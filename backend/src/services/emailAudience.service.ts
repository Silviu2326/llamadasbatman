import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * EM-111: lectura a nivel de organización de la audiencia de email.
 *
 * No introduce ningún modelo nuevo. La suscripción a una categoría (newsletter,
 * promotions, contact…) ya vive en `ContactConsent` con `channel='email'` y
 * `purpose` como categoría — ver `lib/emailCompliance.ts`, que es la única
 * barrera de envío. Aquí solo se expone esa misma verdad en forma de lista,
 * porque hasta ahora únicamente se podía consultar lead a lead
 * (`GET /api/leads/:id/preferences`) y no había forma de responder a
 * "quién está suscrito a la newsletter".
 *
 * Consecuencia deliberada: una baja registrada por el webhook de Mautic o por
 * un rebote duro aparece aquí sin trabajo extra, porque es la misma fila.
 */

/** Estados de ContactConsent que bloquean el envío, con su motivo. */
export const SUBSCRIBER_STATUSES = ['granted', 'revoked', 'bounced', 'complaint', 'unknown'] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

export interface SubscriberFilters {
  purpose?: string
  status?: SubscriberStatus
  search?: string
  limit?: number
  offset?: number
}

export interface SubscriberRow {
  id: string
  leadId: string
  name: string
  email: string | null
  purpose: string
  status: string
  source: string
  tags: string[]
  occurredAt: Date
  /** Última entrega registrada hacia este lead, si la hay. */
  lastDeliveryAt: Date | null
}

const MAX_PAGE_SIZE = 200

function pageSize(limit?: number): number {
  if (!limit || limit < 1) return 50
  return Math.min(limit, MAX_PAGE_SIZE)
}

function buildWhere(orgId: string, filters: SubscriberFilters): Prisma.ContactConsentWhereInput {
  const where: Prisma.ContactConsentWhereInput = {
    orgId,
    channel: 'email',
    // Una fila de consentimiento sin lead pertenece a una identidad de canal
    // suelta y no es direccionable como suscriptor.
    leadId: { not: null },
  }
  if (filters.purpose) where.purpose = filters.purpose
  if (filters.status) where.status = filters.status
  const search = filters.search?.trim()
  if (search) {
    where.lead = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }
  }
  return where
}

export async function listSubscribers(
  orgId: string,
  filters: SubscriberFilters = {}
): Promise<{ total: number; rows: SubscriberRow[] }> {
  const where = buildWhere(orgId, filters)
  const take = pageSize(filters.limit)
  const skip = Math.max(0, filters.offset ?? 0)

  const [total, consents] = await Promise.all([
    prisma.contactConsent.count({ where }),
    prisma.contactConsent.findMany({
      where,
      take,
      skip,
      orderBy: { occurredAt: 'desc' },
      include: {
        lead: { select: { id: true, name: true, email: true, tags: true } },
      },
    }),
  ])

  const leadIds = consents.map(consent => consent.leadId).filter((id): id is string => Boolean(id))
  // Una sola consulta agregada en vez de N: el "último envío" es una columna
  // informativa de la tabla, no puede costar una query por fila.
  const lastDeliveries = leadIds.length
    ? await prisma.emailDelivery.groupBy({
        by: ['leadId'],
        where: { orgId, leadId: { in: leadIds } },
        _max: { queuedAt: true },
      })
    : []
  const lastDeliveryByLead = new Map(
    lastDeliveries.map(entry => [entry.leadId, entry._max.queuedAt ?? null])
  )

  const rows = consents
    .filter(consent => consent.lead)
    .map(consent => ({
      id: consent.id,
      leadId: consent.lead!.id,
      name: consent.lead!.name,
      email: consent.lead!.email,
      purpose: consent.purpose,
      status: consent.status,
      source: consent.source,
      tags: consent.lead!.tags,
      occurredAt: consent.occurredAt,
      lastDeliveryAt: lastDeliveryByLead.get(consent.lead!.id) ?? null,
    }))

  return { total, rows }
}

export interface SubscriberSummary {
  /** Categorías presentes en la organización, con su reparto por estado. */
  purposes: Array<{
    purpose: string
    granted: number
    revoked: number
    bounced: number
    complaint: number
    unknown: number
    total: number
  }>
  /** Leads con email que aún no tienen ninguna fila de consentimiento. */
  withoutConsent: number
}

export async function getSubscriberSummary(orgId: string): Promise<SubscriberSummary> {
  const [grouped, leadsWithEmail, leadsWithConsent] = await Promise.all([
    prisma.contactConsent.groupBy({
      by: ['purpose', 'status'],
      where: { orgId, channel: 'email', leadId: { not: null } },
      _count: { _all: true },
    }),
    prisma.lead.count({ where: { orgId, email: { not: null } } }),
    prisma.contactConsent.findMany({
      where: { orgId, channel: 'email', leadId: { not: null } },
      distinct: ['leadId'],
      select: { leadId: true },
    }),
  ])

  const byPurpose = new Map<string, SubscriberSummary['purposes'][number]>()
  for (const entry of grouped) {
    const current = byPurpose.get(entry.purpose) ?? {
      purpose: entry.purpose,
      granted: 0,
      revoked: 0,
      bounced: 0,
      complaint: 0,
      unknown: 0,
      total: 0,
    }
    const count = entry._count._all
    if (entry.status === 'granted') current.granted += count
    else if (entry.status === 'revoked') current.revoked += count
    else if (entry.status === 'bounced') current.bounced += count
    else if (entry.status === 'complaint') current.complaint += count
    else current.unknown += count
    current.total += count
    byPurpose.set(entry.purpose, current)
  }

  return {
    purposes: [...byPurpose.values()].sort((a, b) => b.granted - a.granted || a.purpose.localeCompare(b.purpose)),
    withoutConsent: Math.max(0, leadsWithEmail - leadsWithConsent.length),
  }
}

/**
 * Alta o baja manual de una categoría. Escribe exactamente la misma fila que el
 * centro de preferencias del lead, para que no existan dos verdades sobre si a
 * alguien se le puede escribir.
 */
export async function setSubscription(
  orgId: string,
  leadId: string,
  purpose: string,
  status: 'granted' | 'revoked',
  source: string
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
  if (!lead) return null

  return prisma.contactConsent.upsert({
    where: { orgId_leadId_channel_purpose: { orgId, leadId, channel: 'email', purpose } },
    create: { orgId, leadId, channel: 'email', purpose, status, source },
    update: { status, source, occurredAt: new Date() },
  })
}

export interface DeliveryFilters {
  status?: string
  campaignId?: string
  search?: string
  limit?: number
  offset?: number
}

export interface DeliveryRow {
  id: string
  leadId: string
  leadName: string
  toAddress: string
  campaignId: string | null
  campaignName: string | null
  status: string
  attempts: number
  queuedAt: Date
  deliveredAt: Date | null
  failedAt: Date | null
  failureCode: string | null
  failureDetail: string | null
  opens: number
  clicks: number
  /** true si el destinatario rebotó, se dio de baja o marcó como spam. */
  suppressed: boolean
}

const SUPPRESSING_EVENTS = new Set(['hard_bounce', 'soft_bounce', 'unsubscribe', 'complaint'])

/**
 * EM-111: seguimiento de envíos. Devuelve una fila por destinatario con su
 * estado real y el recuento de aperturas/clics, que hasta ahora solo existía
 * agregado (`/api/email/overview`) o dentro de la ficha de un lead concreto.
 */
export async function listDeliveries(
  orgId: string,
  filters: DeliveryFilters = {}
): Promise<{ total: number; rows: DeliveryRow[] }> {
  const where: Prisma.EmailDeliveryWhereInput = { orgId }
  if (filters.status) where.status = filters.status
  if (filters.campaignId) where.campaignId = filters.campaignId
  const search = filters.search?.trim()
  if (search) {
    where.OR = [
      { toAddress: { contains: search, mode: 'insensitive' } },
      { lead: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const take = pageSize(filters.limit)
  const skip = Math.max(0, filters.offset ?? 0)

  const [total, deliveries] = await Promise.all([
    prisma.emailDelivery.count({ where }),
    prisma.emailDelivery.findMany({
      where,
      take,
      skip,
      orderBy: { queuedAt: 'desc' },
      include: {
        lead: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        events: { select: { type: true } },
      },
    }),
  ])

  const rows = deliveries.map(delivery => {
    let opens = 0
    let clicks = 0
    let suppressed = false
    for (const event of delivery.events) {
      if (event.type === 'open') opens += 1
      else if (event.type === 'click') clicks += 1
      if (SUPPRESSING_EVENTS.has(event.type)) suppressed = true
    }
    return {
      id: delivery.id,
      leadId: delivery.leadId,
      leadName: delivery.lead?.name ?? 'Contacto eliminado',
      toAddress: delivery.toAddress,
      campaignId: delivery.campaignId,
      campaignName: delivery.campaign?.name ?? null,
      status: delivery.status,
      attempts: delivery.attempts,
      queuedAt: delivery.queuedAt,
      deliveredAt: delivery.deliveredAt,
      failedAt: delivery.failedAt,
      failureCode: delivery.failureCode,
      failureDetail: delivery.failureDetail,
      opens,
      clicks,
      suppressed: suppressed || delivery.status === 'bounced' || delivery.status === 'unsubscribed',
    }
  })

  return { total, rows }
}
