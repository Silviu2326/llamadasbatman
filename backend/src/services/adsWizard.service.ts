import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { findByVertical } from './adPlaybook.service'
import { generateFallbackAssets } from './assetGenerator.service'
import { classifyPublishError, publishCampaign } from './metaCampaignBuilder.service'
import { createActivation } from './adPlan.service'
import { createAudience } from './adAudience.service'

/**
 * El asistente y /captacion/atraer/ads hablan del mismo objeto: la activación
 * Meta (objetivo y presupuesto del brief) y la audiencia escrita se persisten
 * como filas del plan, que es lo que publishCampaign y la página de Ads leen.
 * Idempotente: si la campaña ya tiene activación meta o una audiencia con ese
 * nombre, no se duplican (un reintento del asistente no puede crear dos).
 */
export async function materializeWizardPlan(orgId: string, campaignId: string, input: {
  objetivo: string
  presupuestoMensual: number
  audience?: string
}) {
  const existingActivation = await prisma.adActivation.findFirst({
    where: { orgId, campaignId, platform: 'meta' },
    select: { id: true },
  })
  let activationId = existingActivation?.id ?? null
  if (!activationId) {
    const created = await createActivation(orgId, {
      campaignId,
      platform: 'meta',
      objective: input.objetivo.trim() || null,
      budgetCents: Math.round(input.presupuestoMensual * 100),
    })
    activationId = created?.id ?? null
  }

  let audienceId: string | null = null
  const audienceName = input.audience?.trim().slice(0, 140) ?? ''
  if (audienceName) {
    const existingAudience = await prisma.adAudience.findFirst({
      where: { orgId, campaignId, name: audienceName, archivedAt: null },
      select: { id: true },
    })
    audienceId = existingAudience?.id ?? null
    if (!audienceId) {
      const created = await createAudience(orgId, {
        name: audienceName,
        campaignId,
        segment: audienceName,
        dataSource: 'wizard',
      })
      audienceId = created?.id ?? null
    }
  }

  return { activationId, audienceId }
}

export async function runWizard(orgId: string, input: {
  vertical: string
  objetivo: string
  presupuestoMensual: number
  audience?: string
  campaignFocus: string
  destination: 'landing' | 'website' | 'whatsapp' | 'calendar' | 'app'
  knowledgeContext?: { id: string; name: string; type?: string; content: string } | null
  strategy?: Record<string, unknown>
  // Margen por venta y porcentaje admisible para adquisicion. De aqui salen
  // el CAC, el CPQL y el CPL objetivo (ads.md 9). Sin margen la pagina solo
  // puede comparar campanas entre si, nunca contra lo que el negocio aguanta.
  marginPerSaleCents?: number
  acquisitionSharePct?: number
  // Variante de anuncio elegida en el asistente. Se guarda en adAssets.creative
  // y publishCampaign la usa como copy si la campaña aún no tiene creatividades
  // aprobadas en el plan.
  creative?: { label: string; title: string; body: string; cta: string }
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
    : { ...(await generateFallbackAssets({ ...input, orgId })), source: 'generated' as const }

  const adAssets = {
    ...assets,
    presupuestoMensual: input.presupuestoMensual,
    ...(input.audience?.trim() ? { audience: input.audience.trim() } : {}),
    ...(input.strategy ? { strategy: input.strategy } : {}),
    campaignFocus: input.campaignFocus.trim(),
    destination: input.destination,
    ...(input.knowledgeContext ? { knowledgeContext: input.knowledgeContext } : {}),
    ...(input.creative ? { creative: input.creative } : {}),
  } as Prisma.InputJsonValue

  const campaign = await prisma.campaign.create({
    data: {
      orgId,
      name: `${input.campaignFocus} — ${input.objetivo}`,
      objective: input.objetivo,
      adPlaybookId: playbook?.id,
      adAssets,
      adStatus: 'draft',
      budgetCents: Math.round(input.presupuestoMensual * 100),
      marginPerSaleCents: input.marginPerSaleCents ?? null,
      acquisitionSharePct: input.acquisitionSharePct ?? null,
      // Conservamos una URL de seguimiento incluso si el destino final será
      // WhatsApp, calendario, web o app: el editor del anuncio resuelve ese
      // enlace antes de publicar y Meta siempre recibe una URL válida.
      landingSlug: `${input.vertical}-${randomUUID().slice(0, 8)}`,
      status: 'draft',
    },
  })

  // Activación Meta y audiencia como filas del plan antes de publicar, para
  // que publishCampaign lea exactamente lo que el asistente definió.
  await materializeWizardPlan(orgId, campaign.id, input)

  // Si ya hay una cuenta de Meta conectada, se intenta publicar en PAUSED. Si
  // no hay cuenta o Meta falla, la campaña queda en draft y la respuesta dice
  // por qué (published/publishError): el asistente lo enseña en vez de
  // dejarlo solo en el log.
  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  let published = false
  let publishError: { code: string; message: string } | null = null
  if (metaAccount) {
    try {
      await publishCampaign(orgId, campaign.id)
      published = true
    } catch (err) {
      const classified = classifyPublishError(err)
      publishError = { code: classified.code, message: classified.message }
      console.error(`[AdsWizard] no se pudo publicar la campaña ${campaign.id} en Meta:`, classified.code)
    }
  } else {
    publishError = { code: 'META_NOT_CONNECTED', message: 'No hay cuenta de Meta conectada: la campaña queda en borrador.' }
  }

  const saved = await prisma.campaign.findFirst({ where: { id: campaign.id, orgId } })
  return { ...saved, published, publishError }
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
