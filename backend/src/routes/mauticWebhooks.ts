import { FastifyInstance } from 'fastify'
import { mauticWebhookSecretForOrg, recordActivityByCrmLeadId, verifyMauticWebhookSecret, verifyMauticWebhookSignature } from '../services/mauticSync.service'
import { recordEmailComplianceEvent } from '../lib/emailCompliance'
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { stopSalesSequenceForLead } from '../services/salesSequence.service'
import { beginWebhookEvent, finishWebhookEvent } from '../observability/webhookLifecycle'

interface MauticContactEvent {
  id?: string | number
  eventId?: string | number
  uuid?: string
  event_id?: string | number
  messageId?: string | number
  message_id?: string | number
  providerMessageId?: string | number
  provider_message_id?: string | number
  statId?: string | number
  stat_id?: string | number
  contact?: { id?: string | number; fields?: { all?: Record<string, unknown> }; tags?: unknown }
  email?: {
    id?: string | number
    subject?: string
    messageId?: string | number
    message_id?: string | number
    providerMessageId?: string | number
    provider_message_id?: string | number
    statId?: string | number
    stat_id?: string | number
  }
  content?: { title?: string }
  url?: string
  [key: string]: unknown
}

type LegacyEventType = 'delivered' | 'open' | 'click' | 'bounce' | 'unsubscribe' | 'reply'
type EmailEventType = 'delivered' | 'open' | 'click' | 'soft_bounce' | 'hard_bounce' | 'unsubscribe' | 'complaint' | 'reply'

function eventType(eventKey: string): LegacyEventType | null {
  const key = eventKey.toLowerCase()
  if (key.includes('unsubscribe')) return 'unsubscribe'
  if (key.includes('reply')) return 'reply'
  if (key.includes('bounce')) return 'bounce'
  if (key.includes('email_on_send') || key.includes('email_on_sent') || key.includes('email_on_deliver')) return 'delivered'
  if (key.includes('page_on_hit') || key.includes('email_on_click')) return 'click'
  if (key.includes('email_on_open')) return 'open'
  return null
}

/**
 * EM-102: bounce se reparte en soft/hard — Mautic no documenta un formato
 * fijo para esto en el payload del webhook, así que se busca la palabra
 * "soft" en cualquier parte del evento; a falta de esa señal se asume hard
 * (el caso más conservador para bloquear envíos futuros).
 */
function isSoftBounce(event: MauticContactEvent): boolean {
  try {
    return JSON.stringify(event).toLowerCase().includes('soft')
  } catch {
    return false
  }
}

function toEmailEventType(legacyType: LegacyEventType, event: MauticContactEvent): EmailEventType {
  if (legacyType === 'bounce') return isSoftBounce(event) ? 'soft_bounce' : 'hard_bounce'
  return legacyType
}

function eventId(event: MauticContactEvent): string | undefined {
  const id = event.eventId ?? event.event_id ?? event.uuid ?? event.id
  return id === undefined ? undefined : String(id)
}

function hasOrgTag(event: MauticContactEvent, orgId: string): boolean | null {
  const all = event.contact?.fields?.all
  const tags = all?.tags ?? event.contact?.tags
  if (tags === undefined) return null
  if (Array.isArray(tags)) return tags.some(tag => String(tag) === `org-${orgId}`)
  if (tags && typeof tags === 'object') return Object.keys(tags).includes(`org-${orgId}`)
  return false
}

/**
 * Correlación segura: el id de una plantilla o el "último envío del lead" no
 * identifican un mensaje concreto. Si Mautic no aporta un ID de mensaje o
 * estadística verificable, guardamos el evento sin delivery en vez de
 * atribuirlo erróneamente a otra campaña.
 */
function providerMessageId(event: MauticContactEvent): string | undefined {
  // Do not use event.id or email.id here: those identify a webhook event and
  // an email template respectively, not a recipient-level message. A webhook
  // is attached to a delivery only when Mautic sends an explicit message/stat
  // identifier that exactly equals EmailDelivery.providerMessageId.
  const value = event.providerMessageId
    ?? event.provider_message_id
    ?? event.messageId
    ?? event.message_id
    ?? event.statId
    ?? event.stat_id
    ?? event.email?.providerMessageId
    ?? event.email?.provider_message_id
    ?? event.email?.messageId
    ?? event.email?.message_id
    ?? event.email?.statId
    ?? event.email?.stat_id
  return value === undefined || value === null ? undefined : String(value)
}

async function resolveDeliveryId(orgId: string, messageId?: string): Promise<string | null> {
  if (!messageId) return null
  const delivery = await prisma.emailDelivery.findFirst({
    where: { orgId, providerMessageId: messageId },
    select: { id: true },
  })
  return delivery?.id ?? null
}

async function applyDeliveryEvent(deliveryId: string, type: EmailEventType): Promise<void> {
  if (type === 'delivered') {
    await prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: { in: ['queued', 'processing', 'accepted'] } },
      data: { status: 'delivered', deliveredAt: new Date() },
    })
    return
  }
  if (type === 'soft_bounce' || type === 'hard_bounce') {
    await prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } },
      data: { status: 'bounced', failedAt: new Date(), failureCode: type.toUpperCase() },
    })
    return
  }
  if (type === 'unsubscribe') {
    await prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } },
      data: { status: 'unsubscribed', failedAt: new Date(), failureCode: 'UNSUBSCRIBED' },
    })
    return
  }
  if (type === 'complaint') {
    await prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } },
      data: { status: 'failed', failedAt: new Date(), failureCode: 'COMPLAINT' },
    })
  }
}

/**
 * EM-102: EmailEvent normalizado por cada evento entrante de Mautic —
 * idempotente vía upsert sobre el unique (provider, externalEventId).
 */
async function recordEmailEvent(
  orgId: string,
  type: EmailEventType,
  externalEventId: string,
  detail?: string,
  url?: string,
  messageId?: string
): Promise<void> {
  try {
    const existing = await prisma.emailEvent.findUnique({
      where: { provider_externalEventId: { provider: 'mautic', externalEventId } },
      select: { id: true },
    })
    if (existing) return

    const deliveryId = await resolveDeliveryId(orgId, messageId)
    try {
      await prisma.emailEvent.create({
        data: {
          orgId,
          deliveryId,
          provider: 'mautic',
          externalEventId,
          type,
          url,
          occurredAt: new Date(),
          metadata: { ...(detail ? { detail } : {}), ...(messageId ? { providerMessageId: messageId } : {}) },
        },
      })
    } catch (error: any) {
      // Parallel webhook retries race on the database unique key; the other
      // request already owns the event and must be the only one to transition
      // the delivery state.
      if (error?.code === 'P2002') return
      throw error
    }
    if (deliveryId) await applyDeliveryEvent(deliveryId, type)
  } catch (err) {
    console.warn('[MauticWebhooks] EmailEvent record failed:', (err as Error).message)
  }
}

/**
 * Acepta un header para que el secreto no viaje en URLs/logs. El query queda
 * como fallback para instalaciones Mautic ya configuradas de esa forma.
 */
export async function mauticWebhooksRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body
    try { done(null, JSON.parse(body as string)) } catch (error) { done(error as Error, undefined) }
  })
  app.post<{ Querystring: { secret?: string }; Body: Record<string, MauticContactEvent[]> }>(
    '/',
    async (req, reply) => {
      const headerSecret = req.headers['x-mautic-webhook-secret'] as string | undefined
      const authorization = req.headers.authorization
      const bearerSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
      const body = req.body ?? {}
      const rawBody = (req as any).rawBody as string | undefined
      const candidateOrgIds = new Set<string>()
      for (const events of Object.values(body)) {
        if (!Array.isArray(events)) continue
        for (const event of events as MauticContactEvent[]) {
          const crmLeadId = typeof event.contact?.fields?.all?.crmleadid === 'string' ? event.contact.fields.all.crmleadid : undefined
          if (!crmLeadId) continue
          const lead = await prisma.lead.findUnique({ where: { id: crmLeadId }, select: { orgId: true } })
          if (lead?.orgId) candidateOrgIds.add(lead.orgId)
        }
      }
      const resolvedOrgId = candidateOrgIds.size === 1 ? [...candidateOrgIds][0] : undefined
      const tenantSecret = resolvedOrgId ? await mauticWebhookSecretForOrg(resolvedOrgId) : undefined
      // Query-string secrets are retained only as an explicit migration
      // fallback. They leak through proxy/access logs, so production must use
      // the dedicated header or Authorization: Bearer instead.
      const allowLegacyQuery = process.env.MAUTIC_WEBHOOK_ALLOW_QUERY_SECRET === 'true' && process.env.NODE_ENV !== 'production'
      const suppliedSecret = headerSecret || bearerSecret || (allowLegacyQuery ? req.query.secret : undefined)
      const signature = req.headers['x-mautic-signature'] as string | undefined
      const tenantValid = Boolean(
        tenantSecret && (
          verifyMauticWebhookSecret(suppliedSecret, tenantSecret)
          || verifyMauticWebhookSignature(rawBody ?? '', signature, tenantSecret)
        ),
      )
      const legacyValid = allowLegacyQuery && verifyMauticWebhookSecret(suppliedSecret, process.env.MAUTIC_WEBHOOK_SECRET)
      if (!tenantValid && !legacyValid) {
        req.log.warn({ event: 'webhook.rejected', provider: 'mautic', channel: 'email', correlationId: req.correlationId, errorCode: 'INVALID_SECRET' }, 'Webhook rechazado')
        return reply.status(403).send({ error: 'Invalid secret' })
      }

      const lifecycle = await beginWebhookEvent({
        provider: 'mautic',
        channel: 'email',
        eventType: 'email.activity',
        correlationId: req.correlationId,
        rawBody: rawBody ?? JSON.stringify(body),
      })
      if (lifecycle.deadLetter) return reply.status(503).send({ error: 'Webhook processing exhausted', code: 'WEBHOOK_DEAD_LETTER', eventId: lifecycle.id })
      if (!lifecycle.claimed) return reply.status(200).send({ ok: true, duplicate: true, inFlight: lifecycle.inFlight })

      try {
        for (const [eventKey, events] of Object.entries(body)) {
        const type = eventType(eventKey)
        if (!type || !Array.isArray(events)) continue

        for (const event of events) {
          const crmLeadId = typeof event.contact?.fields?.all?.crmleadid === 'string'
            ? event.contact.fields.all.crmleadid
            : undefined
          if (!crmLeadId) continue
          const leadOrg = await prisma.lead.findUnique({ where: { id: crmLeadId }, select: { orgId: true } })
          if (!leadOrg) continue
          if (hasOrgTag(event, leadOrg.orgId) === false) continue
          const detail = event.email?.subject ?? event.content?.title
          // When Mautic omits an event ID, hash the full payload plus its
          // webhook topic. This avoids collapsing separate opens/clicks that
          // happen to share a subject line.
          const fingerprint = eventId(event)
            || createHash('sha256').update(`${eventKey}|${JSON.stringify(event)}`).digest('hex')

          // Compat: se mantiene Lead.customFields.mauticActivity — es lo que
          // ya lee la vista de overview de Email marketing.
          if (type !== 'delivered' && type !== 'reply') {
            await recordActivityByCrmLeadId(crmLeadId, type, detail, fingerprint).catch(() => {})
          }

          // EM-102: EmailDelivery/EmailEvent normalizados, idempotentes.
          await recordEmailEvent(
            leadOrg.orgId,
            toEmailEventType(type, event),
            fingerprint,
            detail,
            typeof event.url === 'string' ? event.url : undefined,
            providerMessageId(event)
          )

          // P0-06: unsubscribe/bounce son cumplimiento, no engagement — deben
          // actualizar ContactConsent (misma tabla y `purpose` que usa
          // assertEmailSendAllowed) para bloquear envíos futuros por
          // cualquier ruta, no solo quedar como una entrada de actividad.
          if (type === 'unsubscribe') {
            await recordEmailComplianceEvent(leadOrg.orgId, crmLeadId, 'revoked', 'mautic_webhook', 'contact').catch(() => {})
          } else if (type === 'bounce') {
            await recordEmailComplianceEvent(leadOrg.orgId, crmLeadId, 'bounced', 'mautic_webhook', 'contact').catch(() => {})
          }

          // A reply or a suppression signal ends active sales sequences before
          // the next leased step can contact the lead again. This is durable
          // and idempotent, so duplicate webhooks cannot resurrect a sequence.
          if (type === 'reply' || type === 'unsubscribe' || type === 'bounce') {
            await stopSalesSequenceForLead(leadOrg.orgId, crmLeadId, type).catch(() => {})
          }
        }
        }
        await finishWebhookEvent({ id: lifecycle.id, provider: 'mautic', channel: 'email', correlationId: req.correlationId, success: true })
      } catch (error) {
        await finishWebhookEvent({ id: lifecycle.id, provider: 'mautic', channel: 'email', correlationId: req.correlationId, success: false, error })
        return reply.status(503).send({ error: 'Temporary processing failure', code: 'WEBHOOK_PROCESSING_FAILED', correlationId: req.correlationId })
      }

      return reply.status(200).send({ ok: true })
    }
  )
}
