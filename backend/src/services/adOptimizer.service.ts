import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'

async function pauseInMeta(orgId: string, campaignId: string, metaAdSetId: string, reason: string) {
  const token = await getDecryptedToken(orgId)
  if (token) {
    try {
      await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${metaAdSetId}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED' }),
      })
    } catch (err) {
      console.error(`[AdOptimizer] no se pudo pausar en Meta ${metaAdSetId}:`, err)
    }
  }
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'paused', adStatus: `paused_${reason}` },
  })
  console.log(`[AdOptimizer] campaign ${campaignId} pausada — motivo: ${reason}`)
}

/**
 * Reglas de META_ADS_AUTOMATION.md que aplican con la forma actual del
 * campaign builder (1 ad set por campaña): kill switch por gasto diario y
 * pausar por CPL alto. Las reglas de "reasignar presupuesto entre ad sets" y
 * "rotar creative por fatiga" quedan afuera — no aplican todavía porque el
 * builder de esta fase crea un solo ad set y un solo creative por campaña.
 */
export async function evaluateCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign?.metaAdSetId || campaign.status !== 'active') return

  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!metaAccount) return

  const latestSnapshot = await prisma.adInsightSnapshot.findFirst({
    where: { campaignId },
    orderBy: { capturedAt: 'desc' },
  })
  if (!latestSnapshot) return

  if (metaAccount.dailyBudgetCapCents && latestSnapshot.spendCents >= metaAccount.dailyBudgetCapCents) {
    await pauseInMeta(orgId, campaignId, campaign.metaAdSetId, 'daily_budget_cap')
    return
  }

  if (
    campaign.maxCostPerLeadCents &&
    latestSnapshot.costPerLeadCents &&
    latestSnapshot.costPerLeadCents > campaign.maxCostPerLeadCents
  ) {
    await pauseInMeta(orgId, campaignId, campaign.metaAdSetId, 'high_cpl')
  }
}
