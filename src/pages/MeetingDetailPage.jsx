import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import PageLoadingState from '../components/ui/PageLoadingState'
import { getLocale, localeCode, useI18n } from '../i18n'
import {
  RiArrowLeftLine, RiCalendarLine, RiVideoLine, RiUserLine,
  RiEditLine, RiCloseLine, RiCheckLine, RiTimeLine,
  RiMoneyDollarBoxLine, RiRobotLine,
} from 'react-icons/ri'
import '../dashboard.css'
import './sales-detail-standard.css'
import NewReunionModal from '../modals/NewReunionModal'

const BG_POOL = ['var(--info-deep)','var(--cyan-deep)','var(--violet-deep)','var(--warn-deep)','var(--pink)','var(--success-deep)','var(--warn-deep)','var(--success)']
const STATUS_LABEL = { scheduled:'Confirmada', completed:'Completada', cancelled:'Cancelada', no_show:'No asistió' }
const STATUS_COLOR = { scheduled:'var(--success)', completed:'var(--dim)', cancelled:'var(--danger)', no_show:'var(--warn)' }
const PLATFORM_COLORS = { google:'#34a853', zoom:'#2D8CFF', teams:'#5b5ea6' }
const TABS = ['Preparación', 'Notas', 'Historial']

// RE-108: mapeos de labels para los datos reales de preparación (nada de
// constantes decorativas — solo texto para presentar valores del backend).
const LEAD_STATUS_LABEL = { new:'Nuevo', contacted:'Contactado', qualified:'Interesado', unqualified:'Perdido', converted:'Ganado' }
const OPP_STAGE_LABEL = { lead:'Lead', qualified:'Calificada', proposal:'Propuesta', negotiation:'Negociación', closed_won:'Ganada', closed_lost:'Perdida' }
const MEETING_STATUS_LABEL = { scheduled:'Confirmada', completed:'Completada', cancelled:'Cancelada', no_show:'No asistió' }
const CALL_STATUS_LABEL = { completed:'Completada', failed:'Fallida', no_answer:'Sin respuesta', busy:'Ocupó' }
const SALES_ACTIVITY_TYPE_LABEL = {
  call:'Llamada', message:'Mensaje', email:'Email', note:'Nota', file:'Archivo',
  meeting:'Reunión', status_change:'Cambio de estado', stage_change:'Cambio de etapa', task:'Tarea',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(localeCode(getLocale()), { day:'2-digit', month:'short', year:'numeric' })
}

function fmtMoney(value, currency) {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(localeCode(getLocale()), { style:'currency', currency: currency || 'EUR', maximumFractionDigits:0 }).format(n)
}

function Avatar({ name, bg, size = 40 }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('')
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.28), flexShrink:0,
      background:`linear-gradient(135deg, ${bg}, color-mix(in srgb, ${bg} 73%, transparent))`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.34, fontWeight:700, color:'#fff',
      boxShadow:`0 0 14px color-mix(in srgb, ${bg} 33%, transparent)`,
    }}>{initials.toUpperCase()}</div>
  )
}

function mapRaw(data, id) {
  const d = new Date(data.scheduledAt)
  const dur = data.durationMinutes ?? 30
  const end = new Date(d.getTime() + dur * 60000)
  const now = new Date()
  const time = d.toLocaleTimeString(localeCode(getLocale()), { hour:'2-digit', minute:'2-digit' })
  const endTime = end.toLocaleTimeString(localeCode(getLocale()), { hour:'2-digit', minute:'2-digit' })
  // derive a stable color from the id
  const idx = id ? id.charCodeAt(0) % BG_POOL.length : 0
  return {
    id: data.id,
    status: data.status,
    lead: {
      name: data.lead?.name ?? '—',
      company: data.lead?.company ?? '—',
      role: '',
      bg: BG_POOL[idx],
    },
    agent: {
      name: data.assignee?.name ?? '—',
      role: data.assignee?.role ?? '',
      bg: 'var(--accent-deep)',
    },
    date: d.toLocaleDateString(localeCode(getLocale())),
    range: `${time} - ${endTime}`,
    dur: `${dur} min`,
    platform: data.meetingUrl?.includes('zoom') ? 'zoom' : 'google',
    estado: STATUS_LABEL[data.status] ?? data.status,
    estadoColor: STATUS_COLOR[data.status] ?? 'var(--success)',
    hasJoin: !!data.meetingUrl && data.status === 'scheduled',
    isLive: data.status === 'scheduled' && d <= now && now <= end,
    objetivo: data.title ?? '',
    title: data.title ?? '',
    summary: '',
    notes: data.notes ?? '',
    value: '—', leadStatus: '—', leadStatusColor: 'var(--muted)',
    priority: 'Media', prioColor: 'var(--info)',
    resources: [],
    meetingUrl: data.meetingUrl,
    // RE-102: crudos, necesarios para precargar el modal de reprogramación.
    scheduledAt: data.scheduledAt,
    durationMinutes: dur,
  }
}

export default function MeetingDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [mtg, setMtg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Preparación')
  const [showCancel, setShowCancel] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesMessage, setNotesMessage] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  // RE-107: resultado de la reunión (outcome/acuerdos) y no-show.
  const [outcome, setOutcome] = useState('')
  const [agreements, setAgreements] = useState('')
  const [createFollowUpTask, setCreateFollowUpTask] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [markingNoShow, setMarkingNoShow] = useState(false)
  const [resultError, setResultError] = useState('')
  // RE-108: contexto real de preparación (lead, notas, llamadas, oportunidad
  // abierta, actividad y reuniones previas) — nunca datos inventados.
  const [prep, setPrep] = useState(null)
  const [prepLoading, setPrepLoading] = useState(true)
  const [prepError, setPrepError] = useState(false)

  function loadPrep() {
    setPrepLoading(true)
    setPrepError(false)
    return apiFetch(`/api/meetings/${id}/prep`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setPrep(data))
      .catch(() => setPrepError(true))
      .finally(() => setPrepLoading(false))
  }

  function reload() {
    return apiFetch(`/api/meetings/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const mapped = mapRaw(data, id)
          setMtg(mapped)
          setNotes(mapped.notes)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { reload(); loadPrep() }, [id])

  // Un guardado que falla en silencio es peor que no guardar: el usuario cree
  // que sus notas están a salvo. Se comprueba la respuesta y se avisa.
  async function saveNotes() {
    if (!mtg) return
    setNotesSaving(true)
    setNotesMessage(null)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        const gate = await readPlanGate(res)
        const body = await res.json().catch(() => ({}))
        setNotesMessage(gate ? planGateMessage(gate, locale) : (body?.error || 'No se pudieron guardar las notas.'))
        return
      }
      setNotesMessage('Notas guardadas.')
    } catch {
      setNotesMessage('No se pudieron guardar las notas. Revisa tu conexión.')
    } finally {
      setNotesSaving(false)
    }
  }

  // Solo se sale de la ficha si la reunión quedó realmente cancelada; si no,
  // el usuario se iría creyendo que la canceló y seguiría agendada.
  async function cancelMeeting() {
    setCancelError('')
    setCancelling(true)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const gate = await readPlanGate(res)
        const body = await res.json().catch(() => ({}))
        setCancelError(gate ? planGateMessage(gate, locale) : (body?.error || 'No se pudo cancelar la reunión. Sigue agendada.'))
        return
      }
      setShowCancel(false)
      navigate('/reuniones')
    } catch {
      setCancelError('No se pudo cancelar la reunión. Revisa tu conexión: sigue agendada.')
    } finally {
      setCancelling(false)
    }
  }

  // RE-107: cierra la reunión con su resultado real (outcome requerido).
  async function completeMeeting() {
    if (!mtg || !outcome.trim()) { setResultError('El resultado es obligatorio'); return }
    setResultError('')
    setCompleting(true)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: outcome.trim(),
          agreements: agreements.trim() || undefined,
          createFollowUpTask,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setResultError(body?.error || 'No se pudo completar la reunión')
        return
      }
      await reload()
      await loadPrep()
    } catch {
      setResultError('No se pudo completar la reunión')
    } finally {
      setCompleting(false)
    }
  }

  // RE-107: registra que el lead no se presentó.
  async function markNoShow() {
    if (!mtg) return
    setResultError('')
    setMarkingNoShow(true)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}/no-show`, {
        method: 'POST',
        body: JSON.stringify({ notes: outcome.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setResultError(body?.error || 'No se pudo marcar como no-show')
        return
      }
      await reload()
      await loadPrep()
    } catch {
      setResultError('No se pudo marcar como no-show')
    } finally {
      setMarkingNoShow(false)
    }
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading meeting' : 'Cargando reunión'} />

  if (!mtg) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:16 }}>
      {locale === 'en' ? 'Meeting not found' : 'Reunión no encontrada'}
    </div>
  )

  const platColor = PLATFORM_COLORS[mtg.platform] || 'var(--accent)'

  return (
    <div className="sales-detail-page dark-scroll" style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px clamp(12px,4vw,28px) 0', flexShrink:0 }}>
        <button onClick={() => navigate('/reuniones')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'var(--dim)', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Reuniones
        </button>
      </div>

      {/* Header */}
      <div style={{ padding:'20px clamp(12px,4vw,28px)', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, var(--surface), var(--surface-2))',
          border:'1px solid var(--line)', borderRadius:16, padding:'22px clamp(14px,3vw,24px)',
        }}>
          {/* Top row */}
          <div style={{ display:'flex', gap:16, alignItems:'flex-start', marginBottom:18, flexWrap:'wrap' }}>
            <Avatar name={mtg.lead.name} bg={mtg.lead.bg} size={52} />
            <div style={{ flex:'1 1 220px', minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5, flexWrap:'wrap' }}>
                <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'var(--text-strong)', minWidth:0, overflowWrap:'anywhere' }}>{mtg.lead.name}</h1>
                <span style={{ fontSize:12, background:`color-mix(in srgb, ${mtg.estadoColor} 13%, transparent)`, color:mtg.estadoColor, border:`1px solid color-mix(in srgb, ${mtg.estadoColor} 25%, transparent)`, borderRadius:99, padding:'2px 10px', fontWeight:600 }}>{mtg.estado}</span>
              </div>
              <p style={{ margin:'0 0 8px', fontSize:13, color:'var(--dim)' }}>{mtg.lead.company}</p>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color: 'var(--dim)', display:'flex', alignItems:'center', gap:5 }}>
                  <RiCalendarLine style={{ width:12, height:12 }} /> {mtg.date}
                </span>
                <span style={{ fontSize:12, color: 'var(--dim)', display:'flex', alignItems:'center', gap:5 }}>
                  <RiTimeLine style={{ width:12, height:12 }} /> {mtg.range} · {mtg.dur}
                </span>
                <span style={{ fontSize:12, fontWeight:700, color:platColor, textTransform:'capitalize', display:'flex', alignItems:'center', gap:5 }}>
                  <RiVideoLine style={{ width:12, height:12 }} /> {mtg.platform}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
              {mtg.hasJoin && (
                <button onClick={() => window.open(mtg.meetingUrl, '_blank')} style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', border:'none',
                  borderRadius:9, padding:'8px 16px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
                  boxShadow:'0 0 18px #7c3aed40',
                }}>
                  <RiVideoLine style={{ width:14, height:14 }} /> Unirse
                </button>
              )}
              <button onClick={() => setShowReschedule(true)} style={{
                display:'flex', alignItems:'center', gap:6, background:'var(--surface-2)',
                border:'1px solid var(--line)', borderRadius:9, padding:'8px 12px',
                color:'var(--muted)', fontSize:13, cursor:'pointer',
              }}>
                <RiEditLine style={{ width:13, height:13 }} /> Reprogramar
              </button>
              <button onClick={() => { setCancelError(''); setShowCancel(true) }} style={{
                background:'#ef444410', border:'1px solid #ef444430', borderRadius:9,
                padding:'8px 12px', color:'var(--danger)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              }}>
                <RiCloseLine style={{ width:13, height:13 }} /> Cancelar
              </button>
            </div>
          </div>

          {/* Agent row */}
          <div style={{ display:'flex', gap:20, padding:'14px 0 0', borderTop:'1px solid var(--line)', flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Avatar name={mtg.agent.name} bg={mtg.agent.bg} size={30} />
              <div>
                <p style={{ margin:0, fontSize:11.5, fontWeight:600, color:'var(--text)' }}>{mtg.agent.name}</p>
                <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>{mtg.agent.role}</p>
              </div>
            </div>
            {[
              { Icon:RiMoneyDollarBoxLine, label:'Valor pipeline', value:mtg.value },
              { Icon:RiUserLine, label:'Estado lead', value:mtg.leadStatus, color:mtg.leadStatusColor },
              { Icon:RiCheckLine, label:'Prioridad', value:mtg.priority, color:mtg.prioColor },
            ].map(({ Icon, label, value, color }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                <Icon style={{ width:13, height:13, color: 'var(--dim)' }} />
                <div>
                  <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>{label}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color: color || 'var(--text)' }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="split-pane" style={{ flex:1, display:'flex', gap:14, padding:'0 clamp(12px,4vw,28px) 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Objetivo card */}
          {mtg.objetivo && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                <RiRobotLine style={{ width:14, height:14, color:'var(--violet)' }} />
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:'var(--violet)' }}>Objetivo</p>
              </div>
              <p style={{ margin:0, fontSize:13, color:'var(--muted)', lineHeight:1.5 }}>{mtg.objetivo}</p>
            </div>
          )}

          {/* Tabs */}
          <div className="tabs-scroll" style={{ display:'flex', gap:0, borderBottom:'1px solid var(--line)' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? 'var(--text-strong)' : 'var(--faint)',
                borderBottom:`2px solid ${tab===t ? 'var(--violet)' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Preparación' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {prepLoading && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                  <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', textAlign:'center' }}>Cargando contexto del lead…</p>
                </div>
              )}

              {!prepLoading && prepError && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                  <p style={{ margin:0, fontSize:12.5, color:'var(--danger)', textAlign:'center' }}>No se pudo cargar el contexto de preparación</p>
                </div>
              )}

              {!prepLoading && !prepError && prep && (
                <>
                  {/* Estado del lead */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Lead</p>
                    {prep.lead ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Estado</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{LEAD_STATUS_LABEL[prep.lead.status] ?? prep.lead.status}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Empresa</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{prep.lead.company || '—'}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Contacto</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{prep.lead.email || prep.lead.phone || '—'}</p>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Lead no disponible</p>
                    )}
                  </div>

                  {/* Notas recientes */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Notas recientes del lead</p>
                    {prep.recentNotes?.length ? prep.recentNotes.map(n => (
                      <div key={n.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
                        <p style={{ margin:'0 0 3px', fontSize:12.5, color:'var(--muted)', lineHeight:1.5 }}>{n.text}</p>
                        <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>{n.authorName} · {fmtDate(n.createdAt)}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin notas previas</p>
                    )}
                  </div>

                  {/* Últimas llamadas */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Últimas llamadas</p>
                    {prep.recentCalls?.length ? prep.recentCalls.map(c => (
                      <div key={c.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{CALL_STATUS_LABEL[c.status] ?? c.status}</span>
                          {c.sentiment && <span style={{ fontSize:10.5, color: 'var(--dim)' }}>· {c.sentiment}</span>}
                          <span style={{ fontSize:10.5, color: 'var(--dim)', marginLeft:'auto' }}>{fmtDate(c.startedAt || c.createdAt)}</span>
                        </div>
                        <p style={{ margin:0, fontSize:12.5, color:'var(--muted)', lineHeight:1.5 }}>{c.summary || 'Sin resumen disponible'}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin llamadas previas</p>
                    )}
                  </div>

                  {/* Oportunidad abierta */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Oportunidad abierta</p>
                    {prep.openOpportunity ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Nombre</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{prep.openOpportunity.name}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Etapa</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{OPP_STAGE_LABEL[prep.openOpportunity.stage] ?? prep.openOpportunity.stage}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Valor</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{fmtMoney(prep.openOpportunity.value, prep.openOpportunity.currency)}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color: 'var(--dim)' }}>Probabilidad</p>
                          <p style={{ margin:0, fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{prep.openOpportunity.probability}%</p>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin oportunidad abierta</p>
                    )}
                  </div>

                  {/* Actividad reciente */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Actividad reciente</p>
                    {prep.recentActivity?.length ? prep.recentActivity.map(a => (
                      <div key={a.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--accent-soft)' }}>{SALES_ACTIVITY_TYPE_LABEL[a.type] ?? a.type}</span>
                          <span style={{ fontSize:10.5, color: 'var(--dim)', marginLeft:'auto' }}>{fmtDate(a.occurredAt)}</span>
                        </div>
                        <p style={{ margin:0, fontSize:12.5, color:'var(--muted)', lineHeight:1.5 }}>{a.subject || a.body || '—'}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin actividad reciente</p>
                    )}
                  </div>

                  {/* Reuniones anteriores */}
                  <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Reuniones anteriores con este lead</p>
                    {prep.previousMeetings?.length ? prep.previousMeetings.map(m => (
                      <div key={m.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{m.title}</span>
                          <span style={{ fontSize:10.5, color: 'var(--dim)', marginLeft:'auto' }}>{fmtDate(m.scheduledAt)} · {MEETING_STATUS_LABEL[m.status] ?? m.status}</span>
                        </div>
                        {m.status === 'completed' ? (
                          <p style={{ margin:0, fontSize:12.5, color:'var(--muted)', lineHeight:1.5 }}>
                            {m.outcome}{m.agreements ? ` — Acuerdos: ${m.agreements}` : ''}
                          </p>
                        ) : (
                          <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin resultado registrado</p>
                        )}
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color: 'var(--dim)', fontStyle:'italic' }}>Sin reuniones previas con este lead</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'Notas' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Escribe tus notas aquí..."
                style={{
                  width:'100%', minHeight:180, background:'transparent', border:'none',
                  color:'var(--muted)', fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6,
                  fontFamily:'inherit', boxSizing:'border-box',
                }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginTop:8 }}>
                {notesMessage && <span role="status" style={{ fontSize:11.5, color: notesMessage === 'Notas guardadas.' ? 'var(--muted)' : 'var(--danger-soft)' }}>{notesMessage}</span>}
                <button onClick={saveNotes} disabled={notesSaving} style={{ background:'var(--accent-deep)', border:'none', borderRadius:7, padding:'6px 14px', color:'#fff', fontSize:12, fontWeight:600, cursor: notesSaving ? 'not-allowed' : 'pointer', opacity: notesSaving ? 0.6 : 1 }}>
                  {notesSaving ? 'Guardando…' : 'Guardar notas'}
                </button>
              </div>
            </div>
          )}

          {tab === 'Historial' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Reuniones anteriores con este contacto</p>
              {prep?.previousMeetings?.length ? prep.previousMeetings.map(m => (
                <div key={m.id} role="button" tabIndex="0" onClick={() => navigate(`/reuniones/${m.id}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/reuniones/${m.id}`)} style={{ display:'flex', flexDirection:'column', gap:3, padding:'10px 0', borderBottom:'1px solid var(--surface-2)', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text)' }}>{m.title}</span>
                    <span style={{ fontSize:11, color:'var(--dim)' }}>{m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString(localeCode(getLocale()), { day:'numeric', month:'short', year:'numeric' }) : '—'}</span>
                  </div>
                  {(m.outcome || m.agreements) && <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>{m.outcome || m.agreements}</p>}
                </div>
              )) : <p style={{ margin:0, fontSize:12.5, color:'var(--dim)' }}>Es la primera reunión con este contacto.</p>}

              <p style={{ margin:'18px 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Actividad reciente</p>
              {prep?.recentActivity?.length ? prep.recentActivity.map(a => (
                <div key={a.id} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 0', borderBottom:'1px solid var(--surface-2)' }}>
                  <span style={{ fontSize:12.5, color:'var(--muted)' }}>{a.subject || a.body || a.type}</span>
                  <span style={{ fontSize:11, color:'var(--dim)', flexShrink:0 }}>{a.occurredAt ? new Date(a.occurredAt).toLocaleDateString(localeCode(getLocale()), { day:'numeric', month:'short' }) : '—'}</span>
                </div>
              )) : <p style={{ margin:0, fontSize:12.5, color:'var(--dim)' }}>Sin actividad registrada con este contacto.</p>}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="split-rail" style={{ '--rail-width':'240px', display:'flex', flexDirection:'column', gap:12 }}>
          {/* Resultado de la reunión (RE-107): solo mientras no esté cerrada
              (completada) ni cancelada — no-show sigue admitiendo cerrarla
              con outcome después. */}
          {mtg.status !== 'completed' && mtg.status !== 'cancelled' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
              <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Resultado de la reunión</p>
              <textarea
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                placeholder="¿Qué pasó en la reunión?"
                style={{
                  width:'100%', minHeight:60, background:'var(--bg)', border:'1px solid var(--line)', borderRadius:7,
                  color:'var(--muted)', fontSize:11.5, outline:'none', resize:'vertical', lineHeight:1.5,
                  fontFamily:'inherit', boxSizing:'border-box', padding:8, marginBottom:8,
                }}
              />
              <textarea
                value={agreements}
                onChange={e => setAgreements(e.target.value)}
                placeholder="Acuerdos alcanzados (opcional)"
                style={{
                  width:'100%', minHeight:44, background:'var(--bg)', border:'1px solid var(--line)', borderRadius:7,
                  color:'var(--muted)', fontSize:11.5, outline:'none', resize:'vertical', lineHeight:1.5,
                  fontFamily:'inherit', boxSizing:'border-box', padding:8, marginBottom:8,
                }}
              />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)', marginBottom:10, cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={createFollowUpTask}
                  onChange={e => setCreateFollowUpTask(e.target.checked)}
                />
                Crear tarea de seguimiento
              </label>
              {resultError && (
                <p style={{ margin:'0 0 8px', fontSize:11, color:'var(--danger)' }}>{resultError}</p>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button onClick={completeMeeting} disabled={completing || markingNoShow} style={{
                  background:'#10b98115', border:'1px solid #10b98130', borderRadius:7,
                  padding:'8px 0', color:'var(--success)', fontSize:12, fontWeight:700,
                  cursor: (completing || markingNoShow) ? 'not-allowed' : 'pointer', opacity: (completing || markingNoShow) ? 0.6 : 1,
                }}>
                  {completing ? 'Completando…' : 'Completar reunión'}
                </button>
                <button onClick={markNoShow} disabled={completing || markingNoShow} style={{
                  background:'#f59e0b15', border:'1px solid #f59e0b30', borderRadius:7,
                  padding:'8px 0', color:'var(--warn)', fontSize:12, fontWeight:700,
                  cursor: (completing || markingNoShow) ? 'not-allowed' : 'pointer', opacity: (completing || markingNoShow) ? 0.6 : 1,
                }}>
                  {markingNoShow ? 'Marcando…' : 'Marcar no-show'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reschedule modal (RE-102): precargado con la reunión actual, nunca
          crea una reunión nueva ni pierde la referencia a esta. */}
      {showReschedule && mtg && (
        <NewReunionModal
          meeting={mtg}
          onClose={() => setShowReschedule(false)}
          onSuccess={() => { setShowReschedule(false); reload() }}
        />
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div onClick={() => setShowCancel(false)} style={{ position:'fixed', inset:0, zIndex:100, background:'var(--scrim)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:14, padding:'24px', width:'min(340px, 100%)', boxShadow:'var(--shadow-2)' }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'var(--text-strong)' }}>¿Cancelar esta reunión?</p>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'var(--dim)', lineHeight:1.5 }}>Se marcará como cancelada.</p>
            {cancelError && <p role="alert" style={{ margin:'0 0 12px', fontSize:12, color:'var(--danger-soft)', lineHeight:1.5 }}>{cancelError}</p>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowCancel(false)} disabled={cancelling} style={{ flex:1, padding:'9px 0', background:'none', border:'1px solid var(--line)', borderRadius:9, color:'var(--muted)', fontSize:13, cursor: cancelling ? 'not-allowed' : 'pointer' }}>No cancelar</button>
              <button onClick={cancelMeeting} disabled={cancelling} style={{ flex:1, padding:'9px 0', background:'#ef444415', border:'1px solid #ef444430', borderRadius:9, color:'var(--danger)', fontSize:13, fontWeight:700, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.6 : 1 }}>{cancelling ? 'Cancelando…' : 'Cancelar reunión'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

