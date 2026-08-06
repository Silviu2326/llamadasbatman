import { prisma } from '../lib/prisma'
import { getDataQuality } from './adDataQuality.service'
import { ECONOMICS_PERIOD_DAYS, getOrgAttribution } from './adAttribution.service'
import { listActiveDecisions } from './adDecision.service'
import { buildWeeklyNarrative } from './adNarrative.service'
import { getOrgTargets } from './adTargets.service'
import { getCapiHealth } from './metaConversions.service'
import { getPolicy } from './adPolicy.service'

type Snapshot = {
  capturedAt: Date
  spendCents: number
  impressions: number
  clicks: number
  leadsCount: number
  costPerLeadCents: number | null
}

/**
 * Ventana de lectura de la página. Las métricas rápidas se calculan sobre este
 * período, no sobre el último snapshot: un snapshot es el gasto de un día, y
 * presentarlo como "gasto de la campaña" subestimaba el coste real.
 */
const DEFAULT_PERIOD_DAYS = 14

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getCreativeCopy(adAssets: unknown) {
  if (!adAssets || typeof adAssets !== 'object' || Array.isArray(adAssets)) return null
  const assets = adAssets as Record<string, unknown>
  return {
    offer: typeof assets.offer === 'string' ? assets.offer : null,
    copy: typeof assets.adCopy === 'string' ? assets.adCopy : null,
  }
}

/**
 * Divide dos magnitudes devolviendo `null` cuando el denominador no permite
 * calcular nada. Ver `docs/vendrava/ads.md` §4.3: `null` es "sin medición" y `0`
 * es "se midió y salió cero"; no son intercambiables.
 */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round(numerator / denominator)
}

/**
 * Vista de operación Ads. Devuelve el contrato de `docs/vendrava/ads.md` §6.1:
 * estado de la cuenta con sus permisos reales, integridad de los datos,
 * señales rápidas separadas de las cohortes maduras, y la política de
 * autonomía vigente.
 *
 * Las cohortes maduras (`summary.mature`), el embudo y la recomendación con
 * evidencia llegan en la Fase 1. Hasta entonces se declaran `null` en vez de
 * inventarlos: la página debe poder decir "todavía no lo sé".
 */
export async function getAdsOverview(orgId: string, options: { periodDays?: number } = {}) {
  const periodDays = options.periodDays ?? DEFAULT_PERIOD_DAYS
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)

  const [campaigns, account, dataQuality, attribution, decisions, targets, capi, policy] = await Promise.all([
    prisma.campaign.findMany({
      where: {
        orgId,
        OR: [
          { adStatus: { not: null } },
          { adPlaybookId: { not: null } },
          { metaCampaignId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        objective: true,
        status: true,
        adStatus: true,
        metaCampaignId: true,
        totalLeads: true,
        meetingsScheduled: true,
        budgetCents: true,
        maxCostPerLeadCents: true,
        adAssets: true,
        createdAt: true,
        adInsightSnapshots: {
          where: { capturedAt: { gte: periodStart } },
          select: {
            capturedAt: true,
            spendCents: true,
            impressions: true,
            clicks: true,
            leadsCount: true,
            costPerLeadCents: true,
          },
          orderBy: { capturedAt: 'desc' },
        },
      },
    }),
    prisma.metaAdAccount.findFirst({
      where: { orgId, status: 'connected' },
      select: {
        id: true,
        metaAdAccountId: true,
        metaPixelId: true,
        dailyBudgetCapCents: true,
        connectedAt: true,
        lastValidatedAt: true,
      },
    }),
    getDataQuality(orgId),
    // Circuito lento (§4.7): ventana propia y más larga que la del circuito
    // rápido, para que las cohortes de venta puedan llegar a madurar.
    getOrgAttribution(orgId, { periodDays: ECONOMICS_PERIOD_DAYS }),
    listActiveDecisions(orgId, { limit: 12 }),
    getOrgTargets(orgId),
    getCapiHealth(orgId),
    getPolicy(orgId),
  ])

  const targetsByCampaign = new Map(targets.map(target => [target.campaignId, target]))

  const attributionByCampaign = new Map(attribution.campaigns.map(item => [item.id, item.attribution]))

  const latestByDay = new Map<string, Snapshot>()
  const items = campaigns.map(campaign => {
    const snapshots = campaign.adInsightSnapshots as Snapshot[]
    const latest = snapshots[0] ?? null
    // Un snapshot por día y campaña: Meta puede devolver varias lecturas del
    // mismo día y sumarlas contaría el gasto dos veces.
    const perDay = new Map<string, Snapshot>()
    for (const snapshot of snapshots) {
      const day = getDateKey(snapshot.capturedAt)
      if (!perDay.has(day)) perDay.set(day, snapshot)
      const key = `${campaign.id}:${day}`
      if (!latestByDay.has(key)) latestByDay.set(key, snapshot)
    }

    const measured = perDay.size > 0
    const period = Array.from(perDay.values()).reduce(
      (sum, snapshot) => ({
        spendCents: sum.spendCents + snapshot.spendCents,
        impressions: sum.impressions + snapshot.impressions,
        clicks: sum.clicks + snapshot.clicks,
        leadsCount: sum.leadsCount + snapshot.leadsCount,
      }),
      { spendCents: 0, impressions: 0, clicks: 0, leadsCount: 0 }
    )

    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.adStatus ?? campaign.status,
      crmStatus: campaign.status,
      metaCampaignId: campaign.metaCampaignId,
      totalLeads: campaign.totalLeads,
      meetingsScheduled: campaign.meetingsScheduled,
      budgetCents: campaign.budgetCents,
      maxCostPerLeadCents: campaign.maxCostPerLeadCents,
      /** Acumulado del período. Sin snapshots todo es `null`, nunca cero. */
      period: {
        days: periodDays,
        measuredDays: perDay.size,
        spendCents: measured ? period.spendCents : null,
        impressions: measured ? period.impressions : null,
        clicks: measured ? period.clicks : null,
        leadsCount: measured ? period.leadsCount : null,
        costPerLeadCents: measured ? ratio(period.spendCents, period.leadsCount) : null,
        ctr: measured && period.impressions > 0
          ? Math.round((period.clicks / period.impressions) * 10_000) / 100
          : null,
      },
      /** Última lectura conocida, para saber cuándo se midió por última vez. */
      latest: {
        capturedAt: latest?.capturedAt ?? null,
        spendCents: latest?.spendCents ?? null,
        impressions: latest?.impressions ?? null,
        clicks: latest?.clicks ?? null,
        leadsCount: latest?.leadsCount ?? null,
        costPerLeadCents: latest?.costPerLeadCents ?? null,
        ctr: latest && latest.impressions > 0
          ? Math.round((latest.clicks / latest.impressions) * 10_000) / 100
          : null,
      },
      /** Embudo económico de esta campaña: cualificados, ventas, CPQL y CAC. */
      economics: attributionByCampaign.get(campaign.id) ?? null,
      /** Objetivos de coste calculados desde el margen (ads.md 9). */
      targets: targetsByCampaign.get(campaign.id) ?? null,
      creative: getCreativeCopy(campaign.adAssets),
    }
  })

  const seriesByDay = new Map<string, { date: string; spendCents: number; leads: number; clicks: number }>()
  for (const snapshot of latestByDay.values()) {
    const date = getDateKey(snapshot.capturedAt)
    const current = seriesByDay.get(date) ?? { date, spendCents: 0, leads: 0, clicks: 0 }
    current.spendCents += snapshot.spendCents
    current.leads += snapshot.leadsCount
    current.clicks += snapshot.clicks
    seriesByDay.set(date, current)
  }
  const series = Array.from(seriesByDay.values()).sort((a, b) => a.date.localeCompare(b.date))

  const measuredCampaigns = items.filter(campaign => campaign.period.measuredDays > 0)
  const totals = measuredCampaigns.reduce((sum, campaign) => ({
    spendCents: sum.spendCents + (campaign.period.spendCents ?? 0),
    impressions: sum.impressions + (campaign.period.impressions ?? 0),
    clicks: sum.clicks + (campaign.period.clicks ?? 0),
    leads: sum.leads + (campaign.period.leadsCount ?? 0),
  }), { spendCents: 0, impressions: 0, clicks: 0, leads: 0 })

  const hasMeasurement = measuredCampaigns.length > 0

  return {
    period: { days: periodDays, from: periodStart.toISOString(), timezone: dataQuality.timezone },
    currency: dataQuality.currency,

    account: account
      ? {
          ...account,
          connected: true,
          status: dataQuality.accountStatus,
          permissions: {
            insights: dataQuality.permissionsInsights,
            leads: dataQuality.permissionsLeads,
            capi: dataQuality.permissionsCapi,
          },
          lastValidatedAt: dataQuality.lastValidatedAt,
        }
      : {
          connected: false,
          status: dataQuality.accountStatus,
          permissions: { insights: false, leads: false, capi: false },
          lastValidatedAt: null,
        },

    dataQuality: {
      status: dataQuality.status,
      computedAt: dataQuality.computedAt,
      lastSnapshotAt: dataQuality.lastSnapshotAt,
      snapshotDelayMinutes: dataQuality.snapshotDelayMinutes,
      attributionCoveragePct: dataQuality.attributionCoveragePct,
      adLevelCoveragePct: dataQuality.adLevelCoveragePct,
      unattributedLeads: dataQuality.unattributedLeads,
      duplicateRatePct: dataQuality.duplicateRatePct,
      consentStatus: dataQuality.consentStatus,
      consentCoveragePct: dataQuality.consentCoveragePct,
      capiStatus: dataQuality.capiStatus,
      missingScopes: dataQuality.missingScopes,
      missingAssets: dataQuality.missingAssets,
      blocksDeepMetrics: dataQuality.blocksDeepMetrics,
      blocksAutomation: dataQuality.blocksAutomation,
      issues: dataQuality.issues,
      /** Salud de CAPI a partir de entregas reales, no de configuracion. */
      capi,
    },

    summary: {
      activeCampaigns: items.filter(campaign => campaign.crmStatus === 'active').length,
      /** Señales rápidas: lo que Meta ya sabe hoy. */
      fast: {
        spendCents: hasMeasurement ? totals.spendCents : null,
        impressions: hasMeasurement ? totals.impressions : null,
        clicks: hasMeasurement ? totals.clicks : null,
        leads: hasMeasurement ? totals.leads : null,
        cplCents: hasMeasurement ? ratio(totals.spendCents, totals.leads) : null,
        ctr: hasMeasurement && totals.impressions > 0
          ? Math.round((totals.clicks / totals.impressions) * 10_000) / 100
          : null,
      },
      /**
       * Cohortes maduras: recorrido lead → llamada → oportunidad → venta.
       * El CAC solo aparece cuando hay ventas suficientes; con una sola venta
       * temprana la cifra parecería precisa sin serlo.
       */
      mature: {
        qualified: attribution.totals.qualified,
        opportunities: attribution.totals.opportunities,
        sales: attribution.totals.sales,
        revenueCents: attribution.totals.revenueCents,
        cpqlCents: attribution.totals.cpqlCents,
        cacCents: attribution.totals.cacCents,
        roas: attribution.totals.roas,
      },
      deepestEligibleSignal: attribution.deepestEligibleSignal,
      eligibilityReason: attribution.eligibilityReason,
    },

    funnel: attribution.funnel,
    /** El embudo vive en el circuito lento, con su propia ventana. */
    funnelPeriodDays: ECONOMICS_PERIOD_DAYS,
    campaigns: items,
    series,

    /**
     * Observaciones vigentes con su evidencia y confianza. Todas en modo
     * consultivo: la aprobación y la ejecución llegan en las fases 3 y 4.
     */
    decisions: decisions.map(decision => ({
      id: decision.id,
      campaignId: decision.campaignId,
      campaignName: decision.campaign?.name ?? null,
      diagnosis: decision.diagnosis,
      severity: decision.severity,
      confidence: decision.confidence,
      confidenceReason: decision.confidenceReason,
      title: decision.title,
      explanation: decision.explanation,
      recommendation: decision.recommendation,
      hypotheticalAction: decision.hypotheticalAction,
      evidence: decision.evidence,
      cohortStatus: decision.cohortStatus,
      signalUsed: decision.signalUsed,
      mode: decision.mode,
      status: decision.status,
      createdAt: decision.createdAt,
    })),

    weeklyNarrative: buildWeeklyNarrative({
      // El informe habla de cualificados y ventas, así que su período es el
      // del circuito lento, no el de las señales rápidas.
      periodDays: ECONOMICS_PERIOD_DAYS,
      campaigns: attribution.campaigns,
      totals: {
        spendCents: attribution.totals.spendCents,
        leads: attribution.totals.leads,
        qualified: attribution.totals.qualified,
        sales: attribution.totals.sales,
        cplCents: attribution.totals.cplCents,
        cpqlCents: attribution.totals.cpqlCents,
        cacCents: attribution.totals.cacCents,
      },
      decisions: decisions.map(decision => ({
        title: decision.title,
        severity: decision.severity,
        diagnosis: decision.diagnosis,
      })),
      dataQualityIssues: dataQuality.issues,
      deepestEligibleSignal: attribution.deepestEligibleSignal,
      eligibilityReason: attribution.eligibilityReason,
    }),

    /**
     * Autonomía vigente. N1 fijo: `adOptimizer.service.ts` pausa campañas sin
     * aprobación y su reconversión a modo sombra es trabajo de la Fase 3, así
     * que la página aún no puede ofrecer aprobar ni ejecutar nada.
     */
    policy: {
      autonomyLevel: policy.autonomyLevel,
      mode: policy.mode,
      targetSignal: policy.targetSignal,
      killSwitch: policy.killSwitchEnabled ? 'engaged' : 'ready',
      killSwitchReason: policy.killSwitchReason,
      maxChangesPerDay: policy.maxChangesPerDay,
      minMinutesBetweenChanges: policy.minMinutesBetweenChanges,
      version: policy.version,
    },
  }
}
