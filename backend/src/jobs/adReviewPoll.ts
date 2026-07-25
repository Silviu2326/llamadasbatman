import { Job, Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { getDecryptedToken } from '../services/metaAdAccount.service'

export interface AdReviewPollJob {
  orgId: string
  campaignId: string
  attempt?: number
}

const QUEUE_NAME = 'ad-review-poll'
const MAX_ATTEMPTS = 20
const POLL_DELAY_MS = 60_000
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const reportAdReviewError = reportQueueError('AdReviewPoll')

let adReviewPollQueue: Queue<AdReviewPollJob> | null = null
let adReviewPollWorker: Worker<AdReviewPollJob> | null = null

void (async () => {
  const connection = await connectOptionalRedis('AdReviewPoll')
  if (!connection) return

  try {
    adReviewPollQueue = new Queue<AdReviewPollJob>(QUEUE_NAME, { connection: connection as any })
    adReviewPollQueue.on('error', reportAdReviewError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    const worker = new Worker<AdReviewPollJob>(
      QUEUE_NAME,
      async (job: Job<AdReviewPollJob>) => {
        const { orgId, campaignId, attempt = 0 } = job.data
        const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
        if (!campaign?.metaAdId) return

        const token = await getDecryptedToken(orgId)
        if (!token) return

        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${campaign.metaAdId}?fields=effective_status&access_token=${token}`
        )
        if (!res.ok) return

        const data = (await res.json()) as { effective_status?: string }
        const status = data.effective_status ?? 'PENDING_REVIEW'
        const adStatus = status === 'ACTIVE' ? 'active' : status === 'DISAPPROVED' ? 'disapproved' : 'pending_review'

        await prisma.campaign.update({ where: { id: campaignId }, data: { adStatus } })
        console.log(`[AdReviewPoll] campaign ${campaignId} → ${adStatus} (intento ${attempt})`)

        if (adStatus === 'pending_review' && attempt < MAX_ATTEMPTS && adReviewPollQueue) {
          try {
            await adReviewPollQueue.add('poll', { orgId, campaignId, attempt: attempt + 1 }, { delay: POLL_DELAY_MS })
          } catch (error) {
            reportAdReviewError(error as Error)
          }
        }
      },
      { connection: connection as any, concurrency: 5 }
    )

    worker.on('completed', (job) => console.log(`[AdReviewPoll] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[AdReviewPoll] job ${job?.id} failed:`, error))
    worker.on('error', reportAdReviewError)
    adReviewPollWorker = worker
  } catch (error) {
    reportAdReviewError(error as Error)
    connection.disconnect()
  }
})()

export async function enqueueAdReviewPoll(orgId: string, campaignId: string): Promise<boolean> {
  if (!adReviewPollQueue) return false
  try {
    await adReviewPollQueue.add('poll', { orgId, campaignId, attempt: 0 }, { delay: POLL_DELAY_MS })
    return true
  } catch (error) {
    reportAdReviewError(error as Error)
    return false
  }
}

export { adReviewPollWorker }
