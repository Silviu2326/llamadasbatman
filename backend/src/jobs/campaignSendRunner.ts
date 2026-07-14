import { prisma } from '../lib/prisma'
import * as mauticSync from '../services/mauticSync.service'

/**
 * EM-105: envía en background los EmailDelivery en 'queued' que
 * publishCampaign encola (marketingCampaigns.service.ts) — mismo patrón de
 * poll + procesar-por-lotes que importJobRunner.ts. No hace falta un claim
 * atómico por fila (a diferencia de ImportJob, que sí tiene contención entre
 * varios jobs pendientes): el flag `running` evita ticks solapados dentro de
 * este proceso, y sendEmailToLead dentro de mauticSync.service.ts es lo
 * único que muta cada EmailDelivery, sacándolo de 'queued' en cuanto se
 * intenta (accepted/failed), así que un delivery nunca se reprocesa dos
 * veces en el mismo tick ni en el siguiente.
 */
const POLL_MS = Number(process.env.CAMPAIGN_SEND_POLL_MS ?? 7_000)
const BATCH_SIZE = 15
let running = false

async function sendQueuedDeliveries(): Promise<void> {
  // Corrección: publishCampaign() encola EmailDelivery para TODA campaña
  // publicada, incluidas las que quedan en status='scheduled' porque
  // scheduledStartAt es futuro. Sin este filtro, una campaña "programada
  // para mañana" enviaba hoy en cuanto se publicaba, porque este runner no
  // distinguía campañas 'running' de 'scheduled'.
  const deliveries = await prisma.emailDelivery.findMany({
    where: { status: 'queued', campaignId: { not: null }, campaign: { status: 'running' } },
    take: BATCH_SIZE,
    orderBy: { queuedAt: 'asc' },
  })

  for (const delivery of deliveries) {
    if (!delivery.templateExternalId) {
      // Sin plantilla vinculada no hay nada que enviar — se marca failed en
      // vez de reintentarlo indefinidamente en cada tick.
      await prisma.emailDelivery.updateMany({
        where: { id: delivery.id, status: 'queued' },
        data: {
          status: 'failed',
          failedAt: new Date(),
          failureCode: 'NO_TEMPLATE',
          failureDetail: 'La campaña no tiene plantilla (templateBindingId) vinculada',
        },
      })
      continue
    }

    await mauticSync
      .sendEmailToLead(delivery.leadId, delivery.templateExternalId, delivery.orgId, delivery.id)
      .catch(err => console.error('[CampaignSendRunner] sendEmailToLead failed:', (err as Error).message))
  }
}

/**
 * Criterio de cierre (deliberadamente simple, sin over-engineering): una
 * campaña 'running' pasa a 'completed' en cuanto ya no le queda ningún
 * EmailDelivery en 'queued' — incluye el caso borde de audiencia vacía o
 * completamente bloqueada por consentimiento (0 EmailDelivery creados), que
 * también se considera "nada pendiente" y se cierra de inmediato. El detalle
 * de éxito/fallo por destinatario ya queda auditado por lead en
 * EmailDelivery.status, así que esta función no distingue envíos parciales.
 */
async function completeFinishedCampaigns(): Promise<void> {
  const runningCampaigns = await prisma.marketingCampaign.findMany({
    where: { status: 'running' },
    select: { id: true, orgId: true },
  })

  for (const campaign of runningCampaigns) {
    const pending = await prisma.emailDelivery.count({
      where: { campaignId: campaign.id, orgId: campaign.orgId, status: 'queued' },
    })
    if (pending > 0) continue

    await prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, orgId: campaign.orgId, status: 'running' },
      data: { status: 'completed' },
    })
  }
}

/** Activa campañas 'scheduled' cuya scheduledStartAt ya llegó, para que sendQueuedDeliveries empiece a procesarlas. */
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
    console.error('[CampaignSendRunner] tick failed:', (error as Error).message)
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
