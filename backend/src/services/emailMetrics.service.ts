import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'
import { twoProportionZ } from './landingExperiments.service'

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

export interface VariantMetrics {
  key: string
  metrics: EmailMetrics
}

export interface CampaignVariantComparison {
  variants: VariantMetrics[]
  /**
   * Veredicto sobre la apertura, que es lo que mide el asunto. El clic depende
   * del cuerpo, que en esta prueba puede ser el mismo en las dos variantes.
   * `null` mientras no haya entregados en ambas o el reparto no sea A/B.
   */
  verdict: {
    control: string
    challenger: string
    z: number
    lift: number | null
    /** El umbral es el mismo que usan los experimentos de landing: |z| ≥ 1,96. */
    significant: boolean
    winner: string | null
  } | null
}

const Z_95 = 1.96

/**
 * EM-113: compara las variantes de una campaña. Solo agrupa lo que ya está
 * guardado en `EmailDelivery.variantKey`; no reparte nada por su cuenta.
 */
export async function getCampaignVariantMetrics(
  orgId: string,
  campaignId: string,
  period?: EmailMetricsPeriod
): Promise<CampaignVariantComparison> {
  const keys = await prisma.emailDelivery.findMany({
    where: { orgId, campaignId, variantKey: { not: null } },
    distinct: ['variantKey'],
    select: { variantKey: true },
    orderBy: { variantKey: 'asc' },
  })
  const variantKeys = keys.map(row => row.variantKey).filter((key): key is string => Boolean(key))
  if (!variantKeys.length) return { variants: [], verdict: null }

  const variants: VariantMetrics[] = []
  for (const key of variantKeys) {
    variants.push({ key, metrics: await computeMetrics(withPeriod({ orgId, campaignId, variantKey: key }, period)) })
  }

  // Con más de dos variantes se compara cada retadora contra A y se declara
  // ganadora la mejor significativa; sin significancia no se declara nada.
  const [control, ...challengers] = variants
  let best: CampaignVariantComparison['verdict'] = null
  for (const challenger of challengers) {
    const test = twoProportionZ(
      { exposures: control.metrics.delivered, conversions: control.metrics.uniqueOpens },
      { exposures: challenger.metrics.delivered, conversions: challenger.metrics.uniqueOpens }
    )
    if (!test) continue
    const significant = Math.abs(test.z) >= Z_95
    const candidate = {
      control: control.key,
      challenger: challenger.key,
      z: test.z,
      lift: test.lift,
      significant,
      winner: significant ? (test.z > 0 ? challenger.key : control.key) : null,
    }
    if (!best || Math.abs(candidate.z) > Math.abs(best.z)) best = candidate
  }
  return { variants, verdict: best }
}

export interface CampaignRevenue {
  attributionWindowDays: number
  /** Leads de la campaña que abrieron alguna oportunidad dentro de la ventana. */
  attributedLeads: number
  /**
   * Ganado y abierto van separados y no se suman nunca: lo abierto es
   * expectativa, no ingreso. Lo perdido no cuenta en ninguno de los dos.
   * Se agrupa por divisa porque sumar euros con dólares sería inventarse una.
   */
  byCurrency: Record<string, { wonValue: number; openValue: number; wonCount: number; openCount: number }>
}

const OPEN_STAGES = ['lead', 'qualified', 'proposal', 'negotiation'] as const

export interface AttributableOpportunity {
  leadId: string
  stage: string
  value: unknown
  currency: string
  createdAt: Date
}

/**
 * La regla de atribución, aparte y sin base de datos para poder discutirla y
 * probarla: cuenta la oportunidad creada entre el primer envío que recibió su
 * lead y `windowMs` después. Ni antes —ya existía, no la trajo este email— ni
 * después. `closed_lost` no suma en ninguna de las dos columnas.
 */
export function attributeOpportunities(
  firstTouch: Map<string, Date>,
  opportunities: AttributableOpportunity[],
  windowMs: number
): Pick<CampaignRevenue, 'attributedLeads' | 'byCurrency'> {
  const byCurrency: CampaignRevenue['byCurrency'] = {}
  const attributed = new Set<string>()
  for (const opportunity of opportunities) {
    const touchedAt = firstTouch.get(opportunity.leadId)
    if (!touchedAt) continue
    const elapsed = opportunity.createdAt.getTime() - touchedAt.getTime()
    if (elapsed < 0 || elapsed > windowMs) continue
    const isWon = opportunity.stage === 'closed_won'
    const isOpen = (OPEN_STAGES as readonly string[]).includes(opportunity.stage)
    if (!isWon && !isOpen) continue
    attributed.add(opportunity.leadId)
    const bucket = byCurrency[opportunity.currency] ??= { wonValue: 0, openValue: 0, wonCount: 0, openCount: 0 }
    const value = opportunity.value === null || opportunity.value === undefined ? 0 : Number(opportunity.value)
    if (isWon) { bucket.wonValue += value; bucket.wonCount++ } else { bucket.openValue += value; bucket.openCount++ }
  }
  return { attributedLeads: attributed.size, byCurrency }
}

/**
 * EM-113: euros atribuidos a una campaña de email. La regla, explícita porque
 * cualquier atribución es una convención y conviene poder discutirla: cuenta
 * la oportunidad cuya creación cae entre el primer envío que recibió ese lead
 * en esta campaña y `attributionWindowDays` después. Ni antes (ya existía) ni
 * después (el mérito ya no es de este email).
 */
export async function getCampaignRevenue(orgId: string, campaignId: string): Promise<CampaignRevenue> {
  const campaign = await prisma.marketingCampaign.findFirst({
    where: { id: campaignId, orgId },
    select: { attributionWindowDays: true },
  })
  const attributionWindowDays = campaign?.attributionWindowDays ?? 0
  const empty: CampaignRevenue = { attributionWindowDays, attributedLeads: 0, byCurrency: {} }
  if (!campaign) return empty

  // Solo envíos que llegaron a salir: un email en cola no puede haber
  // provocado nada.
  const deliveries = await prisma.emailDelivery.findMany({
    where: { orgId, campaignId, status: { notIn: ['queued', 'failed'] } },
    select: { leadId: true, acceptedAt: true, queuedAt: true },
  })
  if (!deliveries.length) return empty

  const firstTouch = new Map<string, Date>()
  for (const delivery of deliveries) {
    const touchedAt = delivery.acceptedAt ?? delivery.queuedAt
    const current = firstTouch.get(delivery.leadId)
    if (!current || touchedAt < current) firstTouch.set(delivery.leadId, touchedAt)
  }

  // ponytail: un `in` con toda la audiencia. A partir de decenas de miles de
  // leads habrá que trocearlo o mover el cruce a SQL.
  const opportunities = await prisma.opportunity.findMany({
    where: { orgId, leadId: { in: [...firstTouch.keys()] } },
    select: { leadId: true, stage: true, value: true, currency: true, createdAt: true },
  })

  const attribution = attributeOpportunities(firstTouch, opportunities, attributionWindowDays * 86_400_000)
  return { attributionWindowDays, ...attribution }
}
