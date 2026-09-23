// This service handles only the configured organisation's phone calls.
// Other modules must not start their email/content/WhatsApp timers on import.
process.env.BACKGROUND_WORKERS_ENABLED = 'false'

async function main() {
  const orgId = process.env.ZADARMA_ORG_ID?.trim()
  if (!orgId) throw new Error('ZADARMA_ORG_ID_REQUIRED')
  const { isPostgresQueueBackend } = await import('./lib/queueBackend')
  if (!isPostgresQueueBackend()) throw new Error('CALL_WORKER_REQUIRES_POSTGRES_QUEUE')
  const { prisma } = await import('./lib/prisma')
  const { startWorkerHeartbeat } = await import('./observability/workerHeartbeat')
  const { startDatabaseQueueWorker } = await import('./lib/databaseQueue')
  const { processLeadCallJob } = await import('./jobs/leadCallDispatch')
  const { processSalesSequenceTick } = await import('./services/salesSequence.service')
  await prisma.$connect()
  const stopHeartbeat = await startWorkerHeartbeat('call-worker')
  if (!stopHeartbeat) throw new Error('CALL_WORKER_HEARTBEAT_UNAVAILABLE')
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await processSalesSequenceTick(25, `call-worker-${process.pid}`, { orgId, type: 'call' }) }
    catch { console.error('[CallWorker] Sequence tick failed; retrying on next poll') }
    finally { running = false }
  }
  const stopQueue = startDatabaseQueueWorker({
    queue: 'lead-call-dispatch', orgId, pollMs: 5000,
    handler: async payload => {
      if (payload.orgId !== orgId || typeof payload.leadId !== 'string') throw new Error('CALL_JOB_SCOPE_INVALID')
      await processLeadCallJob({ orgId, leadId: payload.leadId })
    },
  })
  const timer = setInterval(() => void tick(), 10000)
  const shutdown = () => {
    clearInterval(timer)
    stopQueue()
    stopHeartbeat()
    // Asterisk and the independent gateway own calls that have already started.
    void prisma.$disconnect().finally(() => process.exit(0))
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  console.log('[CallWorker] Ready: PostgreSQL call queue and scheduled call steps')
  await tick()
}

void main().catch(() => { console.error('[CallWorker] Startup failed'); process.exit(1) })
