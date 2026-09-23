import { apiFetch } from './api'
import { getLocale, localeCode } from '../i18n'

export const ORCHESTRATION_API_PATH = '/api/orchestration/plan'
export const ORCHESTRATION_API_ROOT = '/api/orchestration'
export const ORCHESTRATION_SOURCE = Object.freeze({ LIVE: 'live', DEMO: 'demo' })
export const ORCHESTRATION_STATUSES = Object.freeze([
  'proposal', 'approved', 'queued', 'running', 'executed', 'paused', 'failed', 'rejected', 'rolling_back',
])

export class OrchestrationApiError extends Error {
  constructor(message, { status = 0, code = 'ORCHESTRATION_API_ERROR', details = null, retriable = false } = {}) {
    super(message)
    this.name = 'OrchestrationApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retriable = retriable
  }
}

export const EMPTY_ORCHESTRATION_FORM = {
  objective: '',
  period: '60 días',
  location: '',
  budget: '',
  desiredResult: '',
}

export const PHASE_META = {
  diagnosis: { label: 'Diagnóstico', kicker: 'Entender la oportunidad', color: 'var(--cyan)', description: 'Reunimos las señales disponibles para decidir dónde merece la pena actuar.' },
  assets: { label: 'Activos', kicker: 'Preparar la base', color: 'var(--violet)', description: 'Convertimos la estrategia en activos trazables y borradores revisables.' },
  activation: { label: 'Activación', kicker: 'Poner el plan en marcha', color: 'var(--warn)', description: 'Proponemos campañas y seguimientos; cualquier acción sensible queda protegida.' },
  monitoring: { label: 'Monitorización', kicker: 'Vigilar el sistema', color: 'var(--success)', description: 'Observamos señales, tareas y bloqueos para que el equipo sepa qué atender.' },
  attribution: { label: 'Atribución', kicker: 'Conectar con negocio', color: 'var(--pink)', description: 'Relacionamos actividad, reuniones, oportunidades e ingresos para aprender.' },
}
const PHASE_KEYS = Object.keys(PHASE_META)

export const RISK_META = {
  low: { label: 'Bajo riesgo', color: 'var(--success-soft)' },
  medium: { label: 'Riesgo medio', color: 'var(--warn-soft)' },
  high: { label: 'Alto riesgo', color: 'var(--danger-soft)' },
}

const PERIOD_DAYS = { '30 días': 30, '60 días': 60, '90 días': 90 }
const LIVE_POLLING_STATUSES = new Set(['queued', 'running', 'rolling_back'])

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normaliseBudget(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function normalisePeriod(value) {
  const period = clean(value)
  return PERIOD_DAYS[period] ? period : EMPTY_ORCHESTRATION_FORM.period
}

function escapeTarget(value) {
  return clean(value) || 'conseguir más clientes'
}

export function validateOrchestrationInput(input) {
  const errors = {}
  if (!clean(input?.objective)) errors.objective = 'Describe el objetivo comercial.'
  if (!clean(input?.location)) errors.location = 'Indica dónde quieres conseguir el resultado.'
  if (!clean(input?.desiredResult)) errors.desiredResult = 'Define cómo sabrás que el objetivo se ha cumplido.'
  return errors
}

export function normaliseOrchestrationInput(input = EMPTY_ORCHESTRATION_FORM) {
  return {
    objective: clean(input.objective),
    period: normalisePeriod(input.period),
    location: clean(input.location),
    budget: normaliseBudget(input.budget),
    desiredResult: clean(input.desiredResult),
  }
}

function createStep(phase, step) {
  return {
    ...step,
    phase,
    status: step.status || (step.approvalRequired ? 'blocked' : 'ready'),
    approved: Boolean(step.approved),
    executed: Boolean(step.executed),
  }
}

function createPhase(key, steps) {
  return { id: key, ...PHASE_META[key], steps: steps.map(step => createStep(key, step)) }
}

function demoStep(id, phase, title, module, moduleRoute, risk = 'low', approvalRequired = false) {
  return {
    id,
    title,
    description: 'Paso explicable del plan local de demostración; no escribe en ningún proveedor.',
    module,
    moduleRoute,
    statusLabel: approvalRequired ? 'Protegido hasta aprobación' : 'Listo para revisar',
    risk,
    dependency: approvalRequired ? 'Revisión humana y credenciales válidas' : 'Datos disponibles en la cuenta',
    approvalRequired,
    ctaLabel: `Abrir ${module}`,
    explainability: 'El modo demo permite explorar la experiencia sin crear efectos externos.',
    executionLabel: 'Ejecutar en demo',
    estimate: 'Por definir',
    phase,
  }
}

export function buildDemoPlan(input = EMPTY_ORCHESTRATION_FORM) {
  const context = normaliseOrchestrationInput(input)
  const target = escapeTarget(context.objective)
  const location = context.location || 'tu mercado'
  const budgetLabel = context.budget ? `${context.budget.toLocaleString(localeCode(getLocale()))} €` : 'presupuesto por definir'
  const phases = [
    createPhase('diagnosis', [
      demoStep('demo-diagnosis-organic', 'diagnosis', `Medir demanda para ${target}`, 'Orgánico y social', '/captacion/atraer/organico'),
      demoStep('demo-diagnosis-prospecting', 'diagnosis', `Encontrar prospectos parecidos en ${location}`, 'Prospect Finder', '/captacion/atraer/prospectos'),
      demoStep('demo-diagnosis-commercial', 'diagnosis', 'Establecer la línea base comercial', 'Inteligencia comercial', '/inteligencia-comercial'),
    ]),
    createPhase('assets', [
      demoStep('demo-assets-landing', 'assets', 'Preparar una landing orientada al resultado', 'Web y SEO', '/captacion/convertir?tab=landings'),
      demoStep('demo-assets-agent', 'assets', 'Alinear agente y playbook con el objetivo', 'Agentes IA', '/agentes'),
      demoStep('demo-assets-email', 'assets', 'Diseñar el seguimiento de nutrición', 'Email marketing', '/email-marketing', 'medium', true),
    ]),
    createPhase('activation', [
      demoStep('demo-activation-ads', 'activation', 'Proponer campaña Ads con límite controlado', 'Ads', '/captacion/atraer/ads', 'high', true),
      demoStep('demo-activation-social', 'activation', 'Convertir el plan en publicaciones revisables', 'Orgánico y social', '/captacion/atraer/organico?tab=contenido', 'high', true),
      demoStep('demo-activation-automation', 'activation', 'Activar el seguimiento operativo', 'Automatizaciones', '/automatizaciones', 'medium', true),
    ]),
    createPhase('monitoring', [
      demoStep('demo-monitoring-pipeline', 'monitoring', 'Vigilar el avance del pipeline', 'Pipeline', '/pipeline'),
      demoStep('demo-monitoring-meetings', 'monitoring', 'Proteger la conversión a reuniones', 'Reuniones', '/reuniones'),
      demoStep('demo-monitoring-agent', 'monitoring', 'Detectar conversaciones que necesitan ayuda', 'Agentes IA', '/agentes'),
    ]),
    createPhase('attribution', [
      demoStep('demo-attribution-source', 'attribution', 'Conectar origen, reunión y oportunidad', 'Inteligencia comercial', '/inteligencia-comercial'),
      demoStep('demo-attribution-review', 'attribution', `Recomendar el siguiente movimiento para ${target}`, 'Dashboard', '/dashboard'),
    ]),
  ]
  return {
    id: `demo-plan-${Date.now()}`,
    source: ORCHESTRATION_SOURCE.DEMO,
    status: 'proposal',
    generatedAt: new Date().toISOString(),
    input: context,
    headline: target,
    durationLabel: context.period,
    locationLabel: location,
    budgetLabel,
    desiredResultLabel: context.desiredResult || 'Resultado comercial por definir',
    lifecycle: { proposal: 'proposal', approval: 'pending', execution: 'not_queued' },
    approvalRequired: true,
    phases,
    guardrails: [
      { id: 'spend', label: 'Gasto publicitario', detail: 'Ads no puede consumir presupuesto en modo demo.', tone: 'high' },
      { id: 'publish', label: 'Publicación externa', detail: 'Posts, landings y campañas solo se simulan.', tone: 'medium' },
      { id: 'contact', label: 'Contacto masivo', detail: 'Email y secuencias no se envían en modo demo.', tone: 'high' },
    ],
  }
}

export function flattenPlanSteps(plan) {
  return plan?.phases?.flatMap(phase => phase.steps || []) || []
}

export function getPlanStatusMeta(status = 'proposal') {
  const labels = {
    proposal: ['Propuesta', 'proposal', 'Pendiente de revisión humana.'],
    approved: ['Aprobado', 'approved', 'Aprobado; pendiente de puesta en cola.'],
    queued: ['En cola', 'queued', 'Preparado para que lo procese el worker.'],
    running: ['Ejecutando', 'running', 'El worker está procesando el plan.'],
    executed: ['Ejecutado', 'executed', 'La ejecución terminó con ledger y auditoría.'],
    paused: ['Pausado', 'paused', 'Hay una dependencia o acción que necesita atención.'],
    failed: ['Fallido', 'failed', 'La ejecución falló y requiere revisión.'],
    rejected: ['Rechazado', 'rejected', 'La propuesta fue rechazada.'],
    rolling_back: ['Revirtiendo', 'rolling-back', 'El worker está compensando efectos confirmados.'],
  }
  const [label, tone, description] = labels[status] || [status || 'Desconocido', 'unknown', 'Estado no reconocido por el frontend.']
  return { label, tone, description }
}

export function getPlanStats(plan) {
  const steps = flattenPlanSteps(plan)
  const executedSteps = steps.filter(step => step.executed || step.executionStatus === 'succeeded' || step.executionStatus === 'compensated').length
  const executed = plan?.status === 'executed' && executedSteps === 0 ? steps.length : executedSteps
  const approved = plan?.lifecycle?.approval === 'approved' || ['approved', 'queued', 'running', 'executed', 'paused', 'failed', 'rolling_back'].includes(plan?.status)
    ? steps.length
    : steps.filter(step => step.approved || !step.approvalRequired).length
  const blocked = steps.filter(step => ['blocked', 'failed', 'rollback_blocked'].includes(step.status || step.executionStatus)).length + (['paused', 'failed'].includes(plan?.status) && !steps.some(step => step.status === 'blocked') ? 1 : 0)
  const lowRisk = steps.filter(step => step.risk === 'low').length
  const highRisk = steps.filter(step => step.risk === 'high' || step.risk === 'medium').length
  return { total: steps.length, executed, approved, blocked, lowRisk, highRisk, progress: steps.length ? Math.round((executed / steps.length) * 100) : (plan?.status === 'executed' ? 100 : 0) }
}

export function isLivePlan(plan) { return plan?.source === ORCHESTRATION_SOURCE.LIVE }
export function isLivePlanPollingStatus(status) { return LIVE_POLLING_STATUSES.has(status) }
export function isTerminalPlanStatus(status) { return ['executed', 'failed', 'paused', 'rejected'].includes(status) }

function moduleTarget(text = '') {
  const value = text.toLowerCase()
  if (value.includes('organic')) return { module: 'Orgánico y social', moduleRoute: '/captacion/atraer/organico' }
  if (value.includes('prospect')) return { module: 'Prospect Finder', moduleRoute: '/captacion/atraer/prospectos' }
  if (value.includes('ads') || value.includes('publicidad')) return { module: 'Ads', moduleRoute: '/captacion/atraer/ads' }
  if (value.includes('landing')) return { module: 'Web y SEO', moduleRoute: '/captacion/convertir?tab=landings' }
  if (value.includes('agente') || value.includes('playbook')) return { module: 'Agentes IA', moduleRoute: '/agentes' }
  if (value.includes('email')) return { module: 'Email marketing', moduleRoute: '/email-marketing' }
  if (value.includes('automat')) return { module: 'Automatizaciones', moduleRoute: '/automatizaciones' }
  if (value.includes('pipeline') || value.includes('lead')) return { module: 'Pipeline', moduleRoute: '/pipeline' }
  return { module: 'Inteligencia comercial', moduleRoute: '/inteligencia-comercial' }
}

function adaptApiPlan(remote, source = ORCHESTRATION_SOURCE.LIVE) {
  const executionSteps = new Map((remote.execution?.steps || []).map(step => [String(step.stepKey), step]))
  const remoteActions = Array.isArray(remote.actions) ? remote.actions : []
  const planApproved = remote.lifecycle?.approval === 'approved' || remote.approval?.status === 'approved' || ['approved', 'queued', 'running', 'executed', 'paused', 'failed', 'rolling_back'].includes(remote.status)
  const phases = (remote.phases || []).map((phase, phaseIndex) => {
    const phaseKey = PHASE_META[phase.id] ? phase.id : PHASE_KEYS[phaseIndex] || 'monitoring'
    const actions = Array.isArray(phase.actions) && phase.actions.length ? phase.actions : (phase.expectedOutputs || [phase.purpose || phase.title])
    const steps = actions.map((action, stepIndex) => {
      const actionObject = phaseKey === 'activation' && remoteActions[stepIndex] ? remoteActions[stepIndex] : null
      const text = String(actionObject?.title || action || '').trim() || 'Revisar el siguiente paso del plan.'
      const target = moduleTarget(text)
      const id = String(actionObject?.id || `${phaseKey}-api-${stepIndex + 1}`)
      const executionStep = executionSteps.get(id)
      const executionStatus = executionStep?.status || null
      const executed = executionStatus === 'succeeded' || executionStatus === 'compensated' || (remote.status === 'executed' && phaseKey !== 'activation')
      const requiresPlanApproval = Boolean(phase.approvalRequired || phaseKey === 'activation' || actionObject?.requiresApproval)
      return createStep(phaseKey, {
        id,
        title: text,
        description: phase.purpose || phase.title,
        ...target,
        statusLabel: executed ? 'Ejecutado' : planApproved ? 'Plan aprobado' : requiresPlanApproval ? 'Protegido por aprobación' : 'Listo para revisar',
        risk: requiresPlanApproval ? 'high' : 'low',
        dependency: Array.isArray(phase.dependencies) && phase.dependencies.length ? phase.dependencies.join(', ') : 'Dependencias por verificar',
        approvalRequired: false,
        requiresPlanApproval,
        approved: planApproved,
        executed,
        executionStatus,
        status: executed ? 'executed' : executionStatus || (planApproved ? 'approved' : requiresPlanApproval ? 'blocked' : 'ready'),
        ctaLabel: `Abrir ${target.module}`,
        explainability: 'La API ha propuesto este paso a partir del objetivo, sus dependencias y las reglas de seguridad.',
        executionLabel: 'Ver estado persistente',
        estimate: phase.scheduledDays ? `Días ${phase.scheduledDays.start}–${phase.scheduledDays.end}` : 'Por definir',
      })
    })
    return { id: phaseKey, ...PHASE_META[phaseKey], steps }
  })
  return {
    id: remote.id || `live-plan-${Date.now()}`,
    source,
    status: remote.status || 'proposal',
    generatedAt: remote.createdAt || new Date().toISOString(),
    input: { objective: remote.objective || '', period: `${remote.durationDays || 60} días`, location: remote.location || '', budget: remote.budget == null ? '' : String(remote.budget), desiredResult: remote.desiredOutcome || '' },
    headline: remote.objective || 'Plan comercial coordinado',
    durationLabel: `${remote.durationDays || 60} días`,
    locationLabel: remote.location || 'tu mercado',
    budgetLabel: remote.budget ? `${Number(remote.budget).toLocaleString(localeCode(getLocale()))} €` : 'presupuesto por definir',
    desiredResultLabel: remote.desiredOutcome || 'Resultado comercial por definir',
    phases,
    lifecycle: remote.lifecycle || { proposal: 'proposal', approval: 'pending', execution: 'not_queued' },
    approvalRequired: Boolean(remote.approvalRequired),
    approvalRequests: remote.approvalRequests || [],
    approval: remote.approval,
    dependencies: remote.dependencies || [],
    actions: remote.actions || [],
    limits: remote.limits || {},
    execution: remote.execution,
    explainability: remote.explainability,
    guardrails: [
      { id: 'spend', label: 'Gasto publicitario', detail: 'Ads no puede consumir presupuesto sin aprobación persistente.', tone: 'high' },
      { id: 'publish', label: 'Publicación externa', detail: 'Los activos quedan en borrador hasta la aprobación requerida.', tone: 'medium' },
      { id: 'contact', label: 'Contacto masivo', detail: 'Email y secuencias respetan consentimiento y auditoría.', tone: 'high' },
    ],
  }
}

function readApiPlan(payload) {
  const plan = payload?.plan || payload?.data || payload
  if (!plan || !Array.isArray(plan.phases)) throw new OrchestrationApiError('La API devolvió un plan persistente inválido.', { code: 'ORCHESTRATION_PLAN_INVALID' })
  return adaptApiPlan(plan, ORCHESTRATION_SOURCE.LIVE)
}

// ---------------------------------------------------------------------------
// Acciones ejecutables del modo live.
// El backend rechaza con 422 EXECUTABLE_ACTIONS_REQUIRED un plan sin acciones,
// así que la UI carga el catálogo (GET /actions/catalog), propone una selección
// y envía `actions` con los campos mínimos que exige cada adaptador.
// ---------------------------------------------------------------------------

export const ACTION_EFFECT_LABELS = { local: 'Efecto interno', external: 'Efecto externo' }

function catalogEntry(catalog, kind) {
  return (Array.isArray(catalog) ? catalog : []).find(item => item.kind === kind) || null
}

export function createActionSelection(kind, values = {}) {
  return { key: `${kind}-${Math.random().toString(36).slice(2, 9)}`, kind, values: { ...values } }
}

/** Selección por defecto razonable según objetivo, presupuesto y texto del formulario. */
export function suggestOrchestrationActions(input, catalog) {
  const context = normaliseOrchestrationInput(input)
  const text = `${context.objective} ${context.desiredResult}`.toLowerCase()
  const available = kind => Boolean(catalogEntry(catalog, kind))
  const selection = []
  if (available('landing.create_draft')) selection.push(createActionSelection('landing.create_draft', { name: context.objective.slice(0, 120), offer: context.desiredResult }))
  const wantsAds = context.budget > 0 && !/sin (ads|anuncios|publicidad)/.test(text)
  if (wantsAds && available('landing.create_draft') && available('ads.publish_paused')) {
    selection.push(createActionSelection('ads.publish_paused', { budgetCents: String(context.budget) }))
  }
  if (/(redes|social|instagram|facebook|linkedin|tiktok|contenido|publicaci)/.test(text) && available('social.create_draft')) {
    selection.push(createActionSelection('social.create_draft', { text: `${context.objective}. ${context.desiredResult}`.slice(0, 500), platforms: ['instagram', 'facebook'] }))
  }
  return selection
}

function isBlank(value) {
  return value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)
}

function parseReferenceList(value) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/)
  return items.map(item => String(item).trim()).filter(Boolean)
}

/**
 * Validación local equivalente a validateOrchestrationActionInput del backend:
 * campos obligatorios y referencias implícitas que solo se resuelven si la
 * acción previa necesaria está antes en la lista.
 */
export function validateActionSelection(selection, catalog, { budget } = {}) {
  const errors = {}
  const list = Array.isArray(selection) ? selection : []
  if (!list.length) return { errors, general: 'Selecciona al menos una acción ejecutable para el plan live.' }
  let totalCents = 0
  list.forEach((item, index) => {
    const entry = catalogEntry(catalog, item.kind)
    if (!entry) { errors[item.key] = 'Acción no disponible en el catálogo.'; return }
    const previous = list.slice(0, index).map(other => other.kind)
    const resolved = Array.isArray(entry.resolvesWith) && entry.resolvesWith.length > 0 && entry.resolvesWith.every(kind => previous.includes(kind))
    for (const field of entry.fields || []) {
      const value = item.values?.[field.key]
      const required = field.required === true || (field.required === 'unless_resolved' && !resolved)
      if (required && isBlank(field.type === 'referenceList' ? parseReferenceList(value) : value)) {
        errors[item.key] = field.required === 'unless_resolved'
          ? `Indica «${field.label}» o añade antes: ${(entry.resolvesWith || []).map(kind => catalogEntry(catalog, kind)?.title || kind).join(' y ')}.`
          : `Falta «${field.label}».`
        return
      }
      if (!isBlank(value) && (field.type === 'cents' || field.type === 'integer')) {
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric < (field.type === 'integer' ? 1 : 0)) { errors[item.key] = `«${field.label}» no es un número válido.`; return }
      }
    }
    if (item.kind === 'ads.publish_paused') totalCents += Math.round(Number(item.values?.budgetCents || 0) * 100)
    if (item.kind === 'ads.activate') totalCents += Math.round(Number(item.values?.dailyBudgetCents || 0) * 100) * Math.trunc(Number(item.values?.durationDays || 0))
  })
  const budgetCents = Math.round(Number(budget || 0) * 100)
  const general = totalCents > budgetCents ? 'El gasto Ads de las acciones supera el presupuesto del plan.' : ''
  return { errors, general }
}

/** Convierte la selección de la UI al contrato `actions` del backend. Los importes se escriben en euros y viajan en céntimos. */
export function buildActionsPayload(selection, catalog) {
  return (Array.isArray(selection) ? selection : []).map(item => {
    const entry = catalogEntry(catalog, item.kind)
    const input = {}
    for (const field of entry?.fields || []) {
      const raw = item.values?.[field.key]
      if (isBlank(raw)) continue
      if (field.type === 'cents') input[field.key] = Math.round(Number(raw) * 100)
      else if (field.type === 'integer') input[field.key] = Math.trunc(Number(raw))
      else if (field.type === 'referenceList') input[field.key] = parseReferenceList(raw)
      else if (field.type === 'platforms') input[field.key] = parseReferenceList(raw)
      else input[field.key] = String(raw).trim()
    }
    return { kind: item.kind, input }
  })
}

/** Reconstruye la selección editable a partir de las acciones de un plan persistido. */
export function selectionFromPlanActions(actions, catalog) {
  return (Array.isArray(actions) ? actions : []).filter(action => catalogEntry(catalog, action?.kind)).map(action => {
    const entry = catalogEntry(catalog, action.kind)
    const values = {}
    for (const field of entry.fields || []) {
      const value = action.input?.[field.key]
      if (value == null) continue
      values[field.key] = field.type === 'cents' ? String(Number(value) / 100) : field.type === 'referenceList' ? parseReferenceList(value).join(', ') : field.type === 'platforms' ? parseReferenceList(value) : String(value)
    }
    return createActionSelection(action.kind, values)
  })
}

export async function fetchOrchestrationActionCatalog(options = {}) {
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/actions/catalog`, { method: 'GET', timeoutMs: options.timeoutMs || 10_000 })
  const actions = Array.isArray(payload?.actions) ? payload.actions.filter(item => item && typeof item.kind === 'string') : null
  if (!actions) throw new OrchestrationApiError('La API devolvió un catálogo de acciones inválido.', { code: 'ORCHESTRATION_CATALOG_INVALID' })
  return { contractVersion: payload.contractVersion ?? null, actions: actions.map(item => ({ ...item, fields: Array.isArray(item.fields) ? item.fields : [] })) }
}

export async function listOrchestrationPlans(options = {}) {
  const params = new URLSearchParams({ limit: String(options.limit || 8), offset: String(options.offset || 0) })
  if (options.status) params.set('status', options.status)
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/plans?${params}`, { method: 'GET', timeoutMs: options.timeoutMs || 10_000 })
  const items = Array.isArray(payload?.items) ? payload.items : []
  return { items, total: Number(payload?.total) || items.length, offset: Number(payload?.offset) || 0, limit: Number(payload?.limit) || items.length, hasMore: Boolean(payload?.hasMore) }
}

export function createIdempotencyKey(operation = 'operation') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `orch-${operation}-${id}`.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180)
}

export async function requestOrchestrationPlan(input, options = {}) {
  const mode = options.mode || (options.useApi === false ? ORCHESTRATION_SOURCE.DEMO : ORCHESTRATION_SOURCE.LIVE)
  if (mode === ORCHESTRATION_SOURCE.DEMO) return { plan: buildDemoPlan(input), source: ORCHESTRATION_SOURCE.DEMO, explicitDemo: true, reason: 'explicit_demo' }
  if (!Array.isArray(options.actions) || options.actions.length === 0) {
    throw new OrchestrationApiError('Un plan live necesita al menos una acción ejecutable configurada.', { status: 422, code: 'EXECUTABLE_ACTIONS_REQUIRED' })
  }
  const normalised = normaliseOrchestrationInput(input)
  const idempotencyKey = options.idempotencyKey || createIdempotencyKey('create')
  const payload = await requestJson(options.fetcher || apiFetch, ORCHESTRATION_API_PATH, {
    method: 'POST', idempotencyKey, timeoutMs: options.timeoutMs || 10_000,
    body: { objective: normalised.objective, durationDays: PERIOD_DAYS[normalised.period] || 60, location: normalised.location, budget: normalised.budget || 0, desiredOutcome: normalised.desiredResult, actions: options.actions },
  })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE, idempotencyKey }
}

export async function getOrchestrationPlan(planId, options = {}) {
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/plans/${encodeURIComponent(planId)}`, { method: 'GET', timeoutMs: options.timeoutMs || 10_000 })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE }
}

export function approveOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'approve', options, { comment: clean(options.comment) || undefined }) }
export function rejectOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'reject', options, { comment: clean(options.comment) || undefined }) }
export function executeOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'execute', options) }
export function rollbackOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'rollback', options) }

async function mutateOrchestrationPlan(planId, action, options, body) {
  if (!clean(planId)) throw new OrchestrationApiError('Falta el identificador del plan persistente.', { code: 'PLAN_ID_REQUIRED', status: 400 })
  const idempotencyKey = options.idempotencyKey || createIdempotencyKey(action)
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/plans/${encodeURIComponent(planId)}/${action}`, { method: 'POST', idempotencyKey, body, timeoutMs: options.timeoutMs || 10_000 })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE, idempotencyKey }
}

function describeFieldErrors(fields) {
  if (!fields || typeof fields !== 'object') return ''
  return Object.entries(fields).filter(([, messages]) => Array.isArray(messages) && messages.length).map(([field, messages]) => `${field}: ${messages[0]}`).join(' · ')
}

async function requestJson(fetcher, path, { method = 'GET', body, idempotencyKey, timeoutMs = 10_000 } = {}) {
  if (typeof fetcher !== 'function') throw new OrchestrationApiError('La conexión live no está disponible en este entorno.', { status: 503, code: 'ORCHESTRATION_FETCH_UNAVAILABLE', retriable: true })
  if (method !== 'GET' && !clean(idempotencyKey)) throw new OrchestrationApiError('Esta operación requiere una clave de idempotencia.', { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' })
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const response = await fetcher(path, { method, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller?.signal })
    let payload = null
    try { payload = await response?.json?.() } catch { payload = null }
    if (!response?.ok) {
      const status = Number(response?.status || 0)
      const defaultMessage = status === 403 ? 'No tienes permisos para esta operación del orquestador.' : status === 409 ? 'El plan cambió de estado. Recarga la versión persistente antes de continuar.' : status === 503 ? 'El servicio del orquestador está temporalmente degradado. Inténtalo de nuevo.' : 'No se pudo completar la operación del orquestador.'
      const fieldDetail = describeFieldErrors(payload?.fields)
      throw new OrchestrationApiError([payload?.error || defaultMessage, fieldDetail].filter(Boolean).join(' — '), { status, code: payload?.code || `ORCHESTRATION_HTTP_${status || 'UNAVAILABLE'}`, details: payload, retriable: [408, 429, 500, 502, 503, 504].includes(status) })
    }
    return payload
  } catch (error) {
    if (error instanceof OrchestrationApiError) throw error
    if (error?.name === 'AbortError') throw new OrchestrationApiError('La operación del orquestador agotó el tiempo de espera.', { status: 503, code: 'ORCHESTRATION_TIMEOUT', retriable: true })
    throw new OrchestrationApiError('No se pudo conectar con el servicio live del orquestador.', { status: 503, code: 'ORCHESTRATION_UNAVAILABLE', details: error, retriable: true })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
