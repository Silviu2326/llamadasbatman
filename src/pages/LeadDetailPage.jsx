import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiArrowRightSLine, RiBarChartBoxLine, RiBuilding2Line,
  RiCalendar2Line, RiCalendarLine, RiCheckboxCircleLine, RiCheckLine,
  RiCloseLine, RiDownloadLine, RiExternalLinkLine, RiFileTextLine,
  RiFireLine, RiGlobalLine, RiLightbulbLine, RiLinkM, RiMailLine,
  RiMapPin2Line, RiMegaphoneLine, RiMoreLine, RiGroupLine, RiPhoneLine, RiPulseLine, RiRefreshLine,
  RiRobot2Line, RiSearchLine, RiSearchEyeLine, RiSendPlaneLine,
  RiShieldCheckLine, RiSparkling2Line, RiStarLine, RiTimeLine, RiUploadCloud2Line,
  RiBriefcase4Line, RiCloseCircleLine, RiCompass3Line, RiLeafLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import { mapLead } from '../lib/leadMapping'
import { describeCallBlock } from '../lib/callBlockLabels'
import '../pages/leads.css'
import './sales-detail-standard.css'
import { MicroappProjectionPanel, MicroappSurfaceActions } from '../components/MicroappSurfaceActions'
import PageLoadingState from '../components/ui/PageLoadingState'

// El fondo es el mismo color del estado al 8%: color-mix mantiene el token como
// única fuente y funciona en claro y oscuro.
const tint = (token, pct = 8) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`
const STATUS_CONFIG = {
  Nuevo: { color: 'var(--muted)', bg: tint('--muted') },
  Contactado: { color: 'var(--cyan)', bg: tint('--cyan') },
  Interesado: { color: 'var(--warn)', bg: tint('--warn') },
  'En seguimiento': { color: 'var(--accent-soft)', bg: tint('--accent-soft') },
  'Reunión agendada': { color: 'var(--success)', bg: tint('--success') },
  Negociación: { color: 'var(--violet)', bg: tint('--violet') },
  Ganado: { color: 'var(--success)', bg: tint('--success') },
  Perdido: { color: 'var(--danger)', bg: tint('--danger') },
}
const STAGES = ['Nuevo', 'Contactado', 'Interesado', 'Ganado', 'Perdido']
const STAGE_TO_BACKEND = { Nuevo: 'new', Contactado: 'contacted', Interesado: 'qualified', Ganado: 'converted', Perdido: 'unqualified' }
const DETAIL_TABS = ['Resumen', 'Actividad', 'Consentimiento', 'Inteligencia', 'Investigación', 'Notas', 'Archivos']

const CALL_LABELS = { completed: 'Llamada saliente', no_answer: 'Llamada sin respuesta', failed: 'Llamada fallida', busy: 'Línea ocupada' }

// LE-107: config visual del timeline de SalesActivity (GET /api/leads/:id/activities).
const ACTIVITY_TYPE_CONFIG = {
  call: { icon: RiPhoneLine, color: 'var(--cyan)', label: 'Llamada' },
  message: { icon: RiSendPlaneLine, color: 'var(--accent-soft)', label: 'Mensaje' },
  email: { icon: RiMailLine, color: 'var(--warn)', label: 'Email' },
  note: { icon: RiFileTextLine, color: 'var(--violet)', label: 'Nota' },
  file: { icon: RiUploadCloud2Line, color: 'var(--success)', label: 'Archivo' },
  meeting: { icon: RiCalendar2Line, color: 'var(--success)', label: 'Reunión' },
  status_change: { icon: RiRefreshLine, color: 'var(--muted)', label: 'Cambio de estado' },
  stage_change: { icon: RiRefreshLine, color: 'var(--muted)', label: 'Cambio de etapa' },
  task: { icon: RiCheckboxCircleLine, color: 'var(--pink)', label: 'Tarea' },
  owner_changed: { icon: RiGroupLine, color: 'var(--info)', label: 'Propietario reasignado' },
}
function activityConfig(type) { return ACTIVITY_TYPE_CONFIG[type] || { icon: RiPulseLine, color: 'var(--muted)', label: type || 'Actividad' } }
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
  granted: { label: 'Otorgado', color: 'var(--success)' },
  denied: { label: 'Denegado', color: 'var(--danger)' },
  revoked: { label: 'Revocado', color: 'var(--danger)' },
  unknown: { label: 'Desconocido', color: 'var(--muted)' },
}

// EM-110: categorías del centro de preferencias de email (ContactConsent, channel=email).
// Es una lista sugerida, no cerrada — cualquier purpose ya existente para el lead se muestra igual.
const EMAIL_PREFERENCE_CATEGORIES = ['contact', 'newsletter', 'promotions']
const EMAIL_PREFERENCE_LABELS = { contact: 'Contacto general', newsletter: 'Newsletter', promotions: 'Promociones' }

// EM-109: historial de EmailDelivery/EmailEvent del lead.
const EMAIL_DELIVERY_STATUS_LABEL = { queued: 'En cola', accepted: 'Aceptado', delivered: 'Entregado', failed: 'Fallido', bounced: 'Rebotado', unsubscribed: 'Baja' }

function formatDate(date, fallback = 'Sin fecha') {
  if (!date) return fallback
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString(localeCode(getLocale()), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(value) {
  if (value == null || value === '' || value === '—') return '—'
  const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? `€${numeric.toLocaleString(localeCode(getLocale()))}` : String(value)
}

function buildTimeline(lead) {
  const calls = (lead.calls || []).map(call => ({ icon: RiPhoneLine, color: 'var(--cyan)', label: CALL_LABELS[call.status] || 'Llamada', text: call.summary || call.outcome || 'Conversación registrada', date: call.createdAt, timestamp: new Date(call.createdAt).getTime() }))
  const meetings = (lead.meetings || []).map(meeting => ({ icon: RiCalendar2Line, color: 'var(--success)', label: 'Reunión agendada', text: meeting.title || 'Revisión comercial', date: meeting.scheduledAt, timestamp: new Date(meeting.scheduledAt).getTime() }))
  const items = [...calls, ...meetings].filter(item => item.date)
  return items.sort((a, b) => b.timestamp - a.timestamp)
}

function DetailScoreRing({ score }) {
  const radius = 39
  const circumference = 2 * Math.PI * radius
  return <div className="lead-detail-ring"><svg viewBox="0 0 100 100"><circle className="ring-bg" cx="50" cy="50" r={radius} /><circle className="ring-value" cx="50" cy="50" r={radius} strokeDasharray={`${(score / 100) * circumference} ${circumference}`} /></svg><div><strong>{score}</strong><span>{score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : score >= 40 ? 'Medio' : 'Bajo'}</span></div></div>
}

/**
 * De dónde vino este lead, en concreto — criterio de §13 de organico.md.
 *
 * La ficha ya decía la campaña de Ads, así que el comprador que llegó por un
 * anuncio se podía rastrear y el que llegó por una búsqueda o un post se
 * quedaba en "fuente: orgánico". Cuando el origen no se puede nombrar se dice
 * eso mismo y por qué falta: repartirlo entre canales inflaría al que ya
 * parece mejor (§8).
 */
const ORIGIN_TONE = { organic_unidentified: 'is-unknown', none: 'is-unknown', paid: 'is-paid' }

function OriginChip({ origin }) {
  if (!origin || origin.kind === 'none') return null
  const label = origin.label
    ? `${origin.channelLabel} · ${origin.label}`
    : origin.channelLabel
  return (
    <span className={`lead-origin-chip ${ORIGIN_TONE[origin.kind] || ''}`} title={origin.detail}>
      {origin.kind === 'paid' ? <RiCompass3Line /> : <RiLeafLine />} {label}
    </span>
  )
}

/**
 * Email frío escrito desde la auditoría. Se enseña entero y editable antes de
 * enviarlo: quien firma es quien responde de lo que pone, así que nada sale
 * sin que una persona lo haya leído. Los hallazgos se listan aparte para poder
 * comprobar de un vistazo que el texto no afirma nada que no esté medido.
 */
function OutboundEmailCard({ audit, draft, edit, setEdit, busy, error, sent, onDraft, onSend }) {
  return <section className="lead-detail-card">
    <div className="lead-detail-card-heading">
      <h3>Email frío desde la auditoría</h3>
      <button className="leads-text-button" onClick={onDraft} disabled={!audit || busy === 'draft'}>
        <RiSparkling2Line /> {busy === 'draft' ? 'Redactando…' : draft ? 'Volver a redactar' : 'Redactar'}
      </button>
    </div>

    {!audit && <div className="lead-audit-card"><strong>Audita primero</strong><p>El email se escribe con los hallazgos de la auditoría. Sin auditar no hay nada cierto que contarle a este negocio.</p></div>}

    {sent && <p className="lead-email-status" style={{ color: 'var(--success-soft)' }}>{sent}</p>}
    {error && <p className="lead-email-status" role="alert" style={{ color: 'var(--danger-soft)' }}>{error}</p>}

    {draft && <div className="lead-outbound">
      {draft.copy?.kind === 'followup' && <p className="lead-email-status" style={{ color: 'var(--accent-soft)' }}>
        Seguimiento nº {draft.copy.attempt}. Escrito viendo los {draft.copy.attempt - 1} envío{draft.copy.attempt - 1 === 1 ? '' : 's'} anteriores, sin repetir su apertura ni su argumento.
      </p>}

      <div className="lead-outbound-findings">
        <span>Escrito solo sobre estos hallazgos:</span>
        <ul>{draft.findings.map(finding => <li key={finding.title}><strong>{finding.title}</strong> — {finding.pitch}</li>)}</ul>
      </div>

      {draft.research?.facts?.length > 0 && <div className="lead-outbound-findings">
        <span>Y sobre lo que su web dice de sí misma ({draft.research.sources.length} página{draft.research.sources.length === 1 ? '' : 's'} leída{draft.research.sources.length === 1 ? '' : 's'}):</span>
        <ul>{draft.research.facts.map(fact => <li key={fact.claim}>
          <strong>{fact.claim}</strong>
          {/* La cita literal se enseña: es la prueba de que el hecho no está inventado. */}
          <em className="lead-outbound-quote">«{fact.quote}»</em>
          <a href={fact.url} target="_blank" rel="noreferrer noopener">{new URL(fact.url).pathname || '/'}</a>
        </li>)}</ul>
        {draft.research.discarded > 0 && <small className="lead-email-status">
          {draft.research.discarded} afirmación{draft.research.discarded === 1 ? '' : 'es'} descartada{draft.research.discarded === 1 ? '' : 's'} por no poder citarse literalmente en la web.
        </small>}
      </div>}

      {draft.research?.queries?.length > 0 && <div className="lead-outbound-findings">
        <span>Buscó por su cuenta:</span>
        <ul>{draft.research.queries.map(query => <li key={query}>«{query}»</li>)}</ul>
      </div>}

      {draft.research && draft.research.analyzed && !draft.research.facts.length && <p className="lead-email-status">
        Se leyeron {draft.research.sources.length} página{draft.research.sources.length === 1 ? '' : 's'} y no salió nada citable. El email va solo con la auditoría.
      </p>}

      {/* Lo que supuso, separado de lo que verificó. Se enseña para que quien
          firma vea sobre qué interpretación está escrito el email. */}
      {draft.copy?.hypothesis && <details className="lead-outbound-variants">
        <summary>Qué supuso del negocio · confianza {draft.copy.hypothesis.confidence}</summary>
        <article>
          <p><strong>Vende:</strong> {draft.copy.hypothesis.sells}</p>
          <p><strong>Le compra:</strong> {draft.copy.hypothesis.buyer}</p>
          <p><strong>Le duele:</strong> {draft.copy.hypothesis.likelyPain}</p>
          <p><strong>Objeción que tendrá:</strong> {draft.copy.hypothesis.objection}</p>
          {draft.copy.hypothesis.assumptions.length > 0 && <>
            <small>Sin verificar — el email puede apoyarse en esto para elegir el enfoque, pero no lo afirma:</small>
            <ul className="lead-outbound-assumptions">{draft.copy.hypothesis.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
          </>}
        </article>
      </details>}

      {/* Las versiones y sus notas: si la elegida no convence, la alternativa
          ya está escrita en vez de haber que pedirla otra vez. */}
      {draft.copy?.variants?.length > 1 && <details className="lead-outbound-variants">
        <summary>Probó {draft.copy.variants.length} estrategias · ganó «{draft.copy.variants[draft.copy.winner]?.strategyName}»{draft.copy.polished ? ' (y la pulió)' : ''}</summary>
        {draft.copy.variants.map((variant, index) => {
          const score = draft.copy.scores.find(item => item.index === index)
          const plan = draft.copy.strategyPlan?.find(item => item.id === variant.strategyId)
          return <article key={index} className={index === draft.copy.winner ? 'is-winner' : ''}>
            <header><strong>{variant.strategyName}</strong>{score && <span>{score.total}/50 · específica {score.specificity}/10 · fácil de responder {score.easyToReply}/10</span>}</header>
            {plan?.why && <small>Elegida porque: {plan.why}</small>}
            <p className="lead-outbound-quote">{variant.subject}</p>
            <p>{variant.body}{variant.ps ? `\n\nP.D. ${variant.ps}` : ''}</p>
            {score?.verdict && <small>{score.verdict}</small>}
            <button type="button" className="leads-text-button" onClick={() => setEdit({ subject: variant.subject, body: variant.body })}>Usar esta</button>
          </article>
        })}
      </details>}
      <label className="lead-outbound-field"><span>Asunto</span>
        <input value={edit.subject} onChange={event => setEdit(previous => ({ ...previous, subject: event.target.value }))} maxLength={120} />
      </label>
      <label className="lead-outbound-field"><span>Cuerpo</span>
        <textarea rows={12} value={edit.body} onChange={event => setEdit(previous => ({ ...previous, body: event.target.value }))} />
      </label>
      {!draft.written && <p className="lead-email-status">Sin <code>DEEPSEEK_API_KEY</code> el cuerpo es el de respaldo: lleva los hallazgos correctos pero no está redactado.</p>}
      {draft.report?.critique?.issues?.length > 0 && <p className="lead-email-status">El editor anotó: {draft.report.critique.issues.join(' · ')}</p>}
      {draft.blocked
        ? <p className="lead-email-status" role="alert" style={{ color: 'var(--warn)' }}>{draft.blocked}</p>
        : <button className="leads-text-button" onClick={onSend} disabled={busy === 'send'}><RiSendPlaneLine /> {busy === 'send' ? 'Enviando…' : 'Enviar ahora'}</button>}
    </div>}
  </section>
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

  return <div className="lead-detail-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="lead-schedule-modal" onSubmit={submit}><header><div><h2>Agendar reunión</h2><p>Reserva el siguiente paso con {lead.name}.</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header><div className="lead-schedule-form"><label>Título<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><div className="lead-schedule-row"><label>Fecha<input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>Hora<input type="time" required value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div><label>Duración<select value={form.duration} onChange={event => setForm({ ...form, duration: event.target.value })}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label><label>Contexto<textarea rows="3" placeholder="Objetivo de la reunión…" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>{error && <span className="lead-email-status" style={{ color: 'var(--danger-soft)' }}>{error}</span>}<div className="lead-schedule-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Agendar reunión'}</button></div></div></form></div>
}

export default function LeadDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [audit, setAudit] = useState(null)
  const [outbound, setOutbound] = useState(null)
  const [outboundEdit, setOutboundEdit] = useState({ subject: '', body: '' })
  const [outboundBusy, setOutboundBusy] = useState('')
  const [outboundError, setOutboundError] = useState('')
  const [outboundSent, setOutboundSent] = useState('')
  const [notes, setNotes] = useState([])
  const [files, setFiles] = useState([])
  const [activities, setActivities] = useState([])
  const [consent, setConsent] = useState([])
  // Elegibilidad para que el agente llame (GET /api/leads/:id → callability).
  const [callability, setCallability] = useState(null)
  const [consentForm, setConsentForm] = useState({ source: '', evidence: '' })
  const [consentSaving, setConsentSaving] = useState('')
  const [consentMessage, setConsentMessage] = useState('')
  const [emailHistory, setEmailHistory] = useState([])
  const [preferences, setPreferences] = useState([])
  const [prefSaving, setPrefSaving] = useState('')
  const [owners, setOwners] = useState([])
  const [ownerSaving, setOwnerSaving] = useState(false)
  // Campaña del lead: lista de GET /api/campaigns y guardado con PUT /api/leads/:id { campaignId }.
  const [campaigns, setCampaigns] = useState([])
  const [campaignSaving, setCampaignSaving] = useState(false)
  const [tab, setTab] = useState('Resumen')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadRetryable, setLoadRetryable] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailDraftId, setEmailDraftId] = useState('')
  const [emailDrafts, setEmailDrafts] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailStatus, setEmailStatus] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const fileInputRef = useRef(null)

  // Historial de MicroappRun del lead (07-MICROAPPS §3.3). Se carga al abrir la
  // pestaña Investigación, no con el resto de la ficha: es una vista secundaria.
  const [microappRuns, setMicroappRuns] = useState(null) // null = aún sin pedir
  const [microappNames, setMicroappNames] = useState({})
  const [microappRunsState, setMicroappRunsState] = useState('idle') // idle | loading | ready | error

  // Modelo Empresa/Account: empresa vinculada al lead (búsqueda + asignación).
  const [account, setAccount] = useState(null)
  const [accountSearch, setAccountSearch] = useState('')
  const [accountResults, setAccountResults] = useState([])
  const [searchingAccounts, setSearchingAccounts] = useState(false)
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [assigningAccount, setAssigningAccount] = useState(false)
  const accountSearchTimer = useRef(null)

  useEffect(() => {
    apiFetch('/api/email/newsletter-drafts')
      .then(response => response.ok ? response.json() : [])
      .then(data => setEmailDrafts(Array.isArray(data) ? data : []))
      .catch(() => setEmailDrafts([]))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true); setLoadError(''); setLoadRetryable(false)
    Promise.allSettled([
      // Guardamos el status para distinguir el 404 real (lead que no existe) del resto de fallos.
      apiFetch(`/api/leads/${id}/timeline`).then(response => response.ok ? response.json().then(data => ({ status: response.status, data })) : { status: response.status, data: null }),
      apiFetch(`/api/leads/${id}/audit`).then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/notes`).then(response => response.ok ? response.json() : []),
      apiFetch(`/api/leads/${id}/files`).then(response => response.ok ? response.json() : []),
      apiFetch('/api/dashboard/stats').then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/activities`).then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/consent`).then(response => response.ok ? response.json() : []),
      apiFetch('/api/leads/owners').then(response => response.ok ? response.json() : []),
      apiFetch('/api/campaigns?page=1&limit=100').then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads/${id}/email-history`).then(response => response.ok ? response.json() : []),
      apiFetch(`/api/leads/${id}/preferences`).then(response => response.ok ? response.json() : []),
      apiFetch(`/api/leads/${id}`).then(response => response.ok ? response.json() : null),
    ]).then(([timelineResult, auditResult, notesResult, filesResult, statsResult, activitiesResult, consentResult, ownersResult, campaignsResult, emailHistoryResult, preferencesResult, leadResult]) => {
      if (!active) return
      const timelineOutcome = timelineResult.status === 'fulfilled' ? timelineResult.value : { status: 0, data: null }
      const timeline = timelineOutcome.data
      if (timeline?.lead) setLead({
        ...mapLead(timeline.lead, 0),
        calls: timeline.calls || [],
        meetings: timeline.meetings || [],
        opportunities: timeline.opportunities || [],
        opportunity: timeline.opportunities?.[0] || null,
        ownerId: timeline.lead.ownerId || null,
        owner: timeline.lead.owner || null,
        firstResponseOverdue: !!timeline.lead.firstResponseOverdue,
        // Origen: cierra el primer eslabón del hilo de ads.md — sin esto la
        // ficha empieza en el lead y no se puede seguir un comprador hasta el
        // anuncio que lo trajo.
        campaign: timeline.lead.campaign || null,
        metaAdId: timeline.lead.metaAdId || null,
        // El otro extremo del hilo: qué keyword, post, ficha, prospección o
        // acontecimiento vertical lo trajo (organico.md §13).
        origin: timeline.origin || null,
      })
      else if (timelineOutcome.status === 404) setLoadError('No se encontró este lead.')
      else { setLoadError('No se pudo cargar la ficha del lead. Inténtalo de nuevo.'); setLoadRetryable(true) }
      const auditValue = auditResult.status === 'fulfilled' ? auditResult.value : null
      setAudit(auditValue?.audit || auditValue || null)
      const notesValue = notesResult.status === 'fulfilled' ? notesResult.value : []
      setNotes(Array.isArray(notesValue) ? notesValue : [])
      const filesValue = filesResult.status === 'fulfilled' ? filesResult.value : []
      setFiles(Array.isArray(filesValue) ? filesValue : [])
      const stats = statsResult.status === 'fulfilled' ? statsResult.value : null
      setEmailEnabled(stats?.orgPlan === 'completo')
      const activitiesValue = activitiesResult.status === 'fulfilled' ? activitiesResult.value : null
      setActivities(Array.isArray(activitiesValue?.data) ? activitiesValue.data : [])
      const consentValue = consentResult.status === 'fulfilled' ? consentResult.value : []
      setConsent(Array.isArray(consentValue) ? consentValue : [])
      const ownersValue = ownersResult.status === 'fulfilled' ? ownersResult.value : []
      setOwners(Array.isArray(ownersValue) ? ownersValue : [])
      const campaignsValue = campaignsResult.status === 'fulfilled' ? campaignsResult.value : null
      setCampaigns(Array.isArray(campaignsValue?.items) ? campaignsValue.items : Array.isArray(campaignsValue) ? campaignsValue : [])
      const emailHistoryValue = emailHistoryResult.status === 'fulfilled' ? emailHistoryResult.value : []
      setEmailHistory(Array.isArray(emailHistoryValue) ? emailHistoryValue : [])
      const preferencesValue = preferencesResult.status === 'fulfilled' ? preferencesResult.value : []
      setPreferences(Array.isArray(preferencesValue) ? preferencesValue : [])
      const leadValue = leadResult.status === 'fulfilled' ? leadResult.value : null
      setCallability(leadValue?.callability || null)
    }).catch(() => {
      // El handler de arriba puede lanzar (p. ej. un lead malformado en mapLead).
      if (active) { setLoadError('No se pudo cargar el lead. Revisa la conexión.'); setLoadRetryable(true) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, reloadKey])

  // Investigación: MicroappRun vinculados al lead + nombres del catálogo. El
  // catálogo puede fallar sin romper la lista (se muestra el id en su lugar).
  useEffect(() => {
    if (tab !== 'Investigación' || microappRuns !== null) return
    let active = true
    setMicroappRunsState('loading')
    Promise.allSettled([
      apiFetch(`/api/microapps/runs?leadId=${encodeURIComponent(id)}`).then(response => response.ok ? response.json() : Promise.reject(new Error(`runs_${response.status}`))),
      apiFetch('/api/microapps').then(response => response.ok ? response.json() : null),
    ]).then(([runsResult, catalogResult]) => {
      if (!active) return
      if (runsResult.status !== 'fulfilled') { setMicroappRunsState('error'); return }
      const data = runsResult.value
      const list = Array.isArray(data) ? data : Array.isArray(data?.runs) ? data.runs : Array.isArray(data?.items) ? data.items : []
      setMicroappRuns(list)
      const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : null
      const catalogList = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.microapps) ? catalog.microapps : []
      setMicroappNames(Object.fromEntries(catalogList.map(app => [app.id, app.name])))
      setMicroappRunsState('ready')
    })
    return () => { active = false }
  }, [tab, microappRuns, id])

  // Modelo Empresa/Account: carga la empresa vinculada cuando el lead trae accountId.
  useEffect(() => {
    let active = true
    if (!lead?.accountId) { setAccount(null); return }
    apiFetch(`/api/accounts/${lead.accountId}`).then(response => response.ok ? response.json() : null).then(data => {
      if (active) setAccount(data)
    }).catch(() => { if (active) setAccount(null) })
    return () => { active = false }
  }, [lead?.accountId])

  // Búsqueda de empresas con debounce, mismo patrón que "Usar lead existente" en NewOportunidadModal.
  useEffect(() => {
    if (!accountPickerOpen) return
    if (accountSearchTimer.current) clearTimeout(accountSearchTimer.current)
    const term = accountSearch.trim()
    if (!term) { setAccountResults([]); return }
    accountSearchTimer.current = setTimeout(async () => {
      setSearchingAccounts(true)
      try {
        const response = await apiFetch(`/api/accounts?search=${encodeURIComponent(term)}&limit=10`)
        if (response.ok) {
          const data = await response.json()
          setAccountResults(data.data ?? [])
        }
      } catch { /* ignora errores de búsqueda, el usuario puede reintentar */ }
      finally { setSearchingAccounts(false) }
    }, 300)
    return () => { if (accountSearchTimer.current) clearTimeout(accountSearchTimer.current) }
  }, [accountSearch, accountPickerOpen])

  async function linkAccount(accountId) {
    setAssigningAccount(true)
    try {
      const response = await apiFetch(`/api/accounts/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ accountId }) })
      if (!response.ok) throw new Error()
      const updated = await response.json()
      setLead(previous => ({ ...previous, accountId: updated.accountId || null }))
      setAccountPickerOpen(false); setAccountSearch(''); setAccountResults([])
    } catch { setLoadError('No se pudo vincular la empresa.') } finally { setAssigningAccount(false) }
  }

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
    const previousStage = currentStage
    const nextStatus = event.target.value
    try {
      const response = await apiFetch(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status: STAGE_TO_BACKEND[nextStatus] || 'qualified' }) })
      if (!response.ok) throw new Error()
      setLead(previous => ({ ...previous, status: nextStatus }))
      setLoadError('')
    } catch {
      // Devuelve el <select> a la etapa realmente guardada en vez de dejar una que no se persistió.
      setLead(previous => ({ ...previous, status: previousStage }))
      setLoadError('No se pudo actualizar el estado.')
    }
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

  // Cambia (o quita con '') la campaña del lead y vuelve a evaluar si el agente
  // puede llamarlo: la campaña y su agente son la mitad de las condiciones.
  async function changeCampaign(event) {
    const nextCampaignId = event.target.value || null
    setCampaignSaving(true)
    try {
      const response = await apiFetch(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({ campaignId: nextCampaignId }) })
      if (!response.ok) throw new Error()
      const nextCampaign = campaigns.find(item => item.id === nextCampaignId) || null
      setLead(previous => ({ ...previous, campaign: nextCampaign ? { id: nextCampaign.id, name: nextCampaign.name } : null }))
      setLoadError('')
      const refreshed = await apiFetch(`/api/leads/${id}`)
      if (refreshed.ok) { const body = await refreshed.json(); setCallability(body?.callability || null) }
    } catch { setLoadError('No se pudo cambiar la campaña del lead.') } finally { setCampaignSaving(false) }
  }

  async function runAudit() {
    try {
      const response = await apiFetch(`/api/leads/${id}/audit`, { method: 'POST', body: JSON.stringify({ website: lead.website || undefined, city: lead.city || undefined, sector: lead.customFields?.sector || undefined }) })
      const result = response.ok ? await response.json() : null
      if (result) setAudit(result.audit || result)
      if (!response.ok) setLoadError('No se pudo ejecutar la auditoría.')
    } catch { setLoadError('No se pudo ejecutar la auditoría.') }
  }

  // Redacta el email frío con los hallazgos de la auditoría. No envía: el
  // borrador se enseña entero y editable antes de que salga a una persona.
  async function draftOutbound() {
    setOutboundBusy('draft')
    setOutboundError('')
    setOutboundSent('')
    try {
      const response = await apiFetch(`/api/leads/${id}/outbound-email/draft`, { method: 'POST', body: JSON.stringify({}) })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'No se pudo redactar el email.')
      setOutbound(result)
      setOutboundEdit({ subject: result.subject, body: result.body })
    } catch (error) {
      setOutboundError(error.message)
      setOutbound(null)
    } finally { setOutboundBusy('') }
  }

  async function sendOutbound() {
    setOutboundBusy('send')
    setOutboundError('')
    try {
      const response = await apiFetch(`/api/leads/${id}/outbound-email/send`, {
        method: 'POST',
        body: JSON.stringify({ subject: outboundEdit.subject, body: outboundEdit.body }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'No se pudo enviar el email.')
      setOutboundSent(`Enviado con el asunto «${result.subject}».`)
      setOutbound(null)
    } catch (error) {
      setOutboundError(error.message)
    } finally { setOutboundBusy('') }
  }

  // EM-110: activa/desactiva una categoría del centro de preferencias de email.
  // Consentimiento de voz manual: acción explícita con fuente y evidencia.
  // Nunca se registra solo; sin él, un número español no se llama.
  async function setVoiceConsent(action) {
    const source = consentForm.source.trim()
    const evidence = consentForm.evidence.trim()
    if (source.length < 2 || evidence.length < 3) { setConsentMessage('Indica la fuente y la evidencia del consentimiento (documento, formulario, conversación…).'); return }
    setConsentSaving(action); setConsentMessage('')
    try {
      const response = await apiFetch(`/api/leads/${id}/consent`, { method: 'POST', body: JSON.stringify({ channel: 'voice', action, source, evidence }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'No se pudo registrar el consentimiento.')
      const voiceRows = Array.isArray(body?.consent) ? body.consent : []
      setConsent(previous => [...previous.filter(item => item.channel !== 'voice'), ...voiceRows])
      if (body?.callability) setCallability(body.callability)
      setConsentForm({ source: '', evidence: '' })
      setConsentMessage(action === 'grant' ? 'Consentimiento de voz registrado.' : 'Consentimiento de voz revocado.')
    } catch (err) { setConsentMessage(err?.message || 'No se pudo registrar el consentimiento.') } finally { setConsentSaving('') }
  }

  async function togglePreference(purpose, nextStatus) {
    setPrefSaving(purpose)
    try {
      const response = await apiFetch(`/api/leads/${id}/preferences`, { method: 'PUT', body: JSON.stringify({ purpose, status: nextStatus }) })
      if (!response.ok) throw new Error()
      const saved = await response.json()
      setPreferences(previous => [...previous.filter(item => item.purpose !== purpose), saved])
    } catch { setLoadError('No se pudo actualizar la preferencia de email.') } finally { setPrefSaving('') }
  }

  async function sendTemplate() {
    if (!emailDraftId.trim()) return
    setSendingEmail(true); setEmailStatus('')
    try {
      const response = await apiFetch(`/api/leads/${id}/send-email`, { method: 'POST', body: JSON.stringify({ emailDraftId: emailDraftId.trim() }) })
      setEmailStatus(response.ok ? 'Email enviado correctamente.' : 'No se pudo enviar el email.')
    } catch { setEmailStatus('No se pudo enviar el email. Revisa la conexión.') } finally { setSendingEmail(false) }
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

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading lead details' : 'Cargando ficha del lead'} />
  if (!lead) return <div className="lead-detail-page" style={{ display: 'grid', placeItems: 'center', color: 'var(--dim)', fontSize: 13 }}><div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}><span>{loadError || (locale === 'en' ? 'Lead not found' : 'Lead no encontrado')}</span>{loadRetryable && <button className="leads-text-button" onClick={() => setReloadKey(key => key + 1)}>{locale === 'en' ? 'Retry' : 'Reintentar'}</button>}</div></div>

  const nextAction = lead.nextAction
  const scoreBreakdown = lead.scoreBreakdown || []

  return <div className="dark-scroll lead-detail-page">
    <header className="lead-detail-topbar"><div className="lead-detail-breadcrumb"><button onClick={() => navigate('/leads')}><RiArrowLeftLine /> Leads</button><RiArrowRightSLine /><div className="lead-detail-brand-icon"><RiGroupLine /></div><div><h1>{lead.name}</h1><p>{lead.company} · Ficha comercial</p></div></div></header>

    <section className="lead-detail-header"><div className="lead-detail-identity"><div className="lead-detail-avatar" style={{ '--avatar-bg': lead.bg || 'var(--accent)' }}>{lead.initials}</div><div className="lead-detail-identity-main"><div className="lead-detail-name-line"><h2>{lead.name}</h2>{score != null && score >= 80 && <span className="lead-hot-label"><RiFireLine /> Hot lead</span>}{lead.firstResponseOverdue && <span className="lead-hot-label" style={{ color: 'var(--danger-faint)', borderColor: tint('--danger', 31), background: tint('--danger', 9) }}><RiTimeLine /> SLA de 1ª respuesta superado</span>}<span className="lead-status" style={{ '--status-color': statusStyle.color, '--status-bg': statusStyle.bg }}><i />{currentStage}</span></div><p>{lead.role || 'Contacto principal'} en {lead.company}</p><div className="lead-detail-identity-meta"><span><RiBuilding2Line /> {lead.source || 'Fuente no definida'}</span>{lead.campaign && <span title={lead.metaAdId ? `Anuncio ${lead.metaAdId}` : 'Anuncio no identificado'}><RiMegaphoneLine /> <button type="button" className="lead-origin-link" onClick={() => navigate(`/campanas/${lead.campaign.id}`)}>{lead.campaign.name}</button>{lead.metaAdId ? ` · anuncio ${lead.metaAdId}` : ' · anuncio sin identificar'}</span>}<OriginChip origin={lead.origin} /><span><RiMapPin2Line /> {lead.city || 'Ubicación no disponible'}</span><span><RiGroupLine /> {lead.owner?.name || 'Sin propietario'}</span></div></div><div className="lead-detail-score-box"><div><strong>{score ?? '—'}</strong><span>{score != null ? (score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : 'Medio') : 'Sin score'}</span><small>{score != null ? 'Calculado con la auditoría del lead' : 'Ejecuta la auditoría para obtenerlo'}</small></div></div><div className="lead-detail-actions"><button className="primary" onClick={() => lead.phone && window.open(`tel:${lead.phone}`)} disabled={!lead.phone}><RiPhoneLine /> Llamar</button><button onClick={() => lead.email && window.open(`mailto:${lead.email}?subject=Seguimiento - ${lead.name}`)} disabled={!lead.email}><RiMailLine /> Email</button><button onClick={() => setShowSchedule(true)}><RiCalendar2Line /> Agendar</button><button onClick={() => setTab('Actividad')}><RiMoreLine /> Más</button></div><div className="lead-detail-stage-select"><label>Estado actual<select value={currentStage} onChange={updateStage}>{STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label><label>Propietario<select value={lead.ownerId || ''} onChange={changeOwner} disabled={ownerSaving}><option value="">Sin asignar</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label>Campaña<select value={lead.campaign?.id || ''} onChange={changeCampaign} disabled={campaignSaving}><option value="">Sin campaña</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.status && item.status !== 'active' ? ` (${item.status})` : ''}</option>)}{lead.campaign?.id && !campaigns.some(item => item.id === lead.campaign.id) ? <option value={lead.campaign.id}>{lead.campaign.name}</option> : null}</select></label></div></div><StageProgress current={currentStage} />{loadError && <p role="alert" className="lead-email-status" style={{ margin: '10px 0 0', color: 'var(--danger-soft)' }}>{loadError}</p>}</section>

    <main className="lead-detail-main"><div className="lead-detail-content"><nav className="lead-detail-tabs" aria-label="Secciones de la ficha">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Notas' && notes.length > 0 && <span style={{ marginLeft: 4, color: 'var(--accent-soft)' }}>({notes.length})</span>}</button>)}</nav>

      {tab === 'Resumen' && <div className="lead-detail-grid"><div><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Puntuación Vendrava</h3><span>{score != null ? 'Score automático' : 'Sin score'}</span></div>{score != null ? <div className="lead-detail-score-layout"><DetailScoreRing score={score} /><div className="lead-breakdown">{scoreBreakdown.map(item => <div className="lead-breakdown-row" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></div> : <div className="lead-audit-card"><strong>No hay score disponible</strong><p>La puntuación se calcula automáticamente con la actividad del lead; todavía no hay datos suficientes.</p></div>}</section><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Información de contacto</h3></div><div className="lead-contact-list"><div className="lead-contact-row"><RiMailLine /><span>{lead.email || 'Email no disponible'}</span></div><div className="lead-contact-row"><RiPhoneLine /><span>{lead.phone || 'Teléfono no disponible'}</span></div><div className="lead-contact-row"><RiMapPin2Line /><span>{lead.city || 'Ubicación no disponible'}</span></div><div className="lead-contact-row"><RiGlobalLine /><span>{lead.website || 'Web no disponible'}</span></div></div></section><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Llamadas del agente</h3><span>{callability ? (callability.eligible ? 'Se puede llamar' : 'No se llamará') : 'Sin evaluar'}</span></div>{callability ? <div className="lead-audit-card" style={{ borderColor: callability.eligible ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--warn) 40%, transparent)' }}><strong>{callability.eligible ? 'Este lead cumple todas las condiciones para que el agente lo llame.' : 'Este lead no se llamará porque:'}</strong>{callability.reasons?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>{callability.reasons.map(reason => <li key={reason.code}>{reason.message}{reason.code === 'missing_voice_consent' && <> <button className="leads-text-button" onClick={() => setTab('Consentimiento')}>Registrar consentimiento</button></>}</li>)}</ul> : <p>Teléfono {callability.phone || lead.phone}. La llamada saldrá cuando la campaña la encole o al pulsar «Llamar ahora».</p>}{callability.warnings?.length ? <p style={{ marginTop: 6, fontSize: 12, color: 'var(--dim)' }}>{callability.warnings.map(item => item.message).join(' ')}</p> : null}{callability.lastCallBlock ? <p style={{ marginTop: 6, fontSize: 12, color: 'var(--warn)' }}>Último intento bloqueado por el sistema de llamadas{callability.lastCallBlock.at ? ` (${formatDate(callability.lastCallBlock.at)})` : ''}: {describeCallBlock(callability.lastCallBlock)}</p> : null}</div> : <div className="lead-audit-card"><strong>Sin evaluación de llamada</strong><p>No se pudo comprobar si el agente puede llamar a este lead. Recarga la ficha.</p></div>}</section></div><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Actividad registrada</h3><span>{timeline.length} eventos</span></div>{timeline.length ? <div className="lead-activity-timeline">{timeline.slice(0, 4).map((item, index) => { const Icon = item.icon; return <div className="lead-activity-item" key={`${item.label}-${index}`}><span className="lead-activity-dot"><Icon /></span><div><strong>{item.label}</strong><p>{item.text}</p></div><time>{formatDate(item.date)}</time></div> })}</div> : <div className="lead-audit-card"><strong>No hay actividad registrada</strong><p>Las llamadas, emails y reuniones de este lead aparecerán aquí.</p></div>}</section></div>}

      {tab === 'Actividad' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Historial del lead</h3><span>{activities.length} eventos</span></div>{activities.length ? <div className="lead-activity-timeline">{activities.map(item => { const cfg = activityConfig(item.type); const Icon = cfg.icon; return <div className="lead-activity-item" key={item.id}><span className="lead-activity-dot" style={{ color: cfg.color, borderColor: `color-mix(in srgb, ${cfg.color} 33%, transparent)`, background: `color-mix(in srgb, ${cfg.color} 8%, transparent)` }}><Icon /></span><div><strong>{cfg.label}</strong><p>{activityText(item)}</p></div><time>{formatDate(item.occurredAt)}</time></div> })}</div> : <div className="lead-audit-card"><strong>No hay actividad registrada</strong><p>Notas, llamadas, cambios de estado y reuniones aparecerán aquí en orden cronológico.</p></div>}</section>}

      {tab === 'Consentimiento' && <div className="lead-detail-grid">
        <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Consentimiento de contacto</h3><span>{consent.length} canales</span></div>{consent.length ? <div className="lead-contact-list">{consent.map(item => { const statusCfg = CONSENT_STATUS_CONFIG[item.status] || CONSENT_STATUS_CONFIG.unknown; return <div className="lead-contact-row" key={item.id}><RiShieldCheckLine /><span>{CONSENT_CHANNEL_LABEL[item.channel] || item.channel} · {item.purpose}</span><span className="lead-status" style={{ '--status-color': statusCfg.color, '--status-bg': `color-mix(in srgb, ${statusCfg.color} 9%, transparent)`, marginLeft: 'auto' }}><i />{statusCfg.label}</span></div> })}</div> : <div className="lead-audit-card"><strong>Sin registros de consentimiento</strong><p>Todavía no se ha capturado consentimiento para ningún canal de este lead.</p></div>}</section>

        <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Consentimiento de voz (llamadas del agente)</h3><span>{consent.some(item => item.channel === 'voice' && item.status === 'granted') ? 'Registrado' : 'Sin registrar'}</span></div><div className="lead-audit-card"><p style={{ marginTop: 0 }}>Los números españoles solo se llaman con consentimiento de voz vigente. Regístralo aquí únicamente si tienes base legal documentada (formulario, contrato, conversación previa) e indica dónde está la prueba. Queda en la auditoría con tu usuario.</p><div style={{ display: 'grid', gap: 8 }}><input value={consentForm.source} maxLength={120} onChange={event => setConsentForm(form => ({ ...form, source: event.target.value }))} placeholder="Fuente (ej. formulario web, contrato 2025, llamada previa)" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} /><textarea value={consentForm.evidence} maxLength={2000} rows={2} onChange={event => setConsentForm(form => ({ ...form, evidence: event.target.value }))} placeholder="Evidencia (ej. URL del formulario y fecha, cláusula del contrato, resumen de la conversación)" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="leads-text-button" disabled={Boolean(consentSaving)} onClick={() => setVoiceConsent('grant')}><RiShieldCheckLine /> {consentSaving === 'grant' ? 'Registrando…' : 'Registrar consentimiento'}</button><button type="button" className="leads-text-button" disabled={Boolean(consentSaving)} onClick={() => setVoiceConsent('revoke')} style={{ color: 'var(--danger-soft)' }}>{consentSaving === 'revoke' ? 'Revocando…' : 'Revocar consentimiento'}</button></div>{consentMessage && <p role="status" className="lead-email-status" style={{ margin: 0 }}>{consentMessage}</p>}</div></div></section>

        {/* EM-110: centro de preferencias por categoría — reutiliza ContactConsent (channel=email). */}
        <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Preferencias de email</h3><span>{preferences.length} categorías</span></div><div className="lead-contact-list">
          {EMAIL_PREFERENCE_CATEGORIES.map(purpose => {
            const pref = preferences.find(item => item.purpose === purpose)
            const granted = pref?.status === 'granted'
            return <div className="lead-contact-row" key={purpose}><RiMailLine /><span>{EMAIL_PREFERENCE_LABELS[purpose] || purpose}</span><button className="leads-text-button" style={{ marginLeft: 'auto' }} disabled={prefSaving === purpose} onClick={() => togglePreference(purpose, granted ? 'revoked' : 'granted')}>{prefSaving === purpose ? 'Guardando…' : granted ? 'Activado · Desactivar' : pref ? 'Desactivado · Activar' : 'Activar'}</button></div>
          })}
          {preferences.filter(item => !EMAIL_PREFERENCE_CATEGORIES.includes(item.purpose)).map(pref => { const statusCfg = CONSENT_STATUS_CONFIG[pref.status] || CONSENT_STATUS_CONFIG.unknown; return <div className="lead-contact-row" key={pref.id}><RiMailLine /><span>{pref.purpose}</span><span className="lead-status" style={{ '--status-color': statusCfg.color, '--status-bg': `color-mix(in srgb, ${statusCfg.color} 9%, transparent)`, marginLeft: 'auto' }}><i />{statusCfg.label}</span></div> })}
        </div></section>

        {/* EM-109: historial de EmailDelivery + eventos de interacción del lead. */}
        <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Historial de email</h3><span>{emailHistory.length} envíos</span></div>{emailHistory.length ? <div className="lead-activity-timeline">{emailHistory.map(item => { const opens = item.events?.filter(event => event.type === 'open').length || 0; const clicks = item.events?.filter(event => event.type === 'click').length || 0; return <div className="lead-activity-item" key={item.id}><span className="lead-activity-dot"><RiMailLine /></span><div><strong>{item.templateExternalId ? `Plantilla ${item.templateExternalId}` : item.toAddress}</strong><p>Estado: {EMAIL_DELIVERY_STATUS_LABEL[item.status] || item.status}{opens ? ` · ${opens} apertura${opens === 1 ? '' : 's'}` : ''}{clicks ? ` · ${clicks} clic${clicks === 1 ? '' : 's'}` : ''}</p></div><time>{formatDate(item.queuedAt)}</time></div> })}</div> : <div className="lead-audit-card"><strong>Sin envíos de email</strong><p>Todavía no se ha enviado ningún email a este lead.</p></div>}</section>
      </div>}

      {tab === 'Inteligencia' && <div className="lead-detail-grid"><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Auditoría digital / SEO</h3><button className="leads-text-button" onClick={runAudit}><RiSearchEyeLine /> {audit ? 'Re-auditar' : 'Auditar ahora'}</button></div>{audit ? <><div className="lead-audit-grid"><span>Presencia pública<b>{audit.publicScore ?? '—'}</b></span><span>Madurez operativa<b>{audit.opsScore ?? '—'}</b></span><span>Oportunidad global<b>{audit.leadOpportunityScore ?? '—'}</b></span></div><p>{audit.summary || audit.commercialPitch || 'La auditoría no generó un resumen esta vez.'}</p></> : <div className="lead-audit-card"><strong>Sin auditoría todavía</strong><p>Ejecuta la auditoría para obtener datos reales.</p></div>}</section><section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Oportunidades detectadas</h3><span>{lead.opportunities?.length || 0}</span></div>{lead.opportunities?.length ? lead.opportunities.map((item, index) => <div className="lead-activity-item" key={item.title || index}><span className="lead-activity-dot"><RiLightbulbLine /></span><div><strong>{item.title}</strong><p>{item.description || 'Sin descripción disponible'}</p></div><time>{item.impact || '—'}</time></div>) : <div className="lead-audit-card"><strong>No hay oportunidades registradas</strong><p>Cuando la auditoría detecte oportunidades comerciales aparecerán aquí.</p></div>}</section>
        <OutboundEmailCard
          audit={audit}
          draft={outbound}
          edit={outboundEdit}
          setEdit={setOutboundEdit}
          busy={outboundBusy}
          error={outboundError}
          sent={outboundSent}
          onDraft={draftOutbound}
          onSend={sendOutbound}
        />
      </div>}

      {tab === 'Investigación' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Investigación con microapps</h3><MicroappSurfaceActions surface="lead" entityId={id} /></div><MicroappProjectionPanel surface="lead" entityId={id} />
        {microappRunsState === 'loading' && <p className="lead-email-status">Cargando investigaciones…</p>}
        {microappRunsState === 'error' && <div className="lead-audit-card"><strong>No se pudo cargar el historial</strong><p>Comprueba la conexión y vuelve a abrir esta pestaña. <button className="leads-text-button" onClick={() => { setMicroappRuns(null); setMicroappRunsState('idle') }}>Reintentar</button></p></div>}
        {microappRunsState === 'ready' && (microappRuns?.length ? <div className="lead-activity-timeline">{microappRuns.map(run => {
          const stale = run.staleAt && new Date(run.staleAt).getTime() < Date.now()
          return <div className="lead-activity-item" key={run.id}>
            <span className="lead-activity-dot"><RiSearchEyeLine /></span>
            <div>
              <strong>{microappNames[run.microappId] || run.microappId}</strong>
              <p>
                {stale && <span style={{ color: 'var(--warn)', fontWeight: 600 }}><RiTimeLine style={{ verticalAlign: '-2px' }} /> Obsoleto desde el {formatDate(run.staleAt)} · </span>}
                <button className="leads-text-button" onClick={() => navigate(`/microapps/${run.microappId}?runId=${encodeURIComponent(run.id)}`)}>Ver resultado <RiExternalLinkLine /></button>
              </p>
            </div>
            <time>{formatDate(run.createdAt)}</time>
          </div>
        })}</div> : <div className="lead-audit-card"><strong>Sin investigaciones todavía</strong><p>Ejecuta una microapp sobre este lead (por ejemplo «Preparar llamada») y su dossier quedará guardado aquí, con fecha y aviso de caducidad.</p></div>)}
      </section>}

      {tab === 'Notas' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Notas del equipo</h3><span>{notes.length} notas</span></div><form className="lead-note-form" onSubmit={addNote}><textarea rows="3" placeholder="Añade contexto para el siguiente contacto…" value={noteText} onChange={event => setNoteText(event.target.value)} /><button type="submit"><RiSendPlaneLine /> Guardar nota</button></form><div className="lead-notes-list">{notes.length ? notes.map(note => <article className="lead-note" key={note.id}><p>{note.text}</p><small>{formatDate(note.createdAt)} · Equipo comercial</small></article>) : <div className="lead-audit-card"><strong>Aún no hay notas</strong><p>Deja aquí objeciones, contexto de la cuenta y acuerdos para que la próxima acción empiece con ventaja.</p></div>}</div></section>}

      {tab === 'Archivos' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Archivos y recursos</h3><span>{files.length} archivos</span></div><div className="lead-file-upload"><span>Sube una propuesta, brief o caso de éxito para mantener todo junto.</span><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}><RiUploadCloud2Line /> {uploading ? 'Subiendo…' : 'Subir archivo'}</button><input key={fileInputKey} ref={fileInputRef} type="file" hidden onChange={event => uploadFile(event.target.files?.[0])} /></div><div className="lead-files-list">{files.length ? files.map(file => <div className="lead-file-row" key={file.id || file.name}><RiFileTextLine /><div><strong>{file.name}</strong><span>{file.size ? `${Math.round(file.size / 1024)} KB` : 'Archivo del lead'} · {formatDate(file.createdAt)}</span></div>{file.url && <button className="leads-text-button" onClick={() => window.open(file.url, '_blank')}><RiExternalLinkLine /></button>}</div>) : <div className="lead-audit-card"><strong>Espacio listo para tus archivos</strong><p>La propuesta y los recursos de contexto aparecerán aquí para cualquier persona del equipo.</p></div>}</div></section>}

      {tab === 'Email' && <section className="lead-detail-card"><div className="lead-detail-card-heading"><h3>Enviar un email</h3><span>{emailDrafts?.length ? 'Borradores de Vendrava' : 'Sin borradores'}</span></div><div className="lead-email-form">{emailDrafts === null ? <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>Cargando borradores…</span> : emailDrafts.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>No hay borradores. Crea uno desde Email marketing.</span> : <select value={emailDraftId} onChange={event => setEmailDraftId(event.target.value)}><option value="">Selecciona un borrador…</option>{emailDrafts.map(draft => <option key={draft.id} value={String(draft.id)}>{draft.name}</option>)}</select>}<button onClick={sendTemplate} disabled={sendingEmail}>{sendingEmail ? 'Enviando…' : 'Enviar email'}</button></div>{emailStatus && <p className="lead-email-status">{emailStatus}</p>}</section>}
    </div>

    <aside className="lead-detail-side">
      {/* Modelo Empresa/Account: empresa vinculada al lead, con buscador para vincular/cambiar (mismo patrón que "Usar lead existente"). */}
      <section className="lead-detail-side-card">
        <h3><RiBriefcase4Line /> Empresa</h3>
        {account ? (
          <div className="lead-contact-row">
            <RiBriefcase4Line />
            <span>{account.name}{account.domain ? ` · ${account.domain}` : ''}</span>
            <button className="leads-text-button" style={{ marginLeft: 'auto' }} disabled={assigningAccount} onClick={() => linkAccount(null)} title="Quitar empresa vinculada">
              <RiCloseCircleLine />
            </button>
          </div>
        ) : (
          <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--dim)' }}>Este lead no tiene una empresa vinculada.</p>
        )}
        {!accountPickerOpen && (
          <button className="leads-text-button" onClick={() => setAccountPickerOpen(true)}>
            {account ? 'Cambiar empresa' : 'Vincular empresa'} <RiArrowRightSLine />
          </button>
        )}
        {accountPickerOpen && (
          <div style={{ marginTop: 6 }}>
            <input
              autoFocus
              value={accountSearch}
              onChange={event => setAccountSearch(event.target.value)}
              placeholder="Buscar empresa por nombre o dominio…"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }}
            />
            {searchingAccounts && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--dim)' }}>Buscando…</p>}
            {!searchingAccounts && accountSearch.trim() && accountResults.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--dim)' }}>Sin resultados.</p>}
            {accountResults.length > 0 && (
              <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
                {accountResults.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={assigningAccount}
                    onClick={() => linkAccount(item.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'none', borderBottom: '1px solid var(--line)', padding: '8px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5 }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 11 }}>{item.domain || '—'}</div>
                  </button>
                ))}
              </div>
            )}
            <button className="leads-text-button" style={{ marginTop: 6 }} onClick={() => { setAccountPickerOpen(false); setAccountSearch(''); setAccountResults([]) }}>Cancelar</button>
          </div>
        )}
      </section>
      <section className="lead-detail-side-card"><h3><RiLightbulbLine /> Siguiente acción</h3><div className="lead-next-action-card"><div><RiStarLine /><div><strong>{nextAction || 'Sin próxima acción'}</strong><p>{nextAction ? 'Acción proporcionada por los datos del lead.' : 'Todavía no hay una próxima acción registrada para este lead.'}</p></div></div>{nextAction?.toLowerCase().includes('demo') && <button onClick={() => setShowSchedule(true)}><RiCalendar2Line /> Agendar ahora</button>}</div></section><section className="lead-detail-side-card"><h3><RiShieldCheckLine /> Auditoría</h3><p>{audit ? 'Hay resultados de auditoría disponibles.' : 'No hay resultados de auditoría.'}</p><button className="leads-text-button" onClick={() => setTab('Inteligencia')}>Ver análisis <RiArrowRightSLine /></button></section></aside></main>

    {showSchedule && <ScheduleModal lead={lead} onClose={() => setShowSchedule(false)} onSaved={scheduleSaved} />}
  </div>
}
