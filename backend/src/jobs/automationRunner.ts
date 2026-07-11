import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { runAutomationsForEvent } from '../services/automations.service'

interface AutomationRunnerJob {
  orgId: string
  event: string
  payload: Record<string, unknown>
}

let automationRunnerWorker: Worker | null = null

try {
  const workerRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  workerRedis.on('error', (err) => console.warn('[AutomationRunner] Redis error (non-fatal):', err.message))

  const worker = new Worker<AutomationRunnerJob>(
    'automation-runner',
    async (job: Job<AutomationRunnerJob>) => {
      const { orgId, event, payload } = job.data

      console.log(`[AutomationRunner] job ${job.id} — event=${event} orgId=${orgId}`)

      try {
        const result = await runAutomationsForEvent(orgId, event, payload)
        console.log(`[AutomationRunner] triggered ${result.triggered} automations`)
      } catch (err) {
        console.error(`[AutomationRunner] error running automations:`, err)
        throw err
      }
    },
    {
      connection: workerRedis as any,
      concurrency: 10,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[AutomationRunner] job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[AutomationRunner] job ${job?.id} failed:`, err)
  })

  worker.on('error', (err) => {
    console.warn('[AutomationRunner] Worker error (non-fatal):', err.message)
  })

  automationRunnerWorker = worker
} catch (err) {
  console.warn('[AutomationRunner] Worker disabled (Redis unavailable):', (err as Error).message)
}

export { automationRunnerWorker }
