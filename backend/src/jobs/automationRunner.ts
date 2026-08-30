import { Job, Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { enqueueDatabaseJob, startDatabaseQueueWorker, type DatabaseQueuePayload } from '../lib/databaseQueue'
import { isPostgresQueueBackend } from '../lib/queueBackend'
import { normalizeAutomationEvent, runAutomationsForEvent } from '../services/automations.service'

interface AutomationRunnerJob {
  orgId: string
  event: string
  payload: Record<string, unknown>
}

let automationRunnerWorker: Worker | null = null
let automationRunnerQueue: Queue<AutomationRunnerJob> | null = null
let stopDatabaseWorker: (() => void) | null = null
const QUEUE_NAME = 'automation-runner'
const reportAutomationError = reportQueueError('AutomationRunner')

async function processAutomationJob({ orgId, event, payload }: AutomationRunnerJob): Promise<void> {
  const result = await runAutomationsForEvent(orgId, normalizeAutomationEvent(event) ?? event, payload)
  console.log(`[AutomationRunner] triggered ${result.triggered} automations`)
}

void (async () => {
  if (isPostgresQueueBackend()) {
    if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
      stopDatabaseWorker = startDatabaseQueueWorker({
        queue: QUEUE_NAME,
        handler: payload => processAutomationJob(payload as unknown as AutomationRunnerJob),
        pollMs: Number(process.env.WORKER_QUEUE_POLL_MS ?? 5_000),
      })
    }
    return
  }
  const connection = await connectOptionalRedis('AutomationRunner')
  if (!connection) return

  try {
    automationRunnerQueue = new Queue<AutomationRunnerJob>(QUEUE_NAME, { connection: connection as any })
    automationRunnerQueue.on('error', reportAutomationError)
    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return
    const worker = new Worker<AutomationRunnerJob>(
      QUEUE_NAME,
      async (job: Job<AutomationRunnerJob>) => processAutomationJob(job.data),
      { connection: connection as any, concurrency: 10 }
    )

    worker.on('completed', (job) => console.log(`[AutomationRunner] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[AutomationRunner] job ${job?.id} failed:`, error))
    worker.on('error', reportAutomationError)
    automationRunnerWorker = worker
  } catch (error) {
    reportAutomationError(error as Error)
    connection.disconnect()
  }
})()

export async function enqueueAutomationEvent(
  orgId: string,
  event: string,
  payload: Record<string, unknown> = {},
  jobId?: string
): Promise<boolean> {
  const canonicalEvent = normalizeAutomationEvent(event)
  if (!canonicalEvent) return false
  const id = jobId ?? String(payload.eventId ?? payload.id ?? `${orgId}:${canonicalEvent}:${JSON.stringify(payload)}`)
  if (isPostgresQueueBackend()) {
    return enqueueDatabaseJob({
      queue: QUEUE_NAME,
      kind: 'automation-event',
      payload: { orgId, event: canonicalEvent, payload: payload as unknown as DatabaseQueuePayload },
      dedupeKey: id,
    })
  }
  if (!automationRunnerQueue) return false
  try {
    await automationRunnerQueue.add('automation-event', { orgId, event: canonicalEvent, payload }, {
      jobId: id, removeOnComplete: 1000, removeOnFail: 1000,
    })
    return true
  } catch (error) {
    reportAutomationError(error as Error)
    return false
  }
}

export { automationRunnerQueue, automationRunnerWorker }
