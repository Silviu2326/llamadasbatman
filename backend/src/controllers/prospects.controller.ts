import { FastifyRequest, FastifyReply } from 'fastify'
import { searchProspects, ProspectingUnavailable, Prospect } from '../services/prospecting.service'
import { createLead, getExistingProspectKeys, auditLead } from '../services/leads.service'
import { enrichFromWebsite } from '../services/digitalAudit.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function search(
  request: FastifyRequest<{ Body: { sector: string; city: string; country?: string } }>,
  reply: FastifyReply
) {
  const { sector, city, country } = request.body
  if (!sector || !city) {
    return reply.status(400).send({ error: 'sector y city son obligatorios' })
  }
  try {
    const prospects = await searchProspects({ sector, city, country })
    return reply.send({ data: prospects })
  } catch (err) {
    if (err instanceof ProspectingUnavailable) {
      // Falta de configuración ≠ proveedor caído: 409 es accionable (hay que
      // conectar Google Places) y 503 se reserva para el fallo real de Places.
      const status = err.code === 'PROSPECTING_NOT_CONFIGURED' ? 409 : 503
      return reply.status(status).send({ error: err.message, code: err.code })
    }
    throw err
  }
}

export async function importProspects(
  request: FastifyRequest<{
    Body: {
      campaignId: string
      sector?: string
      city?: string
      enrich?: boolean
      autoAudit?: boolean
      autoCall?: boolean
      items: Prospect[]
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const { campaignId, sector, city, enrich, autoAudit, autoCall, items } = request.body
  const normalizedCampaignId = campaignId?.trim()

  if (!normalizedCampaignId) {
    return reply.status(400).send({
      error: 'Selecciona una campaña antes de importar prospectos',
      code: 'CAMPAIGN_REQUIRED',
    })
  }

  if (!Array.isArray(items) || !items.length) {
    return reply.status(400).send({ error: 'items es obligatorio' })
  }

  // La campaña es la frontera de atribución del flujo outbound. Se valida
  // antes de enriquecer o crear leads para evitar importaciones parciales y
  // referencias a campañas de otra organización.
  const campaign = await prisma.campaign.findFirst({
    where: { id: normalizedCampaignId, orgId },
    select: { id: true, settings: true },
  })
  if (!campaign) {
    return reply.status(404).send({
      error: 'La campaña seleccionada no existe o no pertenece a tu organización',
      code: 'CAMPAIGN_NOT_FOUND',
    })
  }

  // Importación incremental: nunca duplicar un prospecto ya importado antes
  // (mismo placeId o mismo teléfono) en esta organización.
  const { placeIds, phones } = await getExistingProspectKeys(orgId)
  const newItems = items.filter((item) => !placeIds.has(item.placeId) && !(item.phone && phones.has(item.phone)))
  const skipped = items.length - newItems.length

  const created = []
  for (const item of newItems) {
    let extra: { email?: string | null; socials?: Record<string, string>; tech?: unknown } = {}
    if (enrich && item.website) {
      const enriched = await enrichFromWebsite(item.website).catch(() => null)
      if (enriched) extra = enriched
    }

    const lead = await createLead(orgId, userId, {
      name: item.name,
      phone: item.phone ?? undefined,
      email: extra.email ?? undefined,
      company: item.name,
      campaignId: campaign.id,
      source: 'prospecting',
      customFields: {
        website: item.website,
        address: item.address,
        rating: item.rating,
        userRatingCount: item.userRatingCount,
        photosCount: item.photosCount,
        mapsUri: item.mapsUri,
        placeId: item.placeId,
        sector,
        city,
        socials: extra.socials,
        tech: extra.tech,
      },
    })

    await prisma.acquisitionEvent.upsert({
      where: {
        orgId_type_externalKey: {
          orgId,
          type: 'prospect_import',
          externalKey: item.placeId,
        },
      },
      create: {
        orgId,
        campaignId: campaign.id,
        leadId: lead.id,
        type: 'prospect_import',
        source: 'prospecting',
        externalKey: item.placeId,
        metadata: { sector, city, mapsUri: item.mapsUri } as any,
      },
      update: {
        campaignId: campaign.id,
        leadId: lead.id,
        source: 'prospecting',
      },
    })

    if (autoAudit && item.website) {
      await auditLead(orgId, lead.id, { website: item.website, sector, city }).catch(() => null)
    }
    if (autoCall) {
      await enqueueLeadCall(orgId, lead.id)
    }

    created.push(lead)
  }

  if (created.length) {
    const campaignSettings = campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)
      ? campaign.settings as Record<string, unknown>
      : {}
    const previousChannels = Array.isArray(campaignSettings.captureChannels)
      ? campaignSettings.captureChannels.filter((value): value is string => typeof value === 'string')
      : []
    await prisma.campaign.updateMany({
      where: { id: campaign.id, orgId },
      data: {
        settings: {
          ...campaignSettings,
          captureChannels: [...new Set([...previousChannels, 'outbound_prospecting'])],
        } as any,
      },
    })
  }

  return reply.send({ imported: created.length, skipped })
}
