import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiArrowRightSLine, RiBarChartBoxLine, RiBuilding2Line,
  RiCalendar2Line, RiCalendarLine, RiCheckboxCircleLine, RiCheckLine,
  RiCloseLine, RiDownloadLine, RiExternalLinkLine, RiFileTextLine,
  RiFireLine, RiGlobalLine, RiLightbulbLine, RiLinkM, RiMailLine,
  RiMapPin2Line, RiMoreLine, RiGroupLine, RiPhoneLine, RiPulseLine, RiRefreshLine,
  RiRobot2Line, RiSearchLine, RiSearchEyeLine, RiSendPlaneLine,
  RiShieldCheckLine, RiSparkling2Line, RiStarLine, RiTimeLine, RiUploadCloud2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { mapLead } from '../lib/leadMapping'
import '../pages/leads.css'

const STATUS_CONFIG = {
  Nuevo: { color: '#94a3b8', bg: '#94a3b815' },
  Contactado: { color: '#22d3ee', bg: '#22d3ee15' },
  Interesado: { color: '#f59e0b', bg: '#f59e0b15' },
  'En seguimiento': { color: '#818cf8', bg: '#818cf815' },
  'Reunión agendada': { color: '#34d399', bg: '#34d39915' },
  Negociación: { color: '#c084fc', bg: '#c084fc15' },
  Ganado: { color: '#34d399', bg: '#34d39915' },
  Perdido: { color: '#ef4444', bg: '#ef444415' },
}
const STAGES = ['Nuevo', 'Contactado', 'Interesado', 'En seguimiento', 'Reunión agendada', 'Negociación', 'Ganado']
const STAGE_TO_BACKEND = { Nuevo: 'new', Contactado: 'contacted', Interesado: 'qualified', 'En seguimiento': 'qualified', 'Reunión agendada': 'qualified', Negociación: 'qualified', Ganado: 'converted', Perdido: 'unqualified' }
const DETAIL_TABS = ['Resumen', 'Actividad', 'Consentimiento', 'Inteligencia', 'Notas', 'Archivos']
const CALL_LABELS = { completed: 'Llamada saliente', no_answer: 'Llamada sin respuesta', failed: 'Llamada fallida', busy: 'Línea ocupada' }

// LE-107: config visual del timeline de SalesActivity (GET /api/leads/:id/activities).
const ACTIVITY_TYPE_CONFIG = {
  call: { icon: RiPhoneLine, color: '#22d3ee', label: 'Llamada' },
  message: { icon: RiSendPlaneLine, color: '#818cf8', label: 'Mensaje' },
  email: { icon: RiMailLine, color: '#f59e0b', label: 'Email' },
  note: { icon: RiFileTextLine, color: '#a78bfa', label: 'Nota' },
  file: { icon: RiUploadCloud2Line, color: '#34d399', label: 'Archivo' },
  meeting: { icon: RiCalendar2Line, color: '#34d399', label: 'Reunión' },
  status_change: { icon: RiRefreshLine, color: '#94a3b8', label: 'Cambio de estado' },
  stage_change: { icon: RiRefreshLine, color: '#94a3b8', label: 'Cambio de etapa' },
  task: { icon: RiCheckboxCircleLine, color: '#f472b6', label: 'Tarea' },
  owner_changed: { icon: RiGroupLine, color: '#60a5fa', label: 'Propietario reasignado' },
}
function activityConfig(type) { return ACTIVITY_TYPE_CONFIG[type] || { icon: RiPulseLine, color: '#94a3b8', label: type || 'Actividad' } }
function activityText(item) {
  if (item.body) return item.body
  if (item.subject) return item.subject
  if (item.type === 'status_change' && item.metadata) return `De "${item.metadata.from ?? '—'}" a "${item.metadata.to ?? '—'}"`
  if (item.type === 'owner_changed') return 'Se reasignó el propietario del lead.'
  return 'Actividad registrada'
}

// LE-107: consentimiento de contacto (ContactConsent) por canal.
const CONSENT_CHANNEL_LABEL = { email: 'Email', whatsapp: 'WhatsApp', voice: 'Llamada de voz', sms: 'SMS' }
const CONSENT_STATUS_CONFIG = {
  granted: { label: 'Otorgado', color: '#34d399' },
  denied: { label: 'Denegado', color: '#ef4444' },
  revoked: { label: 'Revocado', color: '#ef4444' },
  unknown: { label: 'Desconocido', color: '#94a3b8' },
}

function formatDate(date, fallback = 'Sin fecha') {
  if (!date) return fallback
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(value) {
  if (value == null || value === '' || value === '—') return '—'
  const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? `€${numeric.toLocaleString('es-ES')}` : String(value)
}

function buildTimeline(lead) {
  const calls = (lead.calls || []).map(call => ({ icon: RiPhoneLine, color: '#22d3ee', label: CALL_LABELS[call.status] || 'Llamada', text: call.summary || call.outcome || 'Conversación registrada', date: call.createdAt, timestamp: new Date(call.createdAt).getTime() }))
  const meetings = (lead.meetings || []).map(meeting => ({ icon: RiCalendar2Line, color: '#34d399', label: 'Reunión agendada', text: meeting.title || 'Revisión comercial', date: meeting.scheduledAt, timestamp: new Date(meeting.scheduledAt).getTime() }))
  const items = [...calls, ...meetings].filter(item => item.date)
  return items.sort((a, b) => b.timestamp - a.timestamp)
}

function DetailScoreRing({ score }) {
  const radius = 39
  const circumference = 2 * Math.PI * radius
  return <div className="lead-detail-ring"><svg viewBox="0 0 100 100"><circle className="ring-bg" cx="50" cy="50" r={radius} /><circle className="ring-value" cx="50" cy="50" r={radius} strokeDasharray={`${(score / 100) * circumference} ${circumference}`} /></svg><div><strong>{score}</strong><span>{score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : score >= 40 ? 'Medio' : 'Bajo'}</span></div></div>
}

function StageProgress({ current }) {
  const currentIndex = Math.max(0, STAGES.indexOf(current))
  return <div className="lead-detail-stages">{STAGES.map((stage, index) => <div className={`lead-detail-stage${index < currentIndex ? ' done' : ''}${index === currentIndex ? ' current' : ''}`} key={stage}><i>{index < currentIndex ? <RiCheckLine /> : index + 1}</i><span>{stage}</span></div>)}</div>
}

function ScheduleModal({ lead, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, time: '10:00', duration: '30', title: `Demo personalizada con ${lead.name}`, notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const response = await apiFetch('/api/meetings', { method: 'POST', body: JSON.stringify({ leadId: lead.id, title: form.title, scheduledAt: `${form.date}T${form.time}:00`, durationMinutes: Number(form.duration), notes: form.notes || undefined }) })
      if (!response.ok) throw new Error()
      onSaved(await response.json())
    } catch { setError('No se pudo guardar la reunión. Revisa la conexión.') } finally { setSaving(false) }
  }

  return <div className="lead-detail-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="lead-schedule-modal" onSubmit={submit}><header><div><h2>Agendar reunión</h2><p>Reserva el siguiente paso con {lead.name}.</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header><div className="lead-schedule-form"><label>Título<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><div className="lead-schedule-row"><label>Fecha<input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>Hora<input type="time" required value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div><label>Duración<select value={form.duration} onChange={event => setForm({ ...form, duration: event.target.value })}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label><label>Contexto<textarea rows="3" placeholder="Objetivo de la reunión…" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>{error && <span className="lead-email-status" style={{ color: '#fda4af' }}>{error}</span>}<div className="lead-schedule-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Agendar reunión'}</button></div></div></form></div>
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [audit, setAudit] = useState(null)
  const [notes, setNotes] = useState([])
  const [files, setFiles] = useState([])
  const [activities, setActivities] = useState([])
  const [consent, setConsent] = useState([])
  const [owners, setOwners] = useState([])
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [tab, setTab] = useState('Resumen')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailStatus, setEmailStatus] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([
      apiFetch(`/api/leads/${id}/timeline`).then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/audit`).then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/notes`).then(response => response.ok ? response.json() : []),
      apiFetch(`/api/leads/${id}/files`).then(response => response.ok ? response.json() : []),
      apiFetch('/api/dashboard/stats').then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/activities`).then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/consent`).then(response => response.ok ? response.json() : []),
      apiFetch('/api/leads/owners').then(response => response.ok ? response.json() : []),
    ]).then(([timelineResult, auditResult, notesResult, filesResult, statsResult, activitiesResult, consentResult, ownersResult]) => {
      if (!active) return
      const timeline = timelineResult.status === 'fulfilled' ? timelineResult.value : null
      if (timeline?.lead) setLead({
        ...mapLead(timeline.lead, 0),
        calls: timeline.calls || [],
        meetings: timeline.meetings || [],
        opportunities: timeline.opportunities || [],
        opportunity: timeline.opportunities?.[0] || null,
        ownerId: timeline.lead.ownerId || null,
        owner: timeline.lead.owner || null,
        firstResponseOverdue: !!timeline.lead.firstResponseOverdue,
      })
      else setLoadError('No se encontró este lead.')
      const auditValue = auditResult.status === 'fulfilled' ? auditResult.value : null
      setAudit(auditValue?.audit || auditValue || null)
      const notesValue = notesResult.status === 'fulfilled' ? notesResult.value : []
      setNotes(Array.isArray(notesValue) ? notesValue : [])
      const filesValue = filesResult.status === 'fulfilled' ? filesResult.value : []
      setFiles(Array.isArray(filesValue) ? filesValue : [])
      const stats = statsResult.status === 'fulfilled' ? statsResult.value : null
      setEmailEnabled(stats?.orgPlan === 'completo' && stats?.mauticEnabled)
      const activitiesValue = activitiesResult.status === 'fulfilled' ? activitiesResult.value : null
      setActivities(Array.isArray(activitiesValue?.data) ? activitiesValue.data : [])
      const consentValue = consentResult.status === 'fulfilled' ? consentResult.value : []
      setConsent(Array.isArray(consentValue) ? consentValue : [])
      const ownersValue = ownersResult.status === 'fulfilled' ? ownersResult.value : []
      setOwners(Array.isArray(ownersValue) ? ownersValue : [])
      setLoading(false)
    }).catch(() => { if (active) setLoadError('No se pudo cargar el lead. Revisa la conexión.') })
    return () => { active = false }
  }, [id])


  const timeline = useMemo(() => lead ? buildTimeline(lead) : [], [lead])
  const currentStage = lead?.status || 'Nuevo'
  const score = lead?.score
  const statusStyle = STATUS_CONFIG[currentStage] || STATUS_CONFIG.Nuevo
  const tabs = emailEnabled ? [...DETAIL_TABS, 'Email'] : DETAIL_TABS

  async function addNote(event) {
    event.preventDefault()
    if (!noteText.trim()) return
    try {
      const response = await apiFetch(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ text: noteText.trim() }) })
      if (!response.ok) throw new Error()
      const saved = await response.json()
      setNotes(previous => [saved, ...previous]); setNoteText('')
    } catch { setLoadError('No se pudo guardar la nota.') }
  }

  async function updateStage(event) {
    const nextStatus = event.target.value
    const response = await apiFetch(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status: STAGE_TO_BACKEND[nextStatus] || 'qualified' }) })
    if (response.ok) setLead(previous => ({ ...previous, status: nextStatus }))
    else setLoadError('No se pudo actualizar el estado.')
  }

  // LE-106: reasigna el propietario del lead (o lo desasigna con '' → null).
  async function changeOwner(event) {
    const nextOwnerId = event.target.value || null
    setOwnerSaving(true)
    try {
      const response = await apiFetch(`/api/leads/${id}/owner`, { method: 'PUT', body: JSON.stringify({ ownerId: nextOwnerId }) })
      if (!response.ok) throw new Error()
      const updated = await response.json()
      setLead(previous => ({ ...previous, ownerId: updated.ownerId || null, owner: owners.find(o => o.id === updated.ownerId) || null }))
    } catch { setLoadError('No se pudo reasignar el propietario.') } finally { setOwnerSaving(false) }
  }

  async function runAudit() {
    try {
      const response = await apiFetch(`/api/leads/${id}/audit`, { method: 'POST', body: JSON.stringify({ website: lead.website || undefined, city: lead.city || undefined, sector: lead.customFields?.sector || undefined }) })
      const result = response.ok ? await response.json() : null
      if (result) setAudit(result.audit || result)
      if (!response.ok) setLoadError('No se pudo ejecutar la auditoría.')
    } catch { setLoadError('No se pudo ejecutar la auditoría.') }
  }

  async function sendTemplate() {
    if (!templateId.trim()) return
    setSendingEmail(true); setEmailStatus('')
    try {
      const response = await apiFetch(`/api/leads/${id}/send-email`, { method: 'POST', body: JSON.stringify({ mauticEmailId: templateId.trim() }) })
      setEmailStatus(response.ok ? 'Email enviado correctamente.' : 'No se pudo enviar el email.')
    } finally { setSendingEmail(false) }
  }

  function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(file) }) }
  async function uploadFile(file) {
    if (!file) return
    setUploading(true)
    try {
      const response = await apiFetch(`/api/leads/${id}/files`, { method: 'POST', body: JSON.stringify({ name: file.name, contentBase64: await fileToBase64(file), mimeType: file.type || undefined }) })
      if (!response.ok) throw new Error()
      const saved = await response.json()
      setFiles(previous => [saved, ...previous])
    } catch { setLoadError('No se pudo subir el archivo.') } finally { setUploading(false); setFileInputKey(key => key + 1) }
  }

  function scheduleSaved(meeting) {
    setLead(previous => ({ ...previous, status: 'Reunión agendada', meetings: [meeting, ...(previous.meetings || [])] }))
    setShowSchedule(false)
  }

  if (loading) return <div className="lead-detail-page" style={{ display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13 }}>Cargando ficha del lead…</div>
  if (!lead) return <div className="lead-detail-page" style={{ display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13 }}>{loadError || 'Lead no encontrado'}</div>

  const nextAction = lead.nextAction
  const scoreBreakdown = lead.scoreBreakdown || []

  return <div className="dark-scroll lead-detail-page">
    <header className="lead-detail-topbar"><div className="lead-detail-breadcrumb"><button onClick={() => navigate('/leads')}><RiArrowLeftLine /> Leads</button><RiArrowRightSLine /><div className="lead-detail-brand-icon"><RiGroupLine /></div><div><h1>{lead.name}</h1><p>{lead.company} · Ficha comercial</p></div></div></header>

    <section className="lead-detail-header"><div className="lead-detail-identity"><div className="lead-detail-avatar" style={{ '--avatar-bg': lead.bg || '#6366f1' }}>{lead.initials}</div><div className="lead-detail-identity-main"><div className="lead-detail-name-line"><h2>{lead.name}</h2>{score >= 80 && <span className="lead-hot-label"><RiFireLine /> Hot lead</span>}{lead.firstResponseOverdue && <span className="lead-hot-label" style={{ color: '#fca5a5', borderColor: '#ef444450', background: '#ef444418' }}><RiTimeLine /> SLA de 1ª respuesta superado</span>}<span className="lead-status" style={{ '--status-color': statusStyle.color, '--status-bg': statusStyle.bg }}><i />{currentStage}</span></div><p>{lead.role || 'Contacto principal'} en {lead.company}</p><div className="lead-detail-identity-meta"><span><RiBuilding2Line /> {lead.source || 'Fuente no definida'}</span><span><RiMapPin2Line /> {lead.city || 'Ubicación no disponible'}</span><span><RiGroupLine /> {lead.owner?.name || 'Sin propietario'}</span></div></div><div className="lead-detail-score-box"><div><strong>{score ?? '—'}</strong><span>{score != null ? (score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : 'Medio') : 'Sin score'}</span><small>Score proporcionado por la API</small></div></div><div className="lead-detail-actions"><button className="primary" onClick={() => lead.phone && window.open(`tel:${lead.phone}`)} disabled={!lead.phone}><RiPhoneLine /> Llamar</button><button onClick={() => lead.email && window.open(`mailto:${lead.email}?subject=Seguimiento - ${lead.name}`)} disabled={!lead.email}><RiMailLine /> Email</button><button onClick={() => setShowSchedule(true)}><RiCalendar2Line /> Agendar</button><button onClick={() => setTab('Actividad')}><RiMoreLine /> Más</button></div><div className="lead-detail-stage-select"><label>Estado actual<select value={currentStage} onChange={updateStage}>{STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label><label>Propietario<select value={lead.ownerId || ''} onChange={changeOwner} disabled={ownerSaving}><option value="">Sin asignar</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label></div></div><StageProgress current={currentStage} /></section>

    <main className="lead-detail-main"><div className="lead-detail-content"><nav className="lead-detail-tabs" aria-label="Secciones de la ficha">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Notas' && notes.length > 0 && <span style={{ marginLeft: 4, color: '#818cf8' }}>({notes.length})</span>}</button>)}</nav>

      {tab === 'Resumen' && <div className="lead-detail-grid"><div><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Puntuación VozIA</h3><span>{score != null ? 'Dato de la API' : 'Sin score'}</span></div>{score != null ? <div className="lead-detail-score-layout"><DetailScoreRing score={score} /><div className="lead-breakdown">{scoreBreakdown.map(item => <div className="lead-breakdown-row" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></div> : <div className="lead-audit-card"><strong>No hay score disponible</strong><p>La API no ha proporcionado una puntuación para este lead.</p></div>}</section><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Información de contacto</h3></div><div className="lead-contact-list"><div className="lead-contact-row"><RiMailLine /><span>{lead.email || 'Email no disponible'}</span></div><div className="lead-contact-row"><RiPhoneLine /><span>{lead.phone || 'Teléfono no disponible'}</span></div><div className="lead-contact-row"><RiMapPin2Line /><span>{lead.city || 'Ubicación no disponible'}</span></div><div className="lead-contact-row"><RiGlobalLine /><span>{lead.website || 'Web no disponible'}</span></div></div></section></div><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Actividad registrada</h3><span>{timeline.length} eventos</span></div>{timeline.length ? <div className="lead-activity-timeline">{timeline.slice(0, 4).map((item, index) => { const Icon = item.icon; return <div className="lead-activity-item" key={`${item.label}-${index}`}><span className="lead-activity-dot"><Icon /></span><div><strong>{item.label}</strong><p>{item.text}</p></div><time>{formatDate(item.date)}</time></div> })}</div> : <div className="lead-audit-card"><strong>No hay actividad registrada</strong><p>La API no ha devuelto eventos para este lead.</p></div>}</section></div>}

      {tab === 'Actividad' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Historial del lead</h3><span>{activities.length} eventos</span></div>{activities.length ? <div className="lead-activity-timeline">{activities.map(item => { const cfg = activityConfig(item.type); const Icon = cfg.icon; return <div className="lead-activity-item" key={item.id}><span className="lead-activity-dot" style={{ color: cfg.color, borderColor: `${cfg.color}55`, background: `${cfg.color}15` }}><Icon /></span><div><strong>{cfg.label}</strong><p>{activityText(item)}</p></div><time>{formatDate(item.occurredAt)}</time></div> })}</div> : <div className="lead-audit-card"><strong>No hay actividad registrada</strong><p>Notas, llamadas, cambios de estado y reuniones aparecerán aquí en orden cronológico.</p></div>}</section>}

      {tab === 'Consentimiento' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Consentimiento de contacto</h3><span>{consent.length} canales</span></div>{consent.length ? <div className="lead-contact-list">{consent.map(item => { const statusCfg = CONSENT_STATUS_CONFIG[item.status] || CONSENT_STATUS_CONFIG.unknown; return <div className="lead-contact-row" key={item.id}><RiShieldCheckLine /><span>{CONSENT_CHANNEL_LABEL[item.channel] || item.channel} · {item.purpose}</span><span className="lead-status" style={{ '--status-color': statusCfg.color, '--status-bg': `${statusCfg.color}18`, marginLeft: 'auto' }}><i />{statusCfg.label}</span></div> })}</div> : <div className="lead-audit-card"><strong>Sin registros de consentimiento</strong><p>Todavía no se ha capturado consentimiento para ningún canal de este lead.</p></div>}</section>}

      {tab === 'Inteligencia' && <div className="lead-detail-grid"><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Auditoría digital / SEO</h3><button className="leads-text-button" onClick={runAudit}><RiSearchEyeLine /> {audit ? 'Re-auditar' : 'Auditar ahora'}</button></div>{audit ? <><div className="lead-audit-grid"><span>Presencia pública<b>{audit.publicScore ?? '—'}</b></span><span>Madurez operativa<b>{audit.opsScore ?? '—'}</b></span><span>Oportunidad global<b>{audit.leadOpportunityScore ?? '—'}</b></span></div><p>{audit.summary || audit.commercialPitch || 'La API no ha devuelto un resumen de auditoría.'}</p></> : <div className="lead-audit-card"><strong>Sin auditoría todavía</strong><p>Ejecuta la auditoría para obtener datos reales.</p></div>}</section><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Oportunidades detectadas</h3><span>{lead.opportunities?.length || 0}</span></div>{lead.opportunities?.length ? lead.opportunities.map((item, index) => <div className="lead-activity-item" key={item.title || index}><span className="lead-activity-dot"><RiLightbulbLine /></span><div><strong>{item.title}</strong><p>{item.description || 'Sin descripción disponible'}</p></div><time>{item.impact || '—'}</time></div>) : <div className="lead-audit-card"><strong>No hay oportunidades registradas</strong><p>La API no ha devuelto oportunidades para este lead.</p></div>}</section></div>}

      {tab === 'Notas' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Notas del equipo</h3><span>{notes.length} notas</span></div><form className="lead-note-form" onSubmit={addNote}><textarea rows="3" placeholder="Añade contexto para el siguiente contacto…" value={noteText} onChange={event => setNoteText(event.target.value)} /><button type="submit"><RiSendPlaneLine /> Guardar nota</button></form><div className="lead-notes-list">{notes.length ? notes.map(note => <article className="lead-note" key={note.id}><p>{note.text}</p><small>{formatDate(note.createdAt)} · Equipo comercial</small></article>) : <div className="lead-audit-card"><strong>Aún no hay notas</strong><p>Deja aquí objeciones, contexto de la cuenta y acuerdos para que la próxima acción empiece con ventaja.</p></div>}</div></section>}

      {tab === 'Archivos' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Archivos y recursos</h3><span>{files.length} archivos</span></div><div className="lead-file-upload"><span>Sube una propuesta, brief o caso de éxito para mantener todo junto.</span><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}><RiUploadCloud2Line /> {uploading ? 'Subiendo…' : 'Subir archivo'}</button><input key={fileInputKey} ref={fileInputRef} type="file" hidden onChange={event => uploadFile(event.target.files?.[0])} /></div><div className="lead-files-list">{files.length ? files.map(file => <div className="lead-file-row" key={file.id || file.name}><RiFileTextLine /><div><strong>{file.name}</strong><span>{file.size ? `${Math.round(file.size / 1024)} KB` : 'Archivo del lead'} · {formatDate(file.createdAt)}</span></div>{file.url && <button className="leads-text-button" onClick={() => window.open(file.url, '_blank')}><RiExternalLinkLine /></button>}</div>) : <div className="lead-audit-card"><strong>Espacio listo para tus archivos</strong><p>La propuesta y los recursos de contexto aparecerán aquí para cualquier persona del equipo.</p></div>}</div></section>}

      {tab === 'Email' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Enviar plantilla de email</h3><span>Mautic conectado</span></div><div className="lead-email-form"><input value={templateId} onChange={event => setTemplateId(event.target.value)} placeholder="ID de plantilla Mautic" /><button onClick={sendTemplate} disabled={sendingEmail}>{sendingEmail ? 'Enviando…' : 'Enviar email'}</button></div>{emailStatus && <p className="lead-email-status">{emailStatus}</p>}</section>}
    </div>

    <aside className="lead-detail-side"><section className="lead-detail-side-card"><h3><RiLightbulbLine /> Siguiente acción</h3><div className="lead-next-action-card"><div><RiStarLine /><div><strong>{nextAction || 'Sin próxima acción'}</strong><p>{nextAction ? 'Acción proporcionada por los datos del lead.' : 'La API no ha registrado una próxima acción.'}</p></div></div>{nextAction?.toLowerCase().includes('demo') && <button onClick={() => setShowSchedule(true)}><RiCalendar2Line /> Agendar ahora</button>}</div></section><section className="lead-detail-side-card"><h3><RiShieldCheckLine /> Auditoría</h3><p>{audit ? 'Hay resultados de auditoría disponibles.' : 'No hay resultados de auditoría.'}</p><button className="leads-text-button" onClick={() => setTab('Inteligencia')}>Ver análisis <RiArrowRightSLine /></button></section></aside></main>

    {showSchedule && <ScheduleModal lead={lead} onClose={() => setShowSchedule(false)} onSaved={scheduleSaved} />}
  </div>
}
