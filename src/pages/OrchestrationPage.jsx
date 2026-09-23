import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine,
  RiAlertLine,
  RiArrowDownSLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiHistoryLine,
  RiFlowChart,
  RiInformationLine,
  RiLightbulbLine,
  RiLoader4Line,
  RiLockLine,
  RiMapPin2Line,
  RiMoneyEuroCircleLine,
  RiPlayLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSparkling2Line,
  RiTimeLine,
} from 'react-icons/ri'
import {
  ACTION_EFFECT_LABELS,
  EMPTY_ORCHESTRATION_FORM,
  PHASE_META,
  RISK_META,
  flattenPlanSteps,
  getPlanStats,
  getOrchestrationPlan,
  approveOrchestrationPlan,
  rejectOrchestrationPlan,
  executeOrchestrationPlan,
  rollbackOrchestrationPlan,
  isLivePlan,
  isLivePlanPollingStatus,
  requestOrchestrationPlan,
  validateOrchestrationInput,
  buildActionsPayload,
  createActionSelection,
  fetchOrchestrationActionCatalog,
  getPlanStatusMeta,
  listOrchestrationPlans,
  selectionFromPlanActions,
  suggestOrchestrationActions,
  validateActionSelection,
} from '../lib/orchestration'
import { getLocale, localeCode, useI18n } from '../i18n'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './orchestration.css'
import './growth-visual-standard.css'

const PHASE_KEYS = Object.keys(PHASE_META)

function formatGeneratedAt(value) {
  if (!value) return 'ahora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'ahora'
  return new Intl.DateTimeFormat(localeCode(getLocale()), { hour: '2-digit', minute: '2-digit' }).format(date)
}

function findStep(plan, stepId) {
  return flattenPlanSteps(plan).find(step => step.id === stepId)
}

function updatePlanStep(currentPlan, stepId, changes) {
  if (!currentPlan) return currentPlan
  return {
    ...currentPlan,
    phases: currentPlan.phases.map(phase => ({
      ...phase,
      steps: phase.steps.map(step => step.id === stepId ? { ...step, ...changes } : step),
    })),
  }
}

function FieldError({ error }) {
  return error ? <span className="orch-field-error" role="alert">{error}</span> : null
}

function RiskBadge({ risk }) {
  const meta = RISK_META[risk] || RISK_META.medium
  return <span className={`orch-risk-badge orch-risk-badge--${risk}`}><i />{meta.label}</span>
}

function StepStatus({ step }) {
  if (step.executed) return <span className="orch-step-status orch-step-status--done"><RiCheckLine /> {step.statusLabel || 'Ejecutado'}</span>
  if (step.requiresPlanApproval && !step.approved) return <span className="orch-step-status orch-step-status--blocked"><RiLockLine /> Requiere aprobación del plan</span>
  if (step.approvalRequired && !step.approved) return <span className="orch-step-status orch-step-status--blocked"><RiLockLine /> Requiere aprobación</span>
  if (step.approved) return <span className="orch-step-status orch-step-status--approved"><RiShieldCheckLine /> Aprobado</span>
  return <span className="orch-step-status orch-step-status--ready"><RiCheckboxCircleLine /> Listo para revisar</span>
}

function StepCard({ step, onApprove, onExecute, busy, live }) {
  const needsApproval = step.approvalRequired || step.requiresPlanApproval
  const blockedByApproval = needsApproval && !step.approved
  const blockedByRisk = !live && step.risk !== 'low' && !step.executed
  const canExecute = !step.executed && !blockedByApproval && !blockedByRisk

  return (
    <li className={`orch-step${step.executed ? ' is-executed' : ''}${blockedByApproval ? ' is-blocked' : ''}`}>
      <div className="orch-step-index" aria-hidden="true">{step.executed ? <RiCheckLine /> : <span />}</div>
      <div className="orch-step-body">
        <div className="orch-step-head">
          <div>
            <div className="orch-step-title-line">
              <h3>{step.title}</h3>
              <RiskBadge risk={step.risk} />
            </div>
            <p>{step.description}</p>
          </div>
          <StepStatus step={step} />
        </div>

        <dl className="orch-step-facts">
          <div>
            <dt>Módulo</dt>
            <dd><Link to={step.moduleRoute}>{step.module}<RiExternalLinkLine /></Link></dd>
          </div>
          <div>
            <dt>Dependencia</dt>
            <dd>{step.dependency}</dd>
          </div>
          <div>
            <dt>Tiempo estimado</dt>
            <dd><RiTimeLine /> {step.estimate}</dd>
          </div>
        </dl>

        <div className="orch-step-explainability">
          <RiInformationLine aria-hidden="true" />
          <span><strong>Por qué está aquí:</strong> {step.explainability}</span>
        </div>

        <footer className="orch-step-actions">
          <Link className="orch-step-link" to={step.moduleRoute}>{step.ctaLabel}<RiArrowRightLine /></Link>
          <div className="orch-step-buttons">
            {needsApproval && !step.approved && !step.executed ? (
              <button type="button" className="orch-button orch-button--approve" onClick={() => onApprove(step.id)} disabled={busy}>
                <RiShieldCheckLine /> {live ? 'Aprobar plan' : 'Aprobar paso'}
              </button>
            ) : null}
            {!step.executed && canExecute ? (
              <button type="button" className="orch-button orch-button--demo" onClick={() => onExecute(step.id)} disabled={busy}>
                {busy ? <RiLoader4Line className="orch-spin" /> : <RiPlayLine />} {busy ? 'Ejecutando…' : step.executionLabel}
              </button>
            ) : null}
            {!step.executed && !canExecute ? (
              <span className="orch-protected-action"><RiLockLine /> {blockedByApproval ? 'Bloqueado hasta aprobación' : 'La ejecución real requiere revisión'}</span>
            ) : null}
          </div>
        </footer>
      </div>
    </li>
  )
}

function PhaseCard({ phase, index, expanded, onToggle, onApprove, onExecute, busyStep, live }) {
  const phaseExecuted = phase.steps.filter(step => step.executed).length
  const phaseProgress = phase.steps.length ? Math.round((phaseExecuted / phase.steps.length) * 100) : 0

  return (
    <section className={`orch-phase orch-phase--${phase.id}`} aria-labelledby={`orch-phase-title-${phase.id}`}>
      <header className="orch-phase-header">
        <div className="orch-phase-number" style={{ '--phase-color': phase.color }}>{index + 1}</div>
        <div className="orch-phase-heading">
          <span style={{ color: phase.color }}>{phase.kicker}</span>
          <h2 id={`orch-phase-title-${phase.id}`}>{phase.label}</h2>
          <p>{phase.description}</p>
        </div>
        <div className="orch-phase-progress">
          <strong>{phaseExecuted}/{phase.steps.length}</strong>
          <span>{phaseProgress}% ejecutado</span>
        </div>
        <button type="button" className="orch-phase-toggle" onClick={() => onToggle(phase.id)} aria-expanded={expanded} aria-controls={`orch-phase-steps-${phase.id}`}>
          <span>{expanded ? 'Ocultar pasos' : 'Ver pasos'}</span>
          <RiArrowDownSLine aria-hidden="true" />
        </button>
      </header>
      <div className="orch-phase-progress-line" aria-hidden="true"><i style={{ width: `${phaseProgress}%`, background: phase.color }} /></div>
      {expanded ? (
        <ol className="orch-step-list" id={`orch-phase-steps-${phase.id}`}>
          {phase.steps.map(step => <StepCard key={step.id} step={step} onApprove={onApprove} onExecute={onExecute} busy={busyStep === step.id || (live && busyStep === 'plan')} live={live} />)}
        </ol>
      ) : null}
    </section>
  )
}

function GoalContext({ plan }) {
  return (
    <div className="orch-context-grid" aria-label="Contexto del objetivo">
      <span><RiTimeLine /> {plan.durationLabel}</span>
      <span><RiMapPin2Line /> {plan.locationLabel}</span>
      <span><RiMoneyEuroCircleLine /> {plan.budgetLabel}</span>
      <span><RiCheckboxCircleLine /> {plan.desiredResultLabel}</span>
    </div>
  )
}

function EmptyState({ onExample, onDemo }) {
  return (
    <section className="orch-empty-state" aria-labelledby="orch-empty-title">
      <div className="orch-empty-orbit" aria-hidden="true"><RiSparkling2Line /></div>
      <div className="orch-empty-copy">
        <span className="orch-section-kicker">Dirección asistida</span>
        <h2 id="orch-empty-title">Aún no hay un plan de acción</h2>
        <p>Escribe un objetivo comercial y el orquestador lo convertirá en fases conectadas. El modo live persiste el plan y protege cada efecto con aprobación; el modo demo es explícito y local.</p>
          <div className="orch-empty-actions">
            <button type="button" className="orch-button orch-button--primary" onClick={onExample}><RiLightbulbLine /> Usar un ejemplo</button>
            <button type="button" className="orch-button orch-button--ghost" onClick={onDemo}><RiPlayLine /> Probar demo explícita</button>
          <span><RiShieldCheckLine /> El gasto, la publicación y el contacto masivo siempre quedan protegidos.</span>
        </div>
      </div>
      <div className="orch-empty-phases" aria-label="Fases que tendrá el plan">
        {PHASE_KEYS.map((key, index) => {
          const phase = PHASE_META[key]
          return <div className="orch-empty-phase" key={key}><b style={{ '--phase-color': phase.color }}>{index + 1}</b><span>{phase.label}</span>{index < PHASE_KEYS.length - 1 ? <i aria-hidden="true" /> : null}</div>
        })}
      </div>
    </section>
  )
}

function Guardrails({ plan }) {
  return (
    <section className="orch-rail-panel orch-guardrail-panel" aria-labelledby="orch-guardrail-title">
      <div className="orch-rail-heading"><div><span className="orch-section-kicker">Control de ejecución</span><h2 id="orch-guardrail-title">Límites visibles</h2></div><RiShieldCheckLine /></div>
      <p className="orch-rail-intro">El plan puede coordinar módulos sin convertir una sugerencia en una acción externa.</p>
      <div className="orch-guardrail-list">
        {plan.guardrails.map(item => <div key={item.id} className={`orch-guardrail orch-guardrail--${item.tone}`}><span><RiLockLine /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}
      </div>
    </section>
  )
}

function NextModules() {
  const modules = [
    { label: 'Ads', route: '/captacion/atraer/ads', color: 'var(--accent-soft)' },
    { label: 'Orgánico y social', route: '/captacion/atraer/organico', color: 'var(--lime)' },
    { label: 'Prospect Finder', route: '/captacion/atraer/prospectos', color: 'var(--cyan)' },
    { label: 'Pipeline', route: '/pipeline', color: 'var(--cyan-deep)' },
    { label: 'Reuniones', route: '/reuniones', color: 'var(--warn)' },
    { label: 'Automatizaciones', route: '/automatizaciones', color: 'var(--danger-soft)' },
  ]
  return (
    <section className="orch-rail-panel orch-next-panel" aria-labelledby="orch-next-title">
      <div className="orch-rail-heading"><div><span className="orch-section-kicker">Módulos conectados</span><h2 id="orch-next-title">Dónde continuar</h2></div><RiFlowChart /></div>
      <div className="orch-next-links">
        {modules.map(module => <Link to={module.route} key={module.route}><i style={{ background: module.color }} />{module.label}<RiArrowRightLine /></Link>)}
      </div>
    </section>
  )
}

const RECENT_PLANS_PAGE = 6

function ActionFieldInput({ field, value, onChange, idPrefix }) {
  const id = `${idPrefix}-${field.key}`
  const required = field.required === true
  const label = <span>{field.label}{field.type === 'cents' ? ' (€)' : ''} {required ? <em>Obligatorio</em> : field.required === 'unless_resolved' ? <small>Obligatorio si no se resuelve</small> : <small>Opcional</small>}</span>
  if (field.type === 'platforms') {
    const selected = Array.isArray(value) ? value : []
    return (
      <fieldset className="orch-field orch-field--wide orch-action-platforms">
        <legend>{label}</legend>
        <div>{(field.options || []).map(option => (
          <label key={option} className={selected.includes(option) ? 'is-selected' : ''}>
            <input type="checkbox" checked={selected.includes(option)} onChange={event => onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option))} /> {option}
          </label>
        ))}</div>
        {field.hint ? <small>{field.hint}</small> : null}
      </fieldset>
    )
  }
  return (
    <label className={`orch-field${field.type === 'longText' ? ' orch-field--wide' : ''}`} htmlFor={id}>
      {label}
      {field.type === 'stage' ? (
        <select id={id} value={value ?? ''} onChange={event => onChange(event.target.value)}>
          <option value="">Selecciona…</option>
          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.type === 'longText' ? (
        <textarea id={id} rows="2" value={value ?? ''} onChange={event => onChange(event.target.value)} />
      ) : (
        <input id={id} type={field.type === 'cents' || field.type === 'integer' ? 'number' : 'text'} min={field.type === 'integer' ? 1 : field.type === 'cents' ? 0 : undefined} step={field.type === 'cents' ? '0.01' : undefined} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={field.type === 'reference' ? 'ID del registro en el CRM' : field.type === 'referenceList' ? 'id1, id2, id3' : undefined} />
      )}
      {field.hint ? <small>{field.hint}</small> : null}
    </label>
  )
}

// Selector de acciones ejecutables del modo live. Cada acción muestra solo los
// campos que su adaptador exige (catálogo del backend) y se valida en local
// con las mismas reglas antes de enviar el plan.
function ActionSelector({ catalog, catalogState, catalogError, onRetryCatalog, selection, onChange, errors, generalError, onSuggest }) {
  const [kindToAdd, setKindToAdd] = useState('')
  if (catalogState === 'loading') return <div className="orch-actions-panel" role="status"><RiLoader4Line className="orch-spin" /> Cargando acciones disponibles…</div>
  if (catalogState === 'error') return <div className="orch-actions-panel orch-actions-panel--error" role="alert"><RiAlertLine /><span>No se pudo cargar el catálogo de acciones: {catalogError}</span><button type="button" className="orch-button orch-button--ghost" onClick={onRetryCatalog}><RiRefreshLine /> Reintentar</button></div>
  const updateValue = (key, field, value) => onChange(selection.map(item => item.key === key ? { ...item, values: { ...item.values, [field]: value } } : item))
  const move = (index, delta) => {
    const next = [...selection]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <section className="orch-actions-panel" aria-labelledby="orch-actions-title">
      <div className="orch-actions-heading">
        <div><span className="orch-section-kicker">Acciones ejecutables</span><h3 id="orch-actions-title">Qué hará el plan al aprobarlo</h3><p>Todas quedan protegidas por aprobación. El orden importa: una landing previa permite resolver la campaña de Ads o social.</p></div>
        <button type="button" className="orch-button orch-button--ghost" onClick={onSuggest}><RiLightbulbLine /> Sugerir según objetivo</button>
      </div>
      {selection.length === 0 ? <p className="orch-actions-empty">Aún no hay acciones. Usa la sugerencia o añade una del catálogo.</p> : null}
      <ol className="orch-action-list">
        {selection.map((item, index) => {
          const entry = catalog.find(candidate => candidate.kind === item.kind)
          return (
            <li key={item.key} className={`orch-action-card${errors[item.key] ? ' has-error' : ''}`}>
              <header>
                <b>{index + 1}</b>
                <div><strong>{entry?.title || item.kind}</strong><small>{ACTION_EFFECT_LABELS[entry?.effects] || ''}{entry?.compensation === 'manual_review' ? ' · rollback con revisión manual' : ''}</small></div>
                <div className="orch-action-controls">
                  <button type="button" aria-label="Subir acción" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" aria-label="Bajar acción" disabled={index === selection.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" aria-label={`Quitar ${entry?.title || item.kind}`} onClick={() => onChange(selection.filter(other => other.key !== item.key))}><RiDeleteBinLine /></button>
                </div>
              </header>
              {entry?.fields?.length ? <div className="orch-action-fields">{entry.fields.map(field => <ActionFieldInput key={field.key} field={field} value={item.values?.[field.key]} idPrefix={item.key} onChange={value => updateValue(item.key, field.key, value)} />)}</div> : null}
              {errors[item.key] ? <FieldError error={errors[item.key]} /> : null}
            </li>
          )
        })}
      </ol>
      <div className="orch-action-add">
        <label className="orch-field"><span>Añadir acción</span>
          <select value={kindToAdd} onChange={event => setKindToAdd(event.target.value)}>
            <option value="">Selecciona una acción…</option>
            {catalog.map(entry => <option key={entry.kind} value={entry.kind}>{entry.title}{entry.effects === 'external' ? ' (externa)' : ''}</option>)}
          </select>
        </label>
        <button type="button" className="orch-button orch-button--ghost" disabled={!kindToAdd || selection.length >= 32} onClick={() => { onChange([...selection, createActionSelection(kindToAdd)]); setKindToAdd('') }}><RiAddLine /> Añadir</button>
      </div>
      {generalError ? <FieldError error={generalError} /> : null}
    </section>
  )
}

function RecentPlans({ state, items, total, hasMore, error, activeId, busyId, onOpen, onMore, onRetry }) {
  return (
    <section className="orch-rail-panel orch-recent-panel" aria-labelledby="orch-recent-title">
      <div className="orch-rail-heading"><div><span className="orch-section-kicker">Historial persistente</span><h2 id="orch-recent-title">Planes recientes</h2></div><RiHistoryLine /></div>
      {state === 'loading' && !items.length ? <p className="orch-rail-intro" role="status"><RiLoader4Line className="orch-spin" /> Cargando planes…</p> : null}
      {state === 'error' ? <div className="orch-recent-error" role="alert"><span>{error}</span><button type="button" className="orch-button orch-button--ghost" onClick={onRetry}><RiRefreshLine /> Reintentar</button></div> : null}
      {state === 'ready' && !items.length ? <p className="orch-rail-intro">Aún no hay planes live guardados en tu organización.</p> : null}
      {items.length ? (
        <ul className="orch-recent-list">
          {items.map(item => {
            const meta = getPlanStatusMeta(item.status)
            return (
              <li key={item.id} className={item.id === activeId ? 'is-active' : ''}>
                <button type="button" onClick={() => onOpen(item.id)} disabled={Boolean(busyId)} aria-current={item.id === activeId ? 'true' : undefined}>
                  <strong>{item.objective || 'Plan sin objetivo'}</strong>
                  <small>{meta.label} · {item.actionCount} acciones · {formatPlanDate(item.createdAt)}</small>
                  {busyId === item.id ? <RiLoader4Line className="orch-spin" /> : <RiArrowRightLine />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {items.length ? <p className="orch-rail-intro">{items.length} de {total} planes</p> : null}
      {hasMore ? <button type="button" className="orch-button orch-button--ghost" onClick={onMore} disabled={state === 'loading'}>{state === 'loading' ? 'Cargando…' : 'Ver más'}</button> : null}
    </section>
  )
}

function formatPlanDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(localeCode(getLocale()), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

export default function OrchestrationPage({ sectionNavigation = null }) {
  const { locale } = useI18n()
  const [form, setForm] = useState(EMPTY_ORCHESTRATION_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [plan, setPlan] = useState(null)
  const [executionMode, setExecutionMode] = useState('live')
  const [isLoading, setIsLoading] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [connectionNotice, setConnectionNotice] = useState('')
  const [toast, setToast] = useState('')
  const [busyStep, setBusyStep] = useState('')
  const [expandedPhases, setExpandedPhases] = useState(() => new Set(PHASE_KEYS))
  const objectiveRef = useRef(null)
  const [catalog, setCatalog] = useState([])
  const [catalogState, setCatalogState] = useState('loading')
  const [catalogError, setCatalogError] = useState('')
  const [catalogReload, setCatalogReload] = useState(0)
  const [selection, setSelection] = useState([])
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [actionErrors, setActionErrors] = useState({})
  const [actionGeneralError, setActionGeneralError] = useState('')
  const [recent, setRecent] = useState({ state: 'loading', items: [], total: 0, hasMore: false, error: '' })
  const [openingPlanId, setOpeningPlanId] = useState('')

  useEffect(() => {
    let active = true
    setCatalogState('loading')
    fetchOrchestrationActionCatalog()
      .then(result => { if (!active) return; setCatalog(result.actions); setCatalogState('ready') })
      .catch(error => { if (!active) return; setCatalogError(error?.message || 'Error desconocido.'); setCatalogState('error') })
    return () => { active = false }
  }, [catalogReload])

  const loadRecentPlans = useCallback(async ({ append = false, offset = 0 } = {}) => {
    setRecent(current => ({ ...current, state: 'loading', error: '' }))
    try {
      const result = await listOrchestrationPlans({ limit: RECENT_PLANS_PAGE, offset })
      setRecent(current => ({ state: 'ready', error: '', total: result.total, hasMore: result.hasMore, items: append ? [...current.items, ...result.items.filter(item => !current.items.some(existing => existing.id === item.id))] : result.items }))
    } catch (error) {
      setRecent(current => ({ ...current, state: 'error', error: error?.message || 'No se pudieron cargar los planes.' }))
    }
  }, [])

  useEffect(() => { void loadRecentPlans() }, [loadRecentPlans])

  // Mientras el usuario no toque la selección, se mantiene la propuesta por
  // defecto alineada con el objetivo, el presupuesto y el catálogo cargado.
  useEffect(() => {
    if (catalogState !== 'ready' || selectionTouched) return
    setSelection(suggestOrchestrationActions(form, catalog))
  }, [catalogState, catalog, form, selectionTouched])

  function changeSelection(next) {
    setSelectionTouched(true)
    setSelection(next)
    setActionErrors({})
    setActionGeneralError('')
  }

  function applySuggestion() {
    setSelectionTouched(false)
    setActionErrors({})
    setActionGeneralError('')
  }

  const stats = useMemo(() => getPlanStats(plan), [plan])
  const livePlan = isLivePlan(plan)
  const isDirty = Boolean(plan && JSON.stringify(form) !== JSON.stringify({ ...EMPTY_ORCHESTRATION_FORM, ...plan.input, budget: plan.input.budget == null ? '' : String(plan.input.budget) }))

  useEffect(() => {
    if (!livePlan || !plan?.id || !isLivePlanPollingStatus(plan.status)) return undefined
    const timer = window.setInterval(async () => {
      try {
        const result = await getOrchestrationPlan(plan.id)
        if (result?.plan) setPlan(result.plan)
      } catch {
        // The current persisted plan remains visible while the worker/provider
        // is temporarily unavailable; the next polling cycle can recover it.
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [livePlan, plan?.id, plan?.status])

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(current => ({ ...current, [field]: '' }))
  }

  async function generatePlan(event) {
    event?.preventDefault()
    const errors = validateOrchestrationInput(form)
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      setGenerationError('Revisa los campos marcados para poder construir el plan.')
      objectiveRef.current?.focus()
      return
    }

    let actions
    if (executionMode === 'live') {
      if (catalogState !== 'ready') {
        setGenerationError('El catálogo de acciones no está disponible; reinténtalo antes de crear un plan live.')
        return
      }
      const { errors: selectionErrors, general } = validateActionSelection(selection, catalog, { budget: form.budget })
      setActionErrors(selectionErrors)
      setActionGeneralError(general)
      if (Object.keys(selectionErrors).length || general) {
        setGenerationError('Revisa las acciones ejecutables marcadas antes de crear el plan live.')
        return
      }
      actions = buildActionsPayload(selection, catalog)
    }

    setFieldErrors({})
    setGenerationError('')
    setConnectionNotice('')
    setToast('')
    setIsLoading(true)
    try {
      const result = await requestOrchestrationPlan(form, { mode: executionMode, actions })
      if (!result?.plan) throw new Error('No se recibió un plan válido.')
      setPlan(result.plan)
      setExpandedPhases(new Set(PHASE_KEYS))
      if (result.source === 'live') {
        setToast('Plan persistente creado desde la API.')
        void loadRecentPlans()
      }
      if (result.source === 'demo') setConnectionNotice('Modo demo explícito: este plan no escribe en la API ni en ningún proveedor.')
    } catch (error) {
      // 422: el backend explica qué referencia o límite falta (EXECUTABLE_ACTIONS_REQUIRED, ACTION_REFERENCE_REQUIRED…).
      const message = error?.message || 'No pudimos generar el plan. Puedes reintentarlo sin perder el objetivo.'
      setGenerationError(error?.status === 422 ? `El backend rechazó las acciones (${error.code}): ${message}` : message)
    } finally {
      setIsLoading(false)
    }
  }

  function useExample() {
    const example = {
      objective: 'Conseguir 20 pacientes de implantes',
      period: '60 días',
      location: 'Valencia',
      budget: '1800',
      desiredResult: '20 pacientes cualificados y 12 reuniones agendadas',
    }
    setForm(example)
    setFieldErrors({})
    setGenerationError('')
    setSelectionTouched(false)
    requestAnimationFrame(() => objectiveRef.current?.focus())
  }

  async function openRecentPlan(planId) {
    if (!planId || openingPlanId) return
    setOpeningPlanId(planId)
    setGenerationError('')
    try {
      const result = await getOrchestrationPlan(planId)
      setPlan(result.plan)
      setExecutionMode('live')
      setForm({ ...EMPTY_ORCHESTRATION_FORM, ...result.plan.input, budget: result.plan.input.budget == null ? '' : String(result.plan.input.budget) })
      if (catalogState === 'ready') { setSelection(selectionFromPlanActions(result.plan.actions, catalog)); setSelectionTouched(true) }
      setExpandedPhases(new Set(PHASE_KEYS))
      setConnectionNotice('')
      setToast('Plan persistente reabierto desde el historial.')
    } catch (error) {
      setGenerationError(error?.message || 'No se pudo abrir el plan seleccionado.')
    } finally {
      setOpeningPlanId('')
    }
  }

  function useDemoExample() {
    setExecutionMode('demo')
    useExample()
    setToast('Modo demo explícito activado. Genera el plan para probarlo sin efectos externos.')
  }

  function toggleExecutionMode() {
    setExecutionMode(current => current === 'live' ? 'demo' : 'live')
    setConnectionNotice('')
    setToast(executionMode === 'live' ? 'Modo demo explícito activado.' : 'Modo live activado: se requiere API, autenticación y persistencia.')
  }

  function togglePhase(phaseId) {
    setExpandedPhases(current => {
      const next = new Set(current)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  async function mutateLivePlan(operation) {
    if (!plan || !livePlan || busyStep) return
    setBusyStep('plan')
    setGenerationError('')
    try {
      const result = operation === 'approve'
        ? await approveOrchestrationPlan(plan.id)
        : operation === 'reject'
          ? await rejectOrchestrationPlan(plan.id)
          : operation === 'rollback'
            ? await rollbackOrchestrationPlan(plan.id)
            : await executeOrchestrationPlan(plan.id)
      if (!result?.plan) throw new Error('La API no devolvió el plan actualizado.')
      setPlan(result.plan)
      void loadRecentPlans()
      setToast(operation === 'approve' ? 'Plan aprobado. El worker ya puede ejecutarlo.' : operation === 'reject' ? 'Plan rechazado y conservado en auditoría.' : operation === 'rollback' ? 'Rollback solicitado; el worker está compensando los efectos confirmados.' : 'Ejecución solicitada; el worker actualizará el ledger persistente.')
    } catch (error) {
      setGenerationError(error?.message || 'No se pudo actualizar el plan persistente.')
    } finally {
      setBusyStep('')
    }
  }

  function approveStep(stepId) {
    if (livePlan) {
      void mutateLivePlan('approve')
      return
    }
    const step = findStep(plan, stepId)
    if (!step || !(step.approvalRequired || step.requiresPlanApproval)) return
    setPlan(current => updatePlanStep(current, stepId, { approved: true, status: 'ready', statusLabel: 'Aprobado para ejecutar' }))
    setToast(`Aprobaste “${step.title}”. Sigue protegido contra ejecución real en esta demo.`)
  }

  async function executeStep(stepId) {
    const step = findStep(plan, stepId)
    if (!step || step.executed) return
    if (livePlan) {
      void mutateLivePlan('execute')
      return
    }
    if (step.approvalRequired && !step.approved) {
      setToast('Este paso está bloqueado: necesita aprobación antes de continuar.')
      return
    }
    if (step.risk !== 'low') {
      setToast('La demo solo ejecuta pasos de bajo riesgo. El resto queda como propuesta revisable.')
      return
    }
    setBusyStep(stepId)
    await new Promise(resolve => setTimeout(resolve, 520))
    setPlan(current => updatePlanStep(current, stepId, { executed: true, status: 'executed', statusLabel: 'Ejecutado en demo' }))
    setBusyStep('')
    setToast(`Ejecutado en demo: ${step.title}. No se ha escrito en ningún proveedor.`)
  }

  async function executeLowRisk() {
    if (!plan) return
    if (livePlan) {
      if (plan.lifecycle?.approval !== 'approved' && !['approved', 'queued', 'running', 'paused'].includes(plan.status)) {
        setToast('Aprueba primero el plan persistente antes de ejecutarlo.')
        return
      }
      void mutateLivePlan('execute')
      return
    }
    const available = flattenPlanSteps(plan).filter(step => !step.executed && step.risk === 'low' && (!step.approvalRequired || step.approved))
    if (!available.length) {
      setToast('No hay más pasos de bajo riesgo disponibles para ejecutar en demo.')
      return
    }
    setBusyStep('all')
    await new Promise(resolve => setTimeout(resolve, 700))
    setPlan(current => ({
      ...current,
      phases: current.phases.map(phase => ({
        ...phase,
        steps: phase.steps.map(step => available.some(item => item.id === step.id) ? { ...step, executed: true, status: 'executed', statusLabel: 'Ejecutado en demo' } : step),
      })),
    }))
    setBusyStep('')
    setToast(`${available.length} pasos de bajo riesgo ejecutados en demo.`)
  }

  function clearPlan() {
    setPlan(null)
    setForm(EMPTY_ORCHESTRATION_FORM)
    setSelectionTouched(false)
    setActionErrors({})
    setActionGeneralError('')
    setFieldErrors({})
    setGenerationError('')
    setConnectionNotice('')
    setToast('')
  }

  return (
    <main className="orchestration-page" aria-busy={isLoading}>
      <div className="orchestration-inner">
        <ProductPageHeader Icon={RiSparkling2Line} title={locale === 'en' ? 'Action center' : 'Centro de acciones'} description={locale === 'en' ? 'A clear objective. A connected plan. Decisions always under control.' : 'Un objetivo claro. Un plan conectado. Decisiones siempre bajo control.'} navigation={sectionNavigation} actions={<div className="orch-page-actions">
            <span className="orch-demo-badge"><i /> {livePlan ? (locale === 'en' ? 'API connected' : 'API conectada') : executionMode === 'demo' ? (locale === 'en' ? 'Explicit demo mode' : 'Modo demo explícito') : (locale === 'en' ? 'Live mode' : 'Modo live')}</span>
            <button type="button" className="orch-button orch-button--ghost" onClick={toggleExecutionMode}>{executionMode === 'live' ? (locale === 'en' ? 'Use demo' : 'Usar demo') : (locale === 'en' ? 'Back to live' : 'Volver a live')}</button>
          </div>} />

        <section className="orch-objective-panel" aria-labelledby="orch-objective-title">
          <div className="orch-panel-heading">
            <div><span className="orch-section-kicker">Entrada de dirección</span><h2 id="orch-objective-title">¿Qué quieres conseguir?</h2><p>El orquestador usará este contexto para ordenar módulos y proponer el siguiente movimiento.</p></div>
            {plan ? <div className="orch-current-plan"><RiCheckboxCircleLine /> Plan actualizado a las {formatGeneratedAt(plan.generatedAt)}</div> : null}
          </div>
          <form className="orch-goal-form" onSubmit={generatePlan} noValidate>
            <label className="orch-field orch-field--wide"><span>Objetivo comercial <em>Obligatorio</em></span><textarea ref={objectiveRef} value={form.objective} onChange={event => updateField('objective', event.target.value)} placeholder="Ej. Conseguir 20 pacientes de implantes" rows="2" aria-invalid={Boolean(fieldErrors.objective)} aria-describedby={fieldErrors.objective ? 'orch-objective-error' : undefined} />{fieldErrors.objective ? <span id="orch-objective-error"><FieldError error={fieldErrors.objective} /></span> : null}</label>
            <label className="orch-field"><span>Periodo</span><select value={form.period} onChange={event => updateField('period', event.target.value)}><option>30 días</option><option>60 días</option><option>90 días</option></select></label>
            <label className="orch-field"><span>Ubicación o mercado <em>Obligatorio</em></span><div className="orch-input-with-icon"><RiMapPin2Line aria-hidden="true" /><input value={form.location} onChange={event => updateField('location', event.target.value)} placeholder="Ej. Valencia" aria-invalid={Boolean(fieldErrors.location)} /> </div><FieldError error={fieldErrors.location} /></label>
            <label className="orch-field"><span>Presupuesto <small>Opcional</small></span><div className="orch-input-with-icon"><RiMoneyEuroCircleLine aria-hidden="true" /><input type="number" min="0" step="50" value={form.budget} onChange={event => updateField('budget', event.target.value)} placeholder="Ej. 1800" /></div></label>
            <label className="orch-field orch-field--wide"><span>Resultado deseado <em>Obligatorio</em></span><textarea value={form.desiredResult} onChange={event => updateField('desiredResult', event.target.value)} placeholder="Ej. 20 pacientes cualificados y 12 reuniones agendadas" rows="2" aria-invalid={Boolean(fieldErrors.desiredResult)} /><FieldError error={fieldErrors.desiredResult} /></label>
            {executionMode === 'live' ? (
              <div className="orch-field--wide">
                <ActionSelector catalog={catalog} catalogState={catalogState} catalogError={catalogError} onRetryCatalog={() => setCatalogReload(value => value + 1)} selection={selection} onChange={changeSelection} errors={actionErrors} generalError={actionGeneralError} onSuggest={applySuggestion} />
              </div>
            ) : (
              <p className="orch-field--wide orch-demo-note"><RiInformationLine aria-hidden="true" /> Modo demo: simulación local sin acciones ejecutables. Nada se guarda ni se envía a proveedores.</p>
            )}
            <div className="orch-form-footer">
              <div className="orch-form-helper"><RiShieldCheckLine aria-hidden="true" /><span>{isDirty ? 'Has cambiado el objetivo. Genera de nuevo para aplicar los cambios.' : 'Los pasos sensibles quedarán bloqueados hasta que alguien los apruebe.'}</span></div>
              <div className="orch-form-actions">
                {plan ? <button type="button" className="orch-button orch-button--ghost" onClick={clearPlan}><RiRefreshLine /> Empezar otro</button> : null}
                <button type="submit" className="orch-button orch-button--primary" disabled={isLoading}>{isLoading ? <><RiLoader4Line className="orch-spin" /> Preparando plan…</> : <><RiSparkling2Line /> {plan ? 'Regenerar plan' : 'Generar plan'}</>}</button>
              </div>
            </div>
          </form>
        </section>

        <RecentPlans {...recent} activeId={livePlan ? plan?.id : null} busyId={openingPlanId} onOpen={openRecentPlan} onMore={() => loadRecentPlans({ append: true, offset: recent.items.length })} onRetry={() => loadRecentPlans()} />

        {generationError ? <div className="orch-alert orch-alert--error" role="alert"><RiAlertLine /><div><strong>No pudimos completar esta generación</strong><span>{generationError}</span></div><button type="button" onClick={() => generatePlan()} disabled={isLoading}><RiRefreshLine /> Reintentar</button></div> : null}

        {isLoading ? (
          <section className="orch-loading-state" role="status" aria-live="polite"><RiLoader4Line className="orch-loading-icon orch-spin" /><div><h2>Construyendo un plan explicable…</h2><p>Estamos ordenando diagnóstico, activos, activación, monitorización y atribución.</p></div><div className="orch-loading-steps"><span /><span /><span /><span /><span /></div></section>
        ) : plan ? (
          <section className="orch-plan-section" aria-labelledby="orch-plan-title">
            <div className="orch-plan-summary">
              <div className="orch-plan-summary-copy">
                <div className="orch-plan-kicker"><RiCheckboxCircleLine /> Plan preparado · {livePlan ? 'fuente API persistente' : 'modo demo explícito'}</div>
                <h2 id="orch-plan-title">{plan.headline}</h2>
                <p>La dirección se ha traducido en {plan.phases.length} fases. Puedes revisar cada dependencia y, en modo live, aprobar y ejecutar el plan con ledger, permisos e idempotencia.</p>
                <GoalContext plan={plan} />
              </div>
              <div className="orch-progress-card" aria-label={`Progreso del plan: ${stats.progress}%`}>
                <div className="orch-progress-head"><span>{livePlan ? 'Progreso persistente' : 'Progreso demo'}</span><strong>{stats.progress}%</strong></div>
                <div className="orch-progress-bar"><i style={{ width: `${stats.progress}%` }} /></div>
                <div className="orch-progress-foot"><span>{stats.executed} de {stats.total} pasos ejecutados</span><span>{stats.blocked} bloqueados</span></div>
              </div>
            </div>

            {connectionNotice ? <div className="orch-alert orch-alert--warning" role="status"><RiInformationLine /><div><strong>Simulación: modo demo explícito</strong><span>{connectionNotice}</span></div></div> : null}

            <div className="orch-plan-toolbar"><div><span className="orch-toolbar-label">Resumen de control</span><span className="orch-toolbar-copy"><b>{stats.lowRisk}</b> pasos de bajo riesgo · <b>{stats.highRisk}</b> acciones sensibles protegidas</span></div><div className="orch-toolbar-actions">{livePlan && plan.status === 'proposal' ? <button type="button" className="orch-button orch-button--approve" onClick={() => mutateLivePlan('reject')} disabled={Boolean(busyStep)}><RiLockLine /> Rechazar</button> : null}{livePlan && ['executed', 'paused', 'failed'].includes(plan.status) ? <button type="button" className="orch-button orch-button--ghost" onClick={() => mutateLivePlan('rollback')} disabled={Boolean(busyStep)}><RiRefreshLine /> Rollback</button> : null}<button type="button" className={`orch-button ${livePlan ? 'orch-button--primary' : 'orch-button--demo'}`} onClick={executeLowRisk} disabled={Boolean(busyStep) || (!livePlan && stats.lowRisk === stats.executed)}><RiPlayLine /> {busyStep ? 'Procesando…' : livePlan ? 'Ejecutar plan' : 'Ejecutar pasos demo'}</button></div></div>

            <div className="orch-plan-layout">
              <div className="orch-phase-stack">
                {plan.phases.map((phase, index) => <PhaseCard key={phase.id} phase={phase} index={index} expanded={expandedPhases.has(phase.id)} onToggle={togglePhase} onApprove={approveStep} onExecute={executeStep} busyStep={busyStep} live={livePlan} />)}
              </div>
              <aside className="orch-rail"><Guardrails plan={plan} /><NextModules /></aside>
            </div>
          </section>
        ) : (
          <EmptyState onExample={useExample} onDemo={useDemoExample} />
        )}

        {toast ? <div className="orch-toast" role="status" aria-live="polite"><RiCheckboxCircleLine /><span>{toast}</span><button type="button" onClick={() => setToast('')} aria-label="Cerrar aviso">×</button></div> : null}
      </div>
    </main>
  )
}
