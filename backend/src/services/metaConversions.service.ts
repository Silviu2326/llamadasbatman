import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { fetchWithTimeout } from '../lib/integrationRuntime'

/**
 * Devolución de señal a Meta por **Conversions API** (`docs/vendrava/ads.md` §7
 * y Fase 2). Nunca la antigua Offline Conversions API.
 *
 * Lo que cambia frente a la versión anterior, que enviaba y olvidaba:
 *
 * - **Consentimiento primero.** Sin `ContactConsent` en estado `granted` no
 *   sale nada. El hash reduce la exposición pero no anonimiza: siguen siendo
 *   datos personales, y enviarlos sin base jurídica es una infracción, no un
 *   descuido.
 * - **Todo queda registrado** en `AdConversionSignal`: qué se envió, cuándo,
 *   con qué `event_id`, en qué estado y con qué error. Sin registro no se
 *   puede saber si CAPI funciona ni reintentar lo que falló.
 * - **Deduplicación real** por `event_id` determinista, con índice único en
 *   base de datos. Un reintento del outbox no duplica una venta.
 *
 * Etapas que se devuelven, de menos a más profunda:
 *
 *   lead → qualified_lead → schedule → sale
 */

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const MAX_ATTEMPTS = 5

/** Nombre del evento en Meta para cada etapa del embudo. */
const EVENT_NAME_BY_STAGE = {
  lead: 'Lead',
  qualified_lead: 'Lead',
  schedule: 'Schedule',
  sale: 'Purchase',
} as const

export type ConversionStage = keyof typeof EVENT_NAME_BY_STAGE

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Meta espera el teléfono solo con dígitos y prefijo de país. Enviar
 * "+34 600 11 22 33" produce un hash que no casa con nada.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

/** `event_id` estable: el mismo hecho de negocio produce siempre el mismo id. */
export function buildEventId(stage: ConversionStage, entityId: string): string {
  return `${stage}:${entityId}`
}

async function getPixelAndToken(orgId: string): Promise<{ pixelId: string; token: string } | null> {
  const account = await prisma.metaAdAccount.findFirst({
    where: { orgId, status: 'connected' },
    select: { metaPixelId: true },
  })
  if (!account?.metaPixelId) return null
  const token = await getDecryptedToken(orgId)
  if (!token) return null
  return { pixelId: account.metaPixelId, token }
}

/**
 * Consentimiento vigente del lead para envío a terceros. Cualquier estado que
 * no sea `granted` bloquea el envío; una retirada posterior bloquea también
 * los envíos futuros aunque el lead ya se hubiese enviado antes.
 */
async function resolveConsent(orgId: string, leadId: string) {
  const consents = await prisma.contactConsent.findMany({
    where: { orgId, leadId },
    select: { status: true, source: true, expiresAt: true },
  })
  if (!consents.length) return { status: 'missing' as const, source: null }
  if (consents.some(consent => consent.status === 'revoked')) return { status: 'revoked' as const, source: null }
  const granted = consents.find(
    consent => consent.status === 'granted' && (!consent.expiresAt || consent.expiresAt.getTime() > Date.now())
  )
  return granted
    ? { status: 'granted' as const, source: granted.source }
    : { status: 'missing' as const, source: null }
}

type EnqueueInput = {
  orgId: string
  stage: ConversionStage
  leadId: string
  /** Identidad del hecho de negocio: id del lead, la reunión o la oportunidad. */
  entityId: string
  eventTime?: Date
  valueCents?: number | null
  currency?: string | null
}

/**
 * Registra la señal y la deja lista para entregar. Es idempotente: si el
 * mismo `event_id` ya existe, se devuelve el registro anterior sin duplicar.
 */
export async function enqueueConversionSignal(input: EnqueueInput) {
  const eventId = buildEventId(input.stage, input.entityId)
  const existing = await prisma.adConversionSignal.findUnique({
    where: { orgId_eventId: { orgId: input.orgId, eventId } },
  })
  // Un reintento del outbox o del proveedor llega aquí con el mismo eventId.
  // Se cuenta para poder medir la tasa de duplicados de la §4.2 en vez de
  // descartarlo en silencio y tener que declararla "sin medición".
  if (existing) {
    return prisma.adConversionSignal.update({
      where: { id: existing.id },
      data: { duplicateAttempts: { increment: 1 } },
    })
  }

  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, orgId: input.orgId },
    select: { id: true, email: true, phone: true, campaignId: true },
  })
  if (!lead) return null

  const consent = await resolveConsent(input.orgId, lead.id)
  const creds = await getPixelAndToken(input.orgId)

  // Los identificadores se hashean aquí y el valor en claro no vuelve a
  // aparecer: ni en la fila, ni en los logs, ni en la respuesta de la API.
  const hashedIdentifiers: Record<string, string> = { external_id: sha256(lead.id) }
  if (lead.email) hashedIdentifiers.em = sha256(lead.email)
  if (lead.phone) hashedIdentifiers.ph = sha256(normalizePhone(lead.phone))

  const status = consent.status !== 'granted'
    ? 'skipped_no_consent'
    : !creds
      ? 'skipped_not_configured'
      : 'pending'

  return prisma.adConversionSignal.create({
    data: {
      orgId: input.orgId,
      leadId: lead.id,
      campaignId: lead.campaignId,
      stage: input.stage,
      eventName: EVENT_NAME_BY_STAGE[input.stage],
      eventId,
      eventTime: input.eventTime ?? new Date(),
      hashedIdentifiers,
      valueCents: input.valueCents ?? null,
      currency: input.valueCents != null ? (input.currency ?? 'EUR') : null,
      consentStatus: consent.status,
      consentSource: consent.source,
      status,
    },
  })
}

/**
 * Entrega una señal pendiente. Devuelve el registro actualizado; los errores
 * se guardan en la fila en vez de propagarse, para que el outbox decida si
 * reintenta según `status` y `attempts`.
 */
export async function deliverConversionSignal(orgId: string, signalId: string) {
  const signal = await prisma.adConversionSignal.findFirst({ where: { id: signalId, orgId } })
  if (!signal || signal.status !== 'pending') return signal
  if (signal.attempts >= MAX_ATTEMPTS) {
    return prisma.adConversionSignal.update({
      where: { id: signal.id },
      data: { status: 'failed', errorCode: 'max_attempts', lastAttemptAt: new Date() },
    })
  }

  // El consentimiento se vuelve a comprobar en la entrega: pudo retirarse
  // entre el registro y el envío, y en ese caso no debe salir.
  if (signal.leadId) {
    const consent = await resolveConsent(signal.orgId, signal.leadId)
    if (consent.status !== 'granted') {
      return prisma.adConversionSignal.update({
        where: { id: signal.id },
        data: { status: 'skipped_no_consent', consentStatus: consent.status },
      })
    }
  }

  const creds = await getPixelAndToken(signal.orgId)
  if (!creds) {
    return prisma.adConversionSignal.update({
      where: { id: signal.id },
      data: { status: 'skipped_not_configured' },
    })
  }

  const userData = (signal.hashedIdentifiers ?? {}) as Record<string, string>
  const event: Record<string, unknown> = {
    event_name: signal.eventName,
    event_time: Math.floor(signal.eventTime.getTime() / 1000),
    event_id: signal.eventId,
    action_source: 'system_generated',
    user_data: userData,
  }
  if (signal.valueCents != null) {
    event.custom_data = {
      currency: signal.currency ?? 'EUR',
      value: signal.valueCents / 100,
      ...(signal.campaignId ? { campaign_id: signal.campaignId } : {}),
    }
  } else if (signal.campaignId) {
    event.custom_data = { campaign_id: signal.campaignId }
  }

  const attempts = signal.attempts + 1
  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${creds.pixelId}/events?access_token=${creds.token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: JSON.stringify([event]) }),
      },
      15_000,
    )
    const body = (await response.text()).slice(0, 500)
    if (!response.ok) {
      return prisma.adConversionSignal.update({
        where: { id: signal.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastAttemptAt: new Date(),
          providerResponse: body,
          errorCode: `http_${response.status}`,
        },
      })
    }
    return prisma.adConversionSignal.update({
      where: { id: signal.id },
      data: {
        status: 'sent',
        attempts,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        providerResponse: body,
        errorCode: null,
      },
    })
  } catch (error) {
    return prisma.adConversionSignal.update({
      where: { id: signal.id },
      data: {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        lastAttemptAt: new Date(),
        errorCode: 'network',
        providerResponse: (error as Error).message.slice(0, 500),
      },
    })
  }
}

/** Registra y entrega en un paso. Nunca lanza: la señal es best-effort. */
async function sendStage(input: EnqueueInput) {
  try {
    const signal = await enqueueConversionSignal(input)
    if (signal?.status === 'pending') return deliverConversionSignal(signal.orgId, signal.id)
    return signal
  } catch (error) {
    console.warn(`[MetaConversions] ${input.stage} error:`, (error as Error).message)
    return null
  }
}

export async function sendLeadEvent(
  orgId: string,
  lead: { id: string; email?: string | null; phone?: string | null; campaignId?: string | null }
) {
  return sendStage({ orgId, stage: 'lead', leadId: lead.id, entityId: lead.id })
}

/**
 * Cualificación: la señal que Meta no puede conocer por su cuenta y que da
 * sentido a todo el circuito. Se envía como `Lead` con su propio `event_id`,
 * porque la integración actual no expone un evento de calidad específico.
 */
export async function sendQualifiedLeadEvent(orgId: string, callId: string, leadId: string) {
  return sendStage({ orgId, stage: 'qualified_lead', leadId, entityId: callId })
}

export async function sendScheduleEvent(orgId: string, meeting: { leadId: string; id?: string }) {
  return sendStage({
    orgId,
    stage: 'schedule',
    leadId: meeting.leadId,
    entityId: meeting.id ?? meeting.leadId,
  })
}

/** Venta cerrada: el único evento que lleva valor económico. */
export async function sendSaleEvent(
  orgId: string,
  opportunity: { id: string; leadId: string; valueCents?: number | null; currency?: string | null }
) {
  return sendStage({
    orgId,
    stage: 'sale',
    leadId: opportunity.leadId,
    entityId: opportunity.id,
    valueCents: opportunity.valueCents ?? null,
    currency: opportunity.currency ?? 'EUR',
  })
}

/** Reintenta las señales que quedaron pendientes por un fallo transitorio. */
export async function retryPendingSignals(orgId: string, limit = 25) {
  const pending = await prisma.adConversionSignal.findMany({
    where: { orgId, status: 'pending', attempts: { gt: 0, lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })
  for (const signal of pending) await deliverConversionSignal(orgId, signal.id)
  return pending.length
}

/**
 * Salud de CAPI a partir de entregas reales, no de si hay un pixel escrito en
 * la configuración. `not_configured` significa que falta el pixel; `unknown`,
 * que no ha habido ningún envío del que poder opinar.
 */
export async function getCapiHealth(orgId: string, windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 86_400_000)
  const rows = await prisma.adConversionSignal.groupBy({
    by: ['status'],
    where: { orgId, createdAt: { gte: since } },
    _count: { _all: true },
  })
  const count = (status: string) => rows.find(row => row.status === status)?._count._all ?? 0
  const sent = count('sent')
  const failed = count('failed')
  const pending = count('pending')
  const noConsent = count('skipped_no_consent')
  const notConfigured = count('skipped_not_configured')
  const total = sent + failed + pending + noConsent + notConfigured

  const status = total === 0
    ? 'unknown'
    : notConfigured > 0 && sent === 0
      ? 'not_configured'
      : failed > 0
        ? 'error'
        : sent > 0
          ? 'sending'
          : 'ready'

  const duplicates = await prisma.adConversionSignal.aggregate({
    where: { orgId, createdAt: { gte: since } },
    _sum: { duplicateAttempts: true },
  })
  const duplicateCount = duplicates._sum.duplicateAttempts ?? 0

  const lastSent = await prisma.adConversionSignal.findFirst({
    where: { orgId, status: 'sent' },
    orderBy: { deliveredAt: 'desc' },
    select: { deliveredAt: true, stage: true },
  })

  return {
    status,
    sent,
    failed,
    pending,
    skippedNoConsent: noConsent,
    skippedNotConfigured: notConfigured,
    total,
    duplicates: duplicateCount,
    // Sobre el total de intentos, no sobre los aceptados: si de 100 envíos 20
    // fueron repeticiones, la tasa es 20/120, no 20/100.
    duplicateRatePct: total + duplicateCount > 0
      ? Math.round((duplicateCount / (total + duplicateCount)) * 100)
      : null,
    lastSentAt: lastSent?.deliveredAt ?? null,
    deepestStageSent: lastSent?.stage ?? null,
  }
}
