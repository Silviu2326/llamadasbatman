import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'

interface InsightsRow {
  spend?: string
  impressions?: string
  clicks?: string
  actions?: Array<{ action_type: string; value: string }>
}

/**
 * Pull de /insights del día en curso (date_preset=today) para el ad set de la
 * campaña — cada snapshot representa "gasto acumulado hoy a esta hora", que es
 * lo que necesita el kill switch diario del optimizer. No usamos ventanas de
 * varios días para esto.
 */
export async function fetchAndStoreInsights(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign?.metaAdSetId) return null

  const token = await getDecryptedToken(orgId)
  if (!token) return null

  const fields = 'spend,impressions,clicks,actions'
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${campaign.metaAdSetId}/insights?date_preset=today&fields=${fields}&access_token=${token}`
  )
  if (!res.ok) {
    console.warn(`[MetaInsights] error ${res.status} para ad set ${campaign.metaAdSetId}`)
    return null
  }
  const data = (await res.json()) as { data: InsightsRow[] }
  const row = data.data[0]
  if (!row) return null

  const spendCents = Math.round(parseFloat(row.spend ?? '0') * 100)
  const impressions = parseInt(row.impressions ?? '0', 10)
  const clicks = parseInt(row.clicks ?? '0', 10)
  const leadsCount = parseInt(row.actions?.find((a) => a.action_type === 'lead')?.value ?? '0', 10)
  const costPerLeadCents = leadsCount > 0 ? Math.round(spendCents / leadsCount) : null

  return prisma.adInsightSnapshot.create({
    data: {
      orgId,
      campaignId,
      metaAdSetId: campaign.metaAdSetId,
      spendCents,
      impressions,
      clicks,
      leadsCount,
      costPerLeadCents,
    },
  })
}

export async function listInsights(orgId: string, campaignId: string) {
  return prisma.adInsightSnapshot.findMany({
    where: { orgId, campaignId },
    orderBy: { capturedAt: 'asc' },
  })
}
