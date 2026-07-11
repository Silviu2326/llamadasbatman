import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
import { canCall } from '../voice/compliance'
import { startOutboundCall } from '../voice/telephony/twilioClient'

export interface LeadCallJob {
  orgId: string
  leadId: string
}

const QUEUE_NAME = 'lead-call-dispatch'
export const MAX_CALL_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 15 * 60 * 1000 // 15min, 30min, 45min...

let leadCallQueue: Queue<LeadCallJob> | null = null
let leadCallDispatchWorker: Worker<LeadCallJob> | null = null

/** Reencola una llamada no contestada con backoff — no hace nada si ya se agotaron los intentos. */
export async function scheduleRetry(orgId: string, leadId: string, attemptsSoFar: number): Promise<boolean> {
  if (!leadCallQueue || attemptsSoFar >= MAX_CALL_ATTEMPTS) return false
  await leadCallQueue.add(
    'call',
    { orgId, leadId },
    { delay: RETRY_BACKOFF_MS * attemptsSoFar, priority: 2, removeOnComplete: 1000, removeOnFail: 1000 }
  )
  return true
}

try {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  connection.on('error', (err) => console.warn('[LeadCallDispatch] Redis error (non-fatal):', err.message))

  leadCallQueue = new Queue<LeadCallJob>(QUEUE_NAME, { connection: connection as any })
  leadCallQueue.on('error', (err) => console.warn('[LeadCallDispatch] Queue error (non-fatal):', err.message))

  const worker = new Worker<LeadCallJob>(
    QUEUE_NAME,
    async (job: Job<LeadCallJob>) => {
      const { orgId, leadId } = job.data
      console.log(`[LeadCallDispatch] job ${job.id} — lead ${leadId}`)

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, orgId },
        include: { campaign: { include: { agent: true } } },
      })
      if (!lead) {
        console.warn(`[LeadCallDispatch] lead ${leadId} not found, skipping`)
        return
      }
      if (!lead.phone) {
        console.warn(`[LeadCallDispatch] lead ${leadId} has no phone, skipping`)
        return
      }
      if (lead.attempts >= MAX_CALL_ATTEMPTS) {
        console.warn(`[LeadCallDispatch] lead ${leadId} ya alcanzó ${MAX_CALL_ATTEMPTS} intentos, skipping`)
        return
      }

      const agent = lead.campaign?.agent ?? (await prisma.agent.findFirst({ where: { orgId, isActive: true } }))
      if (!agent) {
        console.warn(`[LeadCallDispatch] no active agent for org ${orgId}, skipping lead ${leadId}`)
        return
      }

      const compliance = await canCall(orgId, lead.phone)
      if (!compliance.allowed) {
        console.warn(`[LeadCallDispatch] lead ${leadId} blocked: ${compliance.reason}`)
        return
      }

      await prisma.lead.update({ where: { id: lead.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date() } })

      const result = await startOutboundCall({
        toNumber: lead.phone,
        orgId,
        campaignId: lead.campaignId ?? '',
        agentId: agent.id,
        leadId: lead.id,
        businessName: lead.company ?? undefined,
      })
      console.log(`[LeadCallDispatch] lead ${leadId} → call ${result.status} (${result.sid ?? 'n/a'})`)
    },
    {
      connection: connection as any,
      concurrency: 10,
      // ponytail: tope fijo de 20 llamadas/min — subir si el volumen real lo justifica
      limiter: { max: 20, duration: 60_000 },
    }
  )

  worker.on('completed', (job) => console.log(`[LeadCallDispatch] job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[LeadCallDispatch] job ${job?.id} failed:`, err))
  worker.on('error', (err) => console.warn('[LeadCallDispatch] Worker error (non-fatal):', err.message))

  leadCallDispatchWorker = worker
} catch (err) {
  console.warn('[LeadCallDispatch] Disabled (Redis unavailable):', (err as Error).message)
}

export { leadCallQueue, leadCallDispatchWorker }
