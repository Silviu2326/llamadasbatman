import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

export interface EmailMetricsPeriod {
  periodFrom?: Date
  periodTo?: Date
}

export interface EmailMetrics {
  sent: number
  accepted: number
  delivered: number
  failed: number
  uniqueOpens: number
  totalOpens: number
  uniqueClicks: number
  totalClicks: number
  unsubscribes: number
  complaints: number
  // EM-108: openRate se calcula sobre entregados (no enviados) porque un
  // email que nunca llegó a bandeja de entrada no tuvo oportunidad de
  // abrirse — dividir sobre "enviados" infla artificialmente el fracaso.
  openRate: number | null
  // clickRate (CTOR, click-to-open rate) = clics únicos / aperturas únicas:
  // mide qué tan persuasivo es el contenido para quien ya abrió el email.
  clickRate: number | null
  // clickToDeliveredRate (CTR) = clics únicos / entregados: mide el
  // rendimiento global del envío (creatividad + asunto + contenido), no
  // solo el contenido para quien abrió. Son métricas distintas y
  // complementarias — CTOR aísla el contenido, CTR mide el envío completo.
  clickToDeliveredRate: number | null
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

/**
 * EM-108: agrega métricas desde EmailDelivery/EmailEvent. Funciona igual con
 * 0 filas que con muchas — solo lee lo que otro proceso vaya poblando.
 */
async function computeMetrics(
  deliveryWhere: Prisma.EmailDeliveryWhereInput
): Promise<EmailMetrics> {
  const [sent, accepted, delivered, failed, deliveryIds] = await Promise.all([
    prisma.emailDelivery.count({ where: deliveryWhere }),
    prisma.emailDelivery.count({
      where: { ...deliveryWhere, status: { notIn: ['queued', 'failed'] } },
    }),
    prisma.emailDelivery.count({
      where: {
        ...deliveryWhere,
        OR: [{ status: 'delivered' }, { events: { some: { type: 'delivered' } } }],
      },
    }),
    prisma.emailDelivery.count({
      where: { ...deliveryWhere, status: { in: ['failed', 'bounced'] } },
    }),
    prisma.emailDelivery.findMany({ where: deliveryWhere, select: { id: true } }),
  ])

  const ids = deliveryIds.map((d) => d.id)
  if (ids.length === 0) {
    return {
      sent,
      accepted,
      delivered,
      failed,
      uniqueOpens: 0,
      totalOpens: 0,
      uniqueClicks: 0,
      totalClicks: 0,
      unsubscribes: 0,
      complaints: 0,
      openRate: safeRatio(0, delivered),
      clickRate: safeRatio(0, 0),
      clickToDeliveredRate: safeRatio(0, delivered),
    }
  }

  const eventWhere = { deliveryId: { in: ids } }

  const [
    uniqueOpens,
    totalOpens,
    uniqueClicks,
    totalClicks,
    unsubscribes,
    complaints,
  ] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { ...eventWhere, type: 'open' },
      distinct: ['deliveryId'],
      select: { deliveryId: true },
    }),
    prisma.emailEvent.count({ where: { ...eventWhere, type: 'open' } }),
    prisma.emailEvent.findMany({
      where: { ...eventWhere, type: 'click' },
      distinct: ['deliveryId'],
      select: { deliveryId: true },
    }),
    prisma.emailEvent.count({ where: { ...eventWhere, type: 'click' } }),
    prisma.emailEvent.findMany({
      where: { ...eventWhere, type: 'unsubscribe' },
      distinct: ['deliveryId'],
      select: { deliveryId: true },
    }),
    prisma.emailEvent.count({ where: { ...eventWhere, type: 'complaint' } }),
  ])

  const uniqueOpensCount = uniqueOpens.length
  const uniqueClicksCount = uniqueClicks.length

  return {
    sent,
    accepted,
    delivered,
    failed,
    uniqueOpens: uniqueOpensCount,
    totalOpens,
    uniqueClicks: uniqueClicksCount,
    totalClicks,
    unsubscribes: unsubscribes.length,
    complaints,
    openRate: safeRatio(uniqueOpensCount, delivered),
    clickRate: safeRatio(uniqueClicksCount, uniqueOpensCount),
    clickToDeliveredRate: safeRatio(uniqueClicksCount, delivered),
  }
}

function withPeriod(base: Prisma.EmailDeliveryWhereInput, period?: EmailMetricsPeriod): Prisma.EmailDeliveryWhereInput {
  if (!period?.periodFrom && !period?.periodTo) return base
  return {
    ...base,
    queuedAt: {
      ...(period.periodFrom ? { gte: period.periodFrom } : {}),
      ...(period.periodTo ? { lte: period.periodTo } : {}),
    },
  }
}

/** EM-108: métricas de una campaña concreta (ownership por orgId+campaignId). */
export async function getCampaignMetrics(
  orgId: string,
  campaignId: string,
  period?: EmailMetricsPeriod
): Promise<EmailMetrics> {
  const where = withPeriod({ orgId, campaignId }, period)
  return computeMetrics(where)
}

/** EM-108: métricas agregadas de toda la organización (todas las campañas). */
export async function getOverviewMetrics(
  orgId: string,
  period?: EmailMetricsPeriod
): Promise<EmailMetrics> {
  const where = withPeriod({ orgId }, period)
  return computeMetrics(where)
}
