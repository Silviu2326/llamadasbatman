import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { ingestLead } from '../services/leadIngestion.service'

interface LandingAssets {
  offer?: string
  leadMagnet?: string
  adCopy?: string
  landingTemplateId?: string
  imageUrl?: string
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

export async function getLanding(
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug, status: 'active' },
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
    landingTemplateId: assets.landingTemplateId ?? 'generic-v1',
    imageUrl: assets.imageUrl ?? '',
  })
}

export async function recordLandingView(
  request: FastifyRequest<{ Params: { slug: string }; Body: LandingTrackingBody }>,
  reply: FastifyReply
) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: request.params.slug, status: 'active' },
    select: { id: true, orgId: true },
  })
  if (!campaign) return reply.status(404).send({ error: 'Landing no encontrada' })

  const tracking = parseTracking(request.body ?? {})
  await recordAcquisitionEvent({
    orgId: campaign.orgId,
    campaignId: campaign.id,
    type: 'landing_view',
    ...tracking,
  })

  return reply.status(201).send({ ok: true })
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
    select: { id: true, orgId: true },
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

  return reply.status(201).send({ ok: true, message: 'Te llamamos en breve' })
}
