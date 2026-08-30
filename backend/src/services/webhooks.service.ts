import { createHmac, randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { fetchWithTimeout } from '../lib/integrationRuntime'

/**
 * Webhooks salientes sobre el outbox que ya existe. Los topics son exactamente
 * los que emite el producto —no hay una capa de eventos nueva—, así que lo que
 * ve una integración es lo mismo que dispara las automatizaciones internas.
 */
export const WEBHOOK_TOPICS = Object.freeze([
  'lead.created',
  'call.completed',
  'message.received',
  'meeting.created',
  'meeting.rescheduled',
  'meeting.completed',
  'meeting.cancelled',
  'meeting.no_show',
  'opportunity.created',
  'opportunity.stage.changed',
  'opportunity.won',
  'opportunity.lost',
  'opportunity.reopened',
] as const)

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number]

const DELIVERY_TIMEOUT_MS = 10_000
const MAX_FAILURES = 20

export function isWebhookTopic(value: unknown): value is WebhookTopic {
  return typeof value === 'string' && (WEBHOOK_TOPICS as readonly string[]).includes(value)
}

/** Firma con el mismo formato que usan Stripe y Meta aquí: `t=…,v1=…`. */
export function signPayload(secret: string, body: string, timestampSeconds: number): string {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex')
  return `t=${timestampSeconds},v1=${signature}`
}

export async function listSubscriptions(orgId: string) {
  return prisma.webhookSubscription.findMany({
    where: { orgId },
    select: {
      id: true, topic: true, targetUrl: true, lastStatus: true, lastError: true,
      lastDeliveredAt: true, failureCount: true, disabledAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function subscribe(orgId: string, input: { topic: string; targetUrl: string; createdById?: string }) {
  if (!isWebhookTopic(input.topic)) throw new Error('Ese evento no existe')
  const parsed = new URL(input.targetUrl)
  if (parsed.protocol !== 'https:' && process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS !== 'true') {
    throw new Error('La URL de destino debe usar https')
  }
  const secret = `whsec_${randomBytes(24).toString('base64url')}`
  const subscription = await prisma.webhookSubscription.upsert({
    where: { orgId_topic_targetUrl: { orgId, topic: input.topic, targetUrl: parsed.toString() } },
    // Re-suscribirse reactiva y limpia el historial de fallos: es lo que hace
    // Zapier al volver a activar un Zap, y debe ser idempotente.
    update: { disabledAt: null, failureCount: 0, lastError: null },
    create: { orgId, topic: input.topic, targetUrl: parsed.toString(), secret, createdById: input.createdById ?? null },
    select: { id: true, topic: true, targetUrl: true, secret: true, createdAt: true },
  })
  return subscription
}

export async function unsubscribe(orgId: string, id: string) {
  const deleted = await prisma.webhookSubscription.deleteMany({ where: { id, orgId } })
  return deleted.count === 1
}

/**
 * Entrega un evento a las suscripciones activas del topic.
 *
 * Nunca lanza: se llama desde el despachador del outbox, y propagar un fallo de
 * red haría que se reintentase el evento entero —incluidas las automatizaciones
 * ya ejecutadas—, duplicándolas.
 *
 * ponytail: entrega única, sin cola de reintentos por suscripción. El resultado
 * de cada intento queda en la fila (`lastStatus`, `lastError`, `failureCount`) y
 * se ve en el portal, y a los 20 fallos seguidos la suscripción se desactiva
 * sola. Si algún día hace falta reintentar entrega por entrega, el paso es una
 * tabla `WebhookDelivery` con su propio estado, no reintentar aquí.
 */
export async function deliverWebhooks(orgId: string, topic: string, payload: Record<string, unknown>): Promise<number> {
  if (!isWebhookTopic(topic)) return 0
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { orgId, topic, disabledAt: null },
    select: { id: true, targetUrl: true, secret: true },
  })
  if (!subscriptions.length) return 0

  const timestamp = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ topic, orgId, occurredAt: new Date(timestamp * 1000).toISOString(), data: payload })

  const results = await Promise.all(subscriptions.map(async subscription => {
    try {
      const response = await fetchWithTimeout(subscription.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendrava-Topic': topic,
          'X-Vendrava-Signature': signPayload(subscription.secret, body, timestamp),
        },
        body,
      }, DELIVERY_TIMEOUT_MS)
      if (response.ok) {
        await prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: { lastStatus: response.status, lastError: null, lastDeliveredAt: new Date(), failureCount: 0 },
        })
        return true
      }
      // 410 Gone es la baja estándar de REST Hooks: Zapier lo devuelve cuando
      // se desactiva un Zap sin llegar a llamar a unsubscribe.
      await recordFailure(subscription.id, response.status, `HTTP ${response.status}`, response.status === 410)
      return false
    } catch (error) {
      await recordFailure(subscription.id, null, (error as Error).message.slice(0, 300), false)
      return false
    }
  }))
  return results.filter(Boolean).length
}

async function recordFailure(id: string, status: number | null, error: string, disableNow: boolean) {
  const updated = await prisma.webhookSubscription.update({
    where: { id },
    data: {
      lastStatus: status,
      lastError: error,
      failureCount: { increment: 1 },
      ...(disableNow ? { disabledAt: new Date() } : {}),
    },
    select: { failureCount: true, disabledAt: true },
  }).catch(() => null)
  if (updated && !updated.disabledAt && updated.failureCount >= MAX_FAILURES) {
    await prisma.webhookSubscription.update({ where: { id }, data: { disabledAt: new Date() } }).catch(() => {})
  }
}
