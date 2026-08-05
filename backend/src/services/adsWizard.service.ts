import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { findByVertical } from './adPlaybook.service'
import { generateFallbackAssets } from './assetGenerator.service'
import { publishCampaign } from './metaCampaignBuilder.service'

export async function runWizard(orgId: string, input: {
  vertical: string
  objetivo: string
  presupuestoMensual: number
  audience?: string
  strategy?: Record<string, unknown>
  // Margen por venta y porcentaje admisible para adquisicion. De aqui salen
  // el CAC, el CPQL y el CPL objetivo (ads.md 9). Sin margen la pagina solo
  // puede comparar campanas entre si, nunca contra lo que el negocio aguanta.
  marginPerSaleCents?: number
  acquisitionSharePct?: number
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

  const adAssets = {
    ...assets,
    presupuestoMensual: input.presupuestoMensual,
    ...(input.audience?.trim() ? { audience: input.audience.trim() } : {}),
    ...(input.strategy ? { strategy: input.strategy } : {}),
  } as Prisma.InputJsonValue

  const campaign = await prisma.campaign.create({
    data: {
      orgId,
      name: `${input.vertical} — ${input.objetivo}`,
      objective: input.objetivo,
      adPlaybookId: playbook?.id,
      adAssets,
      adStatus: 'draft',
      budgetCents: Math.round(input.presupuestoMensual * 100),
      marginPerSaleCents: input.marginPerSaleCents ?? null,
      acquisitionSharePct: input.acquisitionSharePct ?? null,
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
    } catch (err) {
      console.error(`[AdsWizard] no se pudo publicar la campaña ${campaign.id} en Meta:`, err)
    }
  }

  return prisma.campaign.findFirst({ where: { id: campaign.id, orgId } })
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
      metaAdSetId: true,
      metaAdId: true,
      totalLeads: true,
      meetingsScheduled: true,
      maxCostPerLeadCents: true,
    },
  })
  return campaign
}
