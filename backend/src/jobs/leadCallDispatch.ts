import { Job, Queue, Worker } from 'bullmq'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { enqueueDatabaseJob, isQueueRetryError, QueueRetryError, startDatabaseQueueWorker } from '../lib/databaseQueue'
import { isPostgresQueueBackend } from '../lib/queueBackend'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'
import { canCall, nextCallWindow, normalizeE164 } from '../voice/compliance'
import { isZadarmaGatewayCallError, stableRequestId, startOutboundCall } from '../voice/telephony/outbound'
import { findActiveVoiceConsent } from '../services/voiceConsent.service'
import { canStartWhiteLabelVoice } from '../services/whiteLabel.service'
import { checkAgentOperationalLimits } from '../voice/agentLimits'

export interface LeadCallJob {
  orgId: string
  leadId: string
  /** Campaña con la que se encoló; si el lead cambió de campaña, el trabajo caduca. */
  campaignId?: string
  /** Clave de idempotencia fijada al encolar (BullMQ la necesita al reencolar). */
  requestId?: string
}

/** Identidad del trabajo reclamado, para que los reintentos repitan el mismo `requestId`. */
export interface LeadCallJobContext { jobId?: string }

const QUEUE_NAME = 'lead-call-dispatch'
export const MAX_CALL_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 15 * 60 * 1000
const CAPACITY_RETRY_MIN_MS = 20_000
const CAPACITY_RETRY_JITTER_MS = 10_000
const reportLeadCallError = reportQueueError('LeadCallDispatch')

let leadCallQueue: Queue<LeadCallJob> | null = null
let leadCallDispatchWorker: Worker<LeadCallJob> | null = null
let stopDatabaseWorker: (() => void) | null = null

/**
 * Motivos por los que el despacho no marca. Se persisten en
 * `lead.customFields.lastCallBlock`, en `AuditLog` y en el timeline
 * (`SalesActivity`), sin tocar `lead.status` ni `lead.attempts`: un bloqueo no
 * es un intento. Los de cumplimiento reutilizan el `reason` de `canCall`.
 */
export type CallBlockReason =
  | 'lead_without_phone' | 'max_attempts' | 'no_campaign' | 'campaign_changed' | 'campaign_inactive'
  | 'agent_missing' | 'agent_not_active' | 'agent_incomplete' | 'agent_voice_consent_missing' | 'agent_limits'
  | 'white_label_quota' | 'invalid_phone' | 'quota_exceeded' | 'optout' | 'outside_hours' | 'missing_voice_consent'
  | 'gateway_rejected'

export const CALL_BLOCK_LABELS: Record<CallBlockReason, string> = {
  lead_without_phone: 'El contacto no tiene teléfono.',
  max_attempts: `Se alcanzó el máximo de ${MAX_CALL_ATTEMPTS} intentos de llamada.`,
  no_campaign: 'El contacto no pertenece a ninguna campaña.',
  campaign_changed: 'El contacto cambió de campaña después de programar la llamada.',
  campaign_inactive: 'La campaña no está activa.',
  agent_missing: 'La campaña no tiene agente asignado.',
  agent_not_active: 'El agente no está publicado y activo.',
  agent_incomplete: 'Al agente le falta voz, instrucciones o número de salida.',
  agent_voice_consent_missing: 'El consentimiento de voz del agente no está vigente.',
  agent_limits: 'El agente ha alcanzado sus límites operativos.',
  white_label_quota: 'La cuota de voz del plan está agotada.',
  invalid_phone: 'El teléfono del contacto no es válido.',
  quota_exceeded: 'La cuota de minutos de llamada está agotada.',
  optout: 'El contacto pidió no recibir llamadas.',
  outside_hours: 'Fuera del horario permitido para llamar; se reprograma a la siguiente ventana.',
  missing_voice_consent: 'El contacto no tiene consentimiento de voz registrado.',
  gateway_rejected: 'La pasarela de voz rechazó la llamada antes de marcar.',
}

export interface CallBlockRecord { reason: CallBlockReason; at: string; detail?: string }

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function startOfDay(now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

/**
 * Deja constancia de un rechazo previo al marcado. Antes el despacho salía con
 * `return` y el usuario veía «en cola» para siempre; ahora el motivo queda en
 * el lead (`customFields.lastCallBlock`), en la auditoría y en el timeline.
 * Nunca bloquea: si falla la escritura se registra y se sigue.
 */
export async function recordCallBlock(input: {
  orgId: string; lead: { id: string; customFields: unknown; campaignId?: string | null }
  reason: CallBlockReason; detail?: string; agentId?: string | null; jobId?: string
}): Promise<CallBlockRecord> {
  const at = new Date().toISOString()
  const block: CallBlockRecord = { reason: input.reason, at, ...(input.detail ? { detail: input.detail.slice(0, 200) } : {}) }
  const customFields = { ...jsonRecord(input.lead.customFields), lastCallBlock: { ...block } } as unknown as Prisma.InputJsonObject
  try {
    await prisma.lead.update({ where: { id: input.lead.id }, data: { customFields } })
  } catch (error) {
    console.error(`[LeadCallDispatch] lead ${input.lead.id}: no se pudo guardar lastCallBlock`, error instanceof Error ? error.message : error)
  }
  await writeAuditLog({
    orgId: input.orgId, actorType: 'system', action: 'lead.call_blocked', entityType: 'Lead', entityId: input.lead.id,
    after: { ...block, campaignId: input.lead.campaignId ?? null, agentId: input.agentId ?? null },
    correlationId: input.jobId,
  })
  await logSalesActivity({
    orgId: input.orgId, type: 'note', leadId: input.lead.id, source: 'call-dispatch',
    sourceId: `${input.lead.id}:${input.reason}:${input.jobId ?? at}`,
    subject: 'Llamada no realizada', body: CALL_BLOCK_LABELS[input.reason],
    metadata: { ...block, campaignId: input.lead.campaignId ?? null, agentId: input.agentId ?? null },
  })
  console.warn(`[LeadCallDispatch] lead ${input.lead.id} bloqueado: ${input.reason}${input.detail ? ` (${input.detail})` : ''}`)
  return block
}

/**
 * Límites operativos del agente (`voice/agentLimits.ts`: llamadas al día,
 * días activos, franja horaria). `callsToday` cuenta todas las llamadas no de
 * prueba del agente hoy, contestadas o no: un intento que sonó también gasta
 * línea. Si el agente tiene tope mensual de minutos, se suma el consumo.
 */
async function checkAgentLimits(orgId: string, agent: { id: string; settings?: unknown; monthlyMinuteLimit?: number | null }, now: Date) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const [callsToday, month] = await Promise.all([
    prisma.call.count({ where: { orgId, agentId: agent.id, isTest: false, createdAt: { gte: startOfDay(now) } } }),
    agent.monthlyMinuteLimit != null
      ? prisma.call.aggregate({ _sum: { durationSeconds: true }, where: { orgId, agentId: agent.id, createdAt: { gte: monthStart } } })
      : Promise.resolve(null),
  ])
  const minutesThisMonth = month ? Math.ceil((month._sum.durationSeconds ?? 0) / 60) : undefined
  return checkAgentOperationalLimits(agent, { now, callsToday, minutesThisMonth })
}

function capacityDelayMs(hint?: number) {
  return hint && hint > 0 ? hint : CAPACITY_RETRY_MIN_MS + Math.floor(Math.random() * CAPACITY_RETRY_JITTER_MS)
}

/**
 * La centralita marcó y el destino no contestó, comunicaba o rechazó. Es un
 * intento real: se crea la fila `Call` mínima con su estado (`no_answer`,
 * `busy` o `failed`), se suma el intento y se reprograma a 15-30 minutos
 * hasta `MAX_CALL_ATTEMPTS`, como hace Twilio en `routes/voice.ts`. No pasa
 * por `ingestCall` a propósito: esa ruta marca el lead como contactado,
 * suma `campaign.contacted` y dispara `call.completed`, y aquí nadie habló.
 *
 * `ORIGINATE_TIMEOUT` es ambiguo: la centralita no confirmó, pero puede que
 * la llamada sí se cursara y llegue su fila real por AudioSocket o por el
 * reconciliador. Se registra como `failed` con ese aviso y se cuenta el
 * intento, pero NO se reprograma un reintento automático: si no, una llamada
 * contestada tarde acabaría con dos filas y dos intentos.
 */
async function registerUnansweredAttempt(input: {
  orgId: string; lead: { id: string; attempts: number; campaignId: string | null }
  agentId: string; requestId: string; code: string; cause?: string; jobId?: string
}) {
  const now = new Date()
  const ambiguous = input.code === 'ORIGINATE_TIMEOUT'
  const status = ambiguous ? 'failed' : input.cause === 'busy' ? 'busy' : input.cause === 'no_answer' ? 'no_answer' : 'failed'
  const externalCallId = `zadarma:attempt:${input.requestId}`
  const data = {
    orgId: input.orgId, agentId: input.agentId, leadId: input.lead.id, campaignId: input.lead.campaignId ?? undefined,
    externalCallId, status, outcome: 'none', durationSeconds: 0, startedAt: now, endedAt: now,
    summary: ambiguous ? 'Resultado ambiguo: la centralita no confirmó el marcado'
      : status === 'busy' ? 'Comunicaba' : status === 'no_answer' ? 'No contestó' : 'La centralita no pudo completar el marcado',
    amdResult: { provider: 'zadarma', code: input.code, cause: input.cause ?? 'unknown', requestId: input.requestId } as Prisma.InputJsonObject,
  } as const
  let call: { id: string; status: string }
  try {
    call = await prisma.call.create({ data, select: { id: true, status: true } })
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error
    call = await prisma.call.findUniqueOrThrow({ where: { orgId_externalCallId: { orgId: input.orgId, externalCallId } }, select: { id: true, status: true } })
  }
  const attempts = input.lead.attempts + 1
  await prisma.lead.update({ where: { id: input.lead.id }, data: { attempts: { increment: 1 }, lastAttemptAt: now } })
  await logSalesActivity({
    orgId: input.orgId, type: 'call', leadId: input.lead.id, source: 'call', sourceId: call.id,
    metadata: { status, outcome: 'none', durationSeconds: 0, code: input.code, cause: input.cause ?? 'unknown', attempts },
  })
  await writeAuditLog({
    orgId: input.orgId, actorType: 'system', action: 'lead.call_unanswered', entityType: 'Call', entityId: call.id,
    after: { leadId: input.lead.id, status, code: input.code, cause: input.cause ?? 'unknown', attempts }, correlationId: input.jobId,
  })
  const retried = ambiguous ? false : await scheduleRetry(input.orgId, input.lead.id, attempts)
  console.warn(`[LeadCallDispatch] lead ${input.lead.id} → ${status} (${input.code}); intento ${attempts}/${MAX_CALL_ATTEMPTS}${retried ? ', reprogramada' : ambiguous ? ', sin reintento automático (resultado ambiguo)' : ''}`)
  return { call, attempts, retried }
}

export async function processLeadCallJob(job: LeadCallJob, context: LeadCallJobContext = {}): Promise<void> {
  const { orgId, leadId } = job
  console.log(`[LeadCallDispatch] job — lead ${leadId}`)

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    include: { campaign: { include: { agent: true } } },
  })
  if (!lead) { console.warn(`[LeadCallDispatch] lead ${leadId} no existe en la organización`); return }
  const block = async (reason: CallBlockReason, detail?: string) => {
    await recordCallBlock({ orgId, lead, reason, detail, agentId: lead.campaign?.agent?.id ?? null, jobId: context.jobId })
  }

  if (!lead.phone) return block('lead_without_phone')
  if (lead.attempts >= MAX_CALL_ATTEMPTS) return block('max_attempts', `${lead.attempts}/${MAX_CALL_ATTEMPTS}`)
  if (!lead.campaignId || !lead.campaign) return block('no_campaign')
  if (job.campaignId && job.campaignId !== lead.campaignId) return block('campaign_changed')
  if (lead.campaign.status !== 'active') return block('campaign_inactive', lead.campaign.status)
  const agent = lead.campaign.agent
  if (!agent || agent.orgId !== orgId) return block('agent_missing')
  if (!agent.isActive || agent.lifecycleStatus !== 'active') return block('agent_not_active', agent.lifecycleStatus)
  const missing = [!agent.voiceId && 'voice', !agent.systemPrompt && 'instructions', !agent.phoneNumber && 'phone'].filter(Boolean)
  if (missing.length) return block('agent_incomplete', missing.join(','))

  const now = new Date()
  // El consentimiento de voz del agente caduca o se revoca sin que el agente
  // cambie de estado. Se comprueba en cada marcado, igual que en la prueba.
  if (!await findActiveVoiceConsent(orgId, agent.id, agent.voiceId, now)) return block('agent_voice_consent_missing')

  const limits = await checkAgentLimits(orgId, agent, now)
  if (!limits.allowed) {
    await block('agent_limits', limits.reason)
    // Día inactivo, fuera de franja o tope diario: el trabajo espera a la
    // siguiente ventana del agente sin gastar intento. Sin ventana (minutos
    // del mes agotados) se queda bloqueado hasta que alguien actúe.
    if (limits.nextWindow && limits.nextWindow.getTime() > now.getTime()) {
      throw new QueueRetryError('CALL_AGENT_LIMITS', { delayMs: limits.nextWindow.getTime() - now.getTime(), countAttempt: false })
    }
    return
  }
  if (!await canStartWhiteLabelVoice(orgId)) return block('white_label_quota')

  const compliance = await canCall(orgId, lead.phone, lead.id)
  if (!compliance.allowed) {
    const reason = (compliance.reason in CALL_BLOCK_LABELS ? compliance.reason : 'gateway_rejected') as CallBlockReason
    await block(reason, reason === 'gateway_rejected' ? compliance.reason : undefined)
    if (compliance.reason === 'outside_hours') {
      const fields = jsonRecord(lead.customFields)
      const timeZone = typeof fields.callTimeZone === 'string' ? fields.callTimeZone : undefined
      const availableAt = nextCallWindow(normalizeE164(lead.phone) ?? lead.phone, now, timeZone)
      if (availableAt) throw new QueueRetryError('CALL_OUTSIDE_HOURS', { delayMs: availableAt.getTime() - now.getTime(), countAttempt: false })
    }
    return
  }

  // Mismo trabajo, mismo `requestId`: un reintento tras un timeout ambiguo no
  // vuelve a marcar, la pasarela devuelve lo que ya tenía.
  const requestId = job.requestId ?? stableRequestId('lead-call', orgId, lead.id, lead.campaignId, context.jobId ?? `attempt:${lead.attempts}`)
  let result: Awaited<ReturnType<typeof startOutboundCall>>
  try {
    result = await startOutboundCall({
      toNumber: lead.phone, orgId, campaignId: lead.campaignId, agentId: agent.id, leadId: lead.id,
      businessName: lead.company ?? undefined, requestId,
    })
  } catch (error) {
    if (isZadarmaGatewayCallError(error)) {
      if (error.retryable && !error.dialed) {
        // Línea ocupada o pasarela sin AMI: no ha sonado nada, no se gasta
        // intento. Se vuelve en 20-30 s (o lo que pida la pasarela).
        throw new QueueRetryError(error.code, { delayMs: capacityDelayMs(error.retryAfterMs), countAttempt: false })
      }
      // Solo cuenta como intento lo que la centralita llegó a marcar. Un
      // Error de AMI por dialplan/permisos (ORIGINATE_INVALID) o cualquier
      // código con `dialed:false` es un bloqueo previo, no una llamada fallida.
      if (error.dialed && (error.code === 'ORIGINATE_TIMEOUT' || error.code === 'ORIGINATE_REJECTED')) {
        await registerUnansweredAttempt({ orgId, lead, agentId: agent.id, requestId, code: error.code, cause: error.cause, jobId: context.jobId })
        return
      }
      return block('gateway_rejected', error.code)
    }
    // Fallo de red o timeout del fetch: no se sabe si la pasarela marcó. No se
    // gasta intento; la cola reintenta con el mismo requestId.
    throw error
  }
  if (result.status === 'invalid_phone') return block('invalid_phone')
  if (result.status === 'offline') throw new QueueRetryError('TELEPHONY_OFFLINE', { delayMs: 60_000 })

  // Solo ahora la pasarela ha confirmado el marcado: el intento cuenta.
  await prisma.lead.update({ where: { id: lead.id }, data: { attempts: { increment: 1 }, lastAttemptAt: now } })
  console.log(`[LeadCallDispatch] lead ${leadId} → call ${result.status} (${result.sid ?? 'n/a'})`)
}

/**
 * `dedupeKey` convierte el encolado en idempotente: BullMQ ignora un `jobId`
 * que ya existe, así que reintentar el paso de una secuencia tras un lease
 * caducado no llama dos veces al mismo prospecto. Sin clave se comporta como
 * siempre (una llamada por invocación), que es lo que quieren las fuentes de
 * leads: dos formularios son dos llamadas.
 */
export async function enqueueLeadCall(
  orgId: string, leadId: string, dedupeKey?: string, delayMs = 0,
  options: { campaignId?: string; onFinished?: 'ignore' | 'requeue' } = {},
): Promise<boolean> {
  const payload = { orgId, leadId, ...(options.campaignId ? { campaignId: options.campaignId } : {}) }
  if (isPostgresQueueBackend()) {
    return enqueueDatabaseJob({ queue: QUEUE_NAME, kind: 'call', payload, dedupeKey, delayMs, onFinished: options.onFinished })
  }
  if (!leadCallQueue) return false
  try {
    await leadCallQueue.add(
      'call',
      payload,
      { delay: Math.max(0, delayMs), priority: 1, removeOnComplete: 1000, removeOnFail: 1000, ...(dedupeKey ? { jobId: dedupeKey } : {}) }
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

/**
 * Decide si el worker genérico (`worker.ts`, BACKGROUND_WORKERS_ENABLED=true)
 * debe consumir `lead-call-dispatch`. Por defecto no: las llamadas las
 * atiende el call-worker dedicado (`callWorker.ts`, aislado por
 * ZADARMA_ORG_ID) y un consumidor sin filtro competiría con él por los
 * mismos trabajos. Solo arranca con LEAD_CALL_DISPATCH_IN_WORKER=true y, si
 * hay ZADARMA_ORG_ID, excluyendo esa organización.
 */
export function leadCallDispatchWorkerPlan(env: NodeJS.ProcessEnv = process.env): { start: false; reason: string } | { start: true; excludeOrgId?: string } {
  if (env.BACKGROUND_WORKERS_ENABLED !== 'true') return { start: false, reason: 'BACKGROUND_WORKERS_ENABLED no es true' }
  if (env.LEAD_CALL_DISPATCH_IN_WORKER !== 'true') return { start: false, reason: 'LEAD_CALL_DISPATCH_IN_WORKER no es true: las llamadas las consume solo el call-worker dedicado' }
  const excludeOrgId = env.ZADARMA_ORG_ID?.trim()
  return excludeOrgId ? { start: true, excludeOrgId } : { start: true }
}

void (async () => {
  if (isPostgresQueueBackend()) {
    const plan = leadCallDispatchWorkerPlan()
    if (!plan.start) {
      if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') console.warn(`[LeadCallDispatch] consumidor genérico de ${QUEUE_NAME} no arranca: ${plan.reason}`)
      return
    }
    if (plan.excludeOrgId) console.warn(`[LeadCallDispatch] consumidor genérico de ${QUEUE_NAME} activo excluyendo ZADARMA_ORG_ID (la atiende el call-worker dedicado)`)
    stopDatabaseWorker = startDatabaseQueueWorker({
      queue: QUEUE_NAME,
      excludeOrgId: plan.excludeOrgId,
      handler: (payload, meta) => processLeadCallJob(payload as unknown as LeadCallJob, { jobId: meta.jobId }),
      pollMs: Number(process.env.WORKER_QUEUE_POLL_MS ?? 5_000),
    })
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
      async (job: Job<LeadCallJob>) => {
        // BullMQ no reencola con retraso por sí solo: se añade un trabajo
        // nuevo que conserva el `requestId` para que la pasarela lo reconozca.
        const requestId = job.data.requestId ?? stableRequestId('lead-call', job.data.orgId, job.data.leadId, job.data.campaignId ?? '', String(job.id ?? ''))
        try { await processLeadCallJob({ ...job.data, requestId }, { jobId: String(job.id ?? '') }) }
        catch (error) {
          if (!isQueueRetryError(error) || !leadCallQueue) throw error
          await leadCallQueue.add('call', { ...job.data, requestId }, { delay: error.delayMs, priority: 1, removeOnComplete: 1000, removeOnFail: 1000 })
        }
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
