import { prisma } from '../lib/prisma'
import { checkRuntimeDependencies } from './dependencyGate'
import { evaluateOperationalAlerts, readinessFromAlerts, type OperationalAlert } from './alertPolicy'
import { readWorkerHeartbeat, type WorkerHeartbeatStatus } from './workerHeartbeat'
import { setGaugeMetric, setQueueGauge } from './metrics'

type DatabaseStatus = 'healthy' | 'missing' | 'unavailable'

type QueueStats = {
  pending: number | null
  processing: number | null
  failed: number | null
  deadLetter: number | null
  expiredLeases: number | null
  oldestPendingAgeSeconds: number | null
}

async function countSafely(query: () => Promise<number>): Promise<number | null> {
  try { return await query() } catch { return null }
}

async function oldestAgeSafely(query: () => Promise<{ createdAt?: Date; queuedAt?: Date; availableAt?: Date } | null>, now = Date.now()): Promise<number | null> {
  try {
    const row = await query()
    if (!row) return 0
    const date = row.createdAt ?? row.queuedAt ?? row.availableAt
    return date ? Math.max(0, Math.round((now - date.getTime()) / 1_000)) : null
  } catch { return null }
}

function unavailableQueue(): QueueStats {
  return { pending: null, processing: null, failed: null, deadLetter: null, expiredLeases: null, oldestPendingAgeSeconds: null }
}

async function queueStats(input: {
  pending: () => Promise<number>
  processing: () => Promise<number>
  failed: () => Promise<number>
  deadLetter: () => Promise<number>
  expiredLeases: () => Promise<number>
  oldestPending: () => Promise<{ createdAt?: Date; queuedAt?: Date; availableAt?: Date } | null>
}): Promise<QueueStats> {
  const [pending, processing, failed, deadLetter, expiredLeases, oldestPendingAgeSeconds] = await Promise.all([
    countSafely(input.pending), countSafely(input.processing), countSafely(input.failed),
    countSafely(input.deadLetter), countSafely(input.expiredLeases), oldestAgeSafely(input.oldestPending),
  ])
  return { pending, processing, failed, deadLetter, expiredLeases, oldestPendingAgeSeconds }
}

async function queueSnapshot() {
  const now = new Date()
  const staleRunBefore = new Date(now.getTime() - 10 * 60_000)
  const [outbox, webhooks, automationRuns, importJobs, emailDeliveries, sequenceSteps, scheduledTriggers] = await Promise.all([
    queueStats({
      pending: () => prisma.outboxEvent.count({ where: { status: 'pending' } }),
      processing: () => prisma.outboxEvent.count({ where: { status: 'processing' } }),
      failed: () => prisma.outboxEvent.count({ where: { status: 'pending', attempts: { gte: 1 } } }),
      deadLetter: () => prisma.outboxEvent.count({ where: { status: 'dead_letter' } }),
      expiredLeases: () => prisma.outboxEvent.count({ where: { status: 'processing', leaseExpiresAt: { lt: now } } }),
      oldestPending: () => prisma.outboxEvent.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    }),
    queueStats({
      pending: () => prisma.webhookEvent.count({ where: { status: { in: ['received', 'processing'] } } }),
      processing: () => prisma.webhookEvent.count({ where: { status: 'processing' } }),
      failed: () => prisma.webhookEvent.count({ where: { status: { in: ['failed', 'error'] } } }),
      deadLetter: () => prisma.webhookEvent.count({ where: { status: 'dead_letter' } }),
      expiredLeases: () => Promise.resolve(0),
      oldestPending: () => prisma.webhookEvent.findFirst({ where: { status: { in: ['received', 'processing'] } }, orderBy: { receivedAt: 'asc' }, select: { receivedAt: true } }).then(row => row ? { createdAt: row.receivedAt } : null),
    }),
    queueStats({
      pending: () => prisma.automationRun.count({ where: { status: 'queued' } }),
      processing: () => prisma.automationRun.count({ where: { status: 'running' } }),
      failed: () => prisma.automationRun.count({ where: { status: { in: ['failed', 'error'] } } }),
      deadLetter: () => prisma.automationRun.count({ where: { status: 'dead_letter' } }),
      expiredLeases: () => prisma.automationRun.count({ where: { status: 'running', startedAt: { lt: staleRunBefore } } }),
      oldestPending: () => prisma.automationRun.findFirst({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    }),
    queueStats({
      pending: () => prisma.importJob.count({ where: { status: 'pending' } }),
      processing: () => prisma.importJob.count({ where: { status: 'processing' } }),
      failed: () => prisma.importJob.count({ where: { status: 'failed' } }),
      deadLetter: () => Promise.resolve(0),
      expiredLeases: () => prisma.importJob.count({ where: { status: 'processing', leaseExpiresAt: { lt: now } } }),
      oldestPending: () => prisma.importJob.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    }),
    queueStats({
      pending: () => prisma.emailDelivery.count({ where: { status: 'queued' } }),
      processing: () => prisma.emailDelivery.count({ where: { status: 'processing' } }),
      failed: () => prisma.emailDelivery.count({ where: { status: { in: ['failed', 'bounced', 'unsubscribed'] } } }),
      deadLetter: () => prisma.emailDelivery.count({ where: { status: 'uncertain' } }),
      expiredLeases: () => prisma.emailDelivery.count({ where: { status: 'processing', leaseExpiresAt: { lt: now } } }),
      oldestPending: () => prisma.emailDelivery.findFirst({ where: { status: 'queued' }, orderBy: { queuedAt: 'asc' }, select: { queuedAt: true } }).then(row => row ? { queuedAt: row.queuedAt } : null),
    }),
    queueStats({
      pending: () => prisma.salesSequenceStepRun.count({ where: { status: 'pending' } }),
      processing: () => prisma.salesSequenceStepRun.count({ where: { status: 'processing' } }),
      failed: () => prisma.salesSequenceStepRun.count({ where: { status: 'failed' } }),
      deadLetter: () => prisma.salesSequenceStepRun.count({ where: { status: 'blocked' } }),
      expiredLeases: () => prisma.salesSequenceStepRun.count({ where: { status: 'processing', leaseExpiresAt: { lt: now } } }),
      oldestPending: () => prisma.salesSequenceStepRun.findFirst({ where: { status: 'pending' }, orderBy: { availableAt: 'asc' }, select: { availableAt: true } }).then(row => row ? { availableAt: row.availableAt } : null),
    }),
    {
      pending: await countSafely(() => prisma.scheduledTrigger.count({ where: { status: 'pending' } })),
      overdue: await countSafely(() => prisma.scheduledTrigger.count({ where: { status: 'pending', dueAt: { lte: now } } })),
    },
  ])

  const queryValues = [
    outbox, webhooks, automationRuns, importJobs, emailDeliveries, sequenceSteps,
    scheduledTriggers.pending, scheduledTriggers.overdue,
  ]
  const databaseQueriesAvailable = queryValues.every(value => value !== null && (!value || typeof value !== 'object' || Object.values(value).every(item => item !== null)))
  return { outbox, webhooks, automationRuns, importJobs, emailDeliveries, sequenceSteps, scheduledTriggers, databaseQueriesAvailable }
}

function publishQueueMetrics(queues: Awaited<ReturnType<typeof queueSnapshot>>) {
  for (const [queue, stats] of Object.entries(queues).filter(([, value]) => value && typeof value === 'object' && 'pending' in value) as Array<[string, QueueStats]>) {
    setQueueGauge(queue, 'pending', stats.pending)
    setQueueGauge(queue, 'processing', stats.processing)
    setQueueGauge(queue, 'failed', stats.failed)
    setQueueGauge(queue, 'dead_letter', stats.deadLetter)
    setQueueGauge(queue, 'expired_leases', stats.expiredLeases)
    setQueueGauge(queue, 'oldest_pending_age_seconds', stats.oldestPendingAgeSeconds)
  }
  setGaugeMetric('vozia_scheduler_pending', {}, queues.scheduledTriggers.pending ?? 0)
  setGaugeMetric('vozia_scheduler_overdue', {}, queues.scheduledTriggers.overdue ?? 0)
  setGaugeMetric('vozia_database_queries_available', {}, queues.databaseQueriesAvailable ? 1 : 0)
}

export type WorkerHealth = {
  status: 'ready' | 'degraded' | 'not_ready'
  checkedAt: string
  dependencies: {
    database: { status: DatabaseStatus; remediation?: string }
    redis: { status: 'configured' | 'missing' | 'disabled' | 'unavailable'; remediation?: string }
  }
  worker: { name: string; enabled: boolean; mode: 'dedicated_process'; heartbeat: WorkerHeartbeatStatus }
  queues: Awaited<ReturnType<typeof queueSnapshot>>
  alerts: string[]
  alertDetails: OperationalAlert[]
}

export async function getWorkerHealth(): Promise<WorkerHealth> {
  const gate = checkRuntimeDependencies()
  const databaseConfigured = gate.checks.find(check => check.name === 'DATABASE_URL')?.configured === true
  let database: { status: DatabaseStatus; remediation?: string }
  if (!databaseConfigured) database = { status: 'missing', remediation: 'Define DATABASE_URL antes de arrancar el backend.' }
  else {
    try { await prisma.$queryRaw`SELECT 1`; database = { status: 'healthy' } }
    catch { database = { status: 'unavailable', remediation: 'Comprueba DNS, TLS, firewall y credenciales de PostgreSQL.' } }
  }

  const redisCheck = gate.checks.find(check => check.name === 'REDIS_URL')
  const workersEnabled = process.env.BACKGROUND_WORKERS_ENABLED !== 'false'
  const heartbeat = await readWorkerHeartbeat()
  const queues = database.status === 'healthy' ? await queueSnapshot() : {
    outbox: unavailableQueue(), webhooks: unavailableQueue(), automationRuns: unavailableQueue(),
    importJobs: unavailableQueue(), emailDeliveries: unavailableQueue(), sequenceSteps: unavailableQueue(),
    scheduledTriggers: { pending: null, overdue: null }, databaseQueriesAvailable: false,
  }
  publishQueueMetrics(queues)
  const redisStatus = redisCheck?.status === 'ready' ? 'configured' : redisCheck?.status === 'disabled' ? 'disabled' : redisCheck?.status === 'missing' ? 'missing' : 'unavailable'
  const alertDetails = evaluateOperationalAlerts({
    database: database.status,
    redis: redisStatus,
    heartbeat: heartbeat.status,
    workersEnabled,
    databaseQueriesAvailable: queues.databaseQueriesAvailable,
    outbox: queues.outbox,
    webhooks: { ...queues.webhooks, received: queues.webhooks.pending },
    automationRuns: {
      queued: queues.automationRuns.pending,
      running: queues.automationRuns.processing,
      failed: queues.automationRuns.failed,
      deadLetter: queues.automationRuns.deadLetter,
    },
    importJobs: queues.importJobs,
    emailDeliveries: {
      queued: queues.emailDeliveries.pending,
      processing: queues.emailDeliveries.processing,
      failed: queues.emailDeliveries.failed,
      uncertain: queues.emailDeliveries.deadLetter,
      expiredLeases: queues.emailDeliveries.expiredLeases,
    },
    sequenceSteps: {
      pending: queues.sequenceSteps.pending,
      processing: queues.sequenceSteps.processing,
      failed: queues.sequenceSteps.failed,
      expiredLeases: queues.sequenceSteps.expiredLeases,
    },
    scheduledTriggers: queues.scheduledTriggers,
  })
  const status = readinessFromAlerts(alertDetails)
  return {
    status,
    checkedAt: new Date().toISOString(),
    dependencies: {
      database,
      redis: redisStatus === 'configured' ? { status: 'configured' } : redisStatus === 'disabled'
        ? { status: 'disabled', remediation: 'Redis desactivado explícitamente; los workers BullMQ no se ejecutan.' }
        : { status: redisStatus, remediation: redisCheck?.remediation ?? 'Comprueba REDIS_URL.' },
    },
    worker: { name: 'dedicated-worker', enabled: workersEnabled, mode: 'dedicated_process', heartbeat },
    queues,
    alerts: alertDetails.map(alert => `${alert.code}: ${alert.summary} Acción: ${alert.action}`),
    alertDetails,
  }
}

export async function getOperationalMetrics() {
  const queues = await queueSnapshot()
  publishQueueMetrics(queues)
  return { generatedAt: new Date().toISOString(), queues, database: queues.databaseQueriesAvailable ? 'healthy' : 'unavailable' as const }
}

export function emptyQueueStatsForTests(): QueueStats { return unavailableQueue() }
