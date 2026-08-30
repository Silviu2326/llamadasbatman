import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { enqueueAdReviewPoll } from '../jobs/adReviewPoll'
import { emitOutcome } from './outcomes.service'
import { checkAssetsConsentForPublication } from './consent.service'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

async function graphPost(path: string, token: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH_URL}${path}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Graph API ${path} failed: ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}

async function graphGet(path: string, token: string, fields: string) {
  const params = new URLSearchParams({ fields, access_token: token })
  const res = await fetch(`${GRAPH_URL}${path}?${params.toString()}`)
  if (!res.ok) throw new Error(`Graph API ${path} failed: ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Record<string, unknown>>
}

interface CampaignAdAssets {
  offer: string
  adCopy: string
  landingTemplateId: string
  imagePrompt: string
  imageUrl?: string
  imageAssetId?: string
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
  const publicBaseUrl = process.env.APP_URL
  if (!publicBaseUrl) throw new Error('APP_URL pública no configurada')
  const parsedPublicUrl = new URL(publicBaseUrl)
  if (['localhost', '127.0.0.1', '::1'].includes(parsedPublicUrl.hostname)) {
    throw new Error('APP_URL debe ser una URL pública antes de publicar en Meta')
  }
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new Error('Campaign not found')

  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!metaAccount) throw new Error('No hay cuenta de Meta conectada para esta organización')

  if (!metaAccount.metaPageId) {
    throw new Error('La cuenta de Meta no tiene una página conectada para crear el anuncio')
  }

  const token = await getDecryptedToken(orgId)
  if (!token) throw new Error('Token de Meta no disponible')

  const assets = campaign.adAssets as unknown as CampaignAdAssets | null
  if (!assets) throw new Error('Campaign sin assets resueltos — corré el wizard primero')
  if (assets.imageAssetId) {
    const consent = await checkAssetsConsentForPublication({ orgId, assetIds: [assets.imageAssetId], channels: ['meta'] })
    if (!consent.valid) {
      throw Object.assign(
        new Error(`No se puede publicar la creatividad: ${consent.reason ?? 'consentimiento no válido'}`),
        { code: 'ASSET_CONSENT_INVALID', assetId: consent.assetId },
      )
    }
  }

  const adAccountId = metaAccount.metaAdAccountId

  // Hacer la operación idempotente evita duplicar campañas si el navegador
  // reintenta la petición después de un timeout.
  if (campaign.metaCampaignId && campaign.metaAdSetId && campaign.metaAdId) {
    return {
      metaCampaignId: campaign.metaCampaignId,
      metaAdSetId: campaign.metaAdSetId,
      metaAdId: campaign.metaAdId,
    }
  }

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

  const landingUrl = new URL(`/l/${campaign.landingSlug}`, parsedPublicUrl).toString()
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

  // North star (09 §5): campaña activada en Meta = 'campaign_published'. Nunca lanza.
  await emitOutcome({ orgId, kind: 'campaign_published', sourceRef: { campaignId, metaCampaignId: campaign.metaCampaignId } })

  await enqueueAdReviewPoll(orgId, campaignId)
}

export async function pauseCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.metaCampaignId && !campaign.metaAdSetId && !campaign.metaAdId) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused', adStatus: 'paused' } })
    return { ok: true, remote: false }
  }

  const token = await getDecryptedToken(orgId)
  if (!token) throw new Error('Token de Meta no disponible')

  // Pausar los tres niveles deja la intención explícita y permite reactivar
  // desde el mismo panel aunque Meta conserve el estado de los hijos.
  for (const id of [campaign.metaAdId, campaign.metaAdSetId, campaign.metaCampaignId]) {
    if (id) await graphPost(`/${id}`, token, { status: 'PAUSED' })
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'paused', adStatus: 'paused' },
  })
  return { ok: true, remote: true }
}

export async function getRemoteStatus(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { id: true, metaCampaignId: true, metaAdSetId: true, metaAdId: true },
  })
  if (!campaign) throw new Error('Campaign not found')
  const token = await getDecryptedToken(orgId)
  if (!token) throw new Error('Token de Meta no disponible')

  const [remoteCampaign, remoteAdSet, remoteAd] = await Promise.all([
    campaign.metaCampaignId ? graphGet(`/${campaign.metaCampaignId}`, token, 'status,effective_status') : null,
    campaign.metaAdSetId ? graphGet(`/${campaign.metaAdSetId}`, token, 'status,effective_status') : null,
    campaign.metaAdId ? graphGet(`/${campaign.metaAdId}`, token, 'status,effective_status') : null,
  ])

  const effectiveStatus = String(remoteAd?.effective_status ?? remoteCampaign?.effective_status ?? 'UNKNOWN').toLowerCase()
  const adStatus = effectiveStatus === 'active'
    ? 'active'
    : effectiveStatus === 'paused'
      ? 'paused'
      : effectiveStatus === 'disapproved'
        ? 'disapproved'
        : 'pending_review'

  await prisma.campaign.update({ where: { id: campaignId }, data: { adStatus } })
  return {
    campaign: remoteCampaign,
    adSet: remoteAdSet,
    ad: remoteAd,
    adStatus,
  }
}
