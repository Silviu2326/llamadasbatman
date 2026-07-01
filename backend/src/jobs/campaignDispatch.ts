import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '../lib/prisma'

interface CampaignDispatchJob {
  orgId: string
  campaignId: string
}

let campaignDispatchWorker: Worker | null = null

try {
  const workerRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

  const worker = new Worker<CampaignDispatchJob>(
    'campaign-dispatch',
    async (job: Job<CampaignDispatchJob>) => {
      const { orgId, campaignId } = job.data

      console.log(`[CampaignDispatch] processing job ${job.id} for campaign ${campaignId}`)

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, orgId },
        include: {
          agent: true,
          leads: { where: { status: 'new' } },
        },
      })

      if (!campaign) {
        console.error(`[CampaignDispatch] Campaign ${campaignId} not found`)
        return
      }

      if (campaign.status !== 'active') {
        console.log(`[CampaignDispatch] Campaign ${campaignId} is not active, skipping`)
        return
      }

      const voiceUrl = process.env.VOICE_SERVICE_URL ?? 'http://localhost:4000'

      try {
        const res = await fetch(`${voiceUrl}/campaigns/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-voice-service-secret': process.env.VOICE_SERVICE_SECRET ?? '',
          },
          body: JSON.stringify({
            campaignId,
            orgId,
            agent: campaign.agent,
            leads: campaign.leads.map((l) => ({
              id: l.id,
              name: l.name,
              phone: l.phone,
            })),
          }),
        })

        if (!res.ok) {
          const text = await res.text()
          console.error(`[CampaignDispatch] Voice service error: ${res.status} ${text}`)
        } else {
          console.log(`[CampaignDispatch] Campaign ${campaignId} dispatched successfully`)
        }
      } catch (err) {
        console.error(`[CampaignDispatch] Failed to call voice service:`, err)
        throw err
      }
    },
    {
      connection: workerRedis as any,
      concurrency: 5,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[CampaignDispatch] job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[CampaignDispatch] job ${job?.id} failed:`, err)
  })

  campaignDispatchWorker = worker
} catch (err) {
  console.warn('[CampaignDispatch] Worker disabled (Redis unavailable):', (err as Error).message)
}

export { campaignDispatchWorker }
