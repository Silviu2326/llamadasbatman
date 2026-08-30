import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { recordWebhookLifecycle } from './metrics'
import { classifyOperationalError, logOperational } from './operationalLog'

const MAX_ATTEMPTS = Math.max(1, Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 8))
const IN_FLIGHT_GRACE_MS = Math.max(5_000, Number(process.env.WEBHOOK_IN_FLIGHT_GRACE_MS ?? 30_000))

export type WebhookBeginInput = {
  provider: string
  channel: string
  eventType?: string
  orgId?: string
  correlationId?: string
  externalEventId?: string
  rawBody?: string
  providerJobId?: string
  eventTimestamp?: Date
  signatureValid?: boolean
  signatureVersion?: string
  metadata?: Record<string, unknown>
}

export type WebhookBeginResult = {
  id: string
  externalEventId: string
  claimed: boolean
  duplicate: boolean
  inFlight: boolean
  deadLetter: boolean
}

function stableExternalEventId(input: WebhookBeginInput): string {
  const source = input.externalEventId?.trim()
  if (source) return `${input.provider}:${input.channel}:${source}`.slice(0, 240)
  const fingerprint = createHash('sha256')
    .update(`${input.provider}|${input.channel}|${input.rawBody ?? ''}`)
    .digest('hex')
  return `${input.provider}:${input.channel}:sha256:${fingerprint}`
}

function safeMetadata(input: WebhookBeginInput, externalEventId: string) {
  return {
    ...(input.metadata ?? {}),
    eventFingerprint: createHash('sha256').update(externalEventId).digest('hex').slice(0, 32),
    bodyBytes: input.rawBody ? Buffer.byteLength(input.rawBody, 'utf8') : undefined,
  }
}

export async function beginWebhookEvent(input: WebhookBeginInput): Promise<WebhookBeginResult> {
  const externalEventId = stableExternalEventId(input)
  const now = new Date()
  try {
    const created = await prisma.webhookEvent.create({
      data: {
        externalEventId,
        orgId: input.orgId,
        provider: input.provider,
        channel: input.channel,
        eventType: input.eventType,
        status: 'processing',
        attempts: 1,
        lastAttemptAt: now,
        correlationId: input.correlationId,
        providerJobId: input.providerJobId,
        eventTimestamp: input.eventTimestamp,
        payloadHash: input.rawBody ? createHash('sha256').update(input.rawBody).digest('hex') : undefined,
        signatureValid: input.signatureValid,
        signatureVersion: input.signatureVersion,
        metadata: safeMetadata(input, externalEventId),
      },
      select: { id: true },
    })
    recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: 'received' })
    return { id: created.id, externalEventId, claimed: true, duplicate: false, inFlight: false, deadLetter: false }
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalEventId: { provider: input.provider, externalEventId } },
    select: { id: true, status: true, attempts: true, lastAttemptAt: true },
  })
  if (!existing) throw new Error('Webhook event disappeared after unique conflict')
  if (existing.status === 'processed') {
    recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: 'duplicate' })
    return { id: existing.id, externalEventId, claimed: false, duplicate: true, inFlight: false, deadLetter: false }
  }
  if (existing.status === 'dead_letter' || existing.attempts >= MAX_ATTEMPTS) {
    recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: 'dead_letter' })
    return { id: existing.id, externalEventId, claimed: false, duplicate: false, inFlight: false, deadLetter: true }
  }
  if (existing.status === 'processing' && existing.lastAttemptAt && now.getTime() - existing.lastAttemptAt.getTime() < IN_FLIGHT_GRACE_MS) {
    return { id: existing.id, externalEventId, claimed: false, duplicate: true, inFlight: true, deadLetter: false }
  }

  const reclaimed = await prisma.webhookEvent.updateMany({
    where: {
      id: existing.id,
      status: { in: ['received', 'failed', 'error', 'processing'] },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      lastAttemptAt: now,
      correlationId: input.correlationId,
      error: null,
      errorCode: null,
    },
  })
  if (!reclaimed.count) return { id: existing.id, externalEventId, claimed: false, duplicate: true, inFlight: true, deadLetter: false }
  recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: 'received' })
  return { id: existing.id, externalEventId, claimed: true, duplicate: false, inFlight: false, deadLetter: false }
}

export async function finishWebhookEvent(input: {
  id: string
  provider: string
  channel: string
  correlationId?: string
  success: boolean
  error?: unknown
}): Promise<void> {
  if (input.success) {
    await prisma.webhookEvent.updateMany({
      where: { id: input.id, status: 'processing' },
      data: { status: 'processed', processedAt: new Date(), error: null, errorCode: null, correlationId: input.correlationId },
    })
    recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: 'processed' })
    return
  }
  const classified = classifyOperationalError(input.error)
  const current = await prisma.webhookEvent.findUnique({ where: { id: input.id }, select: { attempts: true } })
  const deadLetter = (current?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS
  await prisma.webhookEvent.updateMany({
    where: { id: input.id, status: 'processing' },
    data: {
      status: deadLetter ? 'dead_letter' : 'failed',
      error: classified.safeMessage,
      errorCode: classified.code,
      lastAttemptAt: new Date(),
      correlationId: input.correlationId,
    },
  })
  recordWebhookLifecycle({ provider: input.provider, channel: input.channel, outcome: deadLetter ? 'dead_letter' : 'failed' })
  logOperational(deadLetter ? 'error' : 'warn', deadLetter ? 'webhook.dead_letter' : 'webhook.failed', {
    correlationId: input.correlationId,
    provider: input.provider,
    channel: input.channel,
    eventId: input.id,
    errorCode: classified.code,
    remediation: classified.remediation,
  })
}

export function webhookExternalId(input: WebhookBeginInput): string {
  return stableExternalEventId(input)
}
