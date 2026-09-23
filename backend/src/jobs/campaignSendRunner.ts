import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { sendNativeMarketingDelivery } from '../services/nativeMarketingEmail.service'
import { recordQueueEvent } from '../observability/metrics'
import { classifyOperationalError, logOperational } from '../observability/operationalLog'

const POLL_MS = Number(process.env.CAMPAIGN_SEND_POLL_MS ?? 7_000)
const BATCH_SIZE = 15
const LEASE_MS = 60_000
const WORKER_ID = process.env.CAMPAIGN_SEND_WORKER_ID?.trim() || `campaign-send-${process.pid}-${randomUUID()}`
let running = false

function dueDeliveryWhere(now: Date): Prisma.EmailDeliveryWhereInput {
  return { OR: [
    { status: 'queued', availableAt: { lte: now } },
    { status: 'processing', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
  ] }
}

async function sendQueuedDeliveries(): Promise<void> {
  const now = new Date()
  const candidates = await prisma.emailDelivery.findMany({
    where: { campaignId: { not: null }, campaign: { status: 'running' }, ...dueDeliveryWhere(now) },
    take: BATCH_SIZE * 2,
    orderBy: { queuedAt: 'asc' },
  })
  for (const delivery of candidates.slice(0, BATCH_SIZE)) {
    const claimedAt = new Date()
    const claimed = await prisma.emailDelivery.updateMany({
      where: { id: delivery.id, campaignId: { not: null }, campaign: { status: 'running' }, ...dueDeliveryWhere(claimedAt) },
      data: { status: 'processing', workerId: WORKER_ID, lockedAt: claimedAt, leaseExpiresAt: new Date(claimedAt.getTime() + LEASE_MS), providerAttemptedAt: claimedAt, attempts: { increment: 1 } },
    })
    if (!claimed.count) continue
    try {
      const outcome = await sendNativeMarketingDelivery(delivery.id, WORKER_ID)
      recordQueueEvent({ queue: 'email-delivery', outcome: outcome === 'accepted' ? 'processed' : outcome === 'retry' ? 'retry' : 'dead_letter' })
    } catch (err) {
      const classified = classifyOperationalError(err)
      recordQueueEvent({ queue: 'email-delivery', outcome: 'tick_error' })
      logOperational('error', 'email_delivery.send.failed', { queue: 'email-delivery', jobId: delivery.id, errorCode: classified.code, remediation: classified.remediation })
      // Any network ambiguity is marked uncertain by the delivery helper. This
      // catch path means no request could be made and can be retried safely.
      await prisma.emailDelivery.updateMany({
        where: { id: delivery.id, status: 'processing', workerId: WORKER_ID },
        data: { status: 'queued', availableAt: new Date(Date.now() + 30_000), failureCode: classified.code, failureDetail: classified.remediation, workerId: null, lockedAt: null, leaseExpiresAt: null },
      }).catch(() => {})
    }
  }
}

async function completeFinishedCampaigns(): Promise<void> {
  const campaigns = await prisma.marketingCampaign.findMany({ where: { status: 'running' }, select: { id: true, orgId: true } })
  for (const campaign of campaigns) {
    const rows = await prisma.emailDelivery.groupBy({ by: ['status'], where: { campaignId: campaign.id, orgId: campaign.orgId }, _count: { _all: true } })
    const count = (status: string) => rows.find(row => row.status === status)?._count._all ?? 0
    if (count('queued') + count('processing') > 0) continue
    await prisma.marketingCampaign.updateMany({ where: { id: campaign.id, orgId: campaign.orgId, status: 'running' }, data: { status: count('uncertain') > 0 ? 'error' : 'completed' } })
  }
}

async function activateScheduledCampaigns(): Promise<void> {
  const now = new Date()
  await prisma.marketingCampaign.updateMany({
    where: { status: 'scheduled', scheduledStartAt: { lte: now }, OR: [{ scheduledEndAt: null }, { scheduledEndAt: { gt: now } }] },
    data: { status: 'running' },
  })
  await prisma.marketingCampaign.updateMany({ where: { status: 'scheduled', scheduledEndAt: { lte: now } }, data: { status: 'completed' } })
}

async function processCampaignSendTick(): Promise<void> {
  if (running) return
  running = true
  try {
    await activateScheduledCampaigns()
    // When an approved send window closes, pause and retain remaining queued rows.
    await prisma.marketingCampaign.updateMany({ where: { status: 'running', scheduledEndAt: { lte: new Date() } }, data: { status: 'paused' } })
    await sendQueuedDeliveries()
    await completeFinishedCampaigns()
  } catch (error) {
    const classified = classifyOperationalError(error)
    recordQueueEvent({ queue: 'email-delivery', outcome: 'tick_error' })
    logOperational('error', 'email_delivery.tick.failed', { queue: 'email-delivery', errorCode: classified.code, remediation: classified.remediation })
  } finally { running = false }
}

let campaignSendTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  campaignSendTimer = setInterval(() => void processCampaignSendTick(), POLL_MS)
  campaignSendTimer.unref()
  void processCampaignSendTick()
}
export { processCampaignSendTick, campaignSendTimer }
