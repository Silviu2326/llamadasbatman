import { prisma } from '../lib/prisma'
import { NO_CONTACT_CALL_OUTCOMES, QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'

/**
 * Cierra el embudo económico de `docs/xarly/ads.md` §4.4:
 *
 *   clic → lead → contactado → cualificado → oportunidad → venta
 *
 * Las definiciones exactas de cada paso están escritas en esa sección y en
 * `lib/callOutcome.ts`. Aquí solo se recorren; no se reinventan.
 *
 * Dos reglas gobiernan todos los cálculos:
 *
 * 1. `null` es "sin medición" y `0` es "se midió y salió cero".
 * 2. Una cohorte inmadura no se declara fracaso. Un comprador que tarda diez
 *    días en cerrar no convierte en mala a la campaña que lo trajo ayer.
 */

/**
 * Días que se conceden a un lead para llegar a venta antes de considerar su
 * cohorte madura. Por debajo de esto, la ausencia de ventas no significa nada.
 */
const SALE_MATURITY_DAYS = 14

/**
 * Ventana del circuito lento (§4.7). Tiene que ser holgadamente mayor que
 * `SALE_MATURITY_DAYS` o ninguna cohorte llegaría nunca a madurar: con una
 * ventana de 14 días, ningún lead de dentro de la ventana puede tener 14 días.
 * El circuito rápido usa su propia ventana, más corta, en `adsOverview`.
 */
export const ECONOMICS_PERIOD_DAYS = 30
/** Días para que la cualificación sea concluyente: la llamada es mucho más rápida. */
const QUALIFICATION_MATURITY_DAYS = 3

/** Mínimos por debajo de los cuales una tasa es ruido, no señal. */
const MIN_LEADS_FOR_QUALIFICATION = 10
const MIN_QUALIFIED_FOR_CPQL = 5
const MIN_SALES_FOR_CAC = 3

export type FunnelStep = {
  key: 'click' | 'lead' | 'contacted' | 'qualified' | 'opportunity' | 'sale'
  label: string
  /** `null` cuando el paso no se puede medir con los datos disponibles. */
  value: number | null
  /** Tasa respecto al paso anterior, en porcentaje. */
  conversionPct: number | null
  /** Qué parte del volumen del paso es atribuible a esta campaña. */
  coveragePct: number | null
}

export type CampaignAttribution = {
  campaignId: string
  periodDays: number
  clicks: number | null
  leads: number | null
  contacted: number | null
  qualified: number | null
  opportunities: number | null
  sales: number | null
  revenueCents: number | null
  spendCents: number | null
  cplCents: number | null
  cpqlCents: number | null
  cacCents: number | null
  roas: number | null
  /** Telemetría de la landing, para separar problema de anuncio de problema de página. */
  landingViews: number | null
  landingLeads: number | null
  landingConversionPct: number | null
  /** Días medios entre la creación del lead y el cierre de la venta. */
  saleLatencyDays: number | null
  cohortStatus: 'insufficient' | 'maturing' | 'mature'
  deepestEligibleSignal: 'clic' | 'lead' | 'qualified_lead' | 'opportunity' | 'sale'
  eligibilityReason: string
  funnel: FunnelStep[]
}

function ratioCents(totalCents: number | null, count: number | null): number | null {
  if (totalCents == null || count == null || count <= 0) return null
  return Math.round(totalCents / count)
}

function conversion(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null
  return Math.round((current / previous) * 1000) / 10
}

/**
 * Elige la señal más profunda que aguanta una decisión. No basta con que
 * existan ventas: hacen falta suficientes y con la cohorte ya madura, o se
 * estaría comparando campañas por accidentes estadísticos.
 */
function chooseSignal(input: {
  leads: number
  qualified: number
  opportunities: number
  sales: number
  matureLeads: number
  qualificationMatureLeads: number
}): { signal: CampaignAttribution['deepestEligibleSignal']; reason: string } {
  if (input.sales >= MIN_SALES_FOR_CAC && input.matureLeads >= MIN_LEADS_FOR_QUALIFICATION) {
    return {
      signal: 'sale',
      reason: `${input.sales} ventas sobre ${input.matureLeads} leads con cohorte madura: se puede comparar CAC y ROAS real.`,
    }
  }
  if (input.qualified >= MIN_QUALIFIED_FOR_CPQL && input.qualificationMatureLeads >= MIN_LEADS_FOR_QUALIFICATION) {
    const salesNote = input.sales > 0
      ? ` Hay ${input.sales} venta${input.sales === 1 ? '' : 's'}, pero aún no bastan para comparar CAC.`
      : ' Todavía no hay ventas maduras suficientes para comparar CAC.'
    return {
      signal: 'qualified_lead',
      reason: `${input.qualified} cualificados sobre ${input.qualificationMatureLeads} leads evaluables: se puede comparar CPQL.${salesNote}`,
    }
  }
  if (input.leads > 0) {
    return {
      signal: 'lead',
      reason: `Solo ${input.qualified} cualificado${input.qualified === 1 ? '' : 's'} sobre ${input.leads} leads: por ahora únicamente el CPL es comparable.`,
    }
  }
  return { signal: 'clic', reason: 'Sin leads en el período: solo se pueden leer señales de entrega.' }
}

/**
 * Recorre el hilo completo de una campaña en el período indicado.
 *
 * El gasto sale de los snapshots deduplicados por día; el resto del embudo se
 * recorre desde los leads de la campaña, que es el único punto donde Meta y el
 * CRM se tocan.
 */
export async function getCampaignAttribution(
  orgId: string,
  campaignId: string,
  options: { periodDays?: number } = {}
): Promise<CampaignAttribution> {
  const periodDays = options.periodDays ?? ECONOMICS_PERIOD_DAYS
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)
  const now = Date.now()

  const [snapshots, leads, acquisition] = await Promise.all([
    prisma.adInsightSnapshot.findMany({
      where: { orgId, campaignId, capturedAt: { gte: periodStart } },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true, spendCents: true, clicks: true },
    }),
    prisma.lead.findMany({
      where: { orgId, campaignId, createdAt: { gte: periodStart } },
      select: {
        id: true,
        createdAt: true,
        calls: { select: { outcome: true } },
        opportunities: { select: { stage: true, value: true, actualCloseDate: true } },
      },
    }),
    prisma.acquisitionEvent.groupBy({
      by: ['type'],
      where: { orgId, campaignId, createdAt: { gte: periodStart }, type: { in: ['landing_view', 'landing_lead'] } },
      _count: { _all: true },
    }),
  ])

  // Un snapshot por día: Meta puede devolver varias lecturas del mismo día.
  const perDay = new Map<string, { spendCents: number; clicks: number }>()
  for (const snapshot of snapshots) {
    const day = snapshot.capturedAt.toISOString().slice(0, 10)
    if (!perDay.has(day)) perDay.set(day, { spendCents: snapshot.spendCents, clicks: snapshot.clicks })
  }
  const measured = perDay.size > 0
  const spendCents = measured
    ? Array.from(perDay.values()).reduce((sum, day) => sum + day.spendCents, 0)
    : null
  const clicks = measured
    ? Array.from(perDay.values()).reduce((sum, day) => sum + day.clicks, 0)
    : null

  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)
  const noContact = new Set<string>(NO_CONTACT_CALL_OUTCOMES)

  let contacted = 0
  let qualified = 0
  let opportunities = 0
  let sales = 0
  let revenueCents = 0
  let revenueMeasured = false
  let matureLeads = 0
  let qualificationMatureLeads = 0
  let saleLatencySum = 0
  let saleLatencyCount = 0

  for (const lead of leads) {
    const ageDays = (now - lead.createdAt.getTime()) / 86_400_000
    if (ageDays >= SALE_MATURITY_DAYS) matureLeads += 1
    if (ageDays >= QUALIFICATION_MATURITY_DAYS) qualificationMatureLeads += 1

    // Por lead, no por llamada: un lead con tres llamadas es un cualificado.
    const outcomes = lead.calls.map(call => call.outcome)
    if (outcomes.some(outcome => !noContact.has(outcome))) contacted += 1
    if (outcomes.some(outcome => qualifying.has(outcome))) qualified += 1

    if (lead.opportunities.length > 0) opportunities += 1
    for (const opportunity of lead.opportunities) {
      if (opportunity.stage !== 'closed_won') continue
      sales += 1
      // Una venta sin importe no es una venta de 0 €: no se suma y el ROAS
      // queda sin medición si ninguna venta trae valor.
      if (opportunity.value != null) {
        revenueCents += Math.round(Number(opportunity.value) * 100)
        revenueMeasured = true
      }
      if (opportunity.actualCloseDate) {
        saleLatencySum += (opportunity.actualCloseDate.getTime() - lead.createdAt.getTime()) / 86_400_000
        saleLatencyCount += 1
      }
    }
  }

  const landingViews = acquisition.find(row => row.type === 'landing_view')?._count._all ?? null
  const landingLeads = acquisition.find(row => row.type === 'landing_lead')?._count._all ?? null

  const leadCount = leads.length
  const revenue = revenueMeasured ? revenueCents : null
  const { signal, reason } = chooseSignal({
    leads: leadCount,
    qualified,
    opportunities,
    sales,
    matureLeads,
    qualificationMatureLeads,
  })

  const cohortStatus: CampaignAttribution['cohortStatus'] =
    matureLeads >= MIN_LEADS_FOR_QUALIFICATION
      ? 'mature'
      : qualificationMatureLeads >= MIN_LEADS_FOR_QUALIFICATION
        ? 'maturing'
        : 'insufficient'

  const funnel: FunnelStep[] = [
    { key: 'click', label: 'Clics', value: clicks, conversionPct: null, coveragePct: null },
    { key: 'lead', label: 'Leads', value: leadCount, conversionPct: conversion(leadCount, clicks), coveragePct: null },
    { key: 'contacted', label: 'Contactados', value: contacted, conversionPct: conversion(contacted, leadCount), coveragePct: null },
    { key: 'qualified', label: 'Cualificados', value: qualified, conversionPct: conversion(qualified, contacted), coveragePct: null },
    { key: 'opportunity', label: 'Oportunidades', value: opportunities, conversionPct: conversion(opportunities, qualified), coveragePct: null },
    { key: 'sale', label: 'Ventas', value: sales, conversionPct: conversion(sales, opportunities), coveragePct: null },
  ]

  return {
    campaignId,
    periodDays,
    clicks,
    leads: leadCount,
    contacted,
    qualified,
    opportunities,
    sales,
    revenueCents: revenue,
    spendCents,
    cplCents: ratioCents(spendCents, leadCount),
    cpqlCents: ratioCents(spendCents, qualified),
    // El CAC solo se publica con la cohorte madura: dividir el gasto entre una
    // única venta temprana produce una cifra que parece precisa y no lo es.
    cacCents: sales >= MIN_SALES_FOR_CAC ? ratioCents(spendCents, sales) : null,
    roas: revenue != null && spendCents != null && spendCents > 0
      ? Math.round((revenue / spendCents) * 100) / 100
      : null,
    landingViews,
    landingLeads,
    landingConversionPct: landingViews != null && landingViews > 0 && landingLeads != null
      ? Math.round((landingLeads / landingViews) * 1000) / 10
      : null,
    saleLatencyDays: saleLatencyCount > 0 ? Math.round((saleLatencySum / saleLatencyCount) * 10) / 10 : null,
    cohortStatus,
    deepestEligibleSignal: signal,
    eligibilityReason: reason,
    funnel,
  }
}

/**
 * Desglose por anuncio dentro de una campaña (§4.5).
 *
 * Los leads anteriores a que se guardara `metaAdId` no lo tienen y nunca lo
 * tendrán: se agrupan aparte en vez de repartirlos entre los anuncios, que
 * sería inventar. Ese grupo es la deuda de atribución de la campaña.
 */
export async function getAdBreakdown(
  orgId: string,
  campaignId: string,
  options: { periodDays?: number } = {}
) {
  const periodDays = options.periodDays ?? ECONOMICS_PERIOD_DAYS
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)

  const leads = await prisma.lead.findMany({
    where: { orgId, campaignId, createdAt: { gte: periodStart } },
    select: {
      metaAdId: true,
      calls: { select: { outcome: true } },
      opportunities: { select: { stage: true, value: true } },
    },
  })
  if (!leads.length) return { periodDays, ads: [], unattributed: null }

  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)
  const groups = new Map<string, { leads: number; qualified: number; sales: number; revenueCents: number }>()

  for (const lead of leads) {
    const key = lead.metaAdId ?? '__sin_anuncio__'
    const row = groups.get(key) ?? { leads: 0, qualified: 0, sales: 0, revenueCents: 0 }
    row.leads += 1
    if (lead.calls.some(call => qualifying.has(call.outcome))) row.qualified += 1
    for (const opportunity of lead.opportunities) {
      if (opportunity.stage !== 'closed_won') continue
      row.sales += 1
      if (opportunity.value != null) row.revenueCents += Math.round(Number(opportunity.value) * 100)
    }
    groups.set(key, row)
  }

  const toRow = (metaAdId: string | null, row: { leads: number; qualified: number; sales: number; revenueCents: number }) => ({
    metaAdId,
    leads: row.leads,
    qualified: row.qualified,
    sales: row.sales,
    revenueCents: row.revenueCents || null,
    qualificationPct: row.leads > 0 ? Math.round((row.qualified / row.leads) * 1000) / 10 : null,
  })

  const unattributedRow = groups.get('__sin_anuncio__')
  groups.delete('__sin_anuncio__')

  return {
    periodDays,
    ads: Array.from(groups.entries())
      .map(([metaAdId, row]) => toRow(metaAdId, row))
      .sort((left, right) => right.qualified - left.qualified || right.leads - left.leads),
    unattributed: unattributedRow ? toRow(null, unattributedRow) : null,
  }
}

/** Agrega el embudo de todas las campañas de Ads de la organización. */
export async function getOrgAttribution(orgId: string, options: { periodDays?: number } = {}) {
  const periodDays = options.periodDays ?? ECONOMICS_PERIOD_DAYS
  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      OR: [{ adStatus: { not: null } }, { adPlaybookId: { not: null } }, { metaCampaignId: { not: null } }],
    },
    select: { id: true, name: true },
  })

  const perCampaign = await Promise.all(
    campaigns.map(async campaign => ({
      ...campaign,
      attribution: await getCampaignAttribution(orgId, campaign.id, { periodDays }),
    }))
  )

  const sum = (pick: (item: CampaignAttribution) => number | null): number | null => {
    const values = perCampaign.map(item => pick(item.attribution)).filter((value): value is number => value != null)
    return values.length ? values.reduce((total, value) => total + value, 0) : null
  }

  const totals = {
    clicks: sum(item => item.clicks),
    leads: sum(item => item.leads),
    contacted: sum(item => item.contacted),
    qualified: sum(item => item.qualified),
    opportunities: sum(item => item.opportunities),
    sales: sum(item => item.sales),
    revenueCents: sum(item => item.revenueCents),
    spendCents: sum(item => item.spendCents),
  }

  const matureCampaigns = perCampaign.filter(item => item.attribution.cohortStatus === 'mature')
  const { signal, reason } = chooseSignal({
    leads: totals.leads ?? 0,
    qualified: totals.qualified ?? 0,
    opportunities: totals.opportunities ?? 0,
    sales: totals.sales ?? 0,
    matureLeads: matureCampaigns.reduce((total, item) => total + (item.attribution.leads ?? 0), 0),
    qualificationMatureLeads: perCampaign.reduce((total, item) => total + (item.attribution.leads ?? 0), 0),
  })

  const funnel: FunnelStep[] = [
    { key: 'click', label: 'Clics', value: totals.clicks, conversionPct: null, coveragePct: null },
    { key: 'lead', label: 'Leads', value: totals.leads, conversionPct: conversion(totals.leads, totals.clicks), coveragePct: null },
    { key: 'contacted', label: 'Contactados', value: totals.contacted, conversionPct: conversion(totals.contacted, totals.leads), coveragePct: null },
    { key: 'qualified', label: 'Cualificados', value: totals.qualified, conversionPct: conversion(totals.qualified, totals.contacted), coveragePct: null },
    { key: 'opportunity', label: 'Oportunidades', value: totals.opportunities, conversionPct: conversion(totals.opportunities, totals.qualified), coveragePct: null },
    { key: 'sale', label: 'Ventas', value: totals.sales, conversionPct: conversion(totals.sales, totals.opportunities), coveragePct: null },
  ]

  return {
    periodDays,
    totals: {
      ...totals,
      cplCents: ratioCents(totals.spendCents, totals.leads),
      cpqlCents: ratioCents(totals.spendCents, totals.qualified),
      cacCents: (totals.sales ?? 0) >= MIN_SALES_FOR_CAC ? ratioCents(totals.spendCents, totals.sales) : null,
      roas: totals.revenueCents != null && totals.spendCents != null && totals.spendCents > 0
        ? Math.round((totals.revenueCents / totals.spendCents) * 100) / 100
        : null,
    },
    funnel,
    deepestEligibleSignal: signal,
    eligibilityReason: reason,
    campaigns: perCampaign,
  }
}
