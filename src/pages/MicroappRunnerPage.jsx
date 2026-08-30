import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiCheckboxCircleLine, RiCoinsLine, RiErrorWarningLine,
  RiDownloadLine, RiExternalLinkLine, RiFolderImageLine, RiHistoryLine,
  RiLoader4Line, RiPlayCircleLine, RiRestartLine, RiShieldCheckLine, RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import { getLocale, localeCode } from '../i18n'
import { microappCategoryMeta, microappCollectionMeta } from '../lib/openPlatform'
import { microappCategoryArt } from '../lib/microappArt'
import './microapps-catalog.css'

const JOB_POLL_MS = 3000
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'canceled'])

function formatCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—'
  return (Number(cents) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function downloadRunJson(run, app) {
  const payload = {
    microapp: { id: app.id, name: app.name, version: run.version || app.version },
    executedAt: run.createdAt || null,
    staleAt: run.staleAt || null,
    input: run.input ?? null,
    result: run.result ?? null,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${app.id}-${run.id || 'resultado'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Título legible desde una clave técnica: "companyOverview" → "Company overview". */
function humanizeKey(key) {
  const text = String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Errores de validación del 400: el shape exacto depende del backend (zod),
 * así que se aceptan los formatos habituales — details/issues como array de
 * { path|field, message } o un objeto fieldErrors { campo: [mensajes] }.
 */
function extractFieldErrors(body) {
  const result = {}
  const push = (field, message) => {
    if (!message) return
    const key = String(field || '')
    result[key] = result[key] ? `${result[key]} · ${message}` : String(message)
  }
  const items = [body?.details, body?.issues, body?.errors].find(Array.isArray)
  if (items) {
    items.forEach(item => {
      if (typeof item === 'string') { push('', item); return }
      const path = Array.isArray(item?.path) ? item.path.join('.') : item?.path || item?.field || item?.key || ''
      push(path, item?.message || item?.error || JSON.stringify(item))
    })
  }
  const fieldErrors = body?.fieldErrors || body?.details?.fieldErrors
  if (fieldErrors && typeof fieldErrors === 'object' && !Array.isArray(fieldErrors)) {
    Object.entries(fieldErrors).forEach(([field, messages]) => {
      push(field, Array.isArray(messages) ? messages.join(' · ') : String(messages))
    })
  }
  return result
}

const WIDGET_HELP = {
  lead: 'ID del lead (cópialo de la URL de su ficha, /leads/…)',
  account: 'ID de la empresa (Account)',
  asset: 'ID del activo (Biblioteca de activos)',
}

/** Un campo del formulario generado desde uiSchema (07-MICROAPPS §3, anotación uiSchema). */
function inputShapeType(schema) {
  if (schema?.type) return schema.type
  const alternatives = Array.isArray(schema?.anyOf) ? schema.anyOf : []
  return alternatives.map(option => option?.type).find(Boolean) || ''
}

function parseStructuredField(field, raw) {
  const type = inputShapeType(field.inputSchema)
  if (type !== 'array' && type !== 'object') return { value: raw }
  if (type === 'array' && Array.isArray(raw)) return { value: raw }
  if (type === 'object' && raw && typeof raw === 'object' && !Array.isArray(raw)) return { value: raw }

  const text = String(raw ?? '').trim()
  if (!text) return { value: type === 'array' ? [] : {} }
  try {
    const parsed = JSON.parse(text)
    if (type === 'array' && !Array.isArray(parsed)) throw new Error('Debe ser una lista JSON')
    if (type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('Debe ser un objeto JSON')
    return { value: parsed }
  } catch (error) {
    // Las listas de valores simples también admiten una opción por línea o
    // separada por comas. Las listas de objetos siempre exigen JSON explícito.
    if (type === 'array' && inputShapeType(field.inputSchema?.items) === 'string' && !text.startsWith('[')) {
      return { value: text.split(/[\n,]+/).map(value => value.trim()).filter(Boolean) }
    }
    return { error: error instanceof Error ? error.message : 'JSON no válido' }
  }
}

function initialFormValues(manifest) {
  const properties = manifest?.inputSchema?.properties || {}
  return Object.fromEntries(Object.entries(properties).flatMap(([key, schema]) => {
    if (!Object.prototype.hasOwnProperty.call(schema || {}, 'default')) return []
    const value = schema.default
    return [[key, value && typeof value === 'object' ? JSON.stringify(value, null, 2) : value]]
  }))
}

function SchemaField({ field, value, error, onChange }) {
  const widget = field.widget || 'text'
  const structuredType = inputShapeType(field.inputSchema)
  const help = field.help || (structuredType === 'object'
    ? 'Introduce un objeto JSON válido.'
    : structuredType === 'array' && inputShapeType(field.inputSchema?.items) === 'object'
      ? 'Introduce una lista JSON de objetos.'
      : structuredType === 'array'
        ? 'Una opción por línea, separadas por comas o como lista JSON.'
        : WIDGET_HELP[widget])
  const inputId = `mapps-field-${field.key}`
  let control = null

  if (widget === 'textarea') {
    control = <textarea id={inputId} rows={4} placeholder={field.placeholder || ''} value={value ?? ''} onChange={event => onChange(event.target.value)} />
  } else if (widget === 'select') {
    control = (
      <select id={inputId} value={value ?? ''} onChange={event => onChange(event.target.value)}>
        <option value="">Selecciona…</option>
        {(field.options || []).map(option => (
          <option key={option.value} value={option.value}>{option.label ?? option.value}</option>
        ))}
      </select>
    )
  } else if (widget === 'number') {
    control = <input id={inputId} type="number" placeholder={field.placeholder || ''} value={value ?? ''} onChange={event => onChange(event.target.value)} />
  } else if (widget === 'toggle') {
    return (
      <div className={`mapps-field mapps-field-toggle${error ? ' has-error' : ''}`}>
        <label>
          <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />
          <span>{field.label || humanizeKey(field.key)}</span>
        </label>
        {help && <small className="mapps-field-help">{help}</small>}
        {error && <small className="mapps-field-error" role="alert">{error}</small>}
      </div>
    )
  } else if (widget === 'url') {
    control = <input id={inputId} type="url" placeholder={field.placeholder || 'https://…'} value={value ?? ''} onChange={event => onChange(event.target.value)} />
  } else {
    // text | lead | account | asset — en v1 son entradas de texto con ayuda contextual.
    control = (
      <input
        id={inputId}
        type={field.sensitive ? 'password' : 'text'}
        placeholder={field.placeholder || ''}
        value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        autoComplete={field.sensitive ? 'off' : undefined}
      />
    )
  }

  return (
    <div className={`mapps-field${error ? ' has-error' : ''}`}>
      <label htmlFor={inputId}>{field.label || humanizeKey(field.key)}</label>
      {control}
      {help && <small className="mapps-field-help">{help}</small>}
      {error && <small className="mapps-field-error" role="alert">{error}</small>}
    </div>
  )
}

/**
 * Render genérico del resultado (result.data): el outputSchema es distinto por
 * microapp, así que se recorre el objeto y cada tipo elige su presentación —
 * títulos + párrafos, listas, o tabla si es un array de objetos homogéneo.
 */
function DataValue({ value, depth = 0 }) {
  if (value == null) return <p className="mapps-muted">—</p>
  if (typeof value === 'string') return <p className="mapps-data-text">{value}</p>
  if (typeof value === 'number' || typeof value === 'boolean') return <p className="mapps-data-text" data-i18n-skip>{String(value)}</p>

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="mapps-muted">Lista vacía.</p>
    const objects = value.every(item => item && typeof item === 'object' && !Array.isArray(item))
    if (objects) {
      const columns = [...new Set(value.flatMap(item => Object.keys(item)))].slice(0, 6)
      return (
        <div className="mapps-table-wrap dark-scroll">
          <table className="mapps-table">
            <thead><tr>{columns.map(column => <th key={column}>{humanizeKey(column)}</th>)}</tr></thead>
            <tbody>
              {value.map((row, index) => (
                <tr key={index}>
                  {columns.map(column => (
                    <td key={column}>
                      {row[column] == null ? '—'
                        : typeof row[column] === 'object' ? JSON.stringify(row[column])
                          : String(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    return (
      <ul className="mapps-data-list">
        {value.map((item, index) => (
          <li key={index}>{typeof item === 'object' ? <DataValue value={item} depth={depth + 1} /> : String(item)}</li>
        ))}
      </ul>
    )
  }

  // Objeto: cada clave es una sección (nivel 1) o una fila etiqueta→valor.
  return (
    <div className="mapps-data-object">
      {Object.entries(value).map(([key, child]) => {
        const scalar = child == null || ['string', 'number', 'boolean'].includes(typeof child)
        if (scalar && depth > 0) {
          return (
            <div key={key} className="mapps-data-row">
              <span>{humanizeKey(key)}</span>
              <strong>{child == null ? '—' : String(child)}</strong>
            </div>
          )
        }
        return (
          <section key={key} className={`mapps-data-section depth-${Math.min(depth, 2)}`}>
            {depth === 0 ? <h4>{humanizeKey(key)}</h4> : <h5>{humanizeKey(key)}</h5>}
            <DataValue value={child} depth={depth + 1} />
          </section>
        )
      })}
    </div>
  )
}

function confidenceLabel(confidence) {
  const qualitative = { high: 'alta', medium: 'media', low: 'baja' }
  if (qualitative[confidence]) return qualitative[confidence]
  const value = Number(confidence)
  if (!Number.isFinite(value)) return String(confidence ?? '—')
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value)
  return `${pct}%`
}

const MICROAPP_ACTION_ROUTES = {
  open_jobs: '/trabajos',
  open_job: '/trabajos',
  open_flow_runs: '/trabajos',
  open_automations: '/automatizaciones',
  open_flow_editor: '/automatizaciones',
  open_integrations: '/conexiones',
  open_connections: '/conexiones',
  open_provider_connections: '/conexiones',
  review_provider_changes: '/conexiones',
  review_route_policy: '/conexiones',
  open_cost_center: '/configuracion?section=plan',
  open_marketplace: '/marketplace',
  open_studio: '/studio',
  create_review_room: '/studio',
  create_production: '/studio',
  create_podcast_brief: '/studio',
  create_recording_brief: '/studio',
  create_studio_tasks: '/studio',
  create_clip_jobs: '/studio',
  create_edit: '/studio',
  regenerate_shot: '/studio',
  render_edl: '/studio',
  fix_qc_findings: '/studio',
  linguistic_review: '/studio',
  open_crm_correction_queue: '/cuentas',
  open_accounts: '/cuentas',
  open_pipeline: '/pipeline',
  create_account_signal: '/cuentas',
  create_lead: '/leads',
  create_prospect_list: '/captacion/atraer/prospectos',
  create_pipeline_tasks: '/pipeline',
  create_pipeline_coaching_tasks: '/pipeline',
  update_forecast_review: '/pipeline',
  create_renewal_opportunity: '/pipeline',
  queue_call: '/llamadas',
  create_agent: '/agentes',
  create_agent_tests: '/agentes',
  update_playbook: '/playbooks',
  create_campaign: '/captacion/planificar',
  create_trigger_campaign: '/captacion/planificar',
  create_ad_experiment: '/captacion/atraer/ads',
  create_ad_cleanup_plan: '/captacion/atraer/ads',
  create_ad_revision: '/captacion/atraer/ads',
  create_creative_experiments: '/captacion/atraer/ads',
  create_landing: '/captacion/convertir?tab=landings',
  update_funnel_form: '/captacion/cerrar',
  create_content: '/captacion/atraer/organico?tab=contenido',
  create_content_draft: '/captacion/atraer/organico?tab=contenido',
  create_content_revision: '/captacion/atraer/organico?tab=contenido',
  create_newsletter_draft: '/email-marketing',
  create_editorial_calendar: '/captacion/atraer/organico?tab=contenido',
  create_editorial_plan: '/captacion/atraer/organico?tab=contenido',
  create_authority_plan: '/captacion/atraer/organico?tab=contenido',
  create_executive_content: '/captacion/atraer/organico?tab=contenido',
  create_sales_sequence: '/automatizaciones',
  schedule_followup: '/automatizaciones',
  create_task: '/trabajos',
  create_tasks: '/trabajos',
  request_approval: '/trabajos?status=awaiting_approval',
  open_prompt_evaluation: '/trabajos',
  open_webhook_events: '/desarrolladores',
  review_knowledge_drafts: '/knowledge-base',
  open_assets: '/activos',
  review_consent: '/gobierno-empresarial',
  request_rights_review: '/gobierno-empresarial',
  license_review: '/gobierno-empresarial',
  run_capability: '/capacidades?tab=providers',
}

function actionIdentity(action) {
  const type = action?.type || action?.kind || ''
  const params = action?.params && typeof action.params === 'object' ? action.params : {}
  return `${type}:${action?.label || ''}:${params.microappId || params.jobId || params.assetId || ''}`
}

function actionDestination(action) {
  const type = action?.type || action?.kind || ''
  const params = action?.params && typeof action.params === 'object' ? action.params : {}
  if (type === 'open_asset' && params.assetId) return `/activos?asset=${encodeURIComponent(params.assetId)}`
  if ((type === 'open_job' || type === 'open_jobs') && params.jobId) return `/trabajos?job=${encodeURIComponent(params.jobId)}`
  return MICROAPP_ACTION_ROUTES[type] || null
}

function ActionChips({ actions, onRunMicroapp, navigate, runId }) {
  const [busyKey, setBusyKey] = useState(null)
  const [message, setMessage] = useState('')
  if (!Array.isArray(actions) || actions.length === 0) return null
  async function execute(action, key, fallback) {
    if (!runId) return fallback?.()
    setBusyKey(key); setMessage('')
    try {
      const response = await apiFetch(`/api/microapps/runs/${encodeURIComponent(runId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo ejecutar la acción.')
      setMessage(body.status === 'awaiting_approval' ? 'Acción enviada a aprobación.' : body.message || 'Acción completada.')
    } catch (error) { setMessage(error.message || 'No se pudo ejecutar la acción.') } finally { setBusyKey(null) }
  }
  return (
    <div className="mapps-actions-row">
      {actions.map((action, index) => {
        const type = action?.type || action?.kind || ''
        const label = action?.label || action?.name || humanizeKey(type || 'Acción')
        const params = action?.params && typeof action.params === 'object' ? action.params : {}
        const targetId = action?.microappId || action?.targetId || params.microappId || (type === 'run_microapp' || type === 'open_microapp' ? action?.id : null)
        const destination = actionDestination(action)
        const runnable = Boolean(targetId && (type === 'run_microapp' || type === 'open_microapp'))
        const navigable = runnable || Boolean(destination) || Boolean(runId)
        const key = `${actionIdentity(action)}-${index}`
        return (
          <button
            key={key}
            type="button"
            className={`mapps-action-chip${navigable ? ' runnable' : ''}`}
            title={navigable ? undefined : 'Esta acción necesita una integración específica'}
            onClick={() => runnable && !runId ? onRunMicroapp(targetId) : destination && type === 'navigate' ? navigate(destination) : execute(action, key, runnable ? () => onRunMicroapp(targetId) : undefined)}
            disabled={!navigable || busyKey === key}
          >
            {busyKey === key ? 'Aplicando…' : label}{navigable && <RiExternalLinkLine />}
          </button>
        )
      })}
      {message && <span className="mapps-muted" role="status">{message}</span>}
    </div>
  )
}

function AgenticCouncil({ council }) {
  if (!council?.final || !Array.isArray(council.rounds)) return null
  const revisions = Array.isArray(council.revisions) ? council.revisions : []
  const appliedRevisions = revisions.filter(revision => revision.status === 'applied')
  const statusLabel = council.final.status === 'ready' ? 'Listo'
    : council.final.status === 'blocked' ? 'Bloqueado'
      : 'Revisión humana'
  return (
    <section className="mapps-agentic-result" aria-label="Consejo de agentes">
      <header>
        <div>
          <span>Consejo de agentes</span>
          <strong>{statusLabel} · {council.final.score}/100</strong>
        </div>
        <span className={`mapps-council-status ${council.final.status}`}>{council.completedRounds}/{council.requestedRounds} rondas</span>
      </header>
      <p>{council.final.consensus}</p>
      {revisions.length > 0 && (
        <div className="mapps-agentic-revisions">
          <strong>{appliedRevisions.length > 0 ? 'Circuito de mejora aplicado' : 'Circuito de mejora conservó el original'}</strong>
          <ul>
            {revisions.map(revision => (
              <li key={revision.afterRound}>
                <b>Tras ronda {revision.afterRound} · {revision.status === 'applied' ? 'revisión validada' : 'revisión rechazada'}</b>
                {revision.appliedChanges?.length > 0 && <span>{revision.appliedChanges.join(' · ')}</span>}
                {revision.rejectionReason && <span>{revision.rejectionReason}</span>}
                {revision.unresolvedChanges?.length > 0 && <span>Pendiente: {revision.unresolvedChanges.join(' · ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {council.final.requiredChanges?.length > 0 && (
        <div>
          <strong>Cambios requeridos</strong>
          <ul>{council.final.requiredChanges.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      <details>
        <summary>Ver deliberación completa</summary>
        {council.rounds.map(round => (
          <article key={round.round} className="mapps-council-round">
            <h4>Ronda {round.round} · {round.synthesis.status} · {round.synthesis.score}/100</h4>
            {round.reviews.map(review => (
              <div key={review.roleId}>
                <strong>{review.roleName}</strong>
                <span>{review.verdict} · {review.score}/100</span>
                {review.findings?.length > 0 && <ul>{review.findings.map((finding, index) => <li key={index}><b>{finding.severity}</b> · {finding.observation} — {finding.recommendation}</li>)}</ul>}
              </div>
            ))}
          </article>
        ))}
      </details>
    </section>
  )
}

function RunHistory({ runs, loading, selectedId, onOpen }) {
  return (
    <section className="mapps-panel mapps-run-history" aria-label="Historial de ejecuciones">
      <header><h2><RiHistoryLine /> Historial</h2><span>{runs.length} recientes</span></header>
      {loading && <p className="mapps-muted"><RiLoader4Line className="mapps-spin" /> Cargando ejecuciones…</p>}
      {!loading && runs.length === 0 && <p className="mapps-muted">Todavía no hay ejecuciones guardadas de esta microapp.</p>}
      <div className="mapps-run-history-list">
        {runs.map(item => {
          const stale = item.staleAt && new Date(item.staleAt).getTime() < Date.now()
          return (
            <button key={item.id} type="button" className={selectedId === item.id ? 'active' : ''} onClick={() => onOpen(item.id)}>
              <span><strong>{formatDate(item.createdAt)}</strong><small>v{item.version}{stale ? ' · caducado' : ''}</small></span>
              <RiExternalLinkLine />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RunResult({ run, app, followUps, onRunMicroapp, onReuseInput, navigate }) {
  const result = run?.result || {}
  const stale = run?.staleAt && new Date(run.staleAt).getTime() < Date.now()
  const evidence = Array.isArray(result.evidence) ? result.evidence : []
  const assets = Array.isArray(result.assets) ? result.assets : []
  const actions = [...(Array.isArray(result.suggestedActions) ? result.suggestedActions : []), ...(Array.isArray(followUps) ? followUps : [])]
    .filter((action, index, all) => all.findIndex(candidate => actionIdentity(candidate) === actionIdentity(action)) === index)
  return (
    <section className="mapps-panel mapps-result" aria-label="Resultado de la microapp">
      <header className="mapps-result-header">
        <h2><RiCheckboxCircleLine /> Resultado</h2>
        <div className="mapps-result-tools">
          {run?.createdAt && <span className="mapps-muted">{formatDate(run.createdAt)}</span>}
          {run?.input && <button type="button" className="mapps-inline-link" onClick={() => onReuseInput(run.input)}><RiRestartLine /> Reutilizar entrada</button>}
          <button type="button" className="mapps-inline-link" onClick={() => downloadRunJson(run, app)}><RiDownloadLine /> Exportar JSON</button>
        </div>
      </header>
      {stale && (
        <p className="mapps-stale" role="status">
          <RiTimeLine /> Este resultado caducó el {formatDate(run.staleAt)}: vuelve a ejecutar la microapp para tener datos frescos.
        </p>
      )}

      <DataValue value={result.data} />

      <AgenticCouncil council={result.agentic} />

      {evidence.length > 0 && (
        <section className="mapps-evidence">
          <h3><RiShieldCheckLine /> Evidencias</h3>
          {evidence.map((item, index) => (
            <article key={index} className="mapps-evidence-item">
              <p>{item.claim}</p>
              <div>
                <span className="mapps-evidence-confidence">Confianza {confidenceLabel(item.confidence)}</span>
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                    Fuente <RiExternalLinkLine />
                  </a>
                )}
                {!item.sourceUrl && item.sourceRef && (
                  <span className="mapps-muted" data-i18n-skip>
                    {typeof item.sourceRef === 'string' ? item.sourceRef : [item.sourceRef.kind, item.sourceRef.id].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {assets.length > 0 && (
        <section className="mapps-evidence">
          <h3><RiFolderImageLine /> Activos generados</h3>
          <div className="mapps-actions-row">
            {assets.map(assetId => (
              <button key={assetId} type="button" className="mapps-action-chip runnable" onClick={() => navigate(`/activos?asset=${encodeURIComponent(assetId)}`)} data-i18n-skip>
                {assetId} <RiExternalLinkLine />
              </button>
            ))}
          </div>
          <p className="mapps-muted">Los activos quedan guardados en la Biblioteca de activos con su procedencia y coste.</p>
        </section>
      )}

      {actions.length > 0 ? (
        <section className="mapps-evidence">
          <h3>Siguientes pasos</h3>
          <ActionChips actions={actions} onRunMicroapp={onRunMicroapp} navigate={navigate} runId={run?.id} />
        </section>
      ) : null}
    </section>
  )
}

export default function MicroappRunnerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const drawer = searchParams.get('drawer') === '1'
  // El catálogo pasa su URL (filtros incluidos) en state.from; un deep-link no la trae.
  const catalogUrl = typeof location.state?.from === 'string' && location.state.from.startsWith('/microapps') ? location.state.from : '/microapps'
  const [app, setApp] = useState(null)
  const [appState, setAppState] = useState('loading') // loading | ready | missing | error
  const [configOpen, setConfigOpen] = useState(false)
  const [configFields, setConfigFields] = useState([])
  const [configValues, setConfigValues] = useState({})
  const [configBusy, setConfigBusy] = useState(false)
  const [values, setValues] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [estimate, setEstimate] = useState(null) // { cents } | null
  const [estimating, setEstimating] = useState(false)
  const [agenticEnabled, setAgenticEnabled] = useState(false)
  const [agenticRounds, setAgenticRounds] = useState(2)
  const [agenticThreshold, setAgenticThreshold] = useState(85)
  const [agenticBudgetCents, setAgenticBudgetCents] = useState(500)
  const [installingFlow, setInstallingFlow] = useState(false)
  const [installedFlowId, setInstalledFlowId] = useState(null)
  // idle | launching | polling | fetching_result | done
  const [runPhase, setRunPhase] = useState('idle')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [run, setRun] = useState(null)
  const [recentRuns, setRecentRuns] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [runError, setRunError] = useState(null) // { tone, text, actions? }
  const pollRef = useRef(null)
  const activeRef = useRef(true)
  const idempotencyRef = useRef(null)

  const uiSchema = useMemo(() => {
    const fields = Array.isArray(app?.uiSchema) ? app.uiSchema : []
    const properties = app?.inputSchema?.properties || {}
    const required = new Set(Array.isArray(app?.inputSchema?.required) ? app.inputSchema.required : [])
    return fields.filter(field => !field.scope || field.scope === 'run').map(field => ({ ...field, inputSchema: properties[field.key] || {}, required: required.has(field.key) }))
  }, [app])
  const leadIdParam = searchParams.get('leadId') || ''
  const accountIdParam = searchParams.get('accountId') || ''
  const productionIdParam = searchParams.get('productionId') || ''
  const callIdParam = searchParams.get('callId') || ''
  const opportunityIdParam = searchParams.get('opportunityId') || ''
  const conversationIdParam = searchParams.get('conversationId') || ''
  const meetingIdParam = searchParams.get('meetingId') || ''
  const leadIdsParam = searchParams.get('leadIds') || ''
  const runIdParam = searchParams.get('runId') || ''

  const loadHistory = useCallback(async (signal) => {
    setHistoryLoading(true)
    try {
      const response = await apiFetch(`/api/microapps/runs?microappId=${encodeURIComponent(id)}&limit=10`, { signal })
      if (!response.ok) throw new Error(`runs_${response.status}`)
      const data = await response.json()
      if (!signal?.aborted) setRecentRuns(Array.isArray(data?.runs) ? data.runs : [])
    } catch (error) {
      if (!signal?.aborted && error?.name !== 'AbortError') setRecentRuns([])
    } finally {
      if (!signal?.aborted) setHistoryLoading(false)
    }
  }, [id])

  useEffect(() => () => { activeRef.current = false; if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // Carga directa: evita descargar el catálogo completo para abrir una receta.
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setAppState('loading')
    // Cambiar de microapp (back/forward o enlaces) vacía la ejecución anterior.
    if (pollRef.current) clearTimeout(pollRef.current)
    setValues({}); setEstimate(null); setRun(null); setRunError(null); setFieldErrors({}); setAgenticEnabled(false); setInstalledFlowId(null)
    idempotencyRef.current = null
    setJobId(null); setJobStatus(null); setRunPhase('idle')
    apiFetch(`/api/microapps/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`microapps_${response.status}`); return response.json() })
      .then(data => {
        if (!active) return
        setApp(data)
        setValues(initialFormValues(data))
        setAppState('ready')
      })
      .catch(error => {
        if (!active) return
        setAppState(String(error?.message).endsWith('_404') ? 'missing' : 'error')
      })
    loadHistory(controller.signal)
    return () => { active = false; controller.abort() }
  }, [id, loadHistory])

  const openRun = useCallback(async (runId) => {
    setRunPhase('fetching_result')
    setRunError(null)
    try {
      const response = await apiFetch(`/api/microapps/runs/${encodeURIComponent(runId)}`)
      if (!response.ok) throw new Error(`run_${response.status}`)
      const data = await response.json()
      if (activeRef.current) { setRun(data?.run || data); setRunPhase('done') }
    } catch {
      if (activeRef.current) { setRunPhase('idle'); setRunError({ tone: 'error', text: 'No se pudo cargar esa ejecución.' }) }
    }
  }, [])

  // Prefill: ?leadId=… rellena el primer campo de tipo lead (llegada desde la ficha del lead).
  useEffect(() => {
    if (!leadIdParam || !uiSchema.length) return
    const leadField = uiSchema.find(field => field.widget === 'lead')
    if (leadField) setValues(current => (current[leadField.key] ? current : { ...current, [leadField.key]: leadIdParam }))
  }, [leadIdParam, uiSchema])

  useEffect(() => {
    if (!accountIdParam || !uiSchema.length) return
    const accountField = uiSchema.find(field => field.widget === 'account')
    if (accountField) setValues(current => (current[accountField.key] ? current : { ...current, [accountField.key]: accountIdParam }))
  }, [accountIdParam, uiSchema])

  useEffect(() => {
    if (!productionIdParam || !uiSchema.length) return
    const productionField = uiSchema.find(field => field.key === 'productionId')
    if (productionField) setValues(current => (current[productionField.key] ? current : { ...current, [productionField.key]: productionIdParam }))
  }, [productionIdParam, uiSchema])

  useEffect(() => {
    if (!callIdParam || !uiSchema.length) return
    const field = uiSchema.find(item => item.widget === 'call')
    if (field) setValues(current => (current[field.key] ? current : { ...current, [field.key]: callIdParam }))
  }, [callIdParam, uiSchema])

  useEffect(() => {
    if (!opportunityIdParam || !uiSchema.length) return
    const field = uiSchema.find(item => item.widget === 'opportunity')
    if (field) setValues(current => (current[field.key] ? current : { ...current, [field.key]: opportunityIdParam }))
  }, [opportunityIdParam, uiSchema])

  useEffect(() => {
    if (!leadIdsParam || !uiSchema.length) return
    const field = uiSchema.find(item => item.key === 'leadIds')
    if (field) {
      const ids = leadIdsParam.split(',').map(value => value.trim()).filter(Boolean)
      setValues(current => (current[field.key] ? current : { ...current, [field.key]: JSON.stringify(ids) }))
    }
  }, [leadIdsParam, uiSchema])

  // ?runId=… abre directamente un resultado ya ejecutado (enlace del historial del lead).
  useEffect(() => {
    if (!runIdParam) return
    let active = true
    setRunPhase('fetching_result')
    apiFetch(`/api/microapps/runs/${runIdParam}`)
      .then(response => { if (!response.ok) throw new Error(`run_${response.status}`); return response.json() })
      .then(data => { if (active) { setRun(data?.run || data); setRunPhase('done') } })
      .catch(() => {
        if (active) { setRunPhase('idle'); setRunError({ tone: 'error', text: 'No se pudo cargar el resultado guardado. Puedes ejecutar la microapp de nuevo.' }) }
      })
    return () => { active = false }
  }, [runIdParam])

  function buildInput() {
    const input = {}
    const errors = {}
    uiSchema.forEach(field => {
      const raw = values[field.key]
      if (field.widget === 'toggle') {
        if (raw != null || field.required) input[field.key] = Boolean(raw)
        return
      }
      if (raw == null || raw === '') return
      if (inputShapeType(field.inputSchema) === 'array' || inputShapeType(field.inputSchema) === 'object') {
        const parsed = parseStructuredField(field, raw)
        if (parsed.error) errors[field.key] = parsed.error
        else input[field.key] = parsed.value
        return
      }
      input[field.key] = field.widget === 'number' ? Number(raw) : raw
    })
    return { input, errors }
  }

  function setFieldValue(key, value) {
    setValues(current => ({ ...current, [key]: value }))
    setEstimate(null) // el coste estimado deja de valer si cambia la entrada
    idempotencyRef.current = null
    setFieldErrors(current => (current[key] ? { ...current, [key]: undefined } : current))
  }

  function agenticConfig() {
    if (!agenticEnabled) return undefined
    return {
      enabled: true,
      strategy: 'closed_loop',
      rounds: Number(agenticRounds),
      qualityThreshold: Number(agenticThreshold),
      maxAdditionalCostCents: Number(agenticBudgetCents),
      allowExternalReview: true,
    }
  }

  async function installAgenticFlow() {
    if (!agenticEnabled) {
      setRunError({ tone: 'warn', text: 'Activa el Consejo de agentes para autorizar la revisión externa antes de instalar el workflow.' })
      return
    }
    setInstallingFlow(true)
    setRunError(null)
    try {
      const response = await apiFetch(`/api/microapps/${encodeURIComponent(id)}/agentic-flow/install`, { method: 'POST', body: JSON.stringify({ allowExternalReview: true }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `No se pudo instalar el workflow (${response.status}).`)
      setInstalledFlowId(body?.flow?.id || null)
    } catch (error) {
      setRunError({ tone: 'error', text: error?.message || 'No se pudo instalar el workflow agentic.' })
    } finally {
      setInstallingFlow(false)
    }
  }

  async function toggleConfig() {
    if (configOpen) { setConfigOpen(false); return }
    setConfigBusy(true)
    try {
      const response = await apiFetch(`/api/microapps/${encodeURIComponent(id)}/config`)
      const body = await response.json().catch(() => ({}))
      const org = Array.isArray(body?.configs) ? body.configs.find(item => item.scope === 'organization') : null
      setConfigFields(Array.isArray(body?.fields) ? body.fields : [])
      setConfigValues(org?.values && typeof org.values === 'object' ? org.values : {})
      setConfigOpen(true)
    } catch { setRunError({ tone: 'error', text: 'No se pudo cargar la configuración.' }) } finally { setConfigBusy(false) }
  }

  async function saveConfig() {
    setConfigBusy(true)
    try {
      const response = await apiFetch(`/api/microapps/${encodeURIComponent(id)}/config`, { method: 'PUT', body: JSON.stringify({ scope: 'organization', values: configValues }) })
      if (!response.ok) throw new Error('config')
      setRunError({ tone: 'success', text: 'Configuración guardada para la organización.' }); setConfigOpen(false)
    } catch { setRunError({ tone: 'error', text: 'No se pudo guardar la configuración.' }) } finally { setConfigBusy(false) }
  }

  async function requestEstimate() {
    setEstimating(true)
    setRunError(null)
    try {
      const built = buildInput()
      if (Object.keys(built.errors).length) {
        setFieldErrors(built.errors)
        setRunError({ tone: 'error', text: 'Revisa los campos estructurados: contienen JSON no válido.' })
        setEstimate(null)
        return
      }
      const agentic = agenticConfig()
      const response = await apiFetch(`/api/microapps/${id}/estimate`, { method: 'POST', body: JSON.stringify({ input: built.input, ...(agentic ? { agentic } : {}) }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 400) {
          setFieldErrors(extractFieldErrors(body))
          setRunError({ tone: 'error', text: 'Revisa los campos marcados: la entrada no es válida.' })
        } else {
          setRunError({ tone: 'error', text: body.error || `No se pudo estimar el coste (${response.status}).` })
        }
        setEstimate(null)
        return
      }
      setEstimate({ cents: body.cents, baseCents: body.baseCents, agenticCents: body.agenticCents })
    } catch {
      setRunError({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    } finally {
      setEstimating(false)
    }
  }

  const loadResultForJob = useCallback(async (finishedJobId) => {
    setRunPhase('fetching_result')
    try {
      // Sin endpoint job→run directo en el contrato: se lista por microapp y se filtra por jobId.
      const response = await apiFetch(`/api/microapps/runs?microappId=${encodeURIComponent(id)}`)
      if (!response.ok) throw new Error(`runs_${response.status}`)
      const data = await response.json()
      const list = Array.isArray(data) ? data : Array.isArray(data?.runs) ? data.runs : Array.isArray(data?.items) ? data.items : []
      const summary = list.find(item => item.jobId === finishedJobId)
      if (!summary?.id) throw new Error('run_not_found')
      const detailResponse = await apiFetch(`/api/microapps/runs/${summary.id}`)
      if (!detailResponse.ok) throw new Error(`run_${detailResponse.status}`)
      const detail = await detailResponse.json()
      if (!activeRef.current) return
      setRun(detail?.run || detail)
      setRunPhase('done')
      loadHistory()
    } catch {
      if (!activeRef.current) return
      setRunPhase('idle')
      setRunError({ tone: 'error', text: 'El trabajo terminó pero no se pudo recuperar el resultado. Búscalo en el Centro de trabajos.' })
    }
  }, [id, loadHistory])

  function reuseInput(input) {
    const next = {}
    for (const field of uiSchema) {
      const value = input?.[field.key]
      if (value === undefined || value === null) continue
      const type = inputShapeType(field.inputSchema)
      next[field.key] = type === 'array' || type === 'object' ? JSON.stringify(value, null, 2) : value
    }
    setValues(next)
    setEstimate(null)
    setFieldErrors({})
    setRunError({ tone: 'success', text: 'Entrada recuperada. Revisa los datos y vuelve a estimar el coste antes de ejecutar.' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pollJob = useCallback(async (activeJobId) => {
    try {
      const response = await apiFetch(`/api/jobs/${activeJobId}`)
      if (response.ok) {
        const job = await response.json()
        if (!activeRef.current) return
        setJobStatus(job.status)
        if (job.status === 'succeeded') { loadResultForJob(activeJobId); return }
        if (TERMINAL_JOB_STATUSES.has(job.status)) {
          setRunPhase('idle')
          const message = job.error?.message || job.error?.code || ''
          setRunError({
            tone: 'error',
            text: job.status === 'canceled'
              ? 'El trabajo se canceló antes de terminar.'
              : `La ejecución falló${message ? `: ${message}` : '.'} Puedes reintentarlo desde aquí o desde el Centro de trabajos.`,
          })
          return
        }
      }
    } catch {
      // Error de red transitorio: el siguiente ciclo lo reintenta.
    }
    if (activeRef.current) pollRef.current = setTimeout(() => pollJob(activeJobId), JOB_POLL_MS)
  }, [loadResultForJob])

  async function runMicroapp() {
    setRunPhase('launching')
    setRunError(null)
    setFieldErrors({})
    setRun(null)
    try {
      const built = buildInput()
      if (Object.keys(built.errors).length) {
        setFieldErrors(built.errors)
        setRunError({ tone: 'error', text: 'Revisa los campos estructurados: contienen JSON no válido.' })
        setRunPhase('idle')
        return
      }
      const input = built.input
      const leadField = uiSchema.find(field => field.widget === 'lead')
      const accountField = uiSchema.find(field => field.widget === 'account')
      const productionField = uiSchema.find(field => field.key === 'productionId')
      const callField = uiSchema.find(field => field.widget === 'call')
      const opportunityField = uiSchema.find(field => field.widget === 'opportunity')
      const conversationField = uiSchema.find(field => field.widget === 'conversation')
      const meetingField = uiSchema.find(field => field.widget === 'meeting')
      const leadId = (leadField && input[leadField.key]) || leadIdParam || undefined
      const accountId = accountField && input[accountField.key] ? String(input[accountField.key]) : undefined
      const productionId = productionField && input[productionField.key] ? String(input[productionField.key]) : undefined
      const callId = callField && input[callField.key] ? String(input[callField.key]) : callIdParam || undefined
      const opportunityId = opportunityField && input[opportunityField.key] ? String(input[opportunityField.key]) : opportunityIdParam || undefined
      const conversationId = conversationField && input[conversationField.key] ? String(input[conversationField.key]) : conversationIdParam || undefined
      const meetingId = meetingField && input[meetingField.key] ? String(input[meetingField.key]) : meetingIdParam || undefined
      const idempotencyKey = idempotencyRef.current || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      idempotencyRef.current = idempotencyKey
      const response = await apiFetch(`/api/microapps/${id}/run`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          input,
          ...(leadId ? { leadId } : {}),
          ...(accountId ? { accountId } : {}),
          ...(productionId ? { productionId } : {}),
          ...(callId ? { callId } : {}),
          ...(opportunityId ? { opportunityId } : {}),
          ...(conversationId ? { conversationId } : {}),
          ...(meetingId ? { meetingId } : {}),
          ...(agenticConfig() ? { agentic: agenticConfig() } : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // Un 4xx prueba que la petición fue rechazada y la clave puede
        // descartarse. En 429/5xx el servidor pudo haber creado el Job antes
        // de perder la respuesta: conservarla hace que Reintentar recupere el
        // mismo trabajo en vez de duplicarlo.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          idempotencyRef.current = null
        }
        setRunPhase('idle')
        if (response.status === 400) {
          setFieldErrors(extractFieldErrors(body))
          setRunError({ tone: 'error', text: 'Revisa los campos marcados: la entrada no es válida.' })
        } else if (response.status === 402) {
          const actions = Array.isArray(body.actions) ? body.actions : []
          const parts = ['No hay saldo suficiente para ejecutar esta microapp.']
          if (actions.includes('topup')) parts.push('Recarga tu monedero desde Configuración → Plan y facturación.')
          if (actions.includes('byok')) parts.push('O conecta tu propia clave del proveedor en el Centro de conexiones (sin coste gestionado).')
          setRunError({ tone: 'warn', text: parts.join(' '), showConnections: actions.includes('byok') })
        } else if (response.status === 403) {
          setRunError({ tone: 'error', text: 'Tu rol no tiene permiso para ejecutar microapps. Pide acceso a un administrador.' })
        } else {
          setRunError({ tone: 'error', text: body.error || `No se pudo lanzar la ejecución (${response.status}).` })
        }
        return
      }
      setJobId(body.jobId)
      idempotencyRef.current = null
      setJobStatus('pending')
      setRunPhase('polling')
      pollRef.current = setTimeout(() => pollJob(body.jobId), JOB_POLL_MS)
    } catch {
      setRunPhase('idle')
      setRunError({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    }
  }

  function openMicroapp(targetId) {
    // Reset completo: el runner es la misma ruta con otro id (mismo componente montado).
    if (pollRef.current) clearTimeout(pollRef.current)
    setValues({}); setEstimate(null); setRun(null); setRunError(null); setFieldErrors({})
    setJobId(null); setJobStatus(null); setRunPhase('idle')
    idempotencyRef.current = null
    const linked = new URLSearchParams()
    if (leadIdParam) linked.set('leadId', leadIdParam)
    if (accountIdParam) linked.set('accountId', accountIdParam)
    if (productionIdParam) linked.set('productionId', productionIdParam)
    if (callIdParam) linked.set('callId', callIdParam)
    if (opportunityIdParam) linked.set('opportunityId', opportunityIdParam)
    if (conversationIdParam) linked.set('conversationId', conversationIdParam)
    if (meetingIdParam) linked.set('meetingId', meetingIdParam)
    navigate(`/microapps/${targetId}${linked.size ? `?${linked.toString()}` : ''}`)
  }

  const meta = microappCategoryMeta(app?.category)
  const collectionMeta = microappCollectionMeta(app?.collection)
  const busy = runPhase === 'launching' || runPhase === 'polling' || runPhase === 'fetching_result'

  if (appState === 'loading') return <PageLoadingState label="Cargando microapp" />

  return (
    <main className={`mapps-page dark-scroll${drawer ? ' mapps-drawer-page' : ''}`}>
      <header className="mapps-runner-topbar">
        <button type="button" className="mapps-back" onClick={() => navigate(drawer ? -1 : catalogUrl)}><RiArrowLeftLine /> {drawer ? 'Cerrar' : 'Microapps'}</button>
      </header>

      {appState === 'loading' && <div className="mapps-state" role="status"><RiLoader4Line className="mapps-spin" /><strong>Cargando microapp…</strong></div>}

      {appState === 'error' && (
        <div className="mapps-state error" role="alert">
          <RiErrorWarningLine />
          <strong>No se pudo cargar la microapp.</strong>
          <span>Comprueba tu conexión o vuelve al catálogo e inténtalo de nuevo.</span>
        </div>
      )}

      {appState === 'missing' && (
        <div className="mapps-state" role="status">
          <RiErrorWarningLine />
          <strong>Esta microapp no está en tu catálogo</strong>
          <span>Puede que la haya retirado el proveedor o que tu plan no la incluya. Revisa el catálogo para ver las disponibles.</span>
          <button type="button" className="mapps-button secondary" onClick={() => navigate(catalogUrl)}>Ver catálogo</button>
        </div>
      )}

      {appState === 'ready' && app && (
        <>
          <header className="mapps-runner-header" style={{ '--cat': meta.color, '--mapps-art': `url(${microappCategoryArt(app.category)})` }}>
            <span className="mapps-category">{meta.label}</span>
            <h1>{app.name}</h1>
            <p>{app.promise}</p>
            <div className="mapps-runner-meta">
              {app.catalogEdition === 'selected-60' && <span className="mapps-tag selected" style={{ '--collection': collectionMeta.color }}>#{app.editorialNumber} · {collectionMeta.label}</span>}
              {app.effects === 'external' && <span className="mapps-tag warn" title="Esta microapp puede actuar fuera de la plataforma (enviar, publicar…)">Efectos externos</span>}
              {app.approvalAction && <span className="mapps-tag warn" title={`Requiere aprobación humana: ${app.approvalAction}`}>Aprobación: {app.approvalAction}</span>}
              {app.freshnessDays != null && <span className="mapps-tag"><RiTimeLine /> Vigencia {app.freshnessDays} días</span>}
              {(app.capabilities || []).map(capability => <span key={capability} className="mapps-tag" data-i18n-skip>{capability}</span>)}
              {(app.dataAccess || []).map(permission => <span key={permission} className="mapps-tag" title="Permiso de datos requerido" data-i18n-skip>{permission}</span>)}
            </div>
            <button type="button" className="mapps-button secondary" onClick={toggleConfig} disabled={configBusy}><RiRestartLine /> {configBusy ? 'Cargando…' : configOpen ? 'Cerrar configuración' : 'Configurar'}</button>
          </header>

          {configOpen && <section className="mapps-panel mapps-config-panel" aria-label="Configuración de la microapp"><header><div><h2>Configurar</h2><p>Estos valores se aplican a la organización; los campos de ejecución siguen en la entrada.</p></div><button type="button" className="mapps-button primary" onClick={saveConfig} disabled={configBusy}>Guardar</button></header>{configFields.length ? configFields.map(field => <SchemaField key={field.key} field={{ ...field, inputSchema: app.inputSchema?.properties?.[field.key] || {} }} value={configValues[field.key]} error={undefined} onChange={value => setConfigValues(current => ({ ...current, [field.key]: field.widget === 'number' ? Number(value) : value }))} />) : <p className="mapps-muted">Esta microapp no tiene campos configurables fuera de la ejecución.</p>}</section>}

          <div className="mapps-runner-layout">
            <section className="mapps-panel" aria-label="Entrada de la microapp">
              <h2>Entrada</h2>
              {uiSchema.length === 0 && <p className="mapps-muted">Esta microapp no necesita datos de entrada: pulsa Ejecutar.</p>}
              <form onSubmit={event => { event.preventDefault(); runMicroapp() }}>
                {uiSchema.map(field => (
                  <SchemaField
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    error={fieldErrors[field.key] || undefined}
                    onChange={value => setFieldValue(field.key, value)}
                  />
                ))}
                {fieldErrors[''] && <p className="mapps-run-message error" role="alert"><RiErrorWarningLine /> {fieldErrors['']}</p>}

                {runError && (
                  <p className={`mapps-run-message ${runError.tone}`} role={runError.tone === 'error' ? 'alert' : 'status'}>
                    <RiErrorWarningLine /> {runError.text}
                    {runError.showConnections && (
                      <button type="button" className="mapps-inline-link" onClick={() => navigate('/conexiones')}>Abrir Centro de conexiones</button>
                    )}
                  </p>
                )}

                <section className="mapps-agentic-config">
                  <label>
                    <input
                      type="checkbox"
                      checked={agenticEnabled}
                      onChange={event => { setAgenticEnabled(event.target.checked); setEstimate(null); idempotencyRef.current = null }}
                    />
                    <span><strong>Consejo de agentes</strong><small>Tres especialistas y un presidente revisan el resultado en circuito cerrado.</small></span>
                  </label>
                  {agenticEnabled && (
                    <>
                      <p><RiShieldCheckLine /> Autorizas la revisión externa con campos sensibles redactados. En circuito cerrado, una mejora solo sustituye el resultado si vuelve a cumplir el contrato de esta microapp; los valores protegidos se conservan.</p>
                      <div>
                        <label>Rondas<input type="number" min="1" max="3" value={agenticRounds} onChange={event => { setAgenticRounds(event.target.value); setEstimate(null); idempotencyRef.current = null }} /></label>
                        <label>Umbral<input type="number" min="60" max="100" value={agenticThreshold} onChange={event => { setAgenticThreshold(event.target.value); setEstimate(null); idempotencyRef.current = null }} /></label>
                        <label>Tope adicional (¢)<input type="number" min="1" max="100000" value={agenticBudgetCents} onChange={event => { setAgenticBudgetCents(event.target.value); setEstimate(null); idempotencyRef.current = null }} /></label>
                      </div>
                    </>
                  )}
                  <div className="mapps-agentic-install">
                    <button type="button" className="mapps-button secondary" disabled={installingFlow || !agenticEnabled} onClick={installAgenticFlow} title={!agenticEnabled ? 'Activa el consejo para autorizar la revisión externa' : undefined}>
                      {installingFlow ? 'Instalando…' : installedFlowId ? 'Workflow instalado' : 'Instalar como workflow'}
                    </button>
                    {installedFlowId && <button type="button" className="mapps-inline-link" onClick={() => navigate(`/capacidades?tab=flows&flow=${encodeURIComponent(installedFlowId)}`)}>Abrir workflow <RiExternalLinkLine /></button>}
                  </div>
                </section>

                <div className="mapps-run-row">
                  <button type="button" className="mapps-button secondary" disabled={estimating || busy} onClick={requestEstimate}>
                    <RiCoinsLine /> {estimating ? 'Estimando…' : 'Estimar coste'}
                  </button>
                  <button type="submit" className="mapps-button primary" disabled={busy || !estimate} title={!estimate ? 'Estima el coste antes de ejecutar' : undefined}>
                    <RiPlayCircleLine /> {runPhase === 'launching' ? 'Lanzando…' : 'Ejecutar'}
                  </button>
                </div>
                {estimate && estimate.agenticCents != null && (
                  <p className="mapps-estimate">
                    Coste máximo estimado: <strong>{formatCents(estimate.cents)}</strong>
                    {estimate.agenticCents != null && <small>Microapp {formatCents(estimate.baseCents)} + consejo {formatCents(estimate.agenticCents)}</small>}
                  </p>
                )}
                {estimate && estimate.agenticCents == null && (
                  <p className="mapps-estimate" role="status">
                    Coste estimado: <strong>{formatCents(estimate.cents)}</strong>
                    <small> — se confirma como coste real al terminar (visible en el Centro de trabajos).</small>
                  </p>
                )}
                {!estimate && <p className="mapps-muted">Estima el coste para habilitar la ejecución. Si cambias una entrada, la estimación se invalida.</p>}
              </form>
            </section>

            {(runPhase === 'polling' || runPhase === 'fetching_result') && (
              <section className="mapps-panel mapps-progress" role="status" aria-label="Progreso de la ejecución">
                <RiLoader4Line className="mapps-spin" />
                <strong>
                  {runPhase === 'fetching_result' ? 'Recuperando el resultado…'
                    : jobStatus === 'running' ? 'Ejecutando…'
                      : jobStatus === 'awaiting_approval' ? 'Esperando aprobación…'
                        : 'En cola…'}
                </strong>
                <span>La ejecución corre como un trabajo en segundo plano; puedes seguirla también desde el Centro de trabajos.</span>
                {jobId && (
                  <button type="button" className="mapps-inline-link" onClick={() => navigate(`/trabajos?job=${jobId}`)}>
                    Ver en el Centro de trabajos <RiExternalLinkLine />
                  </button>
                )}
              </section>
            )}

            {runPhase === 'done' && run && (
              <RunResult run={run} app={app} followUps={app.followUps} onRunMicroapp={openMicroapp} onReuseInput={reuseInput} navigate={navigate} />
            )}
          </div>
          <RunHistory runs={recentRuns} loading={historyLoading} selectedId={run?.id} onOpen={openRun} />
        </>
      )}
    </main>
  )
}
