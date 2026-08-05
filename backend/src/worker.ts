// The dedicated worker should run with workers enabled by default, while
// still allowing the shared BullMQ workers to be disabled explicitly.
if (process.env.BACKGROUND_WORKERS_ENABLED === undefined) process.env.BACKGROUND_WORKERS_ENABLED = 'true'

import { startWorkerHeartbeat } from './observability/workerHeartbeat'
import { logOperational, safeOperationalError } from './observability/operationalLog'

let stopWorkerHeartbeat: (() => void) | null = null
let stopping = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return
  stopping = true
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

  await Promise.all([
    import('./jobs/automationRunner'),
    import('./jobs/leadCallDispatch'),
    import('./jobs/adReviewPoll'),
    import('./jobs/adInsightsSync'),
    import('./jobs/outboxDispatcher'),
    import('./jobs/temporalEventScheduler'),
    import('./jobs/importJobRunner'),
    import('./jobs/campaignSendRunner'),
    import('./jobs/salesSequenceRunner'),
    import('./jobs/seoAuditRefresh'),
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
