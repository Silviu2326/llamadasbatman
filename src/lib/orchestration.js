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
      demoStep('demo-diagnosis-organic', 'diagnosis', `Medir demanda para ${target}`, 'Organic Leads', '/organic'),
      demoStep('demo-diagnosis-prospecting', 'diagnosis', `Encontrar prospectos parecidos en ${location}`, 'Prospect Finder', '/prospectos'),
      demoStep('demo-diagnosis-commercial', 'diagnosis', 'Establecer la línea base comercial', 'Inteligencia comercial', '/inteligencia-comercial'),
    ]),
    createPhase('assets', [
      demoStep('demo-assets-landing', 'assets', 'Preparar una landing orientada al resultado', 'Landings & webs', '/landings'),
      demoStep('demo-assets-agent', 'assets', 'Alinear agente y playbook con el objetivo', 'Agentes IA', '/agentes'),
      demoStep('demo-assets-email', 'assets', 'Diseñar el seguimiento de nutrición', 'Email marketing', '/email-marketing', 'medium', true),
    ]),
    createPhase('activation', [
      demoStep('demo-activation-ads', 'activation', 'Proponer campaña Ads con límite controlado', 'Ads', '/ads', 'high', true),
      demoStep('demo-activation-social', 'activation', 'Convertir el plan en publicaciones revisables', 'Redes sociales', '/redes-sociales', 'high', true),
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
  if (value.includes('organic')) return { module: 'Organic Leads', moduleRoute: '/organic' }
  if (value.includes('prospect')) return { module: 'Prospect Finder', moduleRoute: '/prospectos' }
  if (value.includes('ads') || value.includes('publicidad')) return { module: 'Ads', moduleRoute: '/ads' }
  if (value.includes('landing')) return { module: 'Landings & webs', moduleRoute: '/landings' }
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

export function createIdempotencyKey(operation = 'operation') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `orch-${operation}-${id}`.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180)
}

export async function requestOrchestrationPlan(input, options = {}) {
  const mode = options.mode || (options.useApi === false ? ORCHESTRATION_SOURCE.DEMO : ORCHESTRATION_SOURCE.LIVE)
  if (mode === ORCHESTRATION_SOURCE.DEMO) return { plan: buildDemoPlan(input), source: ORCHESTRATION_SOURCE.DEMO, fallback: false, explicitDemo: true, reason: 'explicit_demo' }
  const normalised = normaliseOrchestrationInput(input)
  const idempotencyKey = options.idempotencyKey || createIdempotencyKey('create')
  const payload = await requestJson(options.fetcher || apiFetch, ORCHESTRATION_API_PATH, {
    method: 'POST', idempotencyKey, timeoutMs: options.timeoutMs || 10_000,
    body: { objective: normalised.objective, durationDays: PERIOD_DAYS[normalised.period] || 60, location: normalised.location, budget: normalised.budget || 0, desiredOutcome: normalised.desiredResult, ...(Array.isArray(options.actions) ? { actions: options.actions } : {}) },
  })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE, fallback: false, idempotencyKey }
}

export async function getOrchestrationPlan(planId, options = {}) {
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/plans/${encodeURIComponent(planId)}`, { method: 'GET', timeoutMs: options.timeoutMs || 10_000 })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE, fallback: false }
}

export function approveOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'approve', options, { comment: clean(options.comment) || undefined }) }
export function rejectOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'reject', options, { comment: clean(options.comment) || undefined }) }
export function executeOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'execute', options) }
export function rollbackOrchestrationPlan(planId, options = {}) { return mutateOrchestrationPlan(planId, 'rollback', options) }

async function mutateOrchestrationPlan(planId, action, options, body) {
  if (!clean(planId)) throw new OrchestrationApiError('Falta el identificador del plan persistente.', { code: 'PLAN_ID_REQUIRED', status: 400 })
  const idempotencyKey = options.idempotencyKey || createIdempotencyKey(action)
  const payload = await requestJson(options.fetcher || apiFetch, `${ORCHESTRATION_API_ROOT}/plans/${encodeURIComponent(planId)}/${action}`, { method: 'POST', idempotencyKey, body, timeoutMs: options.timeoutMs || 10_000 })
  return { plan: readApiPlan(payload), source: ORCHESTRATION_SOURCE.LIVE, fallback: false, idempotencyKey }
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
      throw new OrchestrationApiError(payload?.error || defaultMessage, { status, code: payload?.code || `ORCHESTRATION_HTTP_${status || 'UNAVAILABLE'}`, details: payload, retriable: [408, 429, 500, 502, 503, 504].includes(status) })
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
