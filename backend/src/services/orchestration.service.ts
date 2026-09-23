import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { hasPermission } from '../access-control'
import { writeAuditLog } from '../lib/audit'
import { prisma } from '../lib/prisma'
import {
  ORCHESTRATION_ACTION_CATALOG,
  ORCHESTRATION_ACTION_KINDS,
  validateOrchestrationActionInput,
  type OrchestrationActionReferences,
  type OrchestrationAction,
  type OrchestrationActionKind,
} from './orchestration.adapters'
import { dispatchOrchestrationJobs } from './orchestration.runtime'

export interface OrchestrationPlanInput {
  objective: string
  durationDays: number
  location: string
  budget: number
  desiredOutcome: string
  actions?: Array<{
    kind: OrchestrationActionKind
    title?: string
    input?: Record<string, unknown>
    references?: OrchestrationActionReferences
    estimatedCostCents?: number
  }>
}

export interface OrchestrationDependency {
  key: string
  label: string
  status: 'to_verify' | 'available' | 'missing'
  required: boolean
  reason: string
  affectedPhases: string[]
}

export interface OrchestrationPhase {
  id: 'diagnosis' | 'assets' | 'activation' | 'monitoring' | 'attribution'
  order: number
  title: string
  purpose: string
  scheduledDays: { start: number; end: number }
  actions: string[]
  expectedOutputs: string[]
  dependencies: string[]
  approvalRequired: boolean
}

export type OrchestrationPlanStatus = 'proposal' | 'approved' | 'queued' | 'running' | 'executed' | 'paused' | 'failed' | 'rejected' | 'rolling_back'

export interface OrchestrationPlan {
  id: string
  status: OrchestrationPlanStatus
  objective: string
  durationDays: number
  location: string
  budget: number
  desiredOutcome: string
  explainability: {
    summary: string
    assumptions: string[]
    decisionRules: string[]
    execution: 'proposal_only' | 'queued' | 'executed_with_ledger'
  }
  phases: OrchestrationPhase[]
  dependencies: OrchestrationDependency[]
  approvalRequired: boolean
  approvalRequests: Array<{
    phase: OrchestrationPhase['id']
    reason: string
    blocking: boolean
  }>
  actions: OrchestrationAction[]
  limits: {
    budgetCents: number
    estimatedCostCents: number
    maxExternalActions: number
    maxActions: number
  }
  lifecycle: {
    proposal: 'proposal' | 'rejected'
    approval: 'pending' | 'approved' | 'rejected'
    execution: 'not_queued' | 'queued' | 'running' | 'executed' | 'paused' | 'failed' | 'rolling_back'
  }
  approval?: {
    id: string
    status: string
    reviewedById?: string | null
    reviewedAt?: string | null
    comment?: string | null
  }
  execution?: {
    automationId: string
    runId?: string | null
    outboxEventId?: string | null
    runStatus?: string | null
    steps: Array<Record<string, unknown>>
  }
  createdAt: string
}

export interface OrchestrationActor {
  userId: string
  orgId: string
  role: string
  correlationId?: string
}

export class OrchestrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 | 422 | 503 = 400,
    public readonly code = 'ORCHESTRATION_ERROR',
  ) {
    super(message)
    this.name = 'OrchestrationError'
  }
}

export const MAX_ACTIONS = 32
export const MAX_EXTERNAL_ACTIONS = 16
export const ORCHESTRATION_CONTRACT_VERSION = 2

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

function normaliseKey(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 180)
}

function requireOperationKey(value: string): string {
  const key = normaliseKey(value)
  if (key.length < 8 || key.length > 180 || key !== value.trim()) {
    throw new OrchestrationError('Idempotency-Key debe tener entre 8 y 180 caracteres alfanuméricos', 400, 'IDEMPOTENCY_KEY_REQUIRED')
  }
  return key
}

function operationFingerprint(mode: string, key: string, payload: unknown = null): string {
  return createHash('sha256').update(JSON.stringify({ mode, key, payload })).digest('hex')
}

const ACTION_REFERENCE_KEYS = [
  'campaignId',
  'landingSlug',
  'leadId',
  'leadIds',
  'agentId',
  'marketingCampaignId',
  'emailDraftId',
  'budgetCents',
  'dailyBudgetCents',
  'durationDays',
  'opportunityId',
  'sequenceId',
] as const

function referencesFromInput(
  input: Record<string, unknown>,
  explicit: OrchestrationActionReferences | undefined,
): OrchestrationActionReferences {
  const references: Record<string, unknown> = {}
  for (const key of ACTION_REFERENCE_KEYS) {
    const explicitValue = explicit?.[key]
    const value = explicitValue ?? input[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    references[key] = value
  }
  return references as OrchestrationActionReferences
}

function validateInput(input: OrchestrationPlanInput): void {
  if (!input.objective.trim() || input.objective.length > 500) throw new OrchestrationError('objective no válido', 400, 'INVALID_OBJECTIVE')
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) throw new OrchestrationError('durationDays no válido', 400, 'INVALID_DURATION')
  if (!input.location.trim() || input.location.length > 160) throw new OrchestrationError('location no válido', 400, 'INVALID_LOCATION')
  if (!Number.isFinite(input.budget) || input.budget < 0 || input.budget > 1_000_000) throw new OrchestrationError('budget no válido', 400, 'INVALID_BUDGET')
  if (!input.desiredOutcome.trim() || input.desiredOutcome.length > 240) throw new OrchestrationError('desiredOutcome no válido', 400, 'INVALID_OUTCOME')
  if (!Array.isArray(input.actions) || input.actions.length === 0) throw new OrchestrationError('Un plan live necesita al menos una acción ejecutable configurada', 422, 'EXECUTABLE_ACTIONS_REQUIRED')
  if ((input.actions?.length ?? 0) > MAX_ACTIONS) throw new OrchestrationError(`El plan no puede superar ${MAX_ACTIONS} acciones`, 400, 'ACTION_LIMIT_EXCEEDED')
}

function schedule(durationDays: number): OrchestrationPhase['scheduledDays'][] {
  const weights = [0.1, 0.2, 0.1, 0.4]
  const lengths = weights.map(weight => Math.max(1, Math.round(durationDays * weight)))
  lengths.push(Math.max(1, durationDays - lengths.reduce((total, value) => total + value, 0)))
  const ranges: OrchestrationPhase['scheduledDays'][] = []
  let cursor = 1
  for (const length of lengths) {
    const start = Math.min(cursor, durationDays)
    const end = Math.min(durationDays, Math.max(start, cursor + length - 1))
    ranges.push({ start, end })
    cursor = end + 1
  }
  ranges[ranges.length - 1] = { start: Math.min(ranges[ranges.length - 1].start, durationDays), end: durationDays }
  return ranges
}

function defaultTitle(kind: OrchestrationActionKind): string {
  return {
    'landing.create_draft': 'Crear landing en borrador',
    'ads.publish_paused': 'Crear campaña Ads pausada',
    'ads.activate': 'Activar campaña Ads',
    'social.create_draft': 'Crear borradores sociales',
    'email.publish': 'Publicar campaña de email',
    'agent.activate': 'Activar agente comercial',
    'lead.create_follow_up': 'Crear seguimiento de lead',
    'pipeline.move_stage': 'Mover oportunidad en pipeline',
    'prospecting.enrich': 'Enriquecer prospecto desde su web',
    'sequence.create_draft': 'Preparar borrador de secuencia comercial',
  }[kind]
}

function actionCost(kind: OrchestrationActionKind, actionInput: Record<string, unknown>, explicit?: number): number {
  const dailyBudget = typeof actionInput.dailyBudgetCents === 'number' ? actionInput.dailyBudgetCents : 0
  const durationDays = typeof actionInput.durationDays === 'number' ? actionInput.durationDays : 0
  const inferred = kind === 'ads.activate'
    ? dailyBudget * durationDays
    : kind === 'ads.publish_paused'
      ? (typeof actionInput.budgetCents === 'number' ? actionInput.budgetCents : 0)
      : 0
  if (explicit !== undefined && (!Number.isSafeInteger(explicit) || explicit < 0)) throw new OrchestrationError('estimatedCostCents no válido', 400, 'INVALID_ACTION_COST')
  if (explicit !== undefined && explicit < inferred) throw new OrchestrationError('estimatedCostCents no puede ser inferior al coste calculado de la acción', 422, 'ACTION_COST_UNDERSTATED')
  return Math.max(inferred, explicit ?? 0)
}

function normaliseActions(input: OrchestrationPlanInput, planKey: string): OrchestrationAction[] {
  const actions = input.actions ?? []
  const externalKinds = new Set<OrchestrationActionKind>(['ads.publish_paused', 'ads.activate', 'social.create_draft', 'email.publish'])
  const externalCount = actions.filter(action => externalKinds.has(action.kind)).length
  if (externalCount > MAX_EXTERNAL_ACTIONS) throw new OrchestrationError(`El plan no puede superar ${MAX_EXTERNAL_ACTIONS} acciones externas`, 400, 'EXTERNAL_ACTION_LIMIT_EXCEEDED')
  return actions.map((action, index) => {
    if (!ORCHESTRATION_ACTION_KINDS.includes(action.kind)) throw new OrchestrationError(`Acción no soportada: ${action.kind}`, 400, 'UNSUPPORTED_ACTION')
    const mergedInput: Record<string, unknown> = { ...(action.input ?? {}) }
    for (const [key, value] of Object.entries(action.references ?? {})) {
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) continue
      const existing = mergedInput[key]
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(value)) throw new OrchestrationError(`La referencia ${key} no coincide con input.${key}`, 400, 'ACTION_REFERENCE_CONFLICT')
      mergedInput[key] = value
    }
    const priorKinds = actions.slice(0, index).map(item => item.kind)
    const issue = validateOrchestrationActionInput(action.kind, mergedInput, {
      canResolveCampaign: priorKinds.includes('landing.create_draft'),
      canResolvePublishedCampaign: priorKinds.includes('landing.create_draft') && priorKinds.includes('ads.publish_paused'),
    })
    if (issue) throw new OrchestrationError(issue.message, 422, issue.code)
    if (Array.isArray(mergedInput.leadIds) && (mergedInput.leadIds.length === 0 || mergedInput.leadIds.length > 100)) throw new OrchestrationError('leadIds debe contener entre 1 y 100 referencias', 422, 'LEAD_REFERENCE_LIMIT_EXCEEDED')
    const inputJsonString = JSON.stringify(mergedInput)
    return {
      id: stableId('step', `${planKey}:${index}:${action.kind}:${inputJsonString}`),
      kind: action.kind,
      title: action.title?.trim() || defaultTitle(action.kind),
      input: mergedInput,
      references: referencesFromInput(mergedInput, action.references),
      estimatedCostCents: actionCost(action.kind, mergedInput, action.estimatedCostCents),
      requiresApproval: true,
    }
  })
}

export function createInitialPlan(orgId: string, input: OrchestrationPlanInput, planId = stableId('plan', `${orgId}:${JSON.stringify(input)}`)): OrchestrationPlan {
  validateInput(input)
  const budgetCents = Math.round(input.budget * 100)
  const actions = normaliseActions(input, planId)
  const ranges = schedule(input.durationDays)
  const budgetLabel = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(input.budget)
  const dependencies: OrchestrationDependency[] = [
    { key: 'crm_data', label: 'Leads, pipeline y reuniones', status: 'to_verify', required: true, reason: 'Permiten establecer la línea base y medir el resultado comercial.', affectedPhases: ['diagnosis', 'monitoring', 'attribution'] },
    { key: 'ads_connection', label: 'Cuenta publicitaria y tracking', status: 'to_verify', required: false, reason: `Necesaria si se aprueba inversión Ads hasta ${budgetLabel}.`, affectedPhases: ['diagnosis', 'assets', 'activation', 'monitoring'] },
    { key: 'organic_assets', label: 'Proyecto Organic Leads y activos de contenido', status: 'to_verify', required: false, reason: 'Permite cubrir demanda orgánica y generar activos revisables.', affectedPhases: ['diagnosis', 'assets', 'monitoring'] },
    { key: 'contact_channels', label: 'Agentes, email, calendario y consentimientos', status: 'to_verify', required: true, reason: 'Evita generar contactos sin canal, disponibilidad o consentimiento válido.', affectedPhases: ['diagnosis', 'activation', 'monitoring'] },
    { key: 'human_approvals', label: 'Aprobación humana explícita', status: 'available', required: true, reason: 'Toda ejecución se queda en propuesta hasta una aprobación persistente.', affectedPhases: ['activation'] },
  ]
  const phases: OrchestrationPhase[] = [
    { id: 'diagnosis', order: 1, title: 'Diagnóstico', scheduledDays: ranges[0], purpose: `Medir el punto de partida para conseguir ${input.desiredOutcome} en ${input.location}.`, actions: ['Revisar leads, pipeline, reuniones y atribución existentes.', 'Comprobar integraciones, permisos, workers y disponibilidad operativa.'], expectedOutputs: ['Línea base comercial.', 'Bloqueos y datos que necesitan validación.'], dependencies: ['crm_data', 'ads_connection', 'organic_assets', 'contact_channels'], approvalRequired: false },
    { id: 'assets', order: 2, title: 'Preparación de activos', scheduledDays: ranges[1], purpose: 'Preparar una propuesta coordinada sin publicarla todavía.', actions: ['Seleccionar audiencias y búsquedas con intención comercial.', 'Preparar landing, anuncios, publicaciones y mensajes revisables.'], expectedOutputs: ['Borradores revisables.', 'Mapa de dependencias entre módulos.'], dependencies: ['ads_connection', 'organic_assets', 'contact_channels'], approvalRequired: false },
    { id: 'activation', order: 3, title: 'Activación aprobada', scheduledDays: ranges[2], purpose: 'Convertir únicamente las acciones aprobadas y configuradas en efectos controlados.', actions: actions.length ? actions.map(action => action.title) : ['Añadir acciones ejecutables con referencias de activos.'], expectedOutputs: ['Acciones idempotentes y auditadas.', 'Errores bloqueados con instrucciones accionables.'], dependencies: ['ads_connection', 'contact_channels', 'human_approvals'], approvalRequired: true },
    { id: 'monitoring', order: 4, title: 'Monitorización y optimización', scheduledDays: ranges[3], purpose: 'Detectar rápidamente coste, disponibilidad, errores y oportunidades estancadas.', actions: ['Revisar coste por lead, contacto y reunión.', 'Proponer cambios con evidencia; no ejecutarlos sin nueva aprobación.'], expectedOutputs: ['Recomendaciones trazables.', 'Comparativa por canal.'], dependencies: ['crm_data', 'ads_connection', 'organic_assets', 'contact_channels'], approvalRequired: false },
    { id: 'attribution', order: 5, title: 'Atribución y aprendizaje', scheduledDays: ranges[4], purpose: 'Comprobar si el objetivo produjo resultados y conservar las decisiones útiles.', actions: ['Vincular fuente, lead, reunión, oportunidad, cierre e ingreso.', 'Calcular coste por resultado y retorno real.'], expectedOutputs: ['Resultado frente a objetivo.', 'Huecos de atribución visibles.'], dependencies: ['crm_data'], approvalRequired: false },
  ]
  const estimatedCostCents = actions.reduce((total, action) => total + action.estimatedCostCents, 0)
  if (estimatedCostCents > budgetCents) throw new OrchestrationError('El coste estimado de las acciones supera el presupuesto aprobado del plan', 422, 'ACTION_COST_EXCEEDS_PLAN_BUDGET')
  return {
    id: planId,
    status: 'proposal',
    objective: input.objective,
    durationDays: input.durationDays,
    location: input.location,
    budget: input.budget,
    desiredOutcome: input.desiredOutcome,
    explainability: {
      summary: `Plan para ${input.objective} durante ${input.durationDays} días en ${input.location}, con límite de ${budgetLabel}.`,
      assumptions: ['El presupuesto está expresado en EUR y es un límite, no un gasto ejecutado.', 'Las integraciones solo se invocan después de una aprobación persistente.', 'Un proveedor sin credenciales, scopes o respuesta verificable queda bloqueado.'],
      decisionRules: ['Priorizar impacto comercial y confianza de los datos.', 'Bloquear gasto, publicación y contacto masivo sin aprobación humana.', 'No reintentar automáticamente un efecto externo cuyo resultado sea incierto.'],
      execution: 'proposal_only',
    },
    phases,
    dependencies,
    approvalRequired: true,
    approvalRequests: [
      { phase: 'activation', reason: 'Publicar campañas, activar gasto o iniciar contactos produce efectos externos.', blocking: true },
      { phase: 'assets', reason: 'La revisión de activos evita publicar mensajes u ofertas no validados.', blocking: false },
    ],
    actions,
    limits: { budgetCents, estimatedCostCents, maxExternalActions: MAX_EXTERNAL_ACTIONS, maxActions: MAX_ACTIONS },
    lifecycle: { proposal: 'proposal', approval: 'pending', execution: 'not_queued' },
    createdAt: new Date().toISOString(),
  }
}

function planPayload(plan: OrchestrationPlan, input: OrchestrationPlanInput, idempotencyKey: string, automationId: string, approvalId: string) {
  return {
    schemaVersion: 1,
    input,
    inputFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    idempotencyKey,
    plan,
    runtime: { automationId, approvalId },
  }
}

function planFromStored(experiment: { id: string; status: string; createdAt: Date; audienceDefinition: Prisma.JsonValue | null }, approval?: { id: string; status: string; reviewedById: string | null; reviewedAt: Date | null; reviewComment: string | null }, executionLedger?: OrchestrationPlan['execution']): OrchestrationPlan {
  const payload = jsonObject(experiment.audienceDefinition)
  const plan = jsonObject(payload.plan) as unknown as OrchestrationPlan
  const executionStatus = experiment.status as OrchestrationPlanStatus
  const approvalStatus = approval?.status === 'approved' ? 'approved' : approval?.status === 'rejected' ? 'rejected' : 'pending'
  const executionState = executionStatus === 'proposal' || executionStatus === 'approved' || executionStatus === 'rejected'
    ? 'not_queued'
    : executionStatus
  return {
    ...plan,
    id: experiment.id,
    status: executionStatus,
    createdAt: experiment.createdAt.toISOString(),
    lifecycle: {
      proposal: approvalStatus === 'rejected' ? 'rejected' : 'proposal',
      approval: approvalStatus,
      execution: executionState as OrchestrationPlan['lifecycle']['execution'],
    },
    explainability: {
      ...plan.explainability,
       execution: ['proposal', 'approved', 'rejected'].includes(executionStatus) ? 'proposal_only' : 'executed_with_ledger',
    },
    approval: approval ? { id: approval.id, status: approval.status, reviewedById: approval.reviewedById, reviewedAt: approval.reviewedAt?.toISOString() ?? null, comment: approval.reviewComment } : undefined,
    execution: executionLedger,
  }
}

export async function getPersistedPlan(orgId: string, planId: string): Promise<OrchestrationPlan | null> {
  const experiment = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId, surface: 'orchestration' } })
  if (!experiment) return null
  const payload = jsonObject(experiment.audienceDefinition)
  const runtime = jsonObject(payload.runtime)
  const storedActions = jsonObject(payload.plan).actions as unknown
  if (!Array.isArray(storedActions) || storedActions.length === 0) throw new OrchestrationError('El plan persistido no tiene acciones ejecutables; crea una propuesta nueva con referencias completas', 409, 'PLAN_HAS_NO_EXECUTABLE_ACTIONS')
  const [approval, automation] = await Promise.all([
    prisma.operationalMemoryProposal.findFirst({ where: { orgId, targetType: 'orchestration_plan', targetId: planId }, orderBy: { createdAt: 'desc' } }),
    runtime.automationId ? prisma.automation.findFirst({ where: { id: String(runtime.automationId), orgId }, select: { id: true } }) : null,
  ])
  const candidateRuns = automation ? await prisma.automationRun.findMany({ where: { orgId, automationId: automation.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, status: true, currentStep: true, triggerEventId: true } }) : []
  // Los command ledgers registran idempotencia, no pasos ejecutables.
  const run = candidateRuns.find(candidate => !candidate.triggerEventId.startsWith(COMMAND_TRIGGER_PREFIX)) ?? null
  const steps = run ? await prisma.automationStepRun.findMany({ where: { orgId, runId: run.id }, orderBy: { createdAt: 'asc' }, select: { stepKey: true, type: true, status: true, output: true, errorCode: true, errorDetail: true, attempt: true, finishedAt: true } }) : []
  const event = run ? await prisma.outboxEvent.findFirst({ where: { orgId, aggregateType: 'OrchestrationPlan', aggregateId: planId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } }) : null
  return planFromStored(experiment, approval ?? undefined, { automationId: automation?.id ?? String(runtime.automationId ?? ''), runId: run?.id ?? null, outboxEventId: event?.id ?? null, runStatus: run?.status ?? null, steps: steps.map(step => ({ ...step, finishedAt: step.finishedAt?.toISOString() ?? null })) })
}

export interface OrchestrationPlanSummary {
  id: string
  objective: string
  status: OrchestrationPlanStatus
  approval: 'pending' | 'approved' | 'rejected'
  desiredOutcome: string
  location: string
  durationDays: number | null
  budgetCents: number | null
  actionCount: number
  actionKinds: OrchestrationActionKind[]
  createdAt: string
  updatedAt: string
}

export const PLAN_LIST_MAX_LIMIT = 50

/** Resumen ligero para la lista «Planes recientes»; nunca devuelve el payload completo. */
export function summarisePlanRow(
  row: { id: string; name: string; status: string; primaryMetric: string; budgetCents: number | null; audienceDefinition: Prisma.JsonValue | null; createdAt: Date; updatedAt: Date },
  approvalStatus?: string | null,
): OrchestrationPlanSummary {
  const payload = jsonObject(row.audienceDefinition)
  const plan = jsonObject(payload.plan)
  const actions = Array.isArray(plan.actions) ? plan.actions.map(action => jsonObject(action)) : []
  return {
    id: row.id,
    objective: typeof plan.objective === 'string' && plan.objective ? plan.objective : row.name.replace(/^Orquestación:\s*/, ''),
    status: row.status as OrchestrationPlanStatus,
    approval: approvalStatus === 'approved' ? 'approved' : approvalStatus === 'rejected' ? 'rejected' : 'pending',
    desiredOutcome: typeof plan.desiredOutcome === 'string' ? plan.desiredOutcome : row.primaryMetric,
    location: typeof plan.location === 'string' ? plan.location : '',
    durationDays: typeof plan.durationDays === 'number' ? plan.durationDays : null,
    budgetCents: row.budgetCents,
    actionCount: actions.length,
    actionKinds: actions.map(action => action.kind).filter((kind): kind is OrchestrationActionKind => typeof kind === 'string' && (ORCHESTRATION_ACTION_KINDS as readonly string[]).includes(kind)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listPersistedPlans(orgId: string, options: { limit?: number; offset?: number; status?: OrchestrationPlanStatus } = {}) {
  const limit = Math.min(PLAN_LIST_MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? 10)))
  const offset = Math.max(0, Math.trunc(options.offset ?? 0))
  const where: Prisma.RevenueExperimentWhereInput = { orgId, surface: 'orchestration', ...(options.status ? { status: options.status } : {}) }
  const [rows, total] = await Promise.all([
    prisma.revenueExperiment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
      select: { id: true, name: true, status: true, primaryMetric: true, budgetCents: true, audienceDefinition: true, createdAt: true, updatedAt: true },
    }),
    prisma.revenueExperiment.count({ where }),
  ])
  const approvals = rows.length
    ? await prisma.operationalMemoryProposal.findMany({ where: { orgId, targetType: 'orchestration_plan', targetId: { in: rows.map(row => row.id) } }, orderBy: { createdAt: 'desc' }, select: { targetId: true, status: true } })
    : []
  const approvalByPlan = new Map<string, string>()
  for (const approval of approvals) if (approval.targetId && !approvalByPlan.has(approval.targetId)) approvalByPlan.set(approval.targetId, approval.status)
  return {
    items: rows.map(row => summarisePlanRow(row, approvalByPlan.get(row.id))),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  }
}

export async function createPersistedPlan(actor: OrchestrationActor, input: OrchestrationPlanInput, idempotencyKey: string) {
  const key = requireOperationKey(idempotencyKey)
  validateInput(input)
  const planId = stableId('orch', `${actor.orgId}:${key}`)
  const approvalId = stableId('approval', `${planId}:approval`)
  const automationId = stableId('automation', `${planId}:runtime`)
  const plan = createInitialPlan(actor.orgId, input, planId)
  const storedPayload = planPayload(plan, input, key, automationId, approvalId)
  const existing = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId } })
  if (existing) {
    const payload = jsonObject(existing.audienceDefinition)
    if (payload.inputFingerprint !== storedPayload.inputFingerprint) throw new OrchestrationError('La idempotency key ya se utilizó con otra propuesta', 409, 'IDEMPOTENCY_CONFLICT')
    const persisted = await getPersistedPlan(actor.orgId, planId)
    if (!persisted) throw new OrchestrationError('No se pudo recuperar la propuesta idempotente', 503, 'PERSISTENCE_READ_FAILED')
    return { ...persisted, idempotentReplay: true }
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.revenueExperiment.create({
        data: {
          id: planId,
          orgId: actor.orgId,
          createdById: actor.userId,
          name: `Orquestación: ${input.objective}`.slice(0, 180),
          surface: 'orchestration',
          primaryMetric: input.desiredOutcome,
          status: 'proposal',
          audienceDefinition: inputJson(storedPayload),
          budgetCents: plan.limits.budgetCents,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + input.durationDays * 86_400_000),
        },
      })
      await tx.operationalMemoryProposal.create({
        data: {
          id: approvalId,
          orgId: actor.orgId,
          createdById: actor.userId,
          sourceType: 'orchestration',
          sourceId: planId,
          targetType: 'orchestration_plan',
          targetId: planId,
          title: `Aprobación requerida: ${input.objective}`.slice(0, 180),
          summary: plan.explainability.summary,
          evidence: inputJson({ idempotencyKey: key, limits: plan.limits, actions: plan.actions.map(action => ({ id: action.id, kind: action.kind, estimatedCostCents: action.estimatedCostCents })) }),
          proposedChange: inputJson(storedPayload),
          status: 'proposed',
        },
      })
      await tx.automation.create({
        data: {
          id: automationId,
          orgId: actor.orgId,
          name: `[orchestration] ${planId}`,
          description: 'Ledger privado de ejecución del orquestador; no es una automatización de usuario.',
          status: 'draft',
          trigger: inputJson({ event: 'orchestration.execute', planId }),
          actions: inputJson(plan.actions),
          isActive: false,
          createdById: actor.userId,
        },
      })
      await tx.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.userId,
          action: 'orchestration.plan.create',
          entityType: 'RevenueExperiment',
          entityId: planId,
          after: inputJson({ status: 'proposal', approvalId, automationId, idempotencyKey: key, limits: plan.limits }),
          correlationId: actor.correlationId,
        },
      })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const persisted = await getPersistedPlan(actor.orgId, planId)
      if (persisted) {
        const persistedPayload = jsonObject((await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId }, select: { audienceDefinition: true } }))?.audienceDefinition)
        if (persistedPayload.inputFingerprint !== storedPayload.inputFingerprint) throw new OrchestrationError('La idempotency key ya se utilizó con otra propuesta', 409, 'IDEMPOTENCY_CONFLICT')
        return { ...persisted, idempotentReplay: true }
      }
    }
    throw error
  }
  return { ...plan, persistence: { approvalId, automationId, idempotencyKey: key }, idempotentReplay: false }
}

function assertApprover(actor: OrchestrationActor, plan: { createdById: string | null; budgetCents: number | null }) {
  if (!hasPermission(actor.role, 'costs.approve', 'org')) throw new OrchestrationError('Tu rol no puede aprobar gasto o efectos externos', 403, 'APPROVAL_PERMISSION_REQUIRED')
  if (plan.createdById === actor.userId) throw new OrchestrationError('La persona que crea el plan no puede aprobar su propia ejecución', 403, 'SEPARATION_OF_DUTIES')
  if ((plan.budgetCents ?? 0) < 0) throw new OrchestrationError('Presupuesto persistido no válido', 422, 'INVALID_PERSISTED_BUDGET')
}

type OrchestrationCommand = 'approve' | 'reject' | 'execute' | 'rollback'
const COMMAND_TRIGGER_PREFIX = 'orchestration:command:'

function commandTriggerEventId(planId: string, command: OrchestrationCommand, key: string): string {
  return `${COMMAND_TRIGGER_PREFIX}${command}:${stableId('key', `${planId}:${key}`)}`
}

function commandFingerprint(command: OrchestrationCommand, key: string, payload: unknown = null): string {
  return operationFingerprint(`command:${command}`, key, payload)
}

type CommandLedger = {
  id: string
  status: string
  input: Prisma.JsonValue | null
  output: Prisma.JsonValue | null
}

function commandInput(ledger: CommandLedger): Record<string, unknown> {
  return jsonObject(ledger.input)
}

function commandOutput(ledger: CommandLedger): Record<string, unknown> {
  return jsonObject(ledger.output)
}

function assertCommandFingerprint(ledger: CommandLedger, fingerprint: string): void {
  if (commandInput(ledger).fingerprint !== fingerprint) {
    throw new OrchestrationError('La clave de idempotencia ya se utilizó con otra operación', 409, 'IDEMPOTENCY_CONFLICT')
  }
  if (ledger.status === 'command_pending') {
    throw new OrchestrationError('La operación idempotente sigue en curso', 409, 'COMMAND_IN_PROGRESS')
  }
}

async function reserveCommand(
  tx: Prisma.TransactionClient,
  actor: OrchestrationActor,
  planId: string,
  automationId: string,
  command: OrchestrationCommand,
  key: string,
  fingerprint: string,
): Promise<{ ledger: CommandLedger; replay: boolean }> {
  const triggerEventId = commandTriggerEventId(planId, command, key)
  const existing = await tx.automationRun.findUnique({
    where: { orgId_automationId_triggerEventId: { orgId: actor.orgId, automationId, triggerEventId } },
    select: { id: true, status: true, input: true, output: true },
  })
  if (existing) {
    assertCommandFingerprint(existing, fingerprint)
    return { ledger: existing, replay: true }
  }

  // La restricción única existente de AutomationRun actúa como valla durable.
  // createMany(skipDuplicates) evita una carrera entre dos reintentos HTTP.
  await tx.automationRun.createMany({
    data: [{
      id: stableId('command', `${planId}:${command}:${key}`),
      orgId: actor.orgId,
      automationId,
      triggerEventId,
      correlationId: actor.correlationId,
      status: 'command_pending',
      input: inputJson({ planId, command, idempotencyKey: key, fingerprint, actorUserId: actor.userId }),
    }],
    skipDuplicates: true,
  })
  const ledger = await tx.automationRun.findUniqueOrThrow({
    where: { orgId_automationId_triggerEventId: { orgId: actor.orgId, automationId, triggerEventId } },
    select: { id: true, status: true, input: true, output: true },
  })
  if (ledger.status !== 'command_pending') {
    assertCommandFingerprint(ledger, fingerprint)
    return { ledger, replay: true }
  }
  return { ledger, replay: false }
}

async function finishCommand(tx: Prisma.TransactionClient, ledgerId: string, output: Record<string, unknown>): Promise<void> {
  await tx.automationRun.update({
    where: { id: ledgerId },
    data: { status: 'command_succeeded', output: inputJson(output), finishedAt: new Date() },
  })
}

async function readCommandLedger(
  orgId: string,
  planId: string,
  automationId: string,
  command: OrchestrationCommand,
  key: string,
  fingerprint: string,
): Promise<CommandLedger | null> {
  const ledger = await prisma.automationRun.findUnique({
    where: { orgId_automationId_triggerEventId: { orgId, automationId, triggerEventId: commandTriggerEventId(planId, command, key) } },
    select: { id: true, status: true, input: true, output: true },
  })
  if (!ledger) return null
  assertCommandFingerprint(ledger, fingerprint)
  return ledger
}

async function queueJob(tx: Prisma.TransactionClient, actor: OrchestrationActor, planId: string, automationId: string, approvalId: string, idempotencyKey: string, mode: 'execute' | 'rollback', operationScope: string = mode) {
  const queueIdentity = `${operationScope}:${idempotencyKey}`
  const runId = stableId('run', `${planId}:${queueIdentity}`)
  const eventId = stableId('event', `${planId}:${queueIdentity}`)
  const triggerEventId = `orchestration:${mode}:${stableId('key', `${planId}:${queueIdentity}`)}`
  const run = await tx.automationRun.upsert({
    where: { orgId_automationId_triggerEventId: { orgId: actor.orgId, automationId, triggerEventId } },
    create: { id: runId, orgId: actor.orgId, automationId, triggerEventId, correlationId: actor.correlationId, status: 'queued', input: inputJson({ planId, mode, idempotencyKey, queueIdentity, explicitRetry: mode === 'execute' && operationScope === 'execute' }) },
    update: {},
  })
  const event = await tx.outboxEvent.upsert({
    where: { id: eventId },
    create: { id: eventId, orgId: actor.orgId, topic: mode === 'execute' ? 'orchestration.execute' : 'orchestration.rollback', aggregateType: 'OrchestrationPlan', aggregateId: planId, payload: inputJson({ planId, automationId, approvalId, runId: run.id, mode, idempotencyKey, queueIdentity, explicitRetry: mode === 'execute' && operationScope === 'execute' }), correlationId: actor.correlationId },
    update: {},
  })
  await tx.revenueExperiment.update({ where: { id: planId }, data: { status: mode === 'execute' ? 'queued' : 'rolling_back' } })
  return { run, event }
}

async function approvePlanLegacy(actor: OrchestrationActor, planId: string, idempotencyKey: string, comment?: string) {
  const key = normaliseKey(idempotencyKey)
  const plan = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
  if (!plan) throw new OrchestrationError('Plan no encontrado', 404, 'PLAN_NOT_FOUND')
  assertApprover(actor, plan)
  const payload = jsonObject(plan.audienceDefinition)
  const runtime = jsonObject(payload.runtime)
  const approvalId = String(runtime.approvalId ?? '')
  const automationId = String(runtime.automationId ?? '')
  if (!approvalId || !automationId) throw new OrchestrationError('Plan sin runtime persistente', 422, 'RUNTIME_MISSING')
  const result = await prisma.$transaction(async tx => {
    if (!['proposal', 'approved'].includes(plan.status)) {
      throw new OrchestrationError('La propuesta ya está en ejecución o en un estado terminal', 409, 'PLAN_ALREADY_QUEUED')
    }
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId } })
    if (!approval) throw new OrchestrationError('Aprobación no encontrada', 404, 'APPROVAL_NOT_FOUND')
    if (approval.createdById === actor.userId) throw new OrchestrationError('No puedes aprobar tu propia propuesta', 403, 'SEPARATION_OF_DUTIES')
    if (approval.status !== 'proposed') throw new OrchestrationError('La propuesta ya fue decidida', 409, 'APPROVAL_ALREADY_DECIDED')
    const updated = await tx.operationalMemoryProposal.update({ where: { id: approval.id }, data: { status: 'approved', reviewedById: actor.userId, reviewedAt: new Date(), reviewComment: comment?.trim() || null } })
    const job = await queueJob(tx, actor, planId, automationId, approval.id, key, 'execute')
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.approve', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: plan.status, approvalStatus: approval.status }), after: inputJson({ status: 'queued', approvalStatus: updated.status, eventId: job.event.id, runId: job.run.id }), correlationId: actor.correlationId } })
    return { approval: updated, job }
  })
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] dispatch tras aprobación falló:', error))
  return getPersistedPlan(actor.orgId, planId).then(persisted => ({ ...(persisted ?? {}), queued: true, eventId: result.job.event.id }))
}

async function rejectPlanLegacy(actor: OrchestrationActor, planId: string, comment?: string) {
  const plan = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
  if (!plan) throw new OrchestrationError('Plan no encontrado', 404, 'PLAN_NOT_FOUND')
  assertApprover(actor, plan)
  const payload = jsonObject(plan.audienceDefinition)
  const approvalId = String(jsonObject(payload.runtime).approvalId ?? '')
  const result = await prisma.$transaction(async tx => {
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId } })
    if (!approval) throw new OrchestrationError('Aprobación no encontrada', 404, 'APPROVAL_NOT_FOUND')
    if (approval.status !== 'proposed') throw new OrchestrationError('La propuesta ya fue decidida', 409, 'APPROVAL_ALREADY_DECIDED')
    const updated = await tx.operationalMemoryProposal.update({ where: { id: approval.id }, data: { status: 'rejected', reviewedById: actor.userId, reviewedAt: new Date(), reviewComment: comment?.trim() || null } })
    await tx.revenueExperiment.update({ where: { id: planId }, data: { status: 'rejected' } })
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.reject', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: plan.status }), after: inputJson({ status: 'rejected', approvalId: updated.id }), correlationId: actor.correlationId } })
    return updated
  })
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), rejected: true, approval: result }
}

async function executePlanLegacy(actor: OrchestrationActor, planId: string, idempotencyKey: string) {
  const plan = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
  if (!plan) throw new OrchestrationError('Plan no encontrado', 404, 'PLAN_NOT_FOUND')
  assertApprover(actor, plan)
  if (!['paused', 'failed'].includes(plan.status)) throw new OrchestrationError('El plan debe estar pausado o fallido para reanudarlo', 409, plan.status === 'queued' || plan.status === 'running' ? 'PLAN_ALREADY_QUEUED' : 'PLAN_NOT_EXECUTABLE')
  const payload = jsonObject(plan.audienceDefinition)
  const runtime = jsonObject(payload.runtime)
  const job = await prisma.$transaction(tx => queueJob(tx, actor, planId, String(runtime.automationId), String(runtime.approvalId), normaliseKey(idempotencyKey), 'execute'))
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] dispatch manual falló:', error))
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), queued: true, eventId: job.event.id }
}

async function rollbackPlanLegacy(actor: OrchestrationActor, planId: string, idempotencyKey: string) {
  const plan = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
  if (!plan) throw new OrchestrationError('Plan no encontrado', 404, 'PLAN_NOT_FOUND')
  assertApprover(actor, plan)
  if (!['running', 'paused', 'executed', 'failed'].includes(plan.status)) throw new OrchestrationError('El plan no tiene efectos confirmados que compensar', 409, 'PLAN_NOT_ROLLBACKABLE')
  const payload = jsonObject(plan.audienceDefinition)
  const runtime = jsonObject(payload.runtime)
  const job = await prisma.$transaction(tx => queueJob(tx, actor, planId, String(runtime.automationId), String(runtime.approvalId), normaliseKey(idempotencyKey), 'rollback'))
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] compensación falló:', error))
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), queued: true, rollback: true, eventId: job.event.id }
}

export async function getOrchestrationHealth(orgId: string) {
  const [pending, processing, deadLetter] = await Promise.all([
    prisma.outboxEvent.count({ where: { orgId, topic: { in: ['orchestration.execute', 'orchestration.rollback'] }, status: 'pending' } }),
    prisma.outboxEvent.count({ where: { orgId, topic: { in: ['orchestration.execute', 'orchestration.rollback'] }, status: 'processing' } }),
    prisma.outboxEvent.count({ where: { orgId, topic: { in: ['orchestration.execute', 'orchestration.rollback'] }, status: 'dead_letter' } }),
  ])
  return { status: deadLetter ? 'degraded' : pending || processing ? 'busy' : 'ok', pending, processing, deadLetter, workerMode: 'durable_outbox_with_request_kick' }
}

type CommandRuntime = {
  plan: { id: string; status: string; createdById: string | null; budgetCents: number | null; audienceDefinition: Prisma.JsonValue | null }
  automationId: string
  approvalId: string
}

async function loadCommandRuntime(actor: OrchestrationActor, planId: string): Promise<CommandRuntime> {
  const plan = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
  if (!plan) throw new OrchestrationError('Plan no encontrado', 404, 'PLAN_NOT_FOUND')
  assertApprover(actor, plan)
  const runtime = jsonObject(jsonObject(plan.audienceDefinition).runtime)
  const automationId = String(runtime.automationId ?? '')
  const approvalId = String(runtime.approvalId ?? '')
  if (!automationId || !approvalId) throw new OrchestrationError('Plan sin runtime persistente', 422, 'RUNTIME_MISSING')
  return { plan, automationId, approvalId }
}

async function commandReplayResponse(actor: OrchestrationActor, planId: string, ledger: CommandLedger) {
  return {
    ...(await getPersistedPlan(actor.orgId, planId) ?? {}),
    ...commandOutput(ledger),
    idempotentReplay: true,
  }
}

/**
 * Aprobación durable. El ledger de AutomationRun se escribe en la misma
 * transacción que la decisión y la creación del outbox; un replay nunca
 * vuelve a aprobar ni vuelve a encolar.
 */
export async function approvePlan(actor: OrchestrationActor, planId: string, idempotencyKey: string, comment?: string) {
  const key = requireOperationKey(idempotencyKey)
  const normalizedComment = comment?.trim() || null
  const { automationId, approvalId } = await loadCommandRuntime(actor, planId)
  const fingerprint = commandFingerprint('approve', key, { comment: normalizedComment })
  const result = await prisma.$transaction(async tx => {
    const command = await reserveCommand(tx, actor, planId, automationId, 'approve', key, fingerprint)
    if (command.replay) return { replay: true as const, ledger: command.ledger }
    const currentPlan = await tx.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
    if (!currentPlan || !['proposal', 'approved'].includes(currentPlan.status)) throw new OrchestrationError('La propuesta ya está en ejecución o en un estado terminal', 409, 'PLAN_ALREADY_QUEUED')
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId } })
    if (!approval) throw new OrchestrationError('Aprobación no encontrada', 404, 'APPROVAL_NOT_FOUND')
    if (approval.createdById === actor.userId) throw new OrchestrationError('No puedes aprobar tu propia propuesta', 403, 'SEPARATION_OF_DUTIES')
    if (approval.status !== 'proposed') throw new OrchestrationError('La propuesta ya fue decidida', 409, 'APPROVAL_ALREADY_DECIDED')
    const updated = await tx.operationalMemoryProposal.update({ where: { id: approval.id }, data: { status: 'approved', reviewedById: actor.userId, reviewedAt: new Date(), reviewComment: normalizedComment } })
    const job = await queueJob(tx, actor, planId, automationId, approval.id, key, 'execute', 'approve')
    const output = { operation: 'approve', queued: true, eventId: job.event.id, runId: job.run.id }
    await finishCommand(tx, command.ledger.id, output)
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.approve', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: currentPlan.status, approvalStatus: approval.status }), after: inputJson({ ...output, approvalStatus: updated.status, idempotencyKey: key }), correlationId: actor.correlationId } })
    return { replay: false as const, output }
  })
  if (result.replay) return commandReplayResponse(actor, planId, result.ledger)
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] dispatch tras aprobación falló:', error))
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), ...result.output, idempotentReplay: false }
}

export async function rejectPlan(actor: OrchestrationActor, planId: string, idempotencyKey: string, comment?: string) {
  const key = requireOperationKey(idempotencyKey)
  const normalizedComment = comment?.trim() || null
  const { automationId, approvalId } = await loadCommandRuntime(actor, planId)
  const fingerprint = commandFingerprint('reject', key, { comment: normalizedComment })
  const result = await prisma.$transaction(async tx => {
    const command = await reserveCommand(tx, actor, planId, automationId, 'reject', key, fingerprint)
    if (command.replay) return { replay: true as const, ledger: command.ledger }
    const currentPlan = await tx.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
    if (!currentPlan || currentPlan.status !== 'proposal') throw new OrchestrationError('La propuesta ya fue decidida', 409, 'PLAN_ALREADY_DECIDED')
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId } })
    if (!approval) throw new OrchestrationError('Aprobación no encontrada', 404, 'APPROVAL_NOT_FOUND')
    if (approval.status !== 'proposed') throw new OrchestrationError('La propuesta ya fue decidida', 409, 'APPROVAL_ALREADY_DECIDED')
    const updated = await tx.operationalMemoryProposal.update({ where: { id: approval.id }, data: { status: 'rejected', reviewedById: actor.userId, reviewedAt: new Date(), reviewComment: normalizedComment } })
    await tx.revenueExperiment.update({ where: { id: planId }, data: { status: 'rejected' } })
    const output = { operation: 'reject', rejected: true, approvalId: updated.id }
    await finishCommand(tx, command.ledger.id, output)
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.reject', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: currentPlan.status, approvalStatus: approval.status }), after: inputJson({ ...output, idempotencyKey: key }), correlationId: actor.correlationId } })
    return { replay: false as const, output }
  })
  if (result.replay) return commandReplayResponse(actor, planId, result.ledger)
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), ...result.output, idempotentReplay: false }
}

export async function executePlan(actor: OrchestrationActor, planId: string, idempotencyKey: string) {
  const key = requireOperationKey(idempotencyKey)
  const { automationId, approvalId } = await loadCommandRuntime(actor, planId)
  const fingerprint = commandFingerprint('execute', key)
  const result = await prisma.$transaction(async tx => {
    const command = await reserveCommand(tx, actor, planId, automationId, 'execute', key, fingerprint)
    if (command.replay) return { replay: true as const, ledger: command.ledger }
    const currentPlan = await tx.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
    if (!currentPlan || !['paused', 'failed'].includes(currentPlan.status)) throw new OrchestrationError('El plan debe estar pausado o fallido para reanudarlo', 409, currentPlan?.status === 'queued' || currentPlan?.status === 'running' ? 'PLAN_ALREADY_QUEUED' : 'PLAN_NOT_EXECUTABLE')
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId, status: 'approved' } })
    if (!approval) throw new OrchestrationError('La ejecución necesita una aprobación persistente', 409, 'APPROVAL_REQUIRED')
    const job = await queueJob(tx, actor, planId, automationId, approval.id, key, 'execute', 'execute')
    const output = { operation: 'execute', queued: true, eventId: job.event.id, runId: job.run.id, explicitRetry: true }
    await finishCommand(tx, command.ledger.id, output)
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.execute', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: currentPlan.status }), after: inputJson({ ...output, idempotencyKey: key }), correlationId: actor.correlationId } })
    return { replay: false as const, output }
  })
  if (result.replay) return commandReplayResponse(actor, planId, result.ledger)
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] dispatch manual falló:', error))
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), ...result.output, idempotentReplay: false }
}

export async function rollbackPlan(actor: OrchestrationActor, planId: string, idempotencyKey: string) {
  const key = requireOperationKey(idempotencyKey)
  const { automationId, approvalId } = await loadCommandRuntime(actor, planId)
  const fingerprint = commandFingerprint('rollback', key)
  const result = await prisma.$transaction(async tx => {
    const command = await reserveCommand(tx, actor, planId, automationId, 'rollback', key, fingerprint)
    if (command.replay) return { replay: true as const, ledger: command.ledger }
    const currentPlan = await tx.revenueExperiment.findFirst({ where: { id: planId, orgId: actor.orgId, surface: 'orchestration' } })
    if (!currentPlan || !['running', 'paused', 'executed', 'failed'].includes(currentPlan.status)) throw new OrchestrationError('El plan no tiene efectos confirmados que compensar', 409, 'PLAN_NOT_ROLLBACKABLE')
    const approval = await tx.operationalMemoryProposal.findFirst({ where: { id: approvalId, orgId: actor.orgId, targetType: 'orchestration_plan', targetId: planId, status: 'approved' } })
    if (!approval) throw new OrchestrationError('La compensación necesita una aprobación persistente', 409, 'APPROVAL_REQUIRED')
    const job = await queueJob(tx, actor, planId, automationId, approval.id, key, 'rollback', 'rollback')
    const output = { operation: 'rollback', queued: true, rollback: true, eventId: job.event.id, runId: job.run.id }
    await finishCommand(tx, command.ledger.id, output)
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, action: 'orchestration.plan.rollback.request', entityType: 'RevenueExperiment', entityId: planId, before: inputJson({ status: currentPlan.status }), after: inputJson({ ...output, idempotencyKey: key }), correlationId: actor.correlationId } })
    return { replay: false as const, output }
  })
  if (result.replay) return commandReplayResponse(actor, planId, result.ledger)
  void dispatchOrchestrationJobs().catch(error => console.error('[Orchestration] compensación falló:', error))
  return { ...(await getPersistedPlan(actor.orgId, planId) ?? {}), ...result.output, idempotentReplay: false }
}

