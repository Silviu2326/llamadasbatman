import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { ingestLead } from '../services/leadIngestion.service'

interface LandingAssets {
  offer?: string
  leadMagnet?: string
  adCopy?: string
}

export async function getLanding(
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug },
    select: {
      id: true,
      orgId: true,
      name: true,
      landingSlug: true,
      adAssets: true,
    },
  })
  if (!campaign) return reply.status(404).send({ error: 'Landing no encontrada' })

  const assets = (campaign.adAssets ?? {}) as LandingAssets
  return reply.send({
    campaignId: campaign.id,
    name: campaign.name,
    offer: assets.offer ?? '',
    leadMagnet: assets.leadMagnet ?? '',
    adCopy: assets.adCopy ?? '',
  })
}

export async function submitLead(
  request: FastifyRequest<{
    Params: { slug: string }
    Body: { name?: string; phone?: string; email?: string }
  }>,
  reply: FastifyReply
) {
  const { name, phone, email } = request.body
  if (!name || !phone) {
    return reply.status(400).send({ error: 'Nombre y teléfono son requeridos' })
  }

  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug },
    select: { id: true, orgId: true },
  })
  if (!campaign) return reply.status(404).send({ error: 'Landing no encontrada' })

  const externalLeadId = `landing-${campaign.id}-${Date.now()}`
  await ingestLead(campaign.orgId, {
    name,
    phone,
    email,
    campaignId: campaign.id,
    source: 'landing_ads',
    externalLeadId,
  })

  return reply.status(201).send({ ok: true, message: 'Te llamamos en breve' })
}
