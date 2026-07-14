import { prisma } from '../lib/prisma'

type Snapshot = {
  capturedAt: Date
  spendCents: number
  impressions: number
  clicks: number
  leadsCount: number
  costPerLeadCents: number | null
}

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
 * Vista de operación Ads: usa el último snapshot por campaña para el estado
 * actual y reduce el historial a un punto diario por campaña para no enviar
 * series redundantes al navegador.
 */
export async function getAdsOverview(orgId: string) {
  const [campaigns, account] = await Promise.all([
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
          select: {
            capturedAt: true,
            spendCents: true,
            impressions: true,
            clicks: true,
            leadsCount: true,
            costPerLeadCents: true,
          },
          orderBy: { capturedAt: 'desc' },
          take: 28,
        },
      },
    }),
    prisma.metaAdAccount.findFirst({
      where: { orgId, status: 'connected' },
      select: { id: true, metaAdAccountId: true, dailyBudgetCapCents: true, connectedAt: true },
    }),
  ])

  const latestByDay = new Map<string, Snapshot>()
  const items = campaigns.map(campaign => {
    const snapshots = campaign.adInsightSnapshots as Snapshot[]
    const latest = snapshots[0] ?? null
    for (const snapshot of snapshots) {
      const key = `${campaign.id}:${getDateKey(snapshot.capturedAt)}`
      if (!latestByDay.has(key)) latestByDay.set(key, snapshot)
    }

    const spendCents = latest?.spendCents ?? 0
    const leads = latest?.leadsCount ?? campaign.totalLeads
    const costPerLeadCents = latest?.costPerLeadCents ?? (leads > 0 ? Math.round(spendCents / leads) : null)
    const ctr = latest?.impressions ? Math.round((latest.clicks / latest.impressions) * 10_000) / 100 : null

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
      latest: {
        capturedAt: latest?.capturedAt ?? null,
        spendCents,
        impressions: latest?.impressions ?? 0,
        clicks: latest?.clicks ?? 0,
        leadsCount: leads,
        costPerLeadCents,
        ctr,
      },
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
  const series = Array.from(seriesByDay.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-14)

  const totals = items.reduce((sum, campaign) => ({
    spendCents: sum.spendCents + campaign.latest.spendCents,
    impressions: sum.impressions + campaign.latest.impressions,
    clicks: sum.clicks + campaign.latest.clicks,
    leads: sum.leads + campaign.latest.leadsCount,
    meetings: sum.meetings + campaign.meetingsScheduled,
  }), { spendCents: 0, impressions: 0, clicks: 0, leads: 0, meetings: 0 })

  const weightedCplCents = totals.leads > 0 ? Math.round(totals.spendCents / totals.leads) : null
  const ctr = totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10_000) / 100 : null
  const candidate = items
    .filter(campaign => (campaign.latest.costPerLeadCents ?? 0) > 0)
    .sort((a, b) => (b.latest.costPerLeadCents ?? 0) - (a.latest.costPerLeadCents ?? 0))[0] ?? null

  return {
    campaigns: items,
    series,
    summary: {
      activeCampaigns: items.filter(campaign => campaign.crmStatus === 'active').length,
      spendCents: totals.spendCents,
      leads: totals.leads,
      meetings: totals.meetings,
      costPerLeadCents: weightedCplCents,
      ctr,
    },
    account: account ? { ...account, connected: true } : { connected: false },
    recommendation: candidate ? {
      campaignId: candidate.id,
      campaignName: candidate.name,
      title: `Proteger el CPL de ${candidate.name}`,
      detail: `Define un límite de ${Math.round((candidate.latest.costPerLeadCents ?? 0) * 1.1)} céntimos para que el optimizador pueda detectar desvíos.`,
      maxCostPerLeadCents: Math.round((candidate.latest.costPerLeadCents ?? 0) * 1.1),
    } : null,
  }
}
