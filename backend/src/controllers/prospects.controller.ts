import { FastifyRequest, FastifyReply } from 'fastify'
import { searchProspects, ProspectingUnavailable, Prospect } from '../services/prospecting.service'
import { createLead, getExistingProspectKeys, auditLead } from '../services/leads.service'
import { enrichFromWebsite } from '../services/digitalAudit.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'

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
      return reply.status(503).send({ error: err.message })
    }
    throw err
  }
}

export async function importProspects(
  request: FastifyRequest<{
    Body: {
      campaignId?: string
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
  const { orgId } = request.user as JWTUser
  const { campaignId, sector, city, enrich, autoAudit, autoCall, items } = request.body
  if (!Array.isArray(items) || !items.length) {
    return reply.status(400).send({ error: 'items es obligatorio' })
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

    const lead = await createLead(orgId, {
      name: item.name,
      phone: item.phone ?? undefined,
      email: extra.email ?? undefined,
      company: item.name,
      campaignId,
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

    if (autoAudit && item.website) {
      await auditLead(orgId, lead.id, { website: item.website, sector, city }).catch(() => null)
    }
    if (autoCall) {
      await enqueueLeadCall(orgId, lead.id)
    }

    created.push(lead)
  }

  return reply.send({ imported: created.length, skipped })
}
