import { Job, Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { canCall } from '../voice/compliance'
import { startOutboundCall } from '../voice/telephony/twilioClient'

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

export async function enqueueLeadCall(orgId: string, leadId: string): Promise<boolean> {
  if (!leadCallQueue) return false
  try {
    await leadCallQueue.add(
      'call',
      { orgId, leadId },
      { priority: 1, removeOnComplete: 1000, removeOnFail: 1000 }
    )
    return true
  } catch (error) {
    reportLeadCallError(error as Error)
    return false
  }
}

export async function scheduleRetry(orgId: string, leadId: string, attemptsSoFar: number): Promise<boolean> {
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
  const connection = await connectOptionalRedis('LeadCallDispatch')
  if (!connection) return

  try {
    leadCallQueue = new Queue<LeadCallJob>(QUEUE_NAME, { connection: connection as any })
    leadCallQueue.on('error', reportLeadCallError)

    // The API can enqueue jobs, but only the dedicated worker process consumes them.
    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    const worker = new Worker<LeadCallJob>(
      QUEUE_NAME,
      async (job: Job<LeadCallJob>) => {
        const { orgId, leadId } = job.data
        console.log(`[LeadCallDispatch] job ${job.id} — lead ${leadId}`)

        const lead = await prisma.lead.findFirst({
          where: { id: leadId, orgId },
          include: { campaign: { include: { agent: true } } },
        })
        if (!lead) return
        if (!lead.phone) return
        if (lead.attempts >= MAX_CALL_ATTEMPTS) return

        const agent = lead.campaign?.agent ?? (await prisma.agent.findFirst({ where: { orgId, isActive: true } }))
        if (!agent) return

        const compliance = await canCall(orgId, lead.phone)
        if (!compliance.allowed) return

        await prisma.lead.update({
          where: { id: lead.id },
          data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
        })

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
