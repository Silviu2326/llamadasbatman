// The dedicated worker should run with workers enabled by default, while
// still allowing the shared BullMQ workers to be disabled explicitly.
if (process.env.BACKGROUND_WORKERS_ENABLED === undefined) process.env.BACKGROUND_WORKERS_ENABLED = 'true'

import { startWorkerHeartbeat } from './observability/workerHeartbeat'
import { logOperational, safeOperationalError } from './observability/operationalLog'

let stopWorkerHeartbeat: (() => void) | null = null
let stopping = false
// PostgreSQL-backed jobs use unref'ed polling timers so they never keep the
// API process alive accidentally. The dedicated worker is a long-lived
// process by definition, so it needs one explicit keep-alive handle.
const workerKeepAlive = setInterval(() => undefined, 60_000)

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return
  stopping = true
  clearInterval(workerKeepAlive)
  stopWorkerHeartbeat?.()
  stopWorkerHeartbeat = null
  logOperational('info', 'worker.shutdown', { worker: 'dedicated-worker', status: signal })
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })

async function startWorkers(): Promise<void> {
  const { startOrchestrationWorker } = await import('./services/orchestration.runtime')
  startOrchestrationWorker()
  logOperational('info', 'worker.component.started', { worker: 'orchestration' })

  // Plataforma abierta: adapters y ejecutores deben estar registrados ANTES
  // de que el jobDispatcher reclame filas, o los kinds quedarían sin ejecutor.
  const { ensureProvidersRegistered } = await import('./providers')
  ensureProvidersRegistered()
  logOperational('info', 'worker.component.started', { worker: 'providers' })

  // Polling de respaldo de trabajos asíncronos en Magnific: el webhook es el
  // camino normal; esto rescata los que se pierden.
  const { pollPendingMagnificJobs, pollPendingRunwayJobs } = await import('./routes/providerWebhooks')
  const magnificPollTimer = setInterval(() => {
    pollPendingMagnificJobs().catch((error: unknown) => {
      logOperational('error', 'worker.magnific.poll_failed', {
        worker: 'providers',
        errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN',
      })
    })
  }, 5 * 60_000)
  magnificPollTimer.unref()
  const runwayPollTimer = setInterval(() => {
    pollPendingRunwayJobs().catch((error: unknown) => {
      logOperational('error', 'worker.runway.poll_failed', {
        worker: 'providers',
        errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN',
      })
    })
  }, Math.max(10_000, Number(process.env.RUNWAY_POLL_INTERVAL_MS ?? 30_000)))
  runwayPollTimer.unref()

  await Promise.all([
    import('./jobs/automationRunner'),
    import('./jobs/leadCallDispatch'),
    import('./jobs/adReviewPoll'),
    import('./jobs/adInsightsSync'),
    import('./jobs/outboxDispatcher'),
    import('./jobs/temporalEventScheduler'),
    import('./jobs/importJobRunner'),
    import('./jobs/leadEnrichment'),
    import('./jobs/campaignSendRunner'),
    import('./jobs/salesSequenceRunner'),
    import('./jobs/seoAuditRefresh'),
    import('./jobs/landingPerformanceRollup'),
    import('./jobs/landingHealthCheck'),
    import('./jobs/landingAutonomyPass'),
    import('./jobs/organicAutonomyPass'),
    import('./jobs/contentWeeklyRefresh'),
    import('./jobs/whiteLabelTraining'),
    import('./jobs/jobDispatcher'),
    import('./jobs/flowRunner'),
  ])

  // The heartbeat starts after all worker modules have loaded. A partially
  // initialized process must not be advertised as ready for background work.
  stopWorkerHeartbeat = await startWorkerHeartbeat()
  if (stopWorkerHeartbeat) logOperational('info', 'worker.heartbeat.started', { worker: 'dedicated-worker' })
  else logOperational('error', 'worker.heartbeat.unavailable', {
    worker: 'dedicated-worker',
    errorCode: 'REDIS_NOT_READY',
    remediation: 'Definir REDIS_URL y comprobar que el worker pueda conectarse.',
  })
  logOperational('info', 'worker.started', { worker: 'dedicated-worker', status: 'ready' })
}

startWorkers().catch((error) => {
  stopWorkerHeartbeat?.()
  stopWorkerHeartbeat = null
  const classified = safeOperationalError(error)
  logOperational('error', 'worker.start.failed', {
    worker: 'dedicated-worker',
    errorCode: classified.code,
    remediation: classified.remediation,
  })
  process.exitCode = 1
})
