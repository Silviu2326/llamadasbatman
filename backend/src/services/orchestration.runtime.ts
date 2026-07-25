import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'
import { prisma } from '../lib/prisma'
import {
  ORCHESTRATION_ACTION_KINDS,
  actionHasExternalEffect,
  compensateOrchestrationAction,
  executeOrchestrationAction,
  type AdapterContext,
  type OrchestrationAction,
  type OrchestrationActionKind,
} from './orchestration.adapters'

const MAX_ATTEMPTS = Math.max(1, Number(process.env.ORCHESTRATION_MAX_ATTEMPTS ?? 5))
const LEASE_MS = Math.max(30_000, Number(process.env.ORCHESTRATION_LEASE_MS ?? 5 * 60_000))
const BATCH_SIZE = Math.min(25, Math.max(1, Number(process.env.ORCHESTRATION_BATCH_SIZE ?? 10)))
const MAX_BACKOFF_MINUTES = 30
let dispatching = false
let workerTimer: NodeJS.Timeout | null = null
let workerStarted = false
let workerStopping = false

class RuntimeError extends Error {
  constructor(message: string, public readonly code = 'ORCHESTRATION_RUNTIME_ERROR') {
    super(message)
  }
}

function object(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function parseAction(value: Prisma.JsonValue): OrchestrationAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, Prisma.JsonValue>
  const id = candidate.id
  const kind = candidate.kind
  const title = candidate.title
  const input = candidate.input
  if (typeof id !== 'string' || typeof kind !== 'string' || !ORCHESTRATION_ACTION_KINDS.includes(kind as OrchestrationActionKind)) return null
  if (typeof title !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) return null
  const rawReferences = candidate.references
  const references = rawReferences && typeof rawReferences === 'object' && !Array.isArray(rawReferences)
    ? rawReferences as Record<string, unknown>
    : {}
  const estimatedCostCents = candidate.estimatedCostCents
  const requiresApproval = candidate.requiresApproval
  return {
    id,
    kind: kind as OrchestrationActionKind,
    title,
    input: input as Record<string, unknown>,
    references,
    estimatedCostCents: typeof estimatedCostCents === 'number' && Number.isFinite(estimatedCostCents) && estimatedCostCents >= 0 ? estimatedCostCents : 0,
    requiresApproval: requiresApproval === true,
  }
}

function actions(value: Prisma.JsonValue | null | undefined): OrchestrationAction[] {
  if (!Array.isArray(value)) return []
  const parsed: OrchestrationAction[] = []
  for (const item of value) {
    const action = parseAction(item)
    if (action) parsed.push(action)
  }
  return parsed
}

function isTerminal(status: string): boolean {
  return ['succeeded', 'skipped', 'blocked', 'compensated', 'rollback_blocked', 'rollback_failed'].includes(status)
}

export function isOutcomeUnknownCode(code: string | null | undefined): boolean {
  return code === 'OUTCOME_UNKNOWN' || code?.endsWith('_OUTCOME_UNKNOWN') === true
}

async function claimEvent(eventId: string) {
  const now = new Date()
  const claimed = await prisma.outboxEvent.updateMany({
    where: {
      id: eventId,
      OR: [
        { status: 'pending', availableAt: { lte: now } },
        { status: 'processing', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
      ],
    },
    data: { status: 'processing', attempts: { increment: 1 }, lockedAt: now, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), workerId: `orchestration-${process.pid}` },
  })
  return claimed.count ? prisma.outboxEvent.findUnique({ where: { id: eventId } }) : null
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.outboxEvent.updateMany({
    where: { id: eventId, status: 'processing', workerId: `orchestration-${process.pid}` },
    data: { status: 'processed', processedAt: new Date(), lockedAt: null, leaseExpiresAt: null, workerId: null, lastError: null, lastErrorCode: null },
  })
}

async function releaseForRetry(event: { id: string; attempts: number }, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Error desconocido del runtime'
  if (event.attempts >= MAX_ATTEMPTS) {
    await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'processing', workerId: `orchestration-${process.pid}` },
      data: { status: 'dead_letter', lastError: message, lastErrorCode: 'MAX_ATTEMPTS_EXCEEDED', lockedAt: null, leaseExpiresAt: null, workerId: null },
    })
    return
  }
  const delayMinutes = Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(0, event.attempts - 1))
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: 'processing', workerId: `orchestration-${process.pid}` },
    data: { status: 'pending', availableAt: new Date(Date.now() + delayMinutes * 60_000), lastError: message, lastErrorCode: 'ORCHESTRATION_RETRY', lockedAt: null, leaseExpiresAt: null, workerId: null },
  })
}

async function claimStep(runId: string, orgId: string, action: OrchestrationAction, options: { retryUncertain?: boolean } = {}) {
  return prisma.$transaction(async tx => {
    const existing = await tx.automationStepRun.findUnique({ where: { runId_stepKey: { runId, stepKey: action.id } } })
    if (existing) {
      if (existing.status === 'blocked' && options.retryUncertain === true && isOutcomeUnknownCode(existing.errorCode)) {
        return tx.automationStepRun.update({ where: { id: existing.id }, data: { status: 'running', attempt: { increment: 1 }, startedAt: new Date(), finishedAt: null, errorCode: null, errorDetail: null } })
      }
      if (isTerminal(existing.status)) return existing
      if (actionHasExternalEffect(action.kind)) {
        return tx.automationStepRun.update({
          where: { id: existing.id },
          data: { status: 'blocked', errorCode: 'OUTCOME_UNKNOWN', errorDetail: 'El proceso se interrumpió después de iniciar un efecto externo; no se repite automáticamente.', finishedAt: new Date() },
        })
      }
      return tx.automationStepRun.update({ where: { id: existing.id }, data: { status: 'running', attempt: { increment: 1 }, startedAt: new Date(), finishedAt: null, errorCode: null, errorDetail: null } })
    }
    return tx.automationStepRun.create({
      data: { orgId, runId, stepKey: action.id, attempt: 1, type: action.kind, status: 'running', input: inputJson(action.input), idempotencyKey: `orchestration-${runId}-${action.id}`, startedAt: new Date() },
    })
  })
}

async function executeEvent(event: NonNullable<Awaited<ReturnType<typeof prisma.outboxEvent.findUnique>>>) {
  const payload = object(event.payload)
  const planId = String(payload.planId ?? event.aggregateId)
  const automationId = String(payload.automationId ?? '')
  const runId = String(payload.runId ?? '')
  const mode = payload.mode === 'rollback' ? 'rollback' : 'execute'
  const explicitRetry = payload.explicitRetry === true
  const experiment = await prisma.revenueExperiment.findFirst({ where: { id: planId, orgId: event.orgId, surface: 'orchestration' } })
  if (!experiment) throw new RuntimeError('La propuesta persistente no existe', 'PLAN_NOT_FOUND')
  const approval = await prisma.operationalMemoryProposal.findFirst({ where: { orgId: event.orgId, targetType: 'orchestration_plan', targetId: planId, status: 'approved' }, orderBy: { createdAt: 'desc' } })
  if (!approval) {
    await prisma.revenueExperiment.updateMany({ where: { id: planId, orgId: event.orgId }, data: { status: 'paused' } })
    throw new RuntimeError('Ejecución bloqueada: falta aprobación persistente', 'APPROVAL_REQUIRED')
  }
  const approver = approval.reviewedById
    ? await prisma.user.findFirst({ where: { id: approval.reviewedById, orgId: event.orgId }, select: { id: true, role: true } })
    : null
  if (!approver) throw new RuntimeError('La aprobación no tiene un aprobador válido en la organización', 'APPROVER_NOT_FOUND')
  const automation = await prisma.automation.findFirst({ where: { id: automationId, orgId: event.orgId, isActive: false } })
  const run = await prisma.automationRun.findFirst({ where: { id: runId, orgId: event.orgId, automationId } })
  if (!automation || !run) throw new RuntimeError('Ledger de ejecución incompleto', 'RUNTIME_LEDGER_MISSING')
  const actionList = actions(automation.actions)
  if (mode === 'rollback') return rollbackEvent(event, experiment, run, actionList, approver.id, approver.role)

  await prisma.automationRun.updateMany({ where: { id: run.id, orgId: event.orgId }, data: { status: 'running', startedAt: new Date(), error: null, errorCode: null } })
  await prisma.revenueExperiment.updateMany({ where: { id: planId, orgId: event.orgId }, data: { status: 'running' } })

  let blockedCount = 0
  let failedCount = 0
  const completed: Array<{ action: OrchestrationAction; output: Record<string, unknown> | null }> = []
  for (const action of actionList) {
    const step = await claimStep(run.id, event.orgId, action, { retryUncertain: explicitRetry })
    if (isTerminal(step.status)) {
      if (step.status === 'blocked') blockedCount++
      if (step.status === 'succeeded') completed.push({ action, output: object(step.output) })
      if (step.status === 'compensated') continue
      if (step.status === 'blocked') break
      continue
    }

    const context: AdapterContext = {
      orgId: event.orgId,
      actorUserId: approver.id,
      actorRole: approver.role,
      planId,
      planBudgetCents: experiment.budgetCents ?? 0,
      idempotencyKey: String(payload.idempotencyKey ?? event.id),
      action,
    }
    const result = await executeOrchestrationAction(context)
    const persistedStatus = result.status === 'failed' && actionHasExternalEffect(action.kind) ? 'blocked' : result.status
    const persistedCode = result.status === 'failed' && actionHasExternalEffect(action.kind) ? 'OUTCOME_UNKNOWN' : result.code
    await prisma.automationStepRun.update({ where: { id: step.id }, data: { status: persistedStatus, output: result.output ? inputJson(result.output) : undefined, errorCode: persistedCode ?? null, errorDetail: result.message ?? null, finishedAt: new Date() } })
    if (result.status === 'succeeded') completed.push({ action, output: result.output ?? null })
    if (persistedStatus === 'blocked') { blockedCount++; break }
    if (result.status === 'failed') {
      // Las acciones locales son reintentables porque no tienen efecto remoto
      // ambiguo. El outbox conserva el lease/backoff; al alcanzar el máximo
      // se compensa lo ya completado.
      if (!actionHasExternalEffect(action.kind) && step.attempt < MAX_ATTEMPTS) {
        throw new RuntimeError(result.message || 'Acción local reintentable', 'ACTION_RETRYABLE')
      }
      failedCount++
      break
    }
  }

  if (failedCount) {
    const compensation = await compensateCompleted(event, experiment, run.id, completed, approver.id, approver.role)
    await prisma.automationRun.update({ where: { id: run.id }, data: { status: 'failed', errorCode: 'ACTION_FAILED', error: `Fallo de acción; compensación: ${compensation.status}`, output: inputJson({ failedCount, compensation }), finishedAt: new Date() } })
    await prisma.revenueExperiment.updateMany({ where: { id: planId, orgId: event.orgId }, data: { status: 'failed' } })
    return
  }

  const finalStatus = blockedCount ? 'paused' : 'completed'
  await prisma.$transaction([
    prisma.automationRun.update({ where: { id: run.id }, data: { status: 'succeeded', output: inputJson({ actionsTotal: actionList.length, blockedCount, failedCount, executionStatus: finalStatus }), finishedAt: new Date() } }),
    prisma.automation.update({ where: { id: automation.id }, data: { runsCount: { increment: 1 }, lastRunAt: new Date() } }),
    prisma.revenueExperiment.update({ where: { id: planId }, data: { status: finalStatus === 'completed' ? 'executed' : finalStatus } }),
    prisma.auditLog.create({ data: { orgId: event.orgId, actorUserId: approval.reviewedById, actorType: 'system', action: 'orchestration.plan.executed', entityType: 'RevenueExperiment', entityId: planId, after: inputJson({ status: finalStatus, blockedCount, actionCount: actionList.length }), correlationId: event.correlationId } }),
  ])
}

async function compensateCompleted(event: NonNullable<Awaited<ReturnType<typeof prisma.outboxEvent.findUnique>>>, experiment: { id: string; budgetCents: number | null }, runId: string, completed: Array<{ action: OrchestrationAction; output: Record<string, unknown> | null }>, actorUserId: string, actorRole: string) {
  const results: Array<Record<string, unknown>> = []
  for (const item of [...completed].reverse()) {
    const context: AdapterContext = { orgId: event.orgId, actorUserId, actorRole, planId: experiment.id, planBudgetCents: experiment.budgetCents ?? 0, idempotencyKey: `${event.id}:compensate:${item.action.id}`, action: item.action }
    const result = await compensateOrchestrationAction(context, item.output)
    await prisma.automationStepRun.updateMany({ where: { orgId: event.orgId, runId, stepKey: item.action.id }, data: { status: result.status === 'succeeded' ? 'compensated' : 'rollback_blocked', errorCode: result.code ?? null, errorDetail: result.message ?? null, output: result.output ? inputJson(result.output) : undefined, finishedAt: new Date() } })
    results.push({ actionId: item.action.id, status: result.status, code: result.code, message: result.message })
  }
  return { status: results.every(result => result.status === 'succeeded') ? 'completed' : 'partial', results }
}

async function rollbackEvent(event: NonNullable<Awaited<ReturnType<typeof prisma.outboxEvent.findUnique>>>, experiment: { id: string; budgetCents: number | null }, run: { id: string; automationId: string }, actionList: OrchestrationAction[], actorUserId: string, actorRole: string) {
  const steps = await prisma.automationStepRun.findMany({ where: { orgId: event.orgId, runId: run.id, status: 'succeeded' }, orderBy: { createdAt: 'desc' } })
  const completed = steps.map(step => ({ action: actionList.find(action => action.id === step.stepKey), output: object(step.output) })).filter((item): item is { action: OrchestrationAction; output: Record<string, unknown> } => Boolean(item.action))
  const compensation = await compensateCompleted(event, experiment, run.id, completed, actorUserId, actorRole)
  await prisma.$transaction([
    prisma.automationRun.update({ where: { id: run.id }, data: { status: 'succeeded', output: inputJson({ rollback: compensation }), finishedAt: new Date() } }),
    prisma.revenueExperiment.update({ where: { id: experiment.id }, data: { status: 'paused' } }),
    prisma.auditLog.create({ data: { orgId: event.orgId, actorUserId, actorType: 'system', action: 'orchestration.plan.rollback', entityType: 'RevenueExperiment', entityId: experiment.id, after: inputJson(compensation), correlationId: event.correlationId } }),
  ])
}

/**
 * Worker exclusivo del orquestador. El outbox general no conoce estos topics;
 * por eso se inicia una sola vez desde worker.ts. Los claims/leases permiten
 * ejecutar más de un proceso de worker sin duplicar pasos.
 */
export function startOrchestrationWorker(): () => void {
  if (workerStarted || process.env.ORCHESTRATION_WORKER_ENABLED === 'false') return () => undefined
  workerStarted = true
  const intervalMs = Math.max(1_000, Number(process.env.ORCHESTRATION_WORKER_INTERVAL_MS ?? 5_000))
  const tick = () => {
    if (workerStopping) return
    void dispatchOrchestrationJobs().catch(error => console.error('[OrchestrationWorker] tick falló:', error))
  }
  tick()
  workerTimer = setInterval(tick, intervalMs)
  workerTimer.unref()
  const stop = () => {
    if (workerStopping) return
    workerStopping = true
    if (workerTimer) clearInterval(workerTimer)
    workerTimer = null
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return stop
}

export async function dispatchOrchestrationJobs(): Promise<{ processed: number; retried: number; deadLetter: number }> {
  if (dispatching) return { processed: 0, retried: 0, deadLetter: 0 }
  dispatching = true
  let processed = 0
  let retried = 0
  let deadLetter = 0
  try {
    const candidates = await prisma.outboxEvent.findMany({ where: { topic: { in: ['orchestration.execute', 'orchestration.rollback'] }, OR: [{ status: 'pending', availableAt: { lte: new Date() } }, { status: 'processing', leaseExpiresAt: { lte: new Date() } }] }, orderBy: { createdAt: 'asc' }, take: BATCH_SIZE, select: { id: true } })
    for (const candidate of candidates) {
      const event = await claimEvent(candidate.id)
      if (!event) continue
      try {
        await executeEvent(event)
        await markProcessed(event.id)
        processed++
      } catch (error) {
        await releaseForRetry(event, error)
        if (event.attempts >= MAX_ATTEMPTS) deadLetter++
        else retried++
      }
    }
  } finally {
    dispatching = false
  }
  return { processed, retried, deadLetter }
}
