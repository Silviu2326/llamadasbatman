import { Job, Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { normalizeAutomationEvent, runAutomationsForEvent } from '../services/automations.service'

interface AutomationRunnerJob {
  orgId: string
  event: string
  payload: Record<string, unknown>
}

let automationRunnerWorker: Worker | null = null
let automationRunnerQueue: Queue<AutomationRunnerJob> | null = null
const QUEUE_NAME = 'automation-runner'
const reportAutomationError = reportQueueError('AutomationRunner')

void (async () => {
  const connection = await connectOptionalRedis('AutomationRunner')
  if (!connection) return

  try {
    automationRunnerQueue = new Queue<AutomationRunnerJob>(QUEUE_NAME, { connection: connection as any })
    automationRunnerQueue.on('error', reportAutomationError)
    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return
    const worker = new Worker<AutomationRunnerJob>(
      QUEUE_NAME,
      async (job: Job<AutomationRunnerJob>) => {
        const { orgId, event, payload } = job.data
        const result = await runAutomationsForEvent(orgId, normalizeAutomationEvent(event) ?? event, payload)
        console.log(`[AutomationRunner] triggered ${result.triggered} automations`)
      },
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
  if (!automationRunnerQueue) return false
  const canonicalEvent = normalizeAutomationEvent(event)
  if (!canonicalEvent) return false
  try {
    const id = jobId ?? String(payload.eventId ?? payload.id ?? `${orgId}:${canonicalEvent}:${JSON.stringify(payload)}`)
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
