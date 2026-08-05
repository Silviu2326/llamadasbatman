import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { runAutomationsForEvent } from '../services/automations.service'
import { recordQueueEvent } from '../observability/metrics'
import { classifyOperationalError, logOperational } from '../observability/operationalLog'
import { sendQualifiedLeadEvent, sendSaleEvent } from '../services/metaConversions.service'
import { isQualifyingOutcome } from '../lib/callOutcome'

const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 5_000)
const BATCH_SIZE = 25
const LEASE_MS = Math.max(30_000, Number(process.env.OUTBOX_LEASE_MS ?? 5 * 60_000))
const WORKER_ID = process.env.OUTBOX_WORKER_ID?.trim() || `outbox-${process.pid}-${randomUUID()}`
export const MAX_OUTBOX_ATTEMPTS = Math.max(1, Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 8))
const MAX_BACKOFF_MINUTES = 60
let running = false

function dueOutboxWhere(now: Date): Prisma.OutboxEventWhereInput {
  return {
    OR: [
      { status: 'pending', availableAt: { lte: now } },
      // Recover rows left by an older worker version without durable leases.
      { status: 'processing', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
    ],
  }
}

/** Conditional UPDATE is the concurrent claim primitive. */
export async function claimOutboxEvent(eventId: string, workerId = WORKER_ID) {
  const now = new Date()
  const claimed = await prisma.outboxEvent.updateMany({
    where: { id: eventId, ...dueOutboxWhere(now) },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      lockedAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      workerId,
    },
  })
  if (claimed.count !== 1) {
    recordQueueEvent({ queue: 'outbox', outcome: 'claim_conflict' })
    return null
  }
  recordQueueEvent({ queue: 'outbox', outcome: 'claimed' })
  return prisma.outboxEvent.findUnique({ where: { id: eventId } })
}

async function claimDueOutboxEvents(workerId = WORKER_ID) {
  const now = new Date()
  const candidates = await prisma.outboxEvent.findMany({
    where: dueOutboxWhere(now), orderBy: { createdAt: 'asc' }, take: BATCH_SIZE * 2, select: { id: true },
  })
  const claimed = await Promise.all(candidates.map(candidate => claimOutboxEvent(candidate.id, workerId)))
  return claimed.filter((event): event is NonNullable<typeof event> => Boolean(event)).slice(0, BATCH_SIZE)
}

async function renewOutboxLease(eventId: string, workerId: string): Promise<boolean> {
  const now = new Date()
  const renewed = await prisma.outboxEvent.updateMany({
    where: { id: eventId, status: 'processing', workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  })
  return renewed.count === 1
}

/** Keeps ownership alive during a slow automation run. */
async function withOutboxLease<T>(eventId: string, workerId: string, work: () => Promise<T>) {
  let leaseLost = false
  let renewal = Promise.resolve()
  const heartbeat = () => {
    renewal = renewal.then(async () => {
      try {
        if (!await renewOutboxLease(eventId, workerId)) leaseLost = true
      } catch {
        leaseLost = true
      }
    })
  }
  const timer = setInterval(heartbeat, Math.max(1_000, Math.floor(LEASE_MS / 3)))
  timer.unref()
  try {
    const value = await work()
    clearInterval(timer)
    await renewal
    return { value, leaseLost }
  } catch (error) {
    clearInterval(timer)
    await renewal
    throw error
  }
}

async function markOutboxProcessed(eventId: string, workerId: string): Promise<boolean> {
  const updated = await prisma.outboxEvent.updateMany({
    where: { id: eventId, status: 'processing', workerId },
    data: { status: 'processed', processedAt: new Date(), lastError: null, lastErrorCode: null, lockedAt: null, leaseExpiresAt: null, workerId: null },
  })
  if (updated.count === 1) recordQueueEvent({ queue: 'outbox', outcome: 'processed' })
  return updated.count === 1
}

async function releaseOutboxForRetry(event: { id: string; attempts: number; correlationId?: string | null }, workerId: string, error: unknown): Promise<void> {
  const classified = classifyOperationalError(error)
  if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
    await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'processing', workerId },
      data: { status: 'dead_letter', lastError: classified.safeMessage, lastErrorCode: 'MAX_ATTEMPTS_EXCEEDED', lockedAt: null, leaseExpiresAt: null, workerId: null },
    })
    recordQueueEvent({ queue: 'outbox', outcome: 'dead_letter' })
    logOperational('error', 'outbox.dead_letter', {
      correlationId: event.correlationId ?? undefined, queue: 'outbox', eventId: event.id, attempt: event.attempts,
      errorCode: 'MAX_ATTEMPTS_EXCEEDED', remediation: classified.remediation,
    })
    return
  }

  const delayMinutes = Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(0, event.attempts - 1))
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: 'processing', workerId },
    data: {
      status: 'pending', availableAt: new Date(Date.now() + delayMinutes * 60_000),
      lastError: classified.safeMessage, lastErrorCode: classified.code,
      lockedAt: null, leaseExpiresAt: null, workerId: null,
    },
  })
  recordQueueEvent({ queue: 'outbox', outcome: 'retry' })
  logOperational('warn', 'outbox.retry.scheduled', {
    correlationId: event.correlationId ?? undefined, queue: 'outbox', eventId: event.id, attempt: event.attempts,
    errorCode: classified.code, remediation: classified.remediation,
  })
}

/**
 * Devuelve a Meta la señal profunda que su pixel no puede conocer: si un lead
 * cualificó en la llamada y si acabó comprando.
 *
 * No lanza nunca. Una señal que no sale no puede tumbar el procesamiento del
 * evento de negocio, y la fila de `AdConversionSignal` conserva el fallo para
 * que se pueda reintentar y para que la banda de integridad lo muestre.
 */
async function forwardConversionSignal(orgId: string, topic: string, payload: Record<string, unknown>) {
  try {
    if (topic === 'call.completed') {
      const callId = typeof payload.callId === 'string' ? payload.callId : null
      const leadId = typeof payload.leadId === 'string' ? payload.leadId : null
      if (callId && leadId && isQualifyingOutcome(payload.outcome)) {
        await sendQualifiedLeadEvent(orgId, callId, leadId)
      }
      return
    }
    if (topic === 'opportunity.won') {
      const opportunityId = typeof payload.opportunityId === 'string' ? payload.opportunityId : null
      const leadId = typeof payload.leadId === 'string' ? payload.leadId : null
      if (opportunityId && leadId) {
        await sendSaleEvent(orgId, {
          id: opportunityId,
          leadId,
          valueCents: typeof payload.valueCents === 'number' ? payload.valueCents : null,
          currency: typeof payload.currency === 'string' ? payload.currency : 'EUR',
        })
      }
    }
  } catch (error) {
    console.warn(`[Outbox] señal de conversión no enviada (${topic}):`, (error as Error).message)
  }
}

async function dispatchPendingOutbox() {
  if (running) return
  running = true
  try {
    const events = await claimDueOutboxEvents(WORKER_ID)
    for (const event of events) {
      try {
        const outcome = await withOutboxLease(event.id, WORKER_ID, async () => {
          const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
            ? event.payload as Record<string, unknown> : {}
          await runAutomationsForEvent(event.orgId, event.topic, {
            ...payload,
            eventId: payload.eventId ?? event.id,
            correlationId: payload.correlationId ?? event.correlationId ?? undefined,
          })
          // La señal de vuelta a Meta viaja por el outbox y no en
          // fire-and-forget: así hereda el lease, los reintentos y la
          // deduplicación, que es lo que exige la Fase 2 de ads.md.
          await forwardConversionSignal(event.orgId, event.topic, payload)
        })
        if (outcome.leaseLost) {
          recordQueueEvent({ queue: 'outbox', outcome: 'lease_lost' })
          logOperational('warn', 'outbox.lease.lost', {
            correlationId: event.correlationId ?? undefined, queue: 'outbox', eventId: event.id,
            remediation: 'Esperar la recuperación por lease y comprobar la latencia de la base.',
          })
          continue
        }
        await markOutboxProcessed(event.id, WORKER_ID)
      } catch (error) {
        await releaseOutboxForRetry(event, WORKER_ID, error)
      }
    }
  } finally {
    running = false
  }
}

let outboxTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  outboxTimer = setInterval(() => void dispatchPendingOutbox(), POLL_MS)
  outboxTimer.unref()
  void dispatchPendingOutbox()
}

export { dispatchPendingOutbox, outboxTimer }
