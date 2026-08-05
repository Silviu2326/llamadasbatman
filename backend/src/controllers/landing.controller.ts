import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { ingestLead } from '../services/leadIngestion.service'
import {
  deviceFromUserAgent,
  ingestLandingEvents,
  isBotUserAgent,
  resolveCurrentVersion,
  type LandingEventInput,
} from '../services/landingTelemetry.service'
import { assignSessionToVariant, assignmentForSession, recordSessionConversion } from '../services/landingExperiments.service'
import { applyPatch } from '../services/landingVariants.service'

interface LandingAssets {
  title?: string
  offer?: string
  leadMagnet?: string
  adCopy?: string
  landingTemplateId?: string
  imageUrl?: string
  seo?: { title?: string; metaDescription?: string }
}

export interface LandingTrackingBody {
  sessionId?: string
  externalKey?: string
  source?: string
  medium?: string
  content?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  referrer?: string
  path?: string
  gclid?: string
  fbclid?: string
}

export interface LandingEventsBody extends LandingTrackingBody {
  events?: LandingEventInput[]
}

export interface LandingLeadBody extends LandingTrackingBody {
  name?: string
  phone?: string
  email?: string
  contactTime?: string
  consent?: boolean
  consentVersion?: string
  // Campo trampa: no se muestra a una persona real. Se acepta para no dar
  // pistas al bot, pero nunca se procesa como una solicitud.
  website?: string
}

function cleanText(value: unknown, maxLength = 255) {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

function canonicalPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, '')
  if (!/^\+?\d{7,15}$/.test(compact)) return undefined
  return compact.replace(/^\+/, '')
}

function validEmail(value: string | undefined) {
  return !value || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320)
}

function safeConsentVersion(value: unknown) {
  const version = cleanText(value, 80) ?? 'contact-request-v1'
  return /^[a-zA-Z0-9._-]+$/.test(version) ? version : undefined
}

function hashFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function consentEvidence(request: FastifyRequest, version: string) {
  const userAgent = request.headers['user-agent'] ?? ''
  const capturedAt = new Date().toISOString()
  // El rastro probatorio no conserva la IP ni el agente en claro dentro de
  // ContactConsent, pero permite correlación forense controlada.
  return `landing:v=${version};at=${capturedAt};ip=${hashFingerprint(request.ip)};ua=${hashFingerprint(userAgent)}`
}

function parseTracking(body: LandingTrackingBody = {}) {
  const sessionId = cleanText(body.sessionId, 160)
  const externalKey = cleanText(body.externalKey, 200)
  const source = cleanText(body.source) ?? cleanText(body.utm_source) ?? 'direct'
  const medium = cleanText(body.medium) ?? cleanText(body.utm_medium)
  const content = cleanText(body.content) ?? cleanText(body.utm_content)

  const metadata: Record<string, string> = {}
  const metadataValues = {
    utmCampaign: cleanText(body.utm_campaign),
    utmTerm: cleanText(body.utm_term),
    referrer: cleanText(body.referrer, 1000),
    path: cleanText(body.path, 1000),
    gclid: cleanText(body.gclid, 300),
    fbclid: cleanText(body.fbclid, 300),
  }
  for (const [key, value] of Object.entries(metadataValues)) {
    if (value !== undefined) metadata[key] = value
  }

  return {
    sessionId,
    externalKey,
    source,
    medium,
    content,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  }
}

async function recordAcquisitionEvent(input: {
  orgId: string
  campaignId: string
  leadId?: string
  type: string
  source: string
  medium?: string
  content?: string
  sessionId?: string
  externalKey?: string
  metadata?: Prisma.InputJsonObject
}) {
  const data = {
    orgId: input.orgId,
    campaignId: input.campaignId,
    leadId: input.leadId,
    type: input.type,
    source: input.source,
    medium: input.medium,
    content: input.content,
    sessionId: input.sessionId,
    externalKey: input.externalKey,
    metadata: input.metadata,
  }

  // Los upserts hacen la deduplicacion atomica y evitan la carrera de un
  // SELECT seguido de INSERT cuando el navegador reintenta una peticion.
  if (input.sessionId) {
    return prisma.acquisitionEvent.upsert({
      where: {
        campaignId_type_sessionId: {
          campaignId: input.campaignId,
          type: input.type,
          sessionId: input.sessionId,
        },
      },
      create: data,
      update: {
        leadId: input.leadId,
        source: input.source,
        medium: input.medium,
        content: input.content,
        externalKey: input.externalKey,
        metadata: input.metadata,
      },
    })
  }

  if (input.externalKey) {
    return prisma.acquisitionEvent.upsert({
      where: {
        orgId_type_externalKey: {
          orgId: input.orgId,
          type: input.type,
          externalKey: input.externalKey,
        },
      },
      create: data,
      update: {
        leadId: input.leadId,
        source: input.source,
        medium: input.medium,
        content: input.content,
        metadata: input.metadata,
      },
    })
  }

  return prisma.acquisitionEvent.create({ data })
}

const LANDING_SELECT = {
  id: true,
  orgId: true,
  name: true,
  landingSlug: true,
  landingKey: true,
  adAssets: true,
} as const

export async function getLanding(
  request: FastifyRequest<{ Params: { slug: string }; Querystring: { sessionId?: string } }>,
  reply: FastifyReply
) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug, status: 'active' },
    select: LANDING_SELECT,
  })
  if (!campaign) return reply.status(404).send({ error: 'Landing no encontrada' })

  // La versión se resuelve al servir, no al guardar: una landing anterior a la
  // telemetría obtiene su primera versión en la primera visita, sin backfill
  // que invente fechas de publicación (landings.md §3.1).
  const version = await resolveCurrentVersion(campaign)

  const assets = (campaign.adAssets ?? {}) as LandingAssets
  const base = {
    title: assets.title ?? null,
    offer: assets.offer ?? '',
    leadMagnet: assets.leadMagnet ?? '',
    adCopy: assets.adCopy ?? '',
    optionalFields: [] as string[],
    hiddenFields: [] as string[],
  }

  // Asignación de variante en el servidor (§9). Se hace aquí, no en el cliente:
  // el navegador nunca decide qué variante le toca ni puede reasignarse hasta
  // que le salga la que prefiere.
  const sessionId = cleanText(request.query?.sessionId, 160)
  const assignment = sessionId && !isBotUserAgent(request.headers['user-agent'])
    ? await assignSessionToVariant(version.landingKey, sessionId)
    : null
  const served = assignment ? applyPatch(base, assignment.patch) : base

  return reply.send({
    campaignId: campaign.id,
    landingKey: version.landingKey,
    landingVersionId: version.id,
    name: campaign.name,
    title: served.title,
    offer: served.offer,
    leadMagnet: served.leadMagnet,
    adCopy: served.adCopy,
    // Campos que la variante activa deja de exigir o retira del formulario.
    // Nombre, teléfono y consentimiento nunca se retiran: sin ellos no se puede
    // atender la solicitud ni acreditar el consentimiento.
    optionalFields: Array.isArray(served.optionalFields) ? served.optionalFields : [],
    hiddenFields: (Array.isArray(served.hiddenFields) ? served.hiddenFields : [])
      .filter((field: unknown) => typeof field === 'string' && !['name', 'phone', 'consent'].includes(field)),
    landingTemplateId: assets.landingTemplateId ?? 'generic-v1',
    imageUrl: assets.imageUrl ?? '',
    seo: assets.seo ?? null,
    experiment: assignment ? { experimentId: assignment.experimentId, variant: assignment.variantKey } : null,
  })
}

/**
 * Contexto compartido por la vista y el resto de eventos. La identidad de la
 * landing (§3.1) se resuelve siempre en el servidor a partir del slug: el
 * navegador nunca decide a qué versión pertenece lo que envía.
 */
async function telemetryContext(request: FastifyRequest<{ Params: { slug: string }; Body: LandingTrackingBody }>) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug, status: 'active' },
    select: LANDING_SELECT,
  })
  if (!campaign) return null

  const tracking = parseTracking(request.body ?? {})
  const version = await resolveCurrentVersion(campaign)
  const userAgent = request.headers['user-agent']

  // Cada evento se sella con su experimento y su variante (§3.1). Sin esto, el
  // agregado sumaría en la misma fila un formulario con campo email y otro sin
  // él, y la línea base se contaminaría con su propio experimento.
  const assignment = tracking.sessionId
    ? await assignmentForSession(version.landingKey, tracking.sessionId)
    : null

  return {
    campaign,
    tracking,
    version,
    assignment,
    isBot: isBotUserAgent(userAgent),
    device: deviceFromUserAgent(userAgent),
    metadata: (request.body ?? {}) as LandingTrackingBody,
  }
}

export async function recordLandingView(
  request: FastifyRequest<{ Params: { slug: string }; Body: LandingTrackingBody }>,
  reply: FastifyReply
) {
  const context = await telemetryContext(request)
  if (!context) return reply.status(404).send({ error: 'Landing no encontrada' })

  // Rastreadores y previsualizaciones de enlaces piden la página entera: sin
  // este filtro, compartir la landing por WhatsApp inventa visitas (§3.2). Se
  // aplica también a `AcquisitionEvent` a propósito — dos recuentos de visita
  // distintos serían justo la doble fuente de verdad que evita §12.
  if (context.isBot) return reply.status(202).send({ ok: true, recorded: false })

  const { campaign, tracking, version, metadata, device, assignment } = context

  await recordAcquisitionEvent({
    orgId: campaign.orgId,
    campaignId: campaign.id,
    type: 'landing_view',
    ...tracking,
  })

  if (tracking.sessionId) {
    await ingestLandingEvents([{ type: 'view', occurredAt: new Date().toISOString() }], {
      orgId: campaign.orgId,
      campaignId: campaign.id,
      landingKey: version.landingKey,
      landingVersionId: version.id,
      sessionId: tracking.sessionId,
      experimentId: assignment?.experimentId ?? null,
      variantId: assignment?.variantId ?? null,
      source: tracking.source,
      medium: tracking.medium,
      utmCampaign: metadata.utm_campaign,
      content: tracking.content,
      term: metadata.utm_term,
      referrer: metadata.referrer,
      device,
    })
  }

  return reply.status(201).send({ ok: true, recorded: true })
}

/**
 * Ingesta por lotes del comportamiento dentro de la landing (§7.1). Sin PII:
 * el cliente envía qué campo se tocó y si quedó relleno, nunca su contenido.
 */
export async function recordLandingEvents(
  request: FastifyRequest<{ Params: { slug: string }; Body: LandingEventsBody }>,
  reply: FastifyReply
) {
  const context = await telemetryContext(request)
  if (!context) return reply.status(404).send({ error: 'Landing no encontrada' })
  if (context.isBot) return reply.status(202).send({ ok: true, accepted: 0 })

  const { campaign, tracking, version, metadata, device, assignment } = context
  // Sin sesión no hay forma honesta de calcular exposición por campo (§7.2):
  // los eventos sueltos inflarían los denominadores.
  if (!tracking.sessionId) return reply.status(202).send({ ok: true, accepted: 0 })

  const { accepted } = await ingestLandingEvents(request.body?.events ?? [], {
    orgId: campaign.orgId,
    campaignId: campaign.id,
    landingKey: version.landingKey,
    landingVersionId: version.id,
    sessionId: tracking.sessionId,
    experimentId: assignment?.experimentId ?? null,
    variantId: assignment?.variantId ?? null,
    source: tracking.source,
    medium: tracking.medium,
    utmCampaign: metadata.utm_campaign,
    content: tracking.content,
    term: metadata.utm_term,
    referrer: metadata.referrer,
    device,
  })

  return reply.status(201).send({ ok: true, accepted })
}

export async function submitLead(
  request: FastifyRequest<{ Params: { slug: string }; Body: LandingLeadBody }>,
  reply: FastifyReply
) {
  const { name, phone, email, contactTime, consent, consentVersion, website } = request.body ?? {}
  // Respuesta indistinguible de una recepción correcta: evita que el bot use
  // el honeypot como oráculo y no genera lead, llamada ni automatización.
  if (cleanText(website, 500)) return reply.status(201).send({ ok: true, message: 'Te llamamos en breve' })
  const cleanedName = cleanText(name, 200)
  const cleanedPhone = cleanText(phone, 80)
  const phoneKey = cleanedPhone ? canonicalPhone(cleanedPhone) : undefined
  const cleanedEmail = cleanText(email, 320)?.toLowerCase()
  const cleanedContactTime = cleanText(contactTime)
  if (!cleanedName || cleanedName.length < 2 || !cleanedPhone || !phoneKey) {
    return reply.status(400).send({ error: 'Nombre y telefono son requeridos' })
  }
  if (!validEmail(cleanedEmail)) return reply.status(400).send({ error: 'Email inválido' })
  if (consent !== true) return reply.status(400).send({ error: 'Se requiere autorización para responder a la solicitud' })
  const acceptedConsentVersion = safeConsentVersion(consentVersion)
  if (!acceptedConsentVersion) return reply.status(400).send({ error: 'Versión de consentimiento inválida' })

  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug, status: 'active' },
    select: { id: true, orgId: true, landingKey: true },
  })
  if (!campaign) return reply.status(404).send({ error: 'Landing no encontrada' })

  const tracking = parseTracking(request.body)
  const attribution: Record<string, string> = { source: tracking.source }
  if (tracking.medium) attribution.medium = tracking.medium
  if (tracking.content) attribution.content = tracking.content
  if (tracking.sessionId) attribution.sessionId = tracking.sessionId
  if (tracking.externalKey) attribution.externalKey = tracking.externalKey
  if (tracking.metadata) Object.assign(attribution, tracking.metadata)
  // No confiamos en sessionId/externalKey enviados por el navegador para la
  // deduplicación. El mismo teléfono no vuelve a disparar la cadena de
  // llamadas/automatizaciones de una campaña por cambiar el identificador.
  const submissionFingerprint = hashFingerprint(`${campaign.id}:${phoneKey}`)
  const externalLeadId = `landing-${campaign.id}-${submissionFingerprint}`
  const lead = await ingestLead(campaign.orgId, {
    name: cleanedName,
    phone: cleanedPhone,
    email: cleanedEmail,
    campaignId: campaign.id,
    source: tracking.source === 'direct' ? 'landing' : tracking.source,
    externalLeadId,
    customFields: {
      ...(cleanedContactTime ? { landingContactTime: cleanedContactTime } : {}),
      attribution,
    },
    consent: {
      whatsapp: true,
      voice: true,
      email: Boolean(cleanedEmail),
      source: 'landing_form',
      evidence: consentEvidence(request, acceptedConsentVersion),
    },
  })

  await recordAcquisitionEvent({
    orgId: campaign.orgId,
    campaignId: campaign.id,
    leadId: lead.id,
    type: 'landing_lead',
    // Para el evento de conversión también se usa el fingerprint de contacto
    // en vez de un sessionId manipulable. SessionId sigue en attribution.
    ...tracking,
    sessionId: undefined,
    externalKey: `landing-lead:${campaign.id}:${submissionFingerprint}`,
  })

  // Conversión del experimento (§9). La conversión se atribuye a la variante
  // que se sirvió a esa sesión; si no hay experimento activo, no hace nada.
  if (campaign.landingKey && tracking.sessionId) {
    await recordSessionConversion(campaign.landingKey, tracking.sessionId, lead.id)
  }

  return reply.status(201).send({ ok: true, message: 'Te llamamos en breve' })
}
