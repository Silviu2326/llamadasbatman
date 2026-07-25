import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import * as mauticSync from '../services/mauticSync.service'
import { recordQueueEvent } from '../observability/metrics'
import { classifyOperationalError, logOperational } from '../observability/operationalLog'

/**
 * EM-105: entrega la cola local de EmailDelivery con claims condicionales
 * persistidos. El flag `running` evita solapes dentro de este proceso; el
 * workerId/lease evita duplicados entre procesos o despliegues simultáneos.
 */
const POLL_MS = Number(process.env.CAMPAIGN_SEND_POLL_MS ?? 7_000)
const BATCH_SIZE = 15
const WORKER_ID = process.env.CAMPAIGN_SEND_WORKER_ID?.trim() || `campaign-send-${process.pid}-${randomUUID()}`
let running = false

function dueDeliveryWhere(now: Date): Prisma.EmailDeliveryWhereInput {
  return {
    OR: [
      { status: 'queued', availableAt: { lte: now } },
      { status: 'processing', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
    ],
  }
}

async function sendQueuedDeliveries(): Promise<void> {
  const now = new Date()
  // A native Mautic campaign owns its delivery. Only local/legacy campaigns
  // without a remote campaign ID are sent through this direct-send runner.
  const deliveries = await prisma.emailDelivery.findMany({
    where: {
      campaignId: { not: null },
      campaign: { status: 'running', externalCampaignId: null },
      ...dueDeliveryWhere(now),
    },
    // Workers can race on candidate selection, therefore fetch additional
    // candidates and let `claimEmailDelivery` be the atomic arbiter.
    take: BATCH_SIZE * 2,
    orderBy: { queuedAt: 'asc' },
  })

  for (const delivery of deliveries.slice(0, BATCH_SIZE)) {
    if (!delivery.templateExternalId) {
      // A template is validated before publication. If a legacy row lacks it,
      // finish it only when it is due/abandoned; never overwrite an active
      // lease owned by another worker.
      await prisma.emailDelivery.updateMany({
        where: { id: delivery.id, ...dueDeliveryWhere(new Date()) },
        data: {
          status: 'failed',
          failedAt: new Date(),
          failureCode: 'NO_TEMPLATE',
          failureDetail: 'La campaña no tiene plantilla (templateBindingId) vinculada',
          lockedAt: null,
          leaseExpiresAt: null,
          workerId: null,
        },
      })
      continue
    }

    await mauticSync
      .sendEmailToLead(delivery.leadId, delivery.templateExternalId, delivery.orgId, delivery.id, WORKER_ID)
      .catch(err => {
        const classified = classifyOperationalError(err)
        recordQueueEvent({ queue: 'email-delivery', outcome: 'tick_error' })
        logOperational('error', 'email_delivery.send.failed', {
          queue: 'email-delivery', jobId: delivery.id, errorCode: classified.code, remediation: classified.remediation,
        })
      })
  }
}

/**
 * A campaign only becomes completed after the durable queue is exhausted.
 * An `uncertain` recipient is escalated as `error`, not silently completed:
 * its provider outcome needs operator review before any redrive.
 */
async function completeFinishedCampaigns(): Promise<void> {
  const runningCampaigns = await prisma.marketingCampaign.findMany({
    where: { status: 'running', externalCampaignId: null },
    select: { id: true, orgId: true },
  })

  for (const campaign of runningCampaigns) {
    const byStatus = await prisma.emailDelivery.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id, orgId: campaign.orgId },
      _count: { _all: true },
    })
    const count = (status: string) => byStatus.find(row => row.status === status)?._count._all ?? 0
    if (count('queued') + count('processing') > 0) continue

    await prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, orgId: campaign.orgId, status: 'running' },
      data: { status: count('uncertain') > 0 ? 'error' : 'completed' },
    })
  }
}

/** Activa campañas 'scheduled' cuya scheduledStartAt ya llegó. */
async function activateScheduledCampaigns(): Promise<void> {
  await prisma.marketingCampaign.updateMany({
    where: { status: 'scheduled', scheduledStartAt: { lte: new Date() } },
    data: { status: 'running' },
  })
}

async function processCampaignSendTick(): Promise<void> {
  if (running) return
  running = true
  try {
    await activateScheduledCampaigns()
    await sendQueuedDeliveries()
    await completeFinishedCampaigns()
  } catch (error) {
    const classified = classifyOperationalError(error)
    recordQueueEvent({ queue: 'email-delivery', outcome: 'tick_error' })
    logOperational('error', 'email_delivery.tick.failed', { queue: 'email-delivery', errorCode: classified.code, remediation: classified.remediation })
  } finally {
    running = false
  }
}

let campaignSendTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  campaignSendTimer = setInterval(() => void processCampaignSendTick(), POLL_MS)
  campaignSendTimer.unref()
  void processCampaignSendTick()
}

export { processCampaignSendTick, campaignSendTimer }
