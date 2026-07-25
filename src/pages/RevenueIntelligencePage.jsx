import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RiAddLine,
  RiAlertLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiCloseLine,
  RiFileList3Line,
  RiFilter3Line,
  RiFlashlightLine,
  RiFlowChart,
  RiInformationLine,
  RiMailSendLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiSearchLine,
  RiSendPlaneLine,
  RiSurveyLine,
  RiTimeLine,
  RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import './revenue-intelligence.css'

const API_ROOT = '/api/revenue-intelligence'

const CHANNEL_META = {
  email: { label: 'Email', icon: RiMailSendLine, tone: 'violet' },
  call: { label: 'Llamada', icon: RiSendPlaneLine, tone: 'cyan' },
  phone: { label: 'Llamada', icon: RiSendPlaneLine, tone: 'cyan' },
  linkedin: { label: 'LinkedIn', icon: RiUserAddLine, tone: 'blue' },
  whatsapp: { label: 'WhatsApp', icon: RiSendPlaneLine, tone: 'green' },
  meeting: { label: 'Reunión', icon: RiSurveyLine, tone: 'amber' },
  task: { label: 'Tarea', icon: RiFileList3Line, tone: 'slate' },
}

const EXPERIMENT_SURFACES = [
  { value: 'landing', label: 'Landing' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'voice', label: 'Voz' },
  { value: 'sequence', label: 'Secuencia' },
  { value: 'audience', label: 'Audiencia' },
]

const EXPERIMENT_STATUS = {
  draft: { label: 'Borrador', tone: 'muted' },
  running: { label: 'En curso', tone: 'active' },
  paused: { label: 'En pausa', tone: 'warning' },
  completed: { label: 'Concluido', tone: 'complete' },
}

const PROPOSAL_STATUS = {
  proposed: { label: 'Pendiente de revisión', tone: 'warning' },
  pending: { label: 'Pendiente de revisión', tone: 'warning' },
  approved: { label: 'Aprobada', tone: 'active' },
  rejected: { label: 'Descartada', tone: 'muted' },
  applied: { label: 'Aplicada', tone: 'complete' },
}

const EMPTY_EXPERIMENT = {
  name: '',
  surface: 'landing',
  primaryMetric: 'Conversión a reunión',
  audience: '',
  controlName: 'Control',
  variantName: 'Variante B',
}

function unwrapList(payload, names) {
  if (Array.isArray(payload)) return payload
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name]
    if (Array.isArray(payload?.data?.[name])) return payload.data[name]
  }
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function unwrapItem(payload, names) {
  if (!payload || typeof payload !== 'object') return payload
  for (const name of names) {
    if (payload[name] && typeof payload[name] === 'object') return payload[name]
    if (payload.data?.[name] && typeof payload.data[name] === 'object') return payload.data[name]
  }
  return payload.data && typeof payload.data === 'object' ? payload.data : payload
}

function responseError(payload, fallback) {
  return payload?.error?.message || payload?.error || payload?.message || fallback
}

async function requestJson(path, options) {
  const response = await apiFetch(path, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(responseError(payload, 'No pudimos completar la operación.'))
  return payload
}

function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat(localeCode(getLocale()), options).format(date)
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'percent', maximumFractionDigits: 0 }).format(number > 1 ? number / 100 : number)
}

function asText(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function listActionTitle(action) {
  return asText(action.title || action.action || action.recommendation || action.name || action.reason, 'Siguiente acción sin título')
}

function actionContact(action) {
  const contact = action.contact || action.lead || action.opportunity || {}
  return asText(contact.name || action.contactName || action.leadName || action.subjectName, 'Contacto sin identificar')
}

function actionConfidence(action) {
  return formatPercent(action.confidence ?? action.score ?? action.probability)
}

function actionChannel(action) {
  return String(action.channel || action.actionType || action.type || 'task').toLowerCase()
}

function experimentVariants(experiment) {
  const variants = unwrapList(experiment, ['variants', 'arms', 'alternatives'])
  const results = Array.isArray(experiment?.results?.byVariant) ? experiment.results.byVariant : []
  const metricsByVariant = new Map(results.map(result => [result.id, result]))
  return variants.map(variant => ({ ...variant, ...(metricsByVariant.get(variant.id) || {}) }))
}

function proposalEvidence(proposal) {
  return asText(proposal.evidenceSummary || proposal.summary || proposal.evidence || proposal.insight || proposal.reason, 'No se ha facilitado una evidencia resumida.')
}

function readableValue(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return 'Cambio estructurado disponible para revisión.'
    }
  }
  return ''
}

function SectionHeader({ eyebrow, title, description, action }) {
  return <div className="ri-section-header">
    <div>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {action}
  </div>
}

function StatusPill({ meta }) {
  return <span className={`ri-status ${meta.tone}`}><i aria-hidden="true" />{meta.label}</span>
}

function EmptyState({ icon: Icon, title, children, action }) {
  return <div className="ri-empty">
    <span className="ri-empty-icon"><Icon aria-hidden="true" /></span>
    <h3>{title}</h3>
    <div>{children}</div>
    {action}
  </div>
}

function RecommendationCard({ action, busy, onAct }) {
  const channel = actionChannel(action)
  const meta = CHANNEL_META[channel] || CHANNEL_META.task
  const Icon = meta.icon
  const confidence = actionConfidence(action)
  const acted = ['executed', 'acted', 'completed', 'done'].includes(String(action.status || '').toLowerCase())
  const dismissed = ['dismissed', 'skipped'].includes(String(action.status || '').toLowerCase())
  const unavailable = acted || dismissed || busy
  const timing = action.scheduledFor || action.recommendedAt || action.when || action.dueAt

  return <article className="ri-action-card">
    <div className={`ri-channel-icon ${meta.tone}`}><Icon aria-hidden="true" /></div>
    <div className="ri-action-copy">
      <div className="ri-action-topline"><span>{meta.label}</span>{confidence ? <strong>{confidence} de confianza</strong> : null}</div>
      <h3>{listActionTitle(action)}</h3>
      <p className="ri-contact">Para {actionContact(action)}</p>
      <p>{asText(action.message || action.reason || action.explanation, 'La recomendación estará disponible cuando se complete su cálculo.')}</p>
      <div className="ri-action-meta">
        <span><RiTimeLine aria-hidden="true" />{timing ? `Sugerida para ${formatDate(timing, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Sin hora sugerida'}</span>
        {action.owner?.name || action.ownerName ? <span><RiUserAddLine aria-hidden="true" />{action.owner?.name || action.ownerName}</span> : null}
      </div>
    </div>
    <div className="ri-action-buttons">
      {acted ? <StatusPill meta={{ label: 'Marcada como realizada', tone: 'complete' }} /> : dismissed ? <StatusPill meta={{ label: 'Descartada', tone: 'muted' }} /> : <>
        <button type="button" className="ri-button primary compact" disabled={unavailable} onClick={() => onAct(action, 'executed')}><RiCheckboxCircleLine aria-hidden="true" />{busy ? 'Guardando' : 'Hecho'}</button>
        <button type="button" className="ri-icon-button" disabled={unavailable} onClick={() => onAct(action, 'dismissed')} aria-label={`Descartar recomendación: ${listActionTitle(action)}`}><RiCloseLine aria-hidden="true" /></button>
      </>}
    </div>
  </article>
}

function ExperimentCard({ experiment, busy, onStart, onPause }) {
  const status = String(experiment.status || 'draft').toLowerCase()
  const meta = EXPERIMENT_STATUS[status] || EXPERIMENT_STATUS.draft
  const variants = experimentVariants(experiment)
  const results = experiment.results || experiment.metrics || {}
  const winner = experiment.winner || variants.find(variant => variant.id === experiment.winnerVariantId) || variants.filter(variant => Number(variant.exposures) > 0).sort((left, right) => Number(right.conversionRate || 0) - Number(left.conversionRate || 0))[0]
  const surface = EXPERIMENT_SURFACES.find(item => item.value === experiment.surface || item.value === experiment.type)?.label || asText(experiment.surface || experiment.type, 'Prueba comercial')
  const canStart = ['draft', 'paused'].includes(status)
  const canPause = status === 'running'

  return <article className="ri-experiment-card">
    <div className="ri-experiment-head"><div><span>{surface}</span><h3>{asText(experiment.name || experiment.title, 'Experimento sin título')}</h3></div><StatusPill meta={meta} /></div>
    <p>{asText(experiment.primaryMetric || experiment.metric || experiment.objective, 'Métrica principal no definida.')}</p>
    {variants.length ? <div className="ri-variant-list" aria-label="Variantes del experimento">{variants.slice(0, 3).map((variant, index) => <span key={variant.id || variant.name || index}>{asText(variant.name || variant.label, `Variante ${index + 1}`)}{variant.conversionRate != null ? <em>{formatPercent(variant.conversionRate)}</em> : null}</span>)}</div> : <span className="ri-no-variants">Aún no hay variantes registradas.</span>}
    <footer>
      <span>{winner ? `Mejor resultado actual: ${asText(winner.name || winner.label, 'variante seleccionada')}` : results.totalAssignments ? `${results.totalAssignments} participantes` : 'Sin resultado concluyente'}</span>
      <div>
        {canPause ? <button type="button" className="ri-text-button" disabled={busy} onClick={() => onPause(experiment)}>{busy ? 'Guardando' : 'Pausar'}</button> : null}
        {canStart ? <button type="button" className="ri-button subtle compact" disabled={busy} onClick={() => onStart(experiment)}><RiPlayCircleLine aria-hidden="true" />{busy ? 'Guardando' : status === 'paused' ? 'Reanudar' : 'Iniciar'}</button> : null}
      </div>
    </footer>
  </article>
}

function ProposalCard({ proposal, busy, onReview }) {
  const status = String(proposal.status || 'proposed').toLowerCase()
  const meta = PROPOSAL_STATUS[status] || PROPOSAL_STATUS.proposed
  const awaitingReview = ['proposed', 'pending'].includes(status)
  const target = asText(proposal.targetName || proposal.playbookName || proposal.contentName || proposal.targetType, 'Contenido operativo')

  return <article className="ri-proposal-card">
    <div className="ri-proposal-head"><div className="ri-proposal-icon"><RiFlowChart aria-hidden="true" /></div><div><span>{target}</span><h3>{asText(proposal.title || proposal.name, 'Propuesta de aprendizaje')}</h3></div><StatusPill meta={meta} /></div>
    <p>{proposalEvidence(proposal)}</p>
    {proposal.proposedChange || proposal.suggestedChange ? <div className="ri-change"><span>Cambio propuesto</span><p>{readableValue(proposal.proposedChange || proposal.suggestedChange)}</p></div> : null}
    <footer>
      <span>{proposal.createdAt ? `Detectado el ${formatDate(proposal.createdAt)}` : 'Pendiente de revisión humana'}</span>
      {awaitingReview ? <div className="ri-review-actions"><button type="button" className="ri-text-button danger" disabled={busy} onClick={() => onReview(proposal, 'rejected')}>Descartar</button><button type="button" className="ri-button primary compact" disabled={busy} onClick={() => onReview(proposal, 'approved')}><RiCheckboxCircleLine aria-hidden="true" />{busy ? 'Guardando' : 'Aprobar'}</button></div> : null}
    </footer>
  </article>
}

function ExperimentModal({ saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_EXPERIMENT)
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.querySelector('input')?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  function change(name, value) {
    setForm(current => ({ ...current, [name]: value }))
  }

  function submit(event) {
    event.preventDefault()
    if (!form.name.trim()) return
    onSubmit({
      name: form.name.trim(),
      surface: form.surface,
      primaryMetric: form.primaryMetric.trim(),
      ...(form.audience.trim() ? { audienceDefinition: { description: form.audience.trim() } } : {}),
      variants: [
        { key: 'control', name: form.controlName.trim() || 'Control', isControl: true, allocation: 50 },
        { key: 'variant_b', name: form.variantName.trim() || 'Variante B', allocation: 50 },
      ],
    })
  }

  return <div className="ri-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form ref={dialogRef} className="ri-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ri-experiment-dialog-title" aria-describedby="ri-experiment-dialog-description">
      <header><div><span>Nuevo experimento</span><h2 id="ri-experiment-dialog-title">Diseña una comparación medible</h2><p id="ri-experiment-dialog-description">Se crea como borrador; iniciar la prueba requiere una decisión posterior.</p></div><button type="button" className="ri-icon-button" onClick={onClose} disabled={saving} aria-label="Cerrar"><RiCloseLine aria-hidden="true" /></button></header>
      <div className="ri-modal-body">
        <label className="ri-field wide"><span>Nombre</span><input value={form.name} maxLength="140" required onChange={event => change('name', event.target.value)} placeholder="Ej. Mensaje de valor para clínicas" /></label>
        <label className="ri-field"><span>Superficie</span><select value={form.surface} onChange={event => change('surface', event.target.value)}>{EXPERIMENT_SURFACES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="ri-field"><span>Métrica principal</span><input value={form.primaryMetric} maxLength="120" required onChange={event => change('primaryMetric', event.target.value)} /></label>
        <label className="ri-field wide"><span>Audiencia</span><input value={form.audience} maxLength="180" onChange={event => change('audience', event.target.value)} placeholder="Segmento o criterio de inclusión" /></label>
        <label className="ri-field"><span>Control</span><input value={form.controlName} maxLength="90" onChange={event => change('controlName', event.target.value)} /></label>
        <label className="ri-field"><span>Variante</span><input value={form.variantName} maxLength="90" onChange={event => change('variantName', event.target.value)} /></label>
        <aside><RiInformationLine aria-hidden="true" /><span>La atribución se interpretará con el período, la audiencia y la métrica que se registren en el servidor.</span></aside>
      </div>
      {error ? <p className="ri-modal-error" role="alert"><RiAlertLine aria-hidden="true" />{error}</p> : null}
      <footer className="ri-modal-actions"><button type="button" className="ri-button subtle" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="ri-button primary" disabled={saving}>{saving ? 'Creando…' : 'Crear borrador'}</button></footer>
    </form>
  </div>
}

export default function RevenueIntelligencePage() {
  const { locale } = useI18n()
  const [nextActions, setNextActions] = useState([])
  const [experiments, setExperiments] = useState([])
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [showExperimentModal, setShowExperimentModal] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function loadWorkspace({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setLoadError('')
    const requests = [
      requestJson(`${API_ROOT}/next-actions?limit=12`).then(payload => unwrapList(payload, ['nextActions', 'actions', 'recommendations'])),
      requestJson(`${API_ROOT}/experiments`).then(payload => unwrapList(payload, ['experiments', 'items'])),
      requestJson(`${API_ROOT}/memory-proposals?status=proposed`).then(payload => unwrapList(payload, ['memoryProposals', 'proposals', 'items'])),
    ]
    const results = await Promise.allSettled(requests)
    const failures = []
    const [actionsResult, experimentsResult, proposalsResult] = results
    if (actionsResult.status === 'fulfilled') setNextActions(actionsResult.value)
    else { setNextActions([]); failures.push('recomendaciones') }
    if (experimentsResult.status === 'fulfilled') setExperiments(experimentsResult.value)
    else { setExperiments([]); failures.push('experimentos') }
    if (proposalsResult.status === 'fulfilled') setProposals(proposalsResult.value)
    else { setProposals([]); failures.push('memoria operativa') }
    if (failures.length) setLoadError(failures.length === 3 ? 'No pudimos cargar la inteligencia comercial. Comprueba tu conexión o los permisos de esta organización.' : `No se pudo actualizar: ${failures.join(', ')}.`)
    if (!silent) setLoading(false)
  }

  useEffect(() => { loadWorkspace() }, [])

  const pendingProposals = useMemo(() => proposals.filter(proposal => ['proposed', 'pending'].includes(String(proposal.status || 'proposed').toLowerCase())), [proposals])
  const runningExperiments = useMemo(() => experiments.filter(experiment => String(experiment.status || '').toLowerCase() === 'running'), [experiments])

  async function refreshActions() {
    setBusyKey('refresh-actions')
    setNotice('')
    try {
      await requestJson(`${API_ROOT}/next-actions/refresh`, { method: 'POST', body: JSON.stringify({}) })
      await loadWorkspace({ silent: true })
      setNotice('Recomendaciones actualizadas.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos actualizar las recomendaciones.')
    } finally {
      setBusyKey('')
    }
  }

  async function updateAction(action, status) {
    const key = `action-${action.id}`
    setBusyKey(key)
    setNotice('')
    try {
      const payload = await requestJson(`${API_ROOT}/next-actions/${action.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      const saved = unwrapItem(payload, ['nextAction', 'action', 'recommendation'])
      setNextActions(current => current.map(item => item.id === action.id ? { ...item, ...saved, status } : item))
      setNotice(status === 'executed' ? 'Recomendación marcada como realizada.' : 'Recomendación descartada.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos actualizar la recomendación.')
    } finally {
      setBusyKey('')
    }
  }

  async function updateExperiment(experiment, method) {
    const key = `experiment-${experiment.id}`
    setBusyKey(key)
    setNotice('')
    try {
      const isStart = method === 'start'
      const payload = await requestJson(isStart ? `${API_ROOT}/experiments/${experiment.id}/start` : `${API_ROOT}/experiments/${experiment.id}`, {
        method: isStart ? 'POST' : 'PATCH',
        body: JSON.stringify(isStart ? {} : { status: 'paused' }),
      })
      const saved = unwrapItem(payload, ['experiment', 'item'])
      const status = isStart ? 'running' : 'paused'
      setExperiments(current => current.map(item => item.id === experiment.id ? { ...item, ...saved, status: saved?.status || status } : item))
      setNotice(isStart ? 'Experimento iniciado.' : 'Experimento pausado.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos actualizar el experimento.')
    } finally {
      setBusyKey('')
    }
  }

  async function createExperiment(input) {
    setBusyKey('create-experiment')
    setSaveError('')
    try {
      const payload = await requestJson(`${API_ROOT}/experiments`, { method: 'POST', body: JSON.stringify(input) })
      const saved = unwrapItem(payload, ['experiment', 'item'])
      setExperiments(current => [saved, ...current])
      setShowExperimentModal(false)
      setNotice('Experimento creado como borrador.')
    } catch (error) {
      setSaveError(error.message || 'No pudimos crear el experimento.')
    } finally {
      setBusyKey('')
    }
  }

  async function reviewProposal(proposal, decision) {
    const key = `proposal-${proposal.id}`
    setBusyKey(key)
    setNotice('')
    try {
      const payload = await requestJson(`${API_ROOT}/memory-proposals/${proposal.id}/review`, { method: 'PATCH', body: JSON.stringify({ decision }) })
      const saved = unwrapItem(payload, ['memoryProposal', 'proposal', 'item'])
      setProposals(current => current.map(item => item.id === proposal.id ? { ...item, ...saved, status: saved?.status || decision } : item))
      setNotice(decision === 'approved' ? 'Propuesta aprobada para su aplicación controlada.' : 'Propuesta descartada.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos revisar la propuesta.')
    } finally {
      setBusyKey('')
    }
  }

  return <main className="ri-page">
    <header className="ri-page-header">
      <div className="ri-heading"><span className="ri-brand"><RiFlashlightLine aria-hidden="true" /></span><div><h1>{locale === 'en' ? 'Revenue intelligence' : 'Inteligencia comercial'}</h1><p>{locale === 'en' ? 'Prioritize the next move, measure what works and turn winning conversations into reviewable proposals.' : 'Prioriza el siguiente movimiento, mide qué funciona y convierte conversaciones ganadoras en propuestas revisables.'}</p></div></div>
      <button type="button" className="ri-button subtle" disabled={loading || busyKey === 'refresh-actions'} onClick={loadWorkspace}><RiRefreshLine className={loading ? 'ri-spin' : ''} aria-hidden="true" />{locale === 'en' ? 'Refresh' : 'Actualizar'}</button>
    </header>

    <section className="ri-command" aria-label="Resumen de inteligencia comercial">
      <div><span>Centro de decisiones</span><h2>Acción con contexto, aprendizaje con control.</h2><p>Las recomendaciones no sustituyen al criterio del equipo: explican qué señal priorizan y dejan trazabilidad de cada decisión.</p></div>
      <dl><div><dt>{nextActions.length}</dt><dd>acciones sugeridas</dd></div><div><dt>{runningExperiments.length}</dt><dd>experimentos en curso</dd></div><div><dt>{pendingProposals.length}</dt><dd>revisiones humanas</dd></div></dl>
    </section>

    {loadError ? <div className="ri-load-error" role="alert"><RiAlertLine aria-hidden="true" /><span>{loadError}</span><button type="button" onClick={loadWorkspace}>Reintentar</button></div> : null}

    <section className="ri-section" aria-labelledby="ri-actions-title">
      <SectionHeader eyebrow="Orquestación" title="Siguiente mejor acción" description="Canal, momento y mensaje priorizados con la explicación disponible." action={<button type="button" className="ri-button primary" disabled={loading || busyKey === 'refresh-actions'} onClick={refreshActions}><RiRefreshLine className={busyKey === 'refresh-actions' ? 'ri-spin' : ''} aria-hidden="true" />{busyKey === 'refresh-actions' ? 'Calculando' : 'Recalcular'}</button>} />
      {loading ? <div className="ri-state"><span className="ri-loader" /><p>Calculando prioridades comerciales…</p></div> : nextActions.length ? <div className="ri-action-list">{nextActions.map(action => <RecommendationCard key={action.id} action={action} busy={busyKey === `action-${action.id}`} onAct={updateAction} />)}</div> : <EmptyState icon={RiFlashlightLine} title="Aún no hay acciones priorizadas"><p>Cuando haya contactos, señales y permisos suficientes, las recomendaciones aparecerán aquí. No se muestran contactos de ejemplo.</p><button type="button" className="ri-button subtle" onClick={refreshActions} disabled={busyKey === 'refresh-actions'}>Recalcular ahora</button></EmptyState>}
    </section>

    <section className="ri-lower-grid">
      <section className="ri-section ri-card-section" aria-labelledby="ri-experiments-title">
        <SectionHeader eyebrow="Experimentación" title="Pruebas comerciales" description="Compara superficies, mensajes y audiencias con una métrica explícita." action={<button type="button" className="ri-icon-button add" onClick={() => { setSaveError(''); setShowExperimentModal(true) }} aria-label="Crear experimento"><RiAddLine aria-hidden="true" /></button>} />
        {loading ? <div className="ri-state compact"><span className="ri-loader" /><p>Cargando experimentos…</p></div> : experiments.length ? <div className="ri-experiment-list">{experiments.map(experiment => <ExperimentCard key={experiment.id} experiment={experiment} busy={busyKey === `experiment-${experiment.id}`} onStart={item => updateExperiment(item, 'start')} onPause={item => updateExperiment(item, 'pause')} />)}</div> : <EmptyState icon={RiFilter3Line} title="Sin experimentos registrados"><p>Crea un borrador cuando exista una hipótesis y una métrica que el equipo pueda atribuir.</p><button type="button" className="ri-button subtle" onClick={() => setShowExperimentModal(true)}>Crear experimento</button></EmptyState>}
      </section>

      <section className="ri-section ri-card-section" aria-labelledby="ri-memory-title">
        <SectionHeader eyebrow="Memoria operativa" title="Aprendizajes a revisión" description="Las propuestas nacen de señales y conversaciones; una persona decide si avanzan." />
        <div className="ri-human-note"><RiInformationLine aria-hidden="true" /><p><strong>Aprobación humana obligatoria.</strong> Una propuesta nunca cambia un playbook ni contenido por sí sola; la aprobación queda registrada antes de cualquier aplicación.</p></div>
        {loading ? <div className="ri-state compact"><span className="ri-loader" /><p>Buscando propuestas…</p></div> : proposals.length ? <div className="ri-proposal-list">{proposals.map(proposal => <ProposalCard key={proposal.id} proposal={proposal} busy={busyKey === `proposal-${proposal.id}`} onReview={reviewProposal} />)}</div> : <EmptyState icon={RiFlowChart} title="No hay aprendizajes pendientes"><p>Cuando el sistema detecte un patrón con evidencia suficiente, lo presentará como propuesta para que el equipo la revise.</p></EmptyState>}
      </section>
    </section>

    {notice ? <div className="ri-toast" role="status"><RiCheckboxCircleLine aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine aria-hidden="true" /></button></div> : null}
    {showExperimentModal ? <ExperimentModal saving={busyKey === 'create-experiment'} error={saveError} onClose={() => { if (busyKey !== 'create-experiment') setShowExperimentModal(false) }} onSubmit={createExperiment} /> : null}
  </main>
}
