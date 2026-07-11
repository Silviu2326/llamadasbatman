import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
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

let adReviewPollQueue: Queue<AdReviewPollJob> | null = null
let adReviewPollWorker: Worker<AdReviewPollJob> | null = null

try {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  connection.on('error', (err) => console.warn('[AdReviewPoll] Redis error (non-fatal):', err.message))

  adReviewPollQueue = new Queue<AdReviewPollJob>(QUEUE_NAME, { connection: connection as any })
  adReviewPollQueue.on('error', (err) => console.warn('[AdReviewPoll] Queue error (non-fatal):', err.message))

  const worker = new Worker<AdReviewPollJob>(
    QUEUE_NAME,
    async (job: Job<AdReviewPollJob>) => {
      const { orgId, campaignId, attempt = 0 } = job.data
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
      if (!campaign?.metaAdId) {
        console.warn(`[AdReviewPoll] campaign ${campaignId} sin metaAdId, se descarta`)
        return
      }

      const token = await getDecryptedToken(orgId)
      if (!token) {
        console.warn(`[AdReviewPoll] sin token para org ${orgId}, se descarta`)
        return
      }

      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${campaign.metaAdId}?fields=effective_status&access_token=${token}`
      )
      if (!res.ok) {
        console.warn(`[AdReviewPoll] Graph API error ${res.status} para ${campaign.metaAdId}`)
        return
      }
      const data = (await res.json()) as { effective_status?: string }
      const status = data.effective_status ?? 'PENDING_REVIEW'
      const adStatus = status === 'ACTIVE' ? 'active' : status === 'DISAPPROVED' ? 'disapproved' : 'pending_review'

      await prisma.campaign.update({ where: { id: campaignId }, data: { adStatus } })
      console.log(`[AdReviewPoll] campaign ${campaignId} → ${adStatus} (intento ${attempt})`)

      if (adStatus === 'pending_review' && attempt < MAX_ATTEMPTS && adReviewPollQueue) {
        await adReviewPollQueue.add('poll', { orgId, campaignId, attempt: attempt + 1 }, { delay: POLL_DELAY_MS })
      }
    },
    { connection: connection as any, concurrency: 5 }
  )

  worker.on('completed', (job) => console.log(`[AdReviewPoll] job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[AdReviewPoll] job ${job?.id} failed:`, err))
  worker.on('error', (err) => console.warn('[AdReviewPoll] Worker error (non-fatal):', err.message))

  adReviewPollWorker = worker
} catch (err) {
  console.warn('[AdReviewPoll] Disabled (Redis unavailable):', (err as Error).message)
}

export async function enqueueAdReviewPoll(orgId: string, campaignId: string): Promise<boolean> {
  if (!adReviewPollQueue) {
    console.warn(`[AdReviewPoll] cola no disponible, campaign ${campaignId} no fue encolada`)
    return false
  }
  await adReviewPollQueue.add('poll', { orgId, campaignId, attempt: 0 }, { delay: POLL_DELAY_MS })
  return true
}

export { adReviewPollWorker }
