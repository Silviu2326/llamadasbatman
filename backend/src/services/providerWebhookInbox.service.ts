import { createHmac, timingSafeEqual } from 'node:crypto'
import { beginWebhookEvent, type WebhookBeginResult } from '../observability/webhookLifecycle'

export class ProviderWebhookVerificationError extends Error {
  constructor(public code: 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE' | 'MISSING_TIMESTAMP' | 'STALE_TIMESTAMP' | 'MISSING_EVENT_ID') {
    super(code)
  }
}

type HeaderBag = Record<string, string | string[] | undefined>

function header(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function parseTimestamp(raw: string): Date | null {
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export type ProviderWebhookProfile = {
  provider: string
  channel: string
  secret: string
  signatureHeader?: string
  timestampHeader?: string
  eventIdHeader?: string
  signatureVersion?: string
  maxSkewSeconds?: number
  /** Standard Webhooks firma "id.timestamp.rawBody". */
  signedPayload?: (parts: { eventId: string; timestamp: string; rawBody: string }) => string
  normalizeSignature?: (headerValue: string) => string[]
}

/**
 * Verifica autenticidad + frescura y reclama el inbox en una sola API. El
 * caller NO debe ejecutar ningún efecto si `claimed` es false.
 */
export async function verifyAndClaimProviderWebhook(input: {
  profile: ProviderWebhookProfile
  headers: HeaderBag
  rawBody: string
  correlationId?: string
  providerJobId?: string
  eventType?: string
  orgId?: string
}): Promise<WebhookBeginResult & { eventTimestamp: Date }> {
  const signatureValue = header(input.headers, input.profile.signatureHeader ?? 'webhook-signature')
  if (!signatureValue) throw new ProviderWebhookVerificationError('MISSING_SIGNATURE')
  const timestampRaw = header(input.headers, input.profile.timestampHeader ?? 'webhook-timestamp')
  if (!timestampRaw) throw new ProviderWebhookVerificationError('MISSING_TIMESTAMP')
  const eventId = header(input.headers, input.profile.eventIdHeader ?? 'webhook-id')?.trim()
  if (!eventId) throw new ProviderWebhookVerificationError('MISSING_EVENT_ID')
  const eventTimestamp = parseTimestamp(timestampRaw)
  const maxSkewMs = (input.profile.maxSkewSeconds ?? 300) * 1000
  if (!eventTimestamp || Math.abs(Date.now() - eventTimestamp.getTime()) > maxSkewMs) {
    throw new ProviderWebhookVerificationError('STALE_TIMESTAMP')
  }

  const payload = (input.profile.signedPayload ?? ((parts) => `${parts.eventId}.${parts.timestamp}.${parts.rawBody}`))({
    eventId,
    timestamp: timestampRaw,
    rawBody: input.rawBody,
  })
  const secret = input.profile.secret.startsWith('whsec_')
    ? Buffer.from(input.profile.secret.slice(6), 'base64')
    : Buffer.from(input.profile.secret, 'utf8')
  const expected = createHmac('sha256', secret).update(payload).digest('base64')
  const candidates = input.profile.normalizeSignature
    ? input.profile.normalizeSignature(signatureValue)
    : signatureValue.split(/\s+/).map((candidate) => candidate.includes(',') ? candidate.split(',')[1] : candidate).filter(Boolean)
  if (!candidates.some((candidate) => safeEqual(candidate, expected))) {
    throw new ProviderWebhookVerificationError('INVALID_SIGNATURE')
  }

  const claimed = await beginWebhookEvent({
    provider: input.profile.provider,
    channel: input.profile.channel,
    externalEventId: eventId,
    rawBody: input.rawBody,
    correlationId: input.correlationId,
    providerJobId: input.providerJobId,
    eventTimestamp,
    eventType: input.eventType,
    orgId: input.orgId,
    signatureValid: true,
    signatureVersion: input.profile.signatureVersion ?? 'hmac-sha256-v1',
  })
  return { ...claimed, eventTimestamp }
}

