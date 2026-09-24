import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { searchProspects, ProspectingUnavailable, Prospect, stateFromAddress } from '../services/prospecting.service'
import { createLead, getExistingProspectKeys, auditLead, InvalidPhoneError, LeadDuplicateError } from '../services/leads.service'
import { normalizeE164 } from '../voice/compliance'
import { enrichFromWebsite } from '../services/digitalAudit.service'
import { enqueueCampaignLeadCall } from '../services/leadCallGate'
import { sendOutboundEmail } from '../services/outboundEmail.service'
import { enrollSalesSequence } from '../services/salesSequence.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const optionalText = (max: number) => z.string().trim().max(max).nullish()

export const searchSchema = z.object({
  sector: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(160),
  country: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
})

// Los ítems vienen del navegador, no de Places directamente: se acotan antes
// de tocar la base (un placeId sin sentido o un nombre de 10 KB no importan).
export const importItemSchema = z.object({
  placeId: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(40),
  website: optionalText(500),
  address: optionalText(300),
  rating: z.number().nullish(),
  userRatingCount: z.number().nullish(),
  mapsUri: optionalText(500),
  photosCount: z.number().nullish(),
  quickScore: z.number().optional(),
}).passthrough()

export const importSchema = z.object({
  campaignId: z.string().trim().min(1).max(64),
  sector: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  state: z.string().trim().max(8).optional(),
  enrich: z.boolean().optional(),
  autoAudit: z.boolean().optional(),
  autoCall: z.boolean().optional(),
  autoEmail: z.boolean().optional(),
  sequenceId: z.string().trim().min(1).max(64).optional(),
  items: z.array(importItemSchema).min(1).max(100),
})

export type CallsSkippedReason = 'campaign_not_active' | 'agent_not_published'

export async function search(
  request: FastifyRequest<{ Body: { sector: string; city: string; country?: string; limit?: number } }>,
  reply: FastifyReply
) {
  const parsed = searchSchema.safeParse(request.body ?? {})
  if (!parsed.success) {
    return reply.status(400).send({ error: 'sector y city son obligatorios (2-160 caracteres); limit entre 1 y 20', code: 'VALIDATION_ERROR', issues: parsed.error.issues })
  }
  const { sector, city, country, limit } = parsed.data
  try {
    const prospects = await searchProspects({ sector, city, country, limit })
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
      /**
       * Estado de EE. UU. (código de dos letras). Si no llega, se deduce de la
       * dirección de Places. Sin él no hay zona horaria y `canCall` no marca.
       */
      state?: string
      enrich?: boolean
      autoAudit?: boolean
      autoCall?: boolean
      /** Escribe el email frío con los hallazgos de la auditoría. */
      autoEmail?: boolean
      /** Matricula el prospecto en esta secuencia en lugar de escribir suelto. */
      sequenceId?: string
      items: Prospect[]
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsedBody = importSchema.safeParse(request.body ?? {})
  if (!parsedBody.success) {
    const missingCampaign = parsedBody.error.issues.some((issue) => issue.path[0] === 'campaignId')
    if (missingCampaign) {
      return reply.status(400).send({ error: 'Selecciona una campaña antes de importar prospectos', code: 'CAMPAIGN_REQUIRED' })
    }
    return reply.status(400).send({ error: 'items es obligatorio (entre 1 y 100 prospectos con nombre)', code: 'VALIDATION_ERROR', issues: parsedBody.error.issues })
  }
  const { campaignId, sector, city, state, enrich, autoAudit, autoCall, autoEmail, sequenceId } = parsedBody.data
  const items = parsedBody.data.items as unknown as Prospect[]
  // El estado del formulario manda sobre el deducido; la deducción es el
  // respaldo para las importaciones que no lo envían.
  const requestedState = typeof state === 'string' ? state.trim().toUpperCase() || null : null
  const normalizedCampaignId = campaignId?.trim()

  if (!normalizedCampaignId) {
    return reply.status(400).send({
      error: 'Selecciona una campaña antes de importar prospectos',
      code: 'CAMPAIGN_REQUIRED',
    })
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
  // (mismo placeId o mismo teléfono) en esta organización. El teléfono se
  // compara ya en E.164: los leads se guardan normalizados y Places devuelve
  // «+34 912 34 56 78», que sin normalizar nunca coincidiría.
  const { placeIds, phones } = await getExistingProspectKeys(orgId)
  const duplicates: Array<{ name: string; matchedBy: 'placeId' | 'phone' | 'email' }> = []
  const invalid: Array<{ name: string; phone: string }> = []
  const seenPhones = new Set<string>()
  const newItems: Array<Prospect & { normalizedPhone: string | null }> = []
  for (const item of items) {
    const name = item.name || item.placeId || ''
    const normalizedPhone = item.phone ? normalizeE164(item.phone) : null
    if (item.placeId && placeIds.has(item.placeId)) { duplicates.push({ name, matchedBy: 'placeId' }); continue }
    if (normalizedPhone && (phones.has(normalizedPhone) || seenPhones.has(normalizedPhone))) { duplicates.push({ name, matchedBy: 'phone' }); continue }
    if (normalizedPhone) seenPhones.add(normalizedPhone)
    newItems.push({ ...item, normalizedPhone })
  }

  const created = []
  let emailed = 0
  let callsQueued = 0
  let callsSkippedCount = 0
  let callsSkippedReason: CallsSkippedReason | null = null
  const emailFailures: Array<{ lead: string; reason: string; code: string }> = []
  const enrolledLeadIds: string[] = []
  const emailLeadIds: Array<{ id: string; name: string }> = []
  for (const item of newItems) {
    const itemName = item.name?.trim() || item.placeId || 'Prospecto'
    // Sin placeId (importaciones manuales) la clave del evento es el teléfono
    // normalizado o el nombre: sigue siendo idempotente por organización.
    const externalKey = item.placeId || item.normalizedPhone || `name:${itemName.toLowerCase()}`
    let extra: { email?: string | null; socials?: Record<string, string>; tech?: unknown } = {}
    if (enrich && item.website) {
      const enriched = await enrichFromWebsite(item.website).catch(() => null)
      if (enriched) extra = enriched
    }

    let lead: Awaited<ReturnType<typeof createLead>>
    try {
      lead = await createLead(orgId, userId, {
      name: itemName,
      phone: item.normalizedPhone ?? item.phone ?? undefined,
      email: extra.email ?? undefined,
      company: itemName,
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
        // Lo lee `leadEnrichment` para calcular la zona horaria del lead. Sin
        // esto, `canCall` rechaza cada llamada con `outside_hours` en silencio.
        state: requestedState ?? stateFromAddress(item.address),
        socials: extra.socials,
        tech: extra.tech,
      },
      }, { strict: true })
    } catch (leadError) {
      // Un prospecto inválido o repetido no rompe la importación: se cuenta
      // por nombre y motivo para que la UI lo muestre.
      if (leadError instanceof InvalidPhoneError) { invalid.push({ name: itemName, phone: leadError.phone }); continue }
      if (leadError instanceof LeadDuplicateError) { duplicates.push({ name: itemName, matchedBy: leadError.matchedBy }); continue }
      throw leadError
    }

    await prisma.acquisitionEvent.upsert({
      where: {
        orgId_type_externalKey: {
          orgId,
          type: 'prospect_import',
          externalKey,
        },
      },
      create: {
        orgId,
        campaignId: campaign.id,
        leadId: lead.id,
        type: 'prospect_import',
        source: 'prospecting',
        externalKey,
        metadata: { sector, city, mapsUri: item.mapsUri } as any,
      },
      update: {
        campaignId: campaign.id,
        leadId: lead.id,
        source: 'prospecting',
      },
    })

    // El orden importa: primero auditar, porque el email frío se escribe con
    // los hallazgos y sin auditoría no hay nada que contar.
    if (autoAudit && item.website) {
      await auditLead(orgId, lead.id, { website: item.website, sector, city }).catch(() => null)
    }
    if (autoCall) {
      // Misma puerta y clave que la importación: solo campaña activa con
      // agente publicado, un único trabajo por lead y campaña. Cuando la
      // puerta no abre se devuelve el motivo: «activé la llamada y no pasó
      // nada» era la queja más repetida de esta pantalla.
      const queued = await enqueueCampaignLeadCall(orgId, lead.id)
      if (queued) callsQueued++
      else {
        callsSkippedCount++
        callsSkippedReason ??= await callsSkippedReasonFor(orgId, campaign.id)
      }
    }
    if (autoEmail && !sequenceId) emailLeadIds.push({ id: lead.id, name: lead.name })
    if (sequenceId) {
      enrolledLeadIds.push(lead.id)
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

  // Los emails salen fuera del bucle de creación y de cuatro en cuatro. Cada
  // uno arrastra la cadena de investigación —hasta cinco descargas y varias
  // llamadas al modelo—, así que en serie una importación de veinte prospectos
  // dejaría la petición HTTP colgada varios minutos.
  // ponytail: 4 en paralelo y el cliente espera. Si esto crece, el envío se
  // encola como las llamadas y la importación devuelve al momento.
  const EMAIL_CONCURRENCY = 4
  for (let index = 0; index < emailLeadIds.length; index += EMAIL_CONCURRENCY) {
    await Promise.all(emailLeadIds.slice(index, index + EMAIL_CONCURRENCY).map(target =>
      sendOutboundEmail(orgId, target.id, { actorUserId: userId })
        .then(() => { emailed++ })
        // Un fallo por lead no rompe la importación: se cuenta con su motivo.
        .catch((error: Error & { code?: string }) => { emailFailures.push({ lead: target.name, reason: error.message, code: error.code ?? 'ERROR' }) })
    ))
  }

  // La secuencia se matricula al final y de una vez: un solo recorrido de
  // consentimiento y un solo informe de cuántos quedaron bloqueados.
  let enrollment: Awaited<ReturnType<typeof enrollSalesSequence>> | null = null
  if (sequenceId && enrolledLeadIds.length) {
    enrollment = await enrollSalesSequence(orgId, sequenceId, enrolledLeadIds, userId).catch(() => null)
  }

  return reply.send({
    imported: created.length,
    // `skipped`/`emailed` se conservan por compatibilidad; el desglose nuevo
    // dice quién y por qué.
    skipped: duplicates.length + invalid.length,
    duplicates,
    invalid,
    emailed,
    emailsSent: emailed,
    // Se devuelven los fallos, no solo el número: "3 no recibieron email" sin
    // el motivo es un dato que no deja hacer nada.
    emailFailures,
    callsQueued,
    callsSkipped: { count: callsSkippedCount, reason: callsSkippedCount ? callsSkippedReason : null },
    enrolled: enrollment?.created ?? 0,
    enrollmentBlocked: enrollment?.blocked ?? 0,
  })
}

/**
 * Motivo por el que `enqueueCampaignLeadCall` no encoló: la campaña no está
 * activa o su agente no está publicado. Se consulta una sola vez por
 * importación (el motivo es de la campaña, no del lead).
 */
async function callsSkippedReasonFor(orgId: string, campaignId: string): Promise<CallsSkippedReason> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { status: true, agent: { select: { isActive: true, lifecycleStatus: true } } },
  })
  if (campaign?.status !== 'active') return 'campaign_not_active'
  return 'agent_not_published'
}
