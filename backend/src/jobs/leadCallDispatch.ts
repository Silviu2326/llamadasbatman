import { Job, Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { enqueueDatabaseJob, startDatabaseQueueWorker } from '../lib/databaseQueue'
import { isPostgresQueueBackend } from '../lib/queueBackend'
import { canCall } from '../voice/compliance'
import { startOutboundCall } from '../voice/telephony/twilioClient'
import { canStartWhiteLabelVoice } from '../services/whiteLabel.service'

export interface LeadCallJob {
  orgId: string
  leadId: string
}

const QUEUE_NAME = 'lead-call-dispatch'
export const MAX_CALL_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 15 * 60 * 1000
const reportLeadCallError = reportQueueError('LeadCallDispatch')

let leadCallQueue: Queue<LeadCallJob> | null = null
let leadCallDispatchWorker: Worker<LeadCallJob> | null = null
let stopDatabaseWorker: (() => void) | null = null

async function processLeadCallJob({ orgId, leadId }: LeadCallJob): Promise<void> {
  console.log(`[LeadCallDispatch] job — lead ${leadId}`)

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    include: { campaign: { include: { agent: true } } },
  })
  if (!lead || !lead.phone || lead.attempts >= MAX_CALL_ATTEMPTS) return
  if (!lead.campaignId) {
    console.warn(`[LeadCallDispatch] lead ${leadId} sin campaña — llamada omitida`)
    return
  }

  const agent = lead.campaign?.agent ?? (await prisma.agent.findFirst({ where: { orgId, isActive: true } }))
  if (!agent) return
  if (!await canStartWhiteLabelVoice(orgId)) {
    console.warn(`[LeadCallDispatch] lead ${leadId} bloqueado por cuota de voz white-label`)
    return
  }
  const compliance = await canCall(orgId, lead.phone, lead.id)
  if (!compliance.allowed) {
    console.warn(`[LeadCallDispatch] lead ${leadId} bloqueado por compliance: ${compliance.reason}`)
    return
  }

  await prisma.lead.update({ where: { id: lead.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date() } })
  const result = await startOutboundCall({
    toNumber: lead.phone,
    orgId,
    campaignId: lead.campaignId,
    agentId: agent.id,
    leadId: lead.id,
    businessName: lead.company ?? undefined,
  })
  console.log(`[LeadCallDispatch] lead ${leadId} → call ${result.status} (${result.sid ?? 'n/a'})`)
}

/**
 * `dedupeKey` convierte el encolado en idempotente: BullMQ ignora un `jobId`
 * que ya existe, así que reintentar el paso de una secuencia tras un lease
 * caducado no llama dos veces al mismo prospecto. Sin clave se comporta como
 * siempre (una llamada por invocación), que es lo que quieren las fuentes de
 * leads: dos formularios son dos llamadas.
 */
export async function enqueueLeadCall(orgId: string, leadId: string, dedupeKey?: string): Promise<boolean> {
  if (isPostgresQueueBackend()) {
    return enqueueDatabaseJob({ queue: QUEUE_NAME, kind: 'call', payload: { orgId, leadId }, dedupeKey })
  }
  if (!leadCallQueue) return false
  try {
    await leadCallQueue.add(
      'call',
      { orgId, leadId },
      { priority: 1, removeOnComplete: 1000, removeOnFail: 1000, ...(dedupeKey ? { jobId: dedupeKey } : {}) }
    )
    return true
  } catch (error) {
    reportLeadCallError(error as Error)
    return false
  }
}

export async function scheduleRetry(orgId: string, leadId: string, attemptsSoFar: number): Promise<boolean> {
  if (isPostgresQueueBackend()) {
    if (attemptsSoFar >= MAX_CALL_ATTEMPTS) return false
    return enqueueDatabaseJob({
      queue: QUEUE_NAME,
      kind: 'call-retry',
      payload: { orgId, leadId },
      dedupeKey: `retry:${orgId}:${leadId}:${attemptsSoFar}`,
      delayMs: RETRY_BACKOFF_MS * attemptsSoFar,
    })
  }
  if (!leadCallQueue || attemptsSoFar >= MAX_CALL_ATTEMPTS) return false
  try {
    await leadCallQueue.add(
      'call',
      { orgId, leadId },
      { delay: RETRY_BACKOFF_MS * attemptsSoFar, priority: 2, removeOnComplete: 1000, removeOnFail: 1000 }
    )
    return true
  } catch (error) {
    reportLeadCallError(error as Error)
    return false
  }
}

void (async () => {
  if (isPostgresQueueBackend()) {
    if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
      stopDatabaseWorker = startDatabaseQueueWorker({
        queue: QUEUE_NAME,
        handler: payload => processLeadCallJob(payload as unknown as LeadCallJob),
        pollMs: Number(process.env.WORKER_QUEUE_POLL_MS ?? 5_000),
      })
    }
    return
  }
  const connection = await connectOptionalRedis('LeadCallDispatch')
  if (!connection) return

  try {
    leadCallQueue = new Queue<LeadCallJob>(QUEUE_NAME, { connection: connection as any })
    leadCallQueue.on('error', reportLeadCallError)

    // The API can enqueue jobs, but only the dedicated worker process consumes them.
    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    const worker = new Worker<LeadCallJob>(
      QUEUE_NAME,
      async (job: Job<LeadCallJob>) => processLeadCallJob(job.data),
      {
        connection: connection as any,
        concurrency: 10,
        limiter: { max: 20, duration: 60_000 },
      }
    )

    worker.on('completed', (job) => console.log(`[LeadCallDispatch] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[LeadCallDispatch] job ${job?.id} failed:`, error))
    worker.on('error', reportLeadCallError)
    leadCallDispatchWorker = worker
  } catch (error) {
    reportLeadCallError(error as Error)
    connection.disconnect()
  }
})()

export { leadCallQueue, leadCallDispatchWorker }
