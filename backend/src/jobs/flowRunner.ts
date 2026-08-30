// Runner de Flows (docs/plataforma-abierta/05-FLUJOS.md §4).
//
// Calcado del patrón de outboxDispatcher/orchestration.runtime: polling +
// claim por UPDATE condicional del FlowRun con lease, heartbeat que renueva el
// lease durante avances lentos y recuperación de huérfanos (lease expirado).
//
// Modelo de avance: el grafo es lineal por defecto (orden de nodes[]), con
// saltos hacia delante vía edges/condition. Un paso que lanza un Job
// (capability/microapp) deja el run esperando; en la siguiente pasada se
// comprueba el estado del Job y, si terminó, se copia salida y coste real a
// spentCents y se continúa.
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { FlowRun, FlowStepRun } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { redactProviderError } from '../lib/integrationRuntime'
import { emitToOrg } from '../websockets/index'
import { route } from '../providers/router'
import { runCapability } from '../providers/runCapability'
import { prepareMicroappEstimate, startMicroappRun } from '../microapps/runtime'
import { getMicroapp } from '../microapps/registry'
import * as tasksService from '../services/tasks.service'
import { publishAsset } from '../services/assets.service'
import { getCampaignAttribution } from '../services/adAttribution.service'
import {
  ORCHESTRATION_ACTION_KINDS,
  executeOrchestrationAction,
  type OrchestrationActionKind,
} from '../services/orchestration.adapters'
import { approvalRule } from '../access-control'
import { flowGraph, type FlowGraph, type FlowNode } from '../flows/graph'
import { buildNodeInput, evaluateCondition, resolveValueRef, type FlowEvalContext } from '../flows/eval'
import { ensureSystemFlows } from '../flows/systemRecipes'

const POLL_MS = Math.max(1_000, Number(process.env.FLOW_RUNNER_POLL_MS ?? 5_000))
const BATCH_SIZE = Math.min(25, Math.max(1, Number(process.env.FLOW_RUNNER_BATCH ?? 10)))
const LEASE_MS = Math.max(30_000, Number(process.env.FLOW_RUNNER_LEASE_MS ?? 5 * 60_000))
const WORKER_ID = process.env.FLOW_RUNNER_WORKER_ID?.trim() || `flow-runner-${process.pid}-${randomUUID()}`
// Cota dura de iteraciones por pasada para que un grafo dañado jamás cuelgue
// el worker (los saltos solo pueden ser hacia delante, pero mejor cinturón).
const MAX_PASS_ITERATIONS = 500

let running = false

/** Clave estable para que recuperar un lease nunca duplique el Job del paso. */
export function flowStepJobIdempotencyKey(flowRunId: string, nodeKey: string, iteration?: number): string {
  return iteration === undefined
    ? `flow:${flowRunId}:node:${nodeKey}`
    : `flow:${flowRunId}:node:${nodeKey}:iteration:${iteration}`
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// ---------------------------------------------------------------------------
// Claim / lease (misma primitiva que el outbox: UPDATE condicional)
// ---------------------------------------------------------------------------

function claimableWhere(now: Date): Prisma.FlowRunWhereInput {
  return {
    status: 'running',
    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
  }
}

async function claimFlowRun(runId: string): Promise<FlowRun | null> {
  const now = new Date()
  const claimed = await prisma.flowRun.updateMany({
    where: { id: runId, ...claimableWhere(now) },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), workerId: WORKER_ID },
  })
  if (claimed.count !== 1) return null
  return prisma.flowRun.findUnique({ where: { id: runId } })
}

async function claimDueFlowRuns(): Promise<FlowRun[]> {
  const now = new Date()
  const candidates = await prisma.flowRun.findMany({
    where: claimableWhere(now),
    orderBy: { startedAt: 'asc' },
    take: BATCH_SIZE * 2,
    select: { id: true },
  })
  const claimed = await Promise.all(candidates.map(candidate => claimFlowRun(candidate.id)))
  return claimed.filter((run): run is FlowRun => Boolean(run)).slice(0, BATCH_SIZE)
}

async function renewLease(runId: string): Promise<boolean> {
  const now = new Date()
  const renewed = await prisma.flowRun.updateMany({
    where: { id: runId, workerId: WORKER_ID, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  })
  return renewed.count === 1
}

/** Mantiene el lease vivo mientras se avanza un run lento (patrón outbox). */
async function withRunLease<T>(runId: string, work: () => Promise<T>): Promise<{ value: T; leaseLost: boolean }> {
  let leaseLost = false
  let renewal = Promise.resolve()
  const heartbeat = () => {
    renewal = renewal.then(async () => {
      try {
        if (!(await renewLease(runId))) leaseLost = true
      } catch {
        leaseLost = true
      }
    })
  }
  const timer = setInterval(heartbeat, Math.max(1_000, Math.floor(LEASE_MS / 3)))
  timer.unref()
  try {
    const value = await work()
    clearInterval(timer)
    await renewal
    return { value, leaseLost }
  } catch (error) {
    clearInterval(timer)
    await renewal
    throw error
  }
}

async function releaseRun(runId: string): Promise<void> {
  await prisma.flowRun.updateMany({
    where: { id: runId, workerId: WORKER_ID },
    data: { leaseExpiresAt: null, workerId: null },
  })
}

// ---------------------------------------------------------------------------
// Estado del avance
// ---------------------------------------------------------------------------

type StepMap = Map<string, FlowStepRun>

interface RunState {
  run: FlowRun
  graph: FlowGraph
  nodeByKey: Map<string, FlowNode>
  orderIndex: Map<string, number>
  // Nodos que solo existen como plantilla de un map: al llegar linealmente se
  // marcan 'skipped' (los consume el fan-out, no el recorrido).
  mapTemplateKeys: Set<string>
  steps: StepMap
  spentCents: number
}

function evalContext(state: RunState): FlowEvalContext {
  const outputs: Record<string, unknown> = {}
  for (const [key, step] of state.steps) {
    if (step.status === 'succeeded' && step.output !== null) outputs[key] = step.output
  }
  return { variables: asObject(state.run.variables), outputs }
}

/** Sucesor lineal con edges explícitas por encima del orden del array. */
function successorOf(state: RunState, nodeKey: string): string | null {
  const edge = state.graph.edges.find(e => e.from === nodeKey)
  if (edge) return edge.to
  const index = state.orderIndex.get(nodeKey)
  if (index === undefined) return null
  const next = state.graph.nodes[index + 1]
  return next ? next.key : null
}

async function upsertStep(state: RunState, nodeKey: string, data: {
  status: string
  jobId?: string | null
  approvalRequestId?: string | null
  input?: unknown
  output?: unknown
  error?: unknown
  finished?: boolean
}): Promise<FlowStepRun> {
  const now = new Date()
  const step = await prisma.flowStepRun.upsert({
    where: { flowRunId_nodeKey: { flowRunId: state.run.id, nodeKey } },
    create: {
      orgId: state.run.orgId,
      flowRunId: state.run.id,
      nodeKey,
      status: data.status,
      jobId: data.jobId ?? null,
      approvalRequestId: data.approvalRequestId ?? null,
      input: data.input === undefined ? undefined : inputJson(data.input),
      output: data.output === undefined ? undefined : inputJson(data.output),
      error: data.error === undefined ? undefined : inputJson(data.error),
      startedAt: now,
      finishedAt: data.finished ? now : null,
    },
    update: {
      status: data.status,
      ...(data.jobId !== undefined ? { jobId: data.jobId } : {}),
      ...(data.approvalRequestId !== undefined ? { approvalRequestId: data.approvalRequestId } : {}),
      ...(data.input !== undefined ? { input: inputJson(data.input) } : {}),
      ...(data.output !== undefined ? { output: inputJson(data.output) } : {}),
      ...(data.error !== undefined ? { error: inputJson(data.error) } : {}),
      startedAt: now,
      finishedAt: data.finished ? now : null,
    },
  })
  state.steps.set(nodeKey, step)
  return step
}

async function failRun(state: RunState, nodeKey: string, code: string, message: string): Promise<void> {
  const existing = state.steps.get(nodeKey)
  const error = { code, message: redactProviderError(message) }
  if (existing && !['succeeded', 'skipped'].includes(existing.status)) {
    // El paso conserva su estado si ya era terminal negativo (blocked/failed).
    if (existing.status !== 'blocked' && existing.status !== 'failed') {
      await upsertStep(state, nodeKey, { status: 'failed', error, finished: true })
    }
  } else if (!existing) {
    await upsertStep(state, nodeKey, { status: 'failed', error, finished: true })
  }
  await prisma.flowRun.updateMany({
    where: { id: state.run.id, status: 'running' },
    data: { status: 'failed', error: inputJson({ ...error, nodeKey }), finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
  })
}

async function pauseRunForApproval(state: RunState): Promise<void> {
  await prisma.flowRun.updateMany({
    where: { id: state.run.id, status: 'running' },
    data: { status: 'awaiting_approval', leaseExpiresAt: null, workerId: null },
  })
}

async function addSpent(state: RunState, cents: number): Promise<void> {
  if (!cents) return
  state.spentCents += cents
  await prisma.flowRun.update({ where: { id: state.run.id }, data: { spentCents: { increment: cents } } })
}

/**
 * Al terminar un run dryRun el desglose de estimaciones se guarda en
 * variables._dryRunReport (decisión documentada: FlowRun.error queda reservado
 * para fallos reales y trigger describe el origen, no el resultado).
 */
async function completeRun(state: RunState): Promise<void> {
  const data: Prisma.FlowRunUpdateManyMutationInput = {
    status: 'succeeded',
    finishedAt: new Date(),
    leaseExpiresAt: null,
    workerId: null,
  }
  if (state.run.dryRun) {
    const stepsReport: Array<{ nodeKey: string; estimateCents: number }> = []
    let total = 0
    for (const [key, step] of state.steps) {
      const output = asObject(step.output)
      let cents = typeof output.estimateCents === 'number' ? output.estimateCents : 0
      const iterations = output.iterations
      if (Array.isArray(iterations)) {
        for (const item of iterations) {
          const iteration = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          if (typeof iteration.estimateCents === 'number') cents += iteration.estimateCents
        }
      }
      if (cents > 0) stepsReport.push({ nodeKey: key, estimateCents: cents })
      total += cents
    }
    data.variables = inputJson({
      ...asObject(state.run.variables),
      _dryRunReport: { totalEstimateCents: total, steps: stepsReport },
    })
  }
  await prisma.flowRun.updateMany({ where: { id: state.run.id, status: 'running' }, data })
}

// ---------------------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------------------

/**
 * Tope duro del run: si el próximo paso lo superaría, el paso queda en
 * 'awaiting_approval' con motivo 'presupuesto' (resolveApproval lo devuelve a
 * 'pending' con budgetApproved). Devuelve true si hay que pausar.
 */
async function holdForBudget(state: RunState, nodeKey: string, estimateCents: number, extraInput: Record<string, unknown>): Promise<boolean> {
  if (state.run.budgetCents === null || state.run.dryRun) return false
  if (state.spentCents + estimateCents <= state.run.budgetCents) return false
  const existing = state.steps.get(nodeKey)
  if (asObject(existing?.input ?? null).budgetApproved === true) return false
  await upsertStep(state, nodeKey, {
    status: 'awaiting_approval',
    input: {
      ...extraInput,
      reason: 'presupuesto',
      estimateCents,
      spentCents: state.spentCents,
      budgetCents: state.run.budgetCents,
    },
  })
  await pauseRunForApproval(state)
  return true
}

// ---------------------------------------------------------------------------
// Ejecutores por tipo de nodo. Devuelven la señal de control del recorrido.
// ---------------------------------------------------------------------------

type StepOutcome = 'advance' | 'wait' | 'stop'

async function runCapabilityNode(state: RunState, node: Extract<FlowNode, { type: 'capability' }>): Promise<StepOutcome> {
  const ctx = evalContext(state)
  const input = buildNodeInput(node.input, ctx)
  const preferences = {
    ...(node.tier ? { tier: node.tier } : {}),
    ...(node.providerId ? { providerId: node.providerId } : {}),
    ...(node.maxCostCents !== undefined ? { maxCostCents: node.maxCostCents } : {}),
  }

  if (state.run.dryRun) {
    // Simulación (microapp #75): el router estima sin crear Job ni gastar.
    try {
      const { decision } = await route({ orgId: state.run.orgId, capability: node.capability, input, preferences })
      await upsertStep(state, node.key, {
        status: 'succeeded',
        input,
        output: {
          simulated: true,
          providerId: decision.providerId,
          estimateCents: Math.ceil(decision.estimateCents),
          alternatives: decision.alternatives.length,
        },
        finished: true,
      })
    } catch (error) {
      // El simulador informa, no revienta: un nodo sin proveedor viable es
      // exactamente lo que el usuario quiere descubrir antes de activar.
      await upsertStep(state, node.key, {
        status: 'succeeded',
        input,
        output: { simulated: true, routable: false, reason: redactProviderError(error), estimateCents: 0 },
        finished: true,
      })
    }
    return 'advance'
  }

  const { decision } = await route({ orgId: state.run.orgId, capability: node.capability, input, preferences })
  const estimate = Math.ceil(decision.estimateCents)
  if (await holdForBudget(state, node.key, estimate, { capability: node.capability })) return 'stop'

  const trigger = asObject(state.run.trigger)
  const { jobId } = await runCapability({
    orgId: state.run.orgId,
    capability: node.capability,
    input,
    preferences,
    flowRunId: state.run.id,
    createdById: typeof trigger.createdById === 'string' ? trigger.createdById : undefined,
    idempotencyKey: flowStepJobIdempotencyKey(state.run.id, node.key),
  })
  await upsertStep(state, node.key, { status: 'running', jobId, input })
  return 'wait'
}

async function runMicroappNode(state: RunState, node: Extract<FlowNode, { type: 'microapp' }>): Promise<StepOutcome> {
  const ctx = evalContext(state)
  const input = buildNodeInput(node.input, ctx)
  const manifest = getMicroapp(node.microappId)

  if (state.run.dryRun) {
    let estimateCents = 0
    if (manifest) {
      const parsed = manifest.inputSchema.safeParse(input)
      if (parsed.success) {
        estimateCents = (await prepareMicroappEstimate({ orgId: state.run.orgId, manifest, input: parsed.data, agentic: node.agentic })).cents
      }
    }
    await upsertStep(state, node.key, {
      status: 'succeeded',
      input,
      output: {
        simulated: true,
        microappId: node.microappId,
        available: Boolean(manifest),
        estimateCents,
        agentic: node.agentic ? { strategy: node.agentic.strategy, rounds: node.agentic.rounds } : null,
      },
      finished: true,
    })
    return 'advance'
  }

  // El presupuesto del Flow también cubre microapps. Antes se aplicaba solo
  // a capability/map, por lo que una receta podía superar el tope mediante un
  // nodo microapp aunque su Job declarase coste estimado.
  let preparedEstimate
  let estimateCents = 0
  if (manifest) {
    const parsed = manifest.inputSchema.safeParse(input)
    if (parsed.success) {
      preparedEstimate = await prepareMicroappEstimate({ orgId: state.run.orgId, manifest, input: parsed.data, agentic: node.agentic })
      estimateCents = Math.ceil(preparedEstimate.cents)
    }
  }
  if (await holdForBudget(state, node.key, estimateCents, { microappId: node.microappId })) return 'stop'

  const trigger = asObject(state.run.trigger)
  const { jobId } = await startMicroappRun({
    orgId: state.run.orgId,
    microappId: node.microappId,
    input,
    createdById: typeof trigger.createdById === 'string' ? trigger.createdById : undefined,
    agentic: node.agentic,
    idempotencyKey: flowStepJobIdempotencyKey(state.run.id, node.key),
    preparedEstimate,
  })
  await upsertStep(state, node.key, { status: 'running', jobId, input })
  return 'wait'
}

/**
 * Acciones internas mínimas del catálogo de Flows. automations.service.ts no
 * exporta su ejecutor (es una función privada acoplada a Automation/Run), así
 * que se reimplementan aquí las tres básicas con la misma semántica de
 * resultado (succeeded/skipped/blocked) y la regla del repo: solo tienen
 * efectos locales; una acción con efecto externo incierto quedaría 'blocked',
 * jamás se reintentaría en silencio.
 */
export const FLOW_ACTION_TYPES = [
  'create_task',
  'update_lead_status',
  'notify',
  'publish_asset',
  'attribution_report',
  ...ORCHESTRATION_ACTION_KINDS,
] as const

interface FlowActionResult {
  status: 'succeeded' | 'skipped' | 'blocked'
  output?: Record<string, unknown>
  errorCode?: string
  errorDetail?: string
}

async function executeFlowAction(
  run: FlowRun,
  nodeKey: string,
  action: string,
  input: Record<string, unknown>,
): Promise<FlowActionResult> {
  if ((ORCHESTRATION_ACTION_KINDS as readonly string[]).includes(action)) {
    const trigger = asObject(run.trigger)
    const actorUserId = typeof trigger.createdById === 'string' ? trigger.createdById : `flow-system:${run.id}`
    const requestedBudget = typeof input.budgetCents === 'number' && Number.isSafeInteger(input.budgetCents)
      ? input.budgetCents
      : 0
    const result = await executeOrchestrationAction({
      orgId: run.orgId,
      actorUserId,
      actorRole: typeof trigger.actorRole === 'string' ? trigger.actorRole : 'system',
      planId: run.id,
      planBudgetCents: run.budgetCents ?? requestedBudget,
      idempotencyKey: `flow:${run.id}:${nodeKey}`,
      action: {
        id: `flow:${run.id}:${nodeKey}`,
        kind: action as OrchestrationActionKind,
        title: `Flow ${run.flowId}: ${nodeKey}`,
        input,
        references: {},
        estimatedCostCents: 0,
        requiresApproval: false,
      },
    })
    if (result.status === 'succeeded') return { status: 'succeeded', output: result.output }
    return {
      status: result.status === 'skipped' ? 'skipped' : 'blocked',
      errorCode: result.code ?? (result.status === 'failed' ? 'ORCHESTRATION_ACTION_FAILED' : 'ORCHESTRATION_ACTION_BLOCKED'),
      errorDetail: result.message ?? `La acción ${action} no pudo completarse`,
    }
  }
  switch (action) {
    case 'create_task': {
      const title = String(input.title ?? '').trim()
      if (!title) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta title en el input' }
      const leadId = typeof input.leadId === 'string' && input.leadId ? input.leadId : undefined
      if (leadId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: run.orgId }, select: { id: true } })
        if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado en la organización' }
      }
      const dueInDays = Number(input.dueInDays ?? 3)
      const task = await tasksService.createSystemTask(run.orgId, null, {
        type: 'automation',
        title,
        description: typeof input.description === 'string' ? input.description : undefined,
        leadId,
        dueAt: new Date(Date.now() + (Number.isFinite(dueInDays) ? dueInDays : 3) * 24 * 3600 * 1000).toISOString(),
        source: 'flow',
        sourceId: `${run.id}:${nodeKey}`,
      })
      return { status: 'succeeded', output: { taskId: task.id, ...(leadId ? { leadId } : {}) } }
    }
    case 'update_lead_status': {
      const leadId = typeof input.leadId === 'string' ? input.leadId : ''
      if (!leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El input no incluye leadId' }
      const status = typeof input.status === 'string' ? input.status : ''
      const allowed = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const
      if (!allowed.includes(status as (typeof allowed)[number])) {
        return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta un status válido en el input' }
      }
      const updated = await prisma.lead.updateMany({
        where: { id: leadId, orgId: run.orgId },
        data: { status: status as (typeof allowed)[number] },
      })
      if (updated.count === 0) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado en la organización' }
      return { status: 'succeeded', output: { leadId, status } }
    }
    case 'notify': {
      const message = String(input.message ?? `Notificación del flujo (run ${run.id})`)
      console.log(`[Flow:${run.flowId}] notify:`, message)
      try {
        // En el proceso worker emitToOrg es un no-op tolerante (jobs.service
        // documenta el mismo criterio).
        emitToOrg(run.orgId, 'flow:notify', { flowRunId: run.id, nodeKey, message })
      } catch (error) {
        console.warn('[FlowRunner] no se pudo emitir flow:notify:', (error as Error).message)
      }
      return { status: 'succeeded', output: { message } }
    }
    case 'publish_asset': {
      const assetId = typeof input.assetId === 'string' ? input.assetId : ''
      if (!assetId) return { status: 'skipped', errorCode: 'ASSET_ID_MISSING', errorDetail: 'Falta assetId para publicar la creatividad' }
      try {
        const asset = await publishAsset({ orgId: run.orgId, id: assetId })
        if (!asset?.publishedUrl) return { status: 'blocked', errorCode: 'ASSET_PUBLISH_FAILED', errorDetail: 'No se pudo crear una copia pública inmutable' }
        return { status: 'succeeded', output: { assetId: asset.id, imageUrl: asset.publishedUrl, publishedUrl: asset.publishedUrl } }
      } catch (error) {
        return { status: 'blocked', errorCode: (error as { code?: string }).code ?? 'ASSET_PUBLISH_BLOCKED', errorDetail: error instanceof Error ? error.message : 'Publicación del asset bloqueada' }
      }
    }
    case 'attribution_report': {
      const campaignId = typeof input.campaignId === 'string' ? input.campaignId : ''
      if (!campaignId) return { status: 'skipped', errorCode: 'CAMPAIGN_ID_MISSING', errorDetail: 'Falta campaignId para el informe' }
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId: run.orgId }, select: { id: true } })
      if (!campaign) return { status: 'skipped', errorCode: 'CAMPAIGN_NOT_FOUND', errorDetail: 'La campaña no existe en la organización' }
      const periodDays = typeof input.periodDays === 'number' && Number.isInteger(input.periodDays)
        ? Math.min(Math.max(input.periodDays, 1), 365)
        : 30
      const report = await getCampaignAttribution(run.orgId, campaign.id, { periodDays })
      return { status: 'succeeded', output: JSON.parse(JSON.stringify(report)) as Record<string, unknown> }
    }
    default:
      return { status: 'skipped', errorCode: 'UNSUPPORTED_ACTION', errorDetail: `Acción no soportada en Flows: ${action}` }
  }
}

async function runActionNode(state: RunState, node: Extract<FlowNode, { type: 'action' }>): Promise<StepOutcome> {
  const ctx = evalContext(state)
  const input = buildNodeInput(node.input, ctx)

  if (state.run.dryRun) {
    await upsertStep(state, node.key, {
      status: 'succeeded',
      input,
      output: { simulated: true, action: node.action, wouldDo: input },
      finished: true,
    })
    return 'advance'
  }

  const result = await executeFlowAction(state.run, node.key, node.action, input)
  if (result.status === 'blocked') {
    await upsertStep(state, node.key, {
      status: 'blocked',
      input,
      error: { code: result.errorCode ?? 'STEP_BLOCKED', message: result.errorDetail ?? 'Acción bloqueada' },
      finished: true,
    })
    await failRun(state, node.key, result.errorCode ?? 'STEP_BLOCKED', result.errorDetail ?? 'Acción bloqueada')
    return 'stop'
  }
  await upsertStep(state, node.key, {
    status: result.status,
    input,
    output: result.output,
    ...(result.errorCode ? { error: { code: result.errorCode, message: result.errorDetail ?? '' } } : {}),
    finished: true,
  })
  return 'advance'
}

async function runApprovalNode(state: RunState, node: Extract<FlowNode, { type: 'approval' }>): Promise<StepOutcome> {
  if (state.run.dryRun) {
    // La simulación no espera humanos: informa de que aquí habría una pausa.
    await upsertStep(state, node.key, {
      status: 'succeeded',
      output: { simulated: true, wouldAwait: node.action, reason: node.reason ?? null },
      finished: true,
    })
    return 'advance'
  }
  const trigger = asObject(state.run.trigger)
  const requesterUserId = typeof trigger.createdById === 'string' ? trigger.createdById : null
  let approvalRequestId: string | null = null
  // Si la acción está en approvalPolicy y el run lo lanzó una persona, se
  // registra la solicitud sensible real (separación de funciones incluida al
  // decidirla en resolveApproval). Un run por evento no tiene solicitante y
  // SensitiveApprovalRequest lo exige: el paso espera igual, sin fila SAR.
  if (approvalRule(node.action) && requesterUserId) {
    const request = await prisma.sensitiveApprovalRequest.create({
      data: {
        orgId: state.run.orgId,
        action: node.action,
        requesterUserId,
        resourceType: 'FlowRun',
        resourceId: state.run.id,
        reason: node.reason ?? `Aprobación del paso ${node.key} del flujo`,
        payload: inputJson({ nodeKey: node.key, flowRunId: state.run.id }),
      },
    })
    approvalRequestId = request.id
  }
  await upsertStep(state, node.key, {
    status: 'awaiting_approval',
    approvalRequestId,
    input: { action: node.action, reason: node.reason ?? null },
  })
  await pauseRunForApproval(state)
  return 'stop'
}

async function runWaitNode(state: RunState, node: Extract<FlowNode, { type: 'wait' }>): Promise<StepOutcome> {
  if (state.run.dryRun) {
    await upsertStep(state, node.key, {
      status: 'succeeded',
      output: { simulated: true, wouldWait: node.seconds ? `${node.seconds}s` : node.eventTopic ?? 'nada' },
      finished: true,
    })
    return 'advance'
  }
  if (node.seconds) {
    const resumeAt = new Date(Date.now() + node.seconds * 1000).toISOString()
    await upsertStep(state, node.key, { status: 'running', input: { resumeAt } })
    return 'wait'
  }
  if (node.eventTopic) {
    // Lo despierta dispatchFlowTriggers (outboxDispatcher) al ver el topic.
    await upsertStep(state, node.key, { status: 'running', input: { eventTopic: node.eventTopic } })
    return 'wait'
  }
  // Sin seconds ni eventTopic el nodo es un no-op declarado: no hay nada que
  // esperar y bloquear el run sería un cuelgue silencioso.
  await upsertStep(state, node.key, { status: 'succeeded', output: { noop: true }, finished: true })
  return 'advance'
}

// ---------------------------------------------------------------------------
// map: fan-out secuencial v1 (concurrency del grafo respetada como máximo — se
// ejecuta 1 a 1). Estado por iteración en output.iterations para sobrevivir a
// pasadas y reinicios del worker.
// ---------------------------------------------------------------------------

interface MapIteration {
  index: number
  jobId?: string
  status?: 'succeeded' | 'failed' | 'skipped'
  output?: unknown
  estimateCents?: number
  simulated?: boolean
}

function readIterations(step: FlowStepRun | undefined): MapIteration[] {
  const output = asObject(step?.output ?? null)
  return Array.isArray(output.iterations) ? (output.iterations as MapIteration[]) : []
}

async function persistIterations(
  state: RunState,
  nodeKey: string,
  status: string,
  items: unknown[],
  iterations: MapIteration[],
  finished = false,
  consumeBudgetApproval = false,
): Promise<void> {
  await upsertStep(state, nodeKey, {
    status,
    input: {
      ...asObject(state.steps.get(nodeKey)?.input ?? null),
      items,
      ...(consumeBudgetApproval ? { budgetApproved: false } : {}),
    },
    output: { iterations, total: items.length },
    finished,
  })
}

async function runMapNode(state: RunState, node: Extract<FlowNode, { type: 'map' }>): Promise<StepOutcome> {
  const template = state.nodeByKey.get(node.node)
  if (!template || (template.type !== 'capability' && template.type !== 'action')) {
    await failRun(state, node.key, 'MAP_TEMPLATE_UNSUPPORTED', `map ${node.key}: el nodo plantilla debe ser capability o action`)
    return 'stop'
  }
  const baseCtx = evalContext(state)
  const existing = state.steps.get(node.key)
  const storedItems = asObject(existing?.input ?? null).items
  const items = Array.isArray(storedItems) ? storedItems : resolveValueRef(node.items, baseCtx)
  if (!Array.isArray(items)) {
    await failRun(state, node.key, 'MAP_ITEMS_INVALID', `map ${node.key}: items no resolvió a una lista`)
    return 'stop'
  }
  const iterations = readIterations(existing)

  for (let index = 0; index < items.length; index++) {
    let iteration = iterations[index]
    const itemCtx: FlowEvalContext = {
      variables: { ...baseCtx.variables, item: items[index], itemIndex: index },
      outputs: baseCtx.outputs,
    }

    // Iteración lanzada como Job: comprobar cómo va antes de seguir.
    if (iteration && iteration.jobId && !iteration.status) {
      const job = await prisma.job.findFirst({ where: { id: iteration.jobId, orgId: state.run.orgId } })
      if (!job) {
        await failRun(state, node.key, 'MAP_JOB_MISSING', `map ${node.key}: el job de la iteración ${index} no existe`)
        return 'stop'
      }
      if (job.status === 'succeeded') {
        iteration.status = 'succeeded'
        iteration.output = job.output
        await addSpent(state, Number(job.costActualCents ?? job.costEstimateCents ?? 0))
        await persistIterations(state, node.key, 'running', items, iterations)
      } else if (job.status === 'failed' || job.status === 'canceled') {
        iteration.status = 'failed'
        await persistIterations(state, node.key, 'running', items, iterations)
        await failRun(state, node.key, 'MAP_ITERATION_FAILED', `map ${node.key}: la iteración ${index} terminó ${job.status}`)
        return 'stop'
      } else {
        return 'wait'
      }
    }

    if (iteration && iteration.status === 'failed') {
      await failRun(state, node.key, 'MAP_ITERATION_FAILED', `map ${node.key}: la iteración ${index} falló`)
      return 'stop'
    }
    if (iteration) continue

    // Lanzar la iteración pendiente (secuencial: solo una en vuelo).
    if (template.type === 'capability') {
      const input = buildNodeInput(template.input, itemCtx)
      const preferences = {
        ...(template.tier ? { tier: template.tier } : {}),
        ...(template.providerId ? { providerId: template.providerId } : {}),
        ...(template.maxCostCents !== undefined ? { maxCostCents: template.maxCostCents } : {}),
      }
      if (state.run.dryRun) {
        try {
          const { decision } = await route({ orgId: state.run.orgId, capability: template.capability, input, preferences })
          iteration = { index, simulated: true, status: 'succeeded', estimateCents: Math.ceil(decision.estimateCents) }
        } catch (error) {
          iteration = { index, simulated: true, status: 'succeeded', estimateCents: 0, output: { routable: false, reason: redactProviderError(error) } }
        }
        iterations[index] = iteration
        await persistIterations(state, node.key, 'running', items, iterations)
        continue
      }
      const { decision } = await route({ orgId: state.run.orgId, capability: template.capability, input, preferences })
      const estimate = Math.ceil(decision.estimateCents)
      if (await holdForBudget(state, node.key, estimate, { items, iterations })) return 'stop'
      const trigger = asObject(state.run.trigger)
      const { jobId } = await runCapability({
        orgId: state.run.orgId,
        capability: template.capability,
        input,
        preferences,
        flowRunId: state.run.id,
        createdById: typeof trigger.createdById === 'string' ? trigger.createdById : undefined,
        idempotencyKey: flowStepJobIdempotencyKey(state.run.id, node.key, index),
      })
      iterations[index] = { index, jobId }
      // La aprobación de presupuesto cubre esta iteración, no todo el fan-out.
      // Persistirla como consumida después del create idempotente hace seguro
      // tanto el siguiente elemento como una recuperación tras caída.
      await persistIterations(state, node.key, 'running', items, iterations, false, true)
      return 'wait'
    }

    // template.type === 'action'
    const input = buildNodeInput(template.input, itemCtx)
    if (state.run.dryRun) {
      iterations[index] = { index, simulated: true, status: 'succeeded', output: { action: template.action, wouldDo: input } }
      await persistIterations(state, node.key, 'running', items, iterations)
      continue
    }
    const result = await executeFlowAction(state.run, `${node.key}[${index}]`, template.action, input)
    if (result.status === 'blocked') {
      iterations[index] = { index, status: 'failed', output: { errorCode: result.errorCode } }
      await persistIterations(state, node.key, 'running', items, iterations)
      await failRun(state, node.key, result.errorCode ?? 'STEP_BLOCKED', result.errorDetail ?? 'Acción bloqueada en map')
      return 'stop'
    }
    iterations[index] = { index, status: result.status === 'skipped' ? 'skipped' : 'succeeded', output: result.output }
    await persistIterations(state, node.key, 'running', items, iterations)
  }

  await persistIterations(state, node.key, 'succeeded', items, iterations, true)
  return 'advance'
}

// ---------------------------------------------------------------------------
// Avance de un run
// ---------------------------------------------------------------------------

export function materializeMicroappStepOutput(
  jobOutput: Prisma.JsonValue | null,
  microappRun: { id: string; result: Prisma.JsonValue; staleAt: Date | null },
): Prisma.InputJsonValue {
  return inputJson({
    ...asObject(jobOutput),
    microappRunId: microappRun.id,
    result: microappRun.result,
    staleAt: microappRun.staleAt?.toISOString() ?? null,
  })
}

/** Cierra un paso capability/microapp cuyo Job terminó; devuelve la señal. */
async function settleJobStep(state: RunState, step: FlowStepRun): Promise<StepOutcome> {
  if (!step.jobId) return 'wait'
  const job = await prisma.job.findFirst({ where: { id: step.jobId, orgId: state.run.orgId } })
  if (!job) {
    await failRun(state, step.nodeKey, 'JOB_MISSING', `El job ${step.jobId} del paso ${step.nodeKey} no existe`)
    return 'stop'
  }
  if (job.status === 'succeeded') {
    let stepOutput: Prisma.InputJsonValue | undefined = job.output !== null
      ? job.output as Prisma.InputJsonValue
      : undefined
    if (job.kind === 'microapp.run') {
      const microappRun = await prisma.microappRun.findFirst({
        where: { jobId: job.id, orgId: state.run.orgId },
        select: { id: true, result: true, staleAt: true },
      })
      if (!microappRun) {
        await failRun(state, step.nodeKey, 'MICROAPP_RESULT_MISSING', `La microapp del paso ${step.nodeKey} terminó sin resultado materializado`)
        return 'stop'
      }
      stepOutput = materializeMicroappStepOutput(job.output, microappRun)
    }
    // Transición condicional: solo una pasada copia salida y coste real.
    const changed = await prisma.flowStepRun.updateMany({
      where: { id: step.id, status: 'running' },
      data: {
        status: 'succeeded',
        ...(stepOutput !== undefined ? { output: stepOutput } : {}),
        finishedAt: new Date(),
      },
    })
    if (changed.count === 1) await addSpent(state, Number(job.costActualCents ?? job.costEstimateCents ?? 0))
    const refreshed = await prisma.flowStepRun.findUnique({ where: { id: step.id } })
    if (refreshed) state.steps.set(step.nodeKey, refreshed)
    return 'advance'
  }
  if (job.status === 'failed') {
    const jobError = asObject(job.error)
    await failRun(state, step.nodeKey, typeof jobError.code === 'string' ? jobError.code : 'JOB_FAILED',
      typeof jobError.message === 'string' ? jobError.message : `El job del paso ${step.nodeKey} falló`)
    return 'stop'
  }
  if (job.status === 'canceled') {
    await failRun(state, step.nodeKey, 'JOB_CANCELED', `El job del paso ${step.nodeKey} fue cancelado`)
    return 'stop'
  }
  return 'wait'
}

async function resumeRunningStep(state: RunState, node: FlowNode, step: FlowStepRun): Promise<StepOutcome> {
  switch (node.type) {
    case 'capability':
    case 'microapp':
      return settleJobStep(state, step)
    case 'map':
      return runMapNode(state, node)
    case 'wait': {
      const input = asObject(step.input)
      if (typeof input.resumeAt === 'string') {
        if (new Date(input.resumeAt).getTime() <= Date.now()) {
          await upsertStep(state, node.key, { status: 'succeeded', output: { waitedUntil: input.resumeAt }, finished: true })
          return 'advance'
        }
        return 'wait'
      }
      // wait de evento: lo cierra dispatchFlowTriggers.
      return 'wait'
    }
    case 'action':
      // Solo hay acciones de efecto local en el catálogo de Flows: re-ejecutar
      // tras un proceso caído es seguro (mismo criterio que las acciones
      // locales del orquestador). Si algún día se añade una acción con efecto
      // externo, este camino debe marcar 'blocked', jamás repetir.
      return runActionNode(state, node)
    default:
      // condition/approval nunca deberían quedar 'running'; fallar visible.
      await failRun(state, node.key, 'STEP_STATE_INVALID', `El paso ${node.key} (${node.type}) quedó en un estado imposible`)
      return 'stop'
  }
}

async function executeFreshNode(state: RunState, node: FlowNode): Promise<StepOutcome> {
  switch (node.type) {
    case 'capability':
      return runCapabilityNode(state, node)
    case 'microapp':
      return runMicroappNode(state, node)
    case 'action':
      return runActionNode(state, node)
    case 'approval':
      return runApprovalNode(state, node)
    case 'wait':
      return runWaitNode(state, node)
    case 'map':
      return runMapNode(state, node)
    case 'condition':
      // condition se maneja en el bucle principal (necesita controlar saltos).
      return 'advance'
  }
}

async function advanceRun(run: FlowRun): Promise<void> {
  const version = await prisma.flowVersion.findUnique({ where: { id: run.flowVersionId } })
  if (!version) {
    await prisma.flowRun.updateMany({
      where: { id: run.id, status: 'running' },
      data: { status: 'failed', error: inputJson({ code: 'FLOW_VERSION_MISSING', message: 'La versión del flujo no existe' }), finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
    })
    return
  }
  const parsed = flowGraph.safeParse(version.graph)
  if (!parsed.success) {
    await prisma.flowRun.updateMany({
      where: { id: run.id, status: 'running' },
      data: { status: 'failed', error: inputJson({ code: 'FLOW_GRAPH_INVALID', message: 'El grafo persistido no cumple el contrato' }), finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
    })
    return
  }
  const graph = parsed.data
  const steps = await prisma.flowStepRun.findMany({ where: { flowRunId: run.id } })
  const state: RunState = {
    run,
    graph,
    nodeByKey: new Map(graph.nodes.map(node => [node.key, node])),
    orderIndex: new Map(graph.nodes.map((node, index) => [node.key, index])),
    mapTemplateKeys: new Set(graph.nodes.filter(n => n.type === 'map').map(n => (n as Extract<FlowNode, { type: 'map' }>).node)),
    steps: new Map(steps.map(step => [step.nodeKey, step])),
    spentCents: run.spentCents,
  }

  let currentKey: string | null = graph.nodes[0]?.key ?? null
  let iterations = 0

  while (currentKey) {
    if (++iterations > MAX_PASS_ITERATIONS) {
      await failRun(state, currentKey, 'FLOW_LOOP_DETECTED', 'El recorrido superó el máximo de iteraciones por pasada')
      return
    }
    const node = state.nodeByKey.get(currentKey)
    if (!node) {
      await failRun(state, currentKey, 'NODE_MISSING', `El nodo ${currentKey} no existe en el grafo`)
      return
    }
    const step = state.steps.get(currentKey)

    if (step && (step.status === 'succeeded' || step.status === 'skipped')) {
      currentKey = successorOf(state, currentKey)
      if (!currentKey) await completeRun(state)
      continue
    }
    if (step && (step.status === 'failed' || step.status === 'blocked')) {
      // El run ya debería estar failed; asegurar coherencia y salir.
      await prisma.flowRun.updateMany({
        where: { id: run.id, status: 'running' },
        data: { status: 'failed', error: inputJson({ code: 'STEP_FAILED', nodeKey: currentKey }), finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
      })
      return
    }
    if (step && step.status === 'awaiting_approval') {
      // Recuperación: si el run quedó 'running' con un paso esperando (caída
      // entre las dos escrituras), volver a pausarlo.
      await pauseRunForApproval(state)
      return
    }

    if (step && (step.status === 'running' || step.status === 'pending')) {
      const outcome: StepOutcome = step.status === 'pending'
        ? node.type === 'map' ? await runMapNode(state, node as Extract<FlowNode, { type: 'map' }>) : await executeFreshNode(state, node)
        : await resumeRunningStep(state, node, step)
      if (outcome === 'advance') continue
      if (outcome === 'wait') { await releaseRun(run.id); return }
      return
    }

    // Nodo sin paso todavía.
    if (state.mapTemplateKeys.has(currentKey)) {
      // Plantilla de un map alcanzada linealmente: la consume el fan-out.
      await upsertStep(state, currentKey, { status: 'skipped', output: { reason: 'map_template' }, finished: true })
      continue
    }

    if (node.type === 'condition') {
      const result = evaluateCondition(node, evalContext(state))
      const target = result ? node.ifTrue : node.ifFalse ?? successorOf(state, currentKey)
      await upsertStep(state, currentKey, { status: 'succeeded', output: { result, next: target }, finished: true })
      if (!target) { await completeRun(state); return }
      const from = state.orderIndex.get(currentKey) ?? 0
      const to = state.orderIndex.get(target)
      if (to === undefined) {
        await failRun(state, currentKey, 'CONDITION_TARGET_MISSING', `condition ${currentKey}: destino inexistente`)
        return
      }
      if (to <= from) {
        // Solo saltos hacia delante: un salto hacia atrás sería un bucle sin
        // condición de parada garantizada.
        await failRun(state, currentKey, 'CONDITION_BACKWARD_JUMP', `condition ${currentKey}: los saltos hacia atrás no están permitidos`)
        return
      }
      // Los nodos sobrevolados quedan 'skipped', visibles en el timeline.
      for (let i = from + 1; i < to; i++) {
        const skippedKey = graph.nodes[i].key
        if (!state.steps.get(skippedKey)) {
          await upsertStep(state, skippedKey, { status: 'skipped', output: { reason: `condition:${currentKey}` }, finished: true })
        }
      }
      currentKey = target
      continue
    }

    const outcome = await executeFreshNode(state, node)
    if (outcome === 'advance') continue
    if (outcome === 'wait') { await releaseRun(run.id); return }
    return
  }

  await completeRun(state)
}

// ---------------------------------------------------------------------------
// Bucle del worker
// ---------------------------------------------------------------------------

export async function dispatchFlowRuns(): Promise<{ advanced: number; failed: number }> {
  if (running) return { advanced: 0, failed: 0 }
  running = true
  let advanced = 0
  let failed = 0
  try {
    const runs = await claimDueFlowRuns()
    for (const run of runs) {
      try {
        const outcome = await withRunLease(run.id, () => advanceRun(run))
        if (outcome.leaseLost) continue
        advanced++
        await releaseRun(run.id)
      } catch (error) {
        failed++
        // Error inesperado del avance (routing, wallet, BD): run failed con
        // mensaje redactado — nunca detalles internos de proveedor.
        const message = redactProviderError(error)
        console.error(`[FlowRunner] avance del run ${run.id} falló:`, message)
        await prisma.flowRun.updateMany({
          where: { id: run.id, status: 'running' },
          data: { status: 'failed', error: inputJson({ code: 'FLOW_RUNNER_ERROR', message }), finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
        }).catch(() => undefined)
      }
    }
  } finally {
    running = false
  }
  return { advanced, failed }
}

let flowRunnerTimer: NodeJS.Timeout | null = null
let started = false

/**
 * Arranque idempotente del runner (worker.ts añade `import('./jobs/flowRunner')`
 * a su Promise.all, igual que el resto de jobs). Publica las recetas de
 * sistema al arrancar, tolerante a una base sin migrar todavía.
 */
export function startFlowRunner(): () => void {
  if (started) return () => undefined
  started = true
  void ensureSystemFlows().catch(error => {
    console.warn('[FlowRunner] no se pudieron publicar las recetas de sistema (¿BD sin migrar?):', (error as Error).message)
  })
  flowRunnerTimer = setInterval(() => void dispatchFlowRuns().catch(error => {
    console.error('[FlowRunner] tick falló:', (error as Error).message)
  }), POLL_MS)
  flowRunnerTimer.unref()
  void dispatchFlowRuns().catch(error => console.error('[FlowRunner] primer tick falló:', (error as Error).message))
  const stop = () => {
    if (flowRunnerTimer) clearInterval(flowRunnerTimer)
    flowRunnerTimer = null
    started = false
  }
  return stop
}

if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  startFlowRunner()
}

export { flowRunnerTimer }
