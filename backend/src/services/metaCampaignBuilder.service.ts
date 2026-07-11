import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { enqueueAdReviewPoll } from '../jobs/adReviewPoll'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

async function graphPost(path: string, token: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH_URL}${path}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Graph API ${path} failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}

interface CampaignAdAssets {
  offer: string
  adCopy: string
  landingTemplateId: string
  imagePrompt: string
  imageUrl?: string
  presupuestoMensual: number
}

/**
 * Arma Campaign → Ad Set → Ad Creative → Ad en Meta, todo en PAUSED. No queda
 * gastando nada hasta que se llame `activateCampaign`.
 *
 * ponytail: el anuncio apunta a la landing propia (link ad simple), no crea
 * un Lead Form nativo de Meta (`/{page_id}/leadgen_forms`) — eso requiere una
 * Página real conectada para poder probarse. Es el próximo paso cuando haya
 * una cuenta de Meta de prueba disponible.
 */
export async function publishCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new Error('Campaign not found')

  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!metaAccount) throw new Error('No hay cuenta de Meta conectada para esta organización')

  const token = await getDecryptedToken(orgId)
  if (!token) throw new Error('Token de Meta no disponible')

  const assets = campaign.adAssets as unknown as CampaignAdAssets | null
  if (!assets) throw new Error('Campaign sin assets resueltos — corré el wizard primero')

  const adAccountId = metaAccount.metaAdAccountId

  const metaCampaign = await graphPost(`/${adAccountId}/campaigns`, token, {
    name: campaign.name,
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: [],
  })

  const dailyBudgetCents = Math.max(100, Math.round((assets.presupuestoMensual * 100) / 30))
  const metaAdSet = await graphPost(`/${adAccountId}/adsets`, token, {
    name: `${campaign.name} — ad set`,
    campaign_id: metaCampaign.id,
    daily_budget: dailyBudgetCents,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LEAD_GENERATION',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: { geo_locations: { countries: ['ES'] } },
    status: 'PAUSED',
  })

  const landingUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/l/${campaign.landingSlug}`
  const linkData: Record<string, unknown> = {
    message: assets.adCopy,
    link: landingUrl,
    call_to_action: { type: 'LEARN_MORE' },
  }
  if (assets.imageUrl) linkData.picture = assets.imageUrl

  const creative = await graphPost(`/${adAccountId}/adcreatives`, token, {
    name: `${campaign.name} — creative`,
    object_story_spec: {
      page_id: metaAccount.metaPageId,
      link_data: linkData,
    },
  })

  const ad = await graphPost(`/${adAccountId}/ads`, token, {
    name: campaign.name,
    adset_id: metaAdSet.id,
    creative: { creative_id: creative.id },
    status: 'PAUSED',
  })

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      metaCampaignId: metaCampaign.id,
      metaAdSetId: metaAdSet.id,
      metaAdId: ad.id,
      adStatus: 'draft',
    },
  })

  return { metaCampaignId: metaCampaign.id, metaAdSetId: metaAdSet.id, metaAdId: ad.id }
}

export async function activateCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign?.metaCampaignId || !campaign.metaAdSetId || !campaign.metaAdId) {
    throw new Error('Campaign no publicada en Meta todavía')
  }
  const token = await getDecryptedToken(orgId)
  if (!token) throw new Error('Token de Meta no disponible')

  await graphPost(`/${campaign.metaCampaignId}`, token, { status: 'ACTIVE' })
  await graphPost(`/${campaign.metaAdSetId}`, token, { status: 'ACTIVE' })
  await graphPost(`/${campaign.metaAdId}`, token, { status: 'ACTIVE' })

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { adStatus: 'pending_review', status: 'active' },
  })

  await enqueueAdReviewPoll(orgId, campaignId)
}
