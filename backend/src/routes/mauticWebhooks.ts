import { FastifyInstance } from 'fastify'
import { recordActivityByCrmLeadId } from '../services/mauticSync.service'
import { recordEmailComplianceEvent } from '../lib/emailCompliance'
import { timingSafeEqual, createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'

interface MauticContactEvent {
  id?: string | number
  eventId?: string | number
  uuid?: string
  event_id?: string | number
  contact?: { fields?: { all?: Record<string, unknown> }; tags?: unknown }
  email?: { subject?: string }
  content?: { title?: string }
  url?: string
  [key: string]: unknown
}

type LegacyEventType = 'open' | 'click' | 'bounce' | 'unsubscribe'
type EmailEventType = 'delivered' | 'open' | 'click' | 'soft_bounce' | 'hard_bounce' | 'unsubscribe' | 'complaint' | 'reply'

function secretMatches(value: string | undefined, expected: string | undefined): boolean {
  if (!value || !expected) return false
  const actual = Buffer.from(value)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

function eventType(eventKey: string): LegacyEventType | null {
  const key = eventKey.toLowerCase()
  if (key.includes('unsubscribe')) return 'unsubscribe'
  if (key.includes('bounce')) return 'bounce'
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

/** Best-effort: el EmailDelivery en curso más reciente de ese lead, si hay uno. */
async function resolveDeliveryId(orgId: string, leadId: string): Promise<string | null> {
  const delivery = await prisma.emailDelivery.findFirst({
    where: { orgId, leadId, status: { in: ['queued', 'accepted'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return delivery?.id ?? null
}

/**
 * EM-102: EmailEvent normalizado por cada evento entrante de Mautic —
 * idempotente vía upsert sobre el unique (provider, externalEventId).
 */
async function recordEmailEvent(
  orgId: string,
  leadId: string,
  type: EmailEventType,
  externalEventId: string,
  detail?: string,
  url?: string
): Promise<void> {
  try {
    const deliveryId = await resolveDeliveryId(orgId, leadId)
    await prisma.emailEvent.upsert({
      where: { provider_externalEventId: { provider: 'mautic', externalEventId } },
      create: {
        orgId,
        deliveryId,
        provider: 'mautic',
        externalEventId,
        type,
        url,
        occurredAt: new Date(),
        metadata: detail ? { detail } : undefined,
      },
      update: {},
    })
  } catch (err) {
    console.warn('[MauticWebhooks] EmailEvent record failed:', (err as Error).message)
  }
}

/**
 * Acepta un header para que el secreto no viaje en URLs/logs. El query queda
 * como fallback para instalaciones Mautic ya configuradas de esa forma.
 */
export async function mauticWebhooksRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { secret?: string }; Body: Record<string, MauticContactEvent[]> }>(
    '/',
    async (req, reply) => {
      const headerSecret = req.headers['x-mautic-webhook-secret'] as string | undefined
      const authorization = req.headers.authorization
      const bearerSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
      const suppliedSecret = headerSecret || bearerSecret || req.query.secret
      if (!secretMatches(suppliedSecret, process.env.MAUTIC_WEBHOOK_SECRET)) {
        return reply.status(403).send({ error: 'Invalid secret' })
      }

      const body = req.body ?? {}
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
          const fingerprint = eventId(event) || createHash('sha256').update(`${crmLeadId}|${type}|${detail || ''}`).digest('hex')

          // Compat: se mantiene Lead.customFields.mauticActivity — es lo que
          // ya lee la vista de overview de Email marketing.
          await recordActivityByCrmLeadId(crmLeadId, type, detail, fingerprint).catch(() => {})

          // EM-102: EmailDelivery/EmailEvent normalizados, idempotentes.
          await recordEmailEvent(
            leadOrg.orgId,
            crmLeadId,
            toEmailEventType(type, event),
            fingerprint,
            detail,
            typeof event.url === 'string' ? event.url : undefined
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
        }
      }

      return reply.status(200).send({ ok: true })
    }
  )
}
