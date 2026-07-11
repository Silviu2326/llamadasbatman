import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { findByVertical } from './adPlaybook.service'
import { generateFallbackAssets } from './assetGenerator.service'
import { publishCampaign, activateCampaign } from './metaCampaignBuilder.service'

export async function runWizard(orgId: string, input: {
  vertical: string
  objetivo: string
  presupuestoMensual: number
}) {
  const playbook = await findByVertical(input.vertical)

  const assets = playbook
    ? {
        offer: playbook.offer,
        leadMagnet: playbook.leadMagnet,
        adCopy: playbook.adCopy,
        landingTemplateId: playbook.landingTemplateId,
        imagePrompt: playbook.imagePrompt,
        source: 'playbook' as const,
      }
    : { ...(await generateFallbackAssets(input)), source: 'generated' as const }

  const campaign = await prisma.campaign.create({
    data: {
      orgId,
      name: `${input.vertical} — ${input.objetivo}`,
      objective: input.objetivo,
      adPlaybookId: playbook?.id,
      adAssets: { ...assets, presupuestoMensual: input.presupuestoMensual },
      adStatus: 'draft',
      landingSlug: `${input.vertical}-${randomUUID().slice(0, 8)}`,
      status: 'draft',
    },
  })

  // Si ya hay una cuenta de Meta conectada, seguimos automático: publicar y
  // activar. Si no hay cuenta conectada (o Meta falla), la campaña queda en
  // draft — el cliente la puede publicar después desde el detalle de campaña.
  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (metaAccount) {
    try {
      await publishCampaign(orgId, campaign.id)
      await activateCampaign(orgId, campaign.id)
    } catch (err) {
      console.error(`[AdsWizard] no se pudo publicar la campaña ${campaign.id} en Meta:`, err)
    }
  }

  return campaign
}

export async function getCampaignAdStatus(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: {
      id: true,
      name: true,
      adStatus: true,
      adAssets: true,
      landingSlug: true,
      metaCampaignId: true,
      totalLeads: true,
      meetingsScheduled: true,
      maxCostPerLeadCents: true,
    },
  })
  return campaign
}
