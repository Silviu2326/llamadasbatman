import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
import { fetchAndStoreInsights } from '../services/metaInsights.service'
import { evaluateCampaign } from '../services/adOptimizer.service'

const QUEUE_NAME = 'ad-insights-sync'
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000 // cada 2hs, ver META_ADS_TECHNICAL_SPEC.md
const REPEATABLE_JOB_ID = 'ad-insights-sync-tick'

let adInsightsSyncQueue: Queue | null = null
let adInsightsSyncWorker: Worker | null = null

try {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  connection.on('error', (err) => console.warn('[AdInsightsSync] Redis error (non-fatal):', err.message))

  adInsightsSyncQueue = new Queue(QUEUE_NAME, { connection: connection as any })
  adInsightsSyncQueue.on('error', (err) => console.warn('[AdInsightsSync] Queue error (non-fatal):', err.message))

  // jobId fijo: si el módulo se carga en más de un proceso (API + worker),
  // BullMQ no duplica el repeatable job.
  adInsightsSyncQueue
    .add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    .catch((err) => console.warn('[AdInsightsSync] no se pudo programar el repeatable job:', err.message))

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const campaigns = await prisma.campaign.findMany({
        where: { status: 'active', metaAdSetId: { not: null } },
        select: { id: true, orgId: true },
      })
      console.log(`[AdInsightsSync] sincronizando ${campaigns.length} campañas activas`)
      for (const c of campaigns) {
        try {
          await fetchAndStoreInsights(c.orgId, c.id)
          await evaluateCampaign(c.orgId, c.id)
        } catch (err) {
          console.error(`[AdInsightsSync] error en campaign ${c.id}:`, err)
        }
      }
    },
    { connection: connection as any, concurrency: 1 }
  )

  worker.on('completed', (job) => console.log(`[AdInsightsSync] job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[AdInsightsSync] job ${job?.id} failed:`, err))
  worker.on('error', (err) => console.warn('[AdInsightsSync] Worker error (non-fatal):', err.message))

  adInsightsSyncWorker = worker
} catch (err) {
  console.warn('[AdInsightsSync] Disabled (Redis unavailable):', (err as Error).message)
}

export { adInsightsSyncQueue, adInsightsSyncWorker }
