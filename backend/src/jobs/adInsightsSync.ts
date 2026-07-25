import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { fetchAndStoreInsights } from '../services/metaInsights.service'
import { evaluateCampaign } from '../services/adOptimizer.service'

const QUEUE_NAME = 'ad-insights-sync'
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'ad-insights-sync-tick'
const reportInsightsError = reportQueueError('AdInsightsSync')

let adInsightsSyncQueue: Queue | null = null
let adInsightsSyncWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('AdInsightsSync')
  if (!connection) return

  try {
    adInsightsSyncQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    adInsightsSyncQueue.on('error', reportInsightsError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await adInsightsSyncQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportInsightsError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const campaigns = await prisma.campaign.findMany({
          where: { status: 'active', metaAdSetId: { not: null } },
          select: { id: true, orgId: true },
        })
        for (const campaign of campaigns) {
          try {
            await fetchAndStoreInsights(campaign.orgId, campaign.id)
            await evaluateCampaign(campaign.orgId, campaign.id)
          } catch (error) {
            console.error(`[AdInsightsSync] error en campaign ${campaign.id}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('completed', (job) => console.log(`[AdInsightsSync] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[AdInsightsSync] job ${job?.id} failed:`, error))
    worker.on('error', reportInsightsError)
    adInsightsSyncWorker = worker
  } catch (error) {
    reportInsightsError(error as Error)
    connection.disconnect()
  }
})()

export { adInsightsSyncQueue, adInsightsSyncWorker }
