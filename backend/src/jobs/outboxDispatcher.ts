import { prisma } from '../lib/prisma'
import { runAutomationsForEvent } from '../services/automations.service'

const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 5_000)
const BATCH_SIZE = 25
let running = false

// FND-06: clasificación simple del error para poder filtrar/alertar sin leer
// el mensaje libre — un par de heurísticas por includes() basta para este volumen.
function classifyErrorCode(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('fetch') || lower.includes('econnrefused') || lower.includes('network') || lower.includes('enotfound')) {
    return 'PROVIDER_ERROR'
  }
  if (lower.includes('valid') || lower.includes('required') || lower.includes('missing') || lower.includes('unsupported') || lower.includes('not found')) {
    return 'VALIDATION_ERROR'
  }
  return 'UNKNOWN'
}

async function dispatchPendingOutbox() {
  if (running) return
  running = true
  try {
    const events = await prisma.outboxEvent.findMany({
      where: { status: 'pending', availableAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    })
    for (const event of events) {
      const claimed = await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'pending' },
        data: { status: 'processing', attempts: { increment: 1 } },
      })
      if (!claimed.count) continue
      try {
        const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown>
          : {}
        await runAutomationsForEvent(event.orgId, event.topic, {
          ...payload,
          eventId: payload.eventId ?? event.id,
          // FND-06: propaga el correlationId del evento (payload o del propio
          // OutboxEvent) para que el AutomationRun resultante quede rastreable.
          correlationId: payload.correlationId ?? event.correlationId ?? undefined,
        })
        await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'processed', processedAt: new Date(), lastError: null, lastErrorCode: null } })
      } catch (error) {
        const delayMinutes = Math.min(60, 2 ** Math.max(0, event.attempts))
        const message = (error as Error).message
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'pending', availableAt: new Date(Date.now() + delayMinutes * 60_000), lastError: message, lastErrorCode: classifyErrorCode(message) },
        })
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
