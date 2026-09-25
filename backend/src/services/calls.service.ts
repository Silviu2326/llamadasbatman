import { prisma } from '../lib/prisma'
import { CallStatus, Prisma } from '@prisma/client'
import { enqueueAutomationEvent } from '../jobs/automationRunner'
import { ensureConversationForLead } from './conversations.service'
import { logSalesActivity } from '../lib/salesActivity'
import { writeAuditLog } from '../lib/audit'
import { CALL_OUTCOME, CALL_OUTCOMES, isQualifyingOutcome, isUnreachedOutcome, normalizeCallOutcome, type CallOutcome } from '../lib/callOutcome'
import { recordWhiteLabelVoiceUsage } from './whiteLabel.service'
import { recordUsage } from '../lib/usage'
import { triggerContextualMicroapps } from '../microapps/contextualAutomation'

/** Turno de la transcripción tal como lo guarda `Call.transcriptTurns`. */
export interface CallTranscriptTurn {
  role: 'agente' | 'prospecto'
  text: string
  atMs: number
}

const TURN_ROLES: Record<string, CallTranscriptTurn['role']> = {
  agente: 'agente', assistant: 'agente', agent: 'agente', ia: 'agente',
  prospecto: 'prospecto', user: 'prospecto', cliente: 'prospecto', lead: 'prospecto', usuario: 'prospecto',
}

/** Acepta lo que envíe cualquier pipeline y guarda solo turnos bien formados. */
export function normalizeTranscriptTurns(value: unknown): CallTranscriptTurn[] | null {
  if (!Array.isArray(value)) return null
  const turns: CallTranscriptTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = TURN_ROLES[String(record.role ?? record.speaker ?? '').trim().toLowerCase()]
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const atMs = Number(record.atMs)
    if (!role || !text) continue
    turns.push({ role, text: text.slice(0, 4000), atMs: Number.isFinite(atMs) && atMs >= 0 ? Math.round(atMs) : 0 })
  }
  return turns.length ? turns.slice(0, 2000) : null
}

function parseIsoDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const CALLBACK_TASK_TITLE = 'Volver a llamar'
const HUMAN_REQUESTED_TASK_TITLE = 'Devolver llamada (pide persona)'

/**
 * Coste de voz para Vendrava en céntimos por minuto (IA + telefonía).
 * Coherente con los 0,06 $/min de growthPredictor.service.ts; configurable
 * por env cuando cambien las tarifas. Ledger: FUNDAMENTOS §3.
 */
function voiceCostPerMinuteCents(): number {
  const raw = Number(process.env.VOICE_COST_PER_MINUTE_CENTS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 6
}

interface CallFilters {
  leadId?: string
  search?: string
  highIntent?: boolean
  agentId?: string
  campaignId?: string
  status?: CallStatus
  outcome?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface VoiceResourceIds {
  orgId: string
  leadId?: string
  agentId?: string
  campaignId?: string
}

export class InvalidVoiceContextError extends Error {
  readonly statusCode = 400

  constructor(message = 'Invalid voice resource context') {
    super(message)
    this.name = 'InvalidVoiceContextError'
  }
}

/**
 * `Call.outcome` alimenta el embudo económico de Ads: un valor desconocido no
 * se degrada a `none` porque eso convertiría una llamada cualificada en una
 * llamada sin resultado y falsearía el CPQL. Se rechaza en la frontera.
 */
export class InvalidCallOutcomeError extends Error {
  readonly statusCode = 400

  constructor(received: string) {
    super(`Resultado de llamada no reconocido: "${received}". Valores admitidos: ${CALL_OUTCOMES.join(', ')}`)
    this.name = 'InvalidCallOutcomeError'
  }
}

/**
 * Validates all voice references against the same tenant. Relationship
 * checks are enforced when the records declare one, while nullable legacy
 * relationships remain compatible with existing calls.
 */
export async function validateVoiceResourceOwnership(
  ids: VoiceResourceIds,
  options: { requireAll?: boolean; requireActiveAgent?: boolean; callDirection?: 'inbound' | 'outbound' } = {},
): Promise<boolean> {
  const orgId = ids.orgId?.trim()
  const leadId = ids.leadId?.trim()
  const agentId = ids.agentId?.trim()
  const campaignId = ids.campaignId?.trim()

  if (!orgId) return false
  if (options.requireAll && (!leadId || !agentId || !campaignId)) return false
  if (!leadId && !agentId && !campaignId) return false

  const [lead, agent, campaign] = await Promise.all([
    leadId
      ? prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, campaignId: true } })
      : Promise.resolve(null),
    agentId
      ? prisma.agent.findFirst({ where: { id: agentId, orgId, ...(options.requireActiveAgent ? { isActive: true } : {}) }, select: { id: true, callDirection: true } })
      : Promise.resolve(null),
    campaignId
      ? prisma.campaign.findFirst({ where: { id: campaignId, orgId }, select: { id: true, agentId: true } })
      : Promise.resolve(null),
  ])

  if (leadId && !lead) return false
  if (agentId && !agent) return false
  if (agent && options.callDirection && agent.callDirection !== 'both' && agent.callDirection !== options.callDirection) return false
  if (campaignId && !campaign) return false
  if (lead?.campaignId && campaignId && lead.campaignId !== campaignId) return false
  if (campaign?.agentId && agentId && campaign.agentId !== agentId) return false
  return true
}

export async function listCalls(orgId: string, filters: CallFilters = {}) {
  const { leadId, search, highIntent, agentId, campaignId, status, outcome, dateFrom, dateTo, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Prisma.CallWhereInput = { orgId }
  if (leadId) where.leadId = leadId
  if (search) where.lead = { OR: ['name', 'company', 'phone', 'email'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) }
  if (highIntent) where.AND = [{ outcome: { in: ['interested', 'meeting_scheduled', 'human_requested'] } }]
  if (agentId) where.agentId = agentId
  if (campaignId) where.campaignId = campaignId
  if (status) where.status = status
  if (outcome) {
    // Las filas de intentos sin respuesta las crea el despacho con
    // `outcome: 'none'` y el motivo en `status`; el filtro las incluye.
    const normalized = normalizeCallOutcome(outcome) ?? outcome
    where.OR = normalized === CALL_OUTCOME.NO_ANSWER || normalized === CALL_OUTCOME.BUSY
      ? [{ outcome: normalized }, { outcome: CALL_OUTCOME.NONE, status: normalized as CallStatus }]
      : [{ outcome: normalized }]
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    }
  }

  const [data, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: { lead: true, agent: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.call.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getCall(orgId: string, id: string) {
  const call = await prisma.call.findFirst({
    where: { id, orgId },
    include: {
      lead: true, agent: true, campaign: true, meetings: true,
      voiceEvaluation: { select: { status: true, overall: true, dimensions: true, criticalErrors: true, trainingTag: true, judgeModel: true, rubricVersion: true, updatedAt: true } },
      voiceMetrics: { select: { metric: true, value: true, unit: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!call) return null
  const { voiceEvaluation, voiceMetrics, ...rest } = call
  return {
    ...rest,
    transcriptTurns: normalizeTranscriptTurns(call.transcriptTurns) ?? [],
    evaluation: voiceEvaluation ? {
      status: voiceEvaluation.status,
      overall: voiceEvaluation.overall,
      dimensions: voiceEvaluation.dimensions,
      criticalErrors: voiceEvaluation.criticalErrors,
      trainingTag: voiceEvaluation.trainingTag,
      judgeModel: voiceEvaluation.judgeModel,
      rubricVersion: voiceEvaluation.rubricVersion,
      updatedAt: voiceEvaluation.updatedAt,
      approved: voiceEvaluation.status === 'completed' && (voiceEvaluation.overall ?? 0) >= 75 && !(Array.isArray(voiceEvaluation.criticalErrors) && voiceEvaluation.criticalErrors.length),
    } : null,
    metrics: summarizeCallMetrics(call, voiceMetrics),
  }
}

/** Métricas planas para la ficha: media por métrica de la traza más los totales de la llamada. */
export function summarizeCallMetrics(
  call: { durationSeconds: number | null; transcriptTurns?: unknown; sentimentScore?: number | null },
  rows: Array<{ metric: string; value: number; unit: string | null }>,
): Record<string, number | string> {
  const turns = normalizeTranscriptTurns(call.transcriptTurns) ?? []
  const grouped = new Map<string, { sum: number; count: number; unit: string | null }>()
  for (const row of rows) {
    const current = grouped.get(row.metric) ?? { sum: 0, count: 0, unit: row.unit }
    current.sum += row.value
    current.count += 1
    grouped.set(row.metric, current)
  }
  const metrics: Record<string, number | string> = {}
  if (call.durationSeconds != null) metrics.durationSeconds = call.durationSeconds
  if (turns.length) {
    metrics.agentTurns = turns.filter(turn => turn.role === 'agente').length
    metrics.prospectTurns = turns.filter(turn => turn.role === 'prospecto').length
  }
  if (call.sentimentScore != null) metrics.sentimentScore = call.sentimentScore
  for (const [metric, item] of grouped) {
    const average = Math.round((item.sum / item.count) * 100) / 100
    metrics[metric] = item.unit ? `${average} ${item.unit}` : average
  }
  return metrics
}

export async function getCallTrace(orgId: string, callId: string, limit = 1000) {
  const call = await prisma.call.findFirst({
    where: { id: callId, orgId },
    select: { id: true, externalCallId: true, runtimeSnapshot: true, startedAt: true, endedAt: true },
  })
  if (!call) return null

  const safeLimit = Math.min(Math.max(limit, 1), 5000)
  const [events, metrics] = await Promise.all([
    prisma.voiceCallEvent.findMany({
      where: { callId, orgId },
      orderBy: { seq: 'asc' },
      take: safeLimit,
    }),
    prisma.voiceCallMetric.findMany({
      where: { callId, orgId },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return { call, events, metrics }
}

export async function getVoiceMetrics(orgId: string, from?: string, to?: string) {
  const createdAt = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  }
  const rows = await prisma.voiceCallMetric.findMany({
    where: { orgId, ...(from || to ? { createdAt } : {}) },
    select: { metric: true, value: true, unit: true, dimensions: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 10_000,
  })

  const grouped = new Map<string, { metric: string; unit: string | null; count: number; sum: number; min: number; max: number }>()
  for (const row of rows) {
    const current = grouped.get(row.metric) ?? {
      metric: row.metric,
      unit: row.unit,
      count: 0,
      sum: 0,
      min: row.value,
      max: row.value,
    }
    current.count += 1
    current.sum += row.value
    current.min = Math.min(current.min, row.value)
    current.max = Math.max(current.max, row.value)
    grouped.set(row.metric, current)
  }

  return {
    from: from ?? null,
    to: to ?? null,
    metrics: [...grouped.values()].map(item => ({
      ...item,
      average: item.count > 0 ? item.sum / item.count : 0,
    })),
  }
}

export async function getCallEvaluation(orgId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId }, select: { id: true } })
  if (!call) return null
  return prisma.voiceCallEvaluation.findUnique({ where: { callId } })
}

export async function getCallMetrics(orgId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId }, select: { id: true, runtimeSnapshot: true } })
  if (!call) return null
  const metrics = await prisma.voiceCallMetric.findMany({ where: { callId, orgId }, orderBy: { createdAt: 'asc' } })
  return { call, metrics }
}

export async function ingestCall(
  orgId: string,
  data: {
    externalCallId?: string
    telephonyProvider?: 'twilio' | 'zadarma'
    leadId: string
    agentId?: string
    campaignId?: string
    /** Prueba de un agente en borrador (voiceTestCall.service.ts), no actividad comercial. */
    isTest?: boolean
    duration?: number
    recordingUrl?: string
    transcript?: string
    transcriptWords?: unknown
    /** Transcripción por turnos `{ role, text, atMs }`; se guarda además del texto plano. */
    transcriptTurns?: unknown
    sentiment?: string
    sentimentScore?: number
    summary?: string
    outcome?: string
    /** ISO 8601: el contacto pidió que se le llame en ese momento. */
    callbackAt?: string
    /** ISO 8601: reunión acordada en la llamada. Sin fecha no se crea reunión. */
    meetingAt?: string
    highIntent?: boolean
    contactClassification?: string
    contactClassificationConfidence?: number
    amdResult?: unknown
    startedAt?: string
    endedAt?: string
  }
) {
  const validContext = await validateVoiceResourceOwnership({
    orgId,
    leadId: data.leadId,
    agentId: data.agentId,
    campaignId: data.campaignId,
  })
  if (!validContext) throw new InvalidVoiceContextError()

  // Un proveedor externo puede enviar su propio vocabulario. Se traduce al
  // canónico o se rechaza; nunca se guarda tal cual.
  if (data.outcome != null) {
    const normalized = normalizeCallOutcome(data.outcome)
    if (!normalized) throw new InvalidCallOutcomeError(String(data.outcome))
    data = { ...data, outcome: normalized }
  }

  const transcriptTurns = normalizeTranscriptTurns(data.transcriptTurns)
  const callbackAt = parseIsoDate(data.callbackAt)
  const meetingAt = parseIsoDate(data.meetingAt)

  let created = false
  let call = data.externalCallId
    ? await prisma.call.findUnique({
        where: { orgId_externalCallId: { orgId, externalCallId: data.externalCallId } },
      })
    : null

  if (!call) {
    try {
      call = await prisma.call.create({
        data: {
          orgId,
          externalCallId: data.externalCallId,
          leadId: data.leadId,
          agentId: data.agentId,
          campaignId: data.campaignId,
          isTest: data.isTest ?? false,
          status: 'completed',
          durationSeconds: data.duration,
          recordingUrl: data.recordingUrl,
          transcript: data.transcript,
          transcriptWords: data.transcriptWords ? (data.transcriptWords as Prisma.InputJsonValue) : undefined,
          transcriptTurns: transcriptTurns ? (transcriptTurns as unknown as Prisma.InputJsonValue) : undefined,
          sentiment: data.sentiment,
          sentimentScore: data.sentimentScore,
          summary: data.summary,
          outcome: data.outcome ?? 'none',
          callbackAt: callbackAt ?? undefined,
          meetingAt: meetingAt ?? undefined,
          contactClassification: data.contactClassification,
          contactClassificationConfidence: data.contactClassificationConfidence,
          amdResult: data.amdResult ? (data.amdResult as Prisma.InputJsonValue) : undefined,
          startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
          endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        },
      })
      created = true
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || !data.externalCallId) throw error
      call = await prisma.call.findUniqueOrThrow({
        where: { orgId_externalCallId: { orgId, externalCallId: data.externalCallId } },
      })
    }
  }

  // FND-02: se persiste aquí, junto al resultado final de la llamada, así el
  // timeline queda registrado tanto para el webhook (calls.controller.ts)
  // como para la voz en vivo (mediaStream.ts), únicos llamantes de ingestCall.
  if (
    call && (
      call.leadId !== data.leadId ||
      (data.agentId !== undefined && call.agentId !== data.agentId) ||
      (data.campaignId !== undefined && call.campaignId !== data.campaignId)
    )
  ) {
    throw new InvalidVoiceContextError('Voice call context does not match the existing call')
  }

  // Duración que la fila ya tenía antes de este evento: es lo que protege el
  // ledger de apuntar dos veces la misma llamada cuando el proveedor reintenta.
  const previousDuration = created ? null : call.durationSeconds

  // A provider can retry after the Call row was committed but before the
  // downstream work finished. Reconcile the fields supplied by the retry so
  // a partial first attempt can be repaired without regressing a richer
  // outcome to the provider's default "none" value.
  if (!created) {
    const incomingOutcome = data.outcome && data.outcome !== 'none' ? data.outcome : undefined
    call = await prisma.call.update({
      where: { id: call.id },
      data: {
        status: 'completed',
        durationSeconds: data.duration,
        recordingUrl: data.recordingUrl,
        transcript: data.transcript,
        transcriptWords: data.transcriptWords ? (data.transcriptWords as Prisma.InputJsonValue) : undefined,
        transcriptTurns: transcriptTurns ? (transcriptTurns as unknown as Prisma.InputJsonValue) : undefined,
        sentiment: data.sentiment,
        sentimentScore: data.sentimentScore,
        summary: data.summary,
        outcome: incomingOutcome,
        callbackAt: callbackAt ?? undefined,
        meetingAt: meetingAt ?? undefined,
        contactClassification: data.contactClassification,
        contactClassificationConfidence: data.contactClassificationConfidence,
        amdResult: data.amdResult ? (data.amdResult as Prisma.InputJsonValue) : undefined,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
      },
    })
  }

  // Ledger de consumo (FUNDAMENTOS §3): la llamada se apunta UNA sola vez, en
  // el momento en que su duración pasa de desconocida (null/0) a definitiva.
  // Este es el único punto del backend que persiste `durationSeconds`, y los
  // reintentos del webhook o de la voz en vivo caen en `previousDuration > 0`.
  const closedDuration = call.durationSeconds ?? 0
  if (closedDuration > 0 && (previousDuration ?? 0) <= 0) {
    await recordUsage({
      orgId,
      provider: `${data.telephonyProvider ?? 'twilio'}+voz`,
      capability: call.direction === 'inbound' ? 'call.inbound' : 'call.outbound',
      quantity: closedDuration,
      unit: 'seconds',
      costCents: (closedDuration / 60) * voiceCostPerMinuteCents(),
      billingMode: 'managed',
      rateVersion: '2026-08',
      idempotencyKey: `call:${call.id}:duration-final`,
      meta: { callId: call.id, ...(call.amdResult != null ? { amdResult: call.amdResult } : {}) },
    })
  }

  const effectiveOutcome = data.outcome && data.outcome !== 'none'
    ? data.outcome
    : call.outcome
  const effectiveCampaignId = data.campaignId ?? call.campaignId

  await logSalesActivity({
    orgId,
    type: 'call',
    leadId: data.leadId,
    source: 'call',
    sourceId: call.id,
    metadata: {
      status: call.status,
      outcome: call.outcome,
      durationSeconds: call.durationSeconds,
    },
  })

  const conversation = await ensureConversationForLead(orgId, data.leadId)
  const eventId = `call.completed:${data.externalCallId ?? call.id}`
  const messageBody = data.summary
    ?? call.summary
    ?? (effectiveOutcome === 'meeting_scheduled' ? 'Llamada completada · reunión agendada' : 'Llamada completada')

  await prisma.$transaction(async tx => {
    await tx.message.upsert({
      where: { orgId_externalEventId: { orgId, externalEventId: eventId } },
      create: {
        orgId,
        conversationId: conversation.id,
        leadId: data.leadId,
        channel: 'voice',
        provider: data.telephonyProvider ?? 'twilio',
        direction: 'outbound',
        contentType: 'call',
        body: messageBody,
        status: 'recorded',
        externalEventId: eventId,
        deliveredAt: call.endedAt ?? new Date(),
        metadata: {
          callId: call.id,
          externalCallId: data.externalCallId ?? null,
          durationSeconds: call.durationSeconds ?? null,
          outcome: effectiveOutcome ?? 'none',
          recordingUrl: call.recordingUrl ?? null,
          sentiment: call.sentiment ?? null,
          highIntent: data.highIntent ?? isQualifyingOutcome(effectiveOutcome),
        },
      },
      update: {
        body: messageBody,
        status: 'recorded',
        metadata: {
          callId: call.id,
          externalCallId: data.externalCallId ?? null,
          durationSeconds: call.durationSeconds ?? null,
          outcome: effectiveOutcome ?? 'none',
          recordingUrl: call.recordingUrl ?? null,
          sentiment: call.sentiment ?? null,
          highIntent: data.highIntent ?? isQualifyingOutcome(effectiveOutcome),
        },
      },
    })
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: data.endedAt ? new Date(data.endedAt) : new Date() },
    })
    // Repair a missing outbox event after a crash between the Call commit and
    // event publication. Existing installations do not yet have a business
    // unique key for this aggregate, so we first query by aggregate and also
    // use a deterministic primary key to make concurrent retries converge.
    const existingOutbox = await tx.outboxEvent.findFirst({
      where: { orgId, topic: 'call.completed', aggregateType: 'Call', aggregateId: call.id },
      select: { id: true },
    })
    if (!existingOutbox) {
      try {
        await tx.outboxEvent.create({
          data: {
            id: `call-completed-${call.id}`,
            orgId,
            topic: 'call.completed',
            aggregateType: 'Call',
            aggregateId: call.id,
            payload: {
              eventId,
              callId: call.id,
              leadId: data.leadId,
              conversationId: conversation.id,
              campaignId: effectiveCampaignId ?? null,
              outcome: effectiveOutcome ?? 'none',
              durationSeconds: call.durationSeconds ?? null,
            },
          },
        })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
        // Another retry won the deterministic insert. The domain row is
        // already durable and the queue call below remains deduplicated.
      }
    }
  })

  const unreached = isUnreachedOutcome(effectiveOutcome)

  if (created) {
    await recordWhiteLabelVoiceUsage(orgId, call.durationSeconds)
    // Buzón, no contesta u ocupado: nadie del negocio atendió, así que el
    // lead no pasa a contactado ni la campaña suma `contacted`.
    if (!unreached) {
      await prisma.lead.updateMany({
        where: { id: data.leadId, orgId, status: 'new' },
        data: { status: 'contacted' },
      })
      if (data.campaignId) {
        await prisma.campaign.updateMany({
          where: { id: data.campaignId, orgId },
          data: { contacted: { increment: 1 } },
        })
      }
    }
  }

  await applyCallOutcomeEffects(orgId, {
    callId: call.id,
    leadId: data.leadId,
    campaignId: effectiveCampaignId ?? null,
    outcome: effectiveOutcome ?? 'none',
    callbackAt: callbackAt ?? call.callbackAt ?? null,
    meetingAt: meetingAt ?? call.meetingAt ?? null,
  })

  await enqueueAutomationEvent(orgId, 'call.completed', {
    eventId,
    callId: call.id,
    leadId: data.leadId,
    conversationId: conversation.id,
    campaignId: effectiveCampaignId,
    outcome: effectiveOutcome ?? 'none',
    durationSeconds: call.durationSeconds,
  }, eventId)

  await triggerContextualMicroapps({
    orgId,
    event: 'after_call',
    entity: { callId: call.id, leadId: data.leadId, conversationId: conversation.id },
  }).catch(error => console.error('[microapps] contextual after_call trigger failed', error))

  return call
}

/**
 * Efectos del resultado de una llamada sobre el CRM. Se aplican al ingerir y
 * se reaplican cuando alguien corrige el resultado desde la ficha:
 *
 * - `interested` / `meeting_scheduled` / `human_requested` → lead `qualified`
 *   (desde new/contacted/unqualified).
 * - `not_interested` / `wrong_number` → lead `unqualified` (nunca desde `converted`).
 * - `meeting_scheduled` con fecha → Meeting; sin fecha, nada que inventar.
 * - `human_requested` → tarea prioritaria "Devolver llamada (pide persona)" y la
 *   llamada marcada como prioritaria (`isFavorite`).
 * - `callback_requested` → lead `contacted` y tarea "Volver a llamar" con
 *   `dueAt` = callbackAt.
 * - no contesta / buzón / ocupado → sin cambios.
 *
 * `applyLeadStatus: false` reaplica reunión y tarea sin tocar el estado del
 * lead: corregir una llamada antigua no debe revertir lo que decidió una
 * llamada posterior.
 */
interface CallOutcomeEffectsInput {
  callId: string
  leadId: string
  campaignId?: string | null
  outcome: string
  callbackAt?: Date | null
  meetingAt?: Date | null
  applyLeadStatus?: boolean
}

export async function applyCallOutcomeEffects(orgId: string, input: CallOutcomeEffectsInput) {
  // The calendar changes and campaign counters must commit together.
  return prisma.$transaction(tx => applyCallOutcomeEffectsInTransaction(tx, orgId, input))
}

async function applyCallOutcomeEffectsInTransaction(prisma: Prisma.TransactionClient, orgId: string, input: CallOutcomeEffectsInput): Promise<{ leadStatus: string | null; meetingCreated: boolean; taskCreated: boolean }> {
  const outcome = normalizeCallOutcome(input.outcome) ?? CALL_OUTCOME.NONE
  let leadStatus: string | null = null
  const applyLeadStatus = input.applyLeadStatus !== false
  if (!applyLeadStatus) {
    // Sin cambio de estado: la llamada corregida no es la última del lead.
  } else if (outcome === CALL_OUTCOME.INTERESTED || outcome === CALL_OUTCOME.MEETING_SCHEDULED || outcome === CALL_OUTCOME.HUMAN_REQUESTED) {
    const updated = await prisma.lead.updateMany({
      where: { id: input.leadId, orgId, status: { in: ['new', 'contacted', 'unqualified'] } },
      data: { status: 'qualified' },
    })
    if (updated.count > 0) leadStatus = 'qualified'
  } else if (outcome === CALL_OUTCOME.NOT_INTERESTED || outcome === CALL_OUTCOME.WRONG_NUMBER) {
    const updated = await prisma.lead.updateMany({
      where: { id: input.leadId, orgId, status: { in: ['new', 'contacted', 'qualified'] } },
      data: { status: 'unqualified' },
    })
    if (updated.count > 0) leadStatus = 'unqualified'
  } else if (outcome === CALL_OUTCOME.CALLBACK_REQUESTED) {
    const updated = await prisma.lead.updateMany({
      where: { id: input.leadId, orgId, status: 'new' },
      data: { status: 'contacted' },
    })
    if (updated.count > 0) leadStatus = 'contacted'
  }

  let meetingCreated = false
  if (outcome === CALL_OUTCOME.MEETING_SCHEDULED && input.meetingAt) {
    const meetingResult = await ensureAutoMeeting(orgId, input.leadId, input.callId, input.meetingAt, prisma)
    meetingCreated = meetingResult.created
    if ((meetingResult.created || meetingResult.reactivated) && input.campaignId) {
      await prisma.campaign.updateMany({
        where: { id: input.campaignId, orgId },
        data: { meetingsScheduled: { increment: 1 } },
      })
    }
  }

  if (outcome !== CALL_OUTCOME.MEETING_SCHEDULED || !input.meetingAt) {
    const cancelled = await prisma.meeting.updateMany({
      where: { id: `auto-call-${input.callId}`, orgId, callId: input.callId, status: 'scheduled' },
      data: { status: 'cancelled', outcome: 'call_result_corrected' },
    })
    if (cancelled.count && input.campaignId) {
      await prisma.campaign.updateMany({
        where: { id: input.campaignId, orgId, meetingsScheduled: { gt: 0 } },
        data: { meetingsScheduled: { decrement: 1 } },
      })
    }
  }

  const taskTitle = outcome === CALL_OUTCOME.HUMAN_REQUESTED ? HUMAN_REQUESTED_TASK_TITLE
    : outcome === CALL_OUTCOME.CALLBACK_REQUESTED ? CALLBACK_TASK_TITLE : null
  // Automatic tasks have no author. Preserve authored tasks and completed work,
  // including existing tasks created before this reconciliation was added.
  await prisma.callTask.deleteMany({
    where: {
      orgId, callId: input.callId, userId: null, done: false,
      title: { in: [CALLBACK_TASK_TITLE, HUMAN_REQUESTED_TASK_TITLE].filter(title => title !== taskTitle) },
    },
  })
  let taskCreated = false
  if (outcome === CALL_OUTCOME.CALLBACK_REQUESTED || outcome === CALL_OUTCOME.HUMAN_REQUESTED) {
    const title = outcome === CALL_OUTCOME.HUMAN_REQUESTED ? HUMAN_REQUESTED_TASK_TITLE : CALLBACK_TASK_TITLE
    // Pide persona: se devuelve la llamada cuanto antes, no cuando el lead diga.
    const dueAt = outcome === CALL_OUTCOME.HUMAN_REQUESTED ? input.callbackAt ?? new Date() : input.callbackAt ?? null
    const existing = await prisma.callTask.findFirst({ where: { orgId, callId: input.callId, title, userId: null }, select: { id: true, done: true } })
    if (!existing) {
      await prisma.callTask.create({ data: { orgId, callId: input.callId, title, dueAt } })
      taskCreated = true
    } else if (!existing.done) {
      await prisma.callTask.updateMany({ where: { id: existing.id, orgId, done: false, userId: null }, data: { dueAt } })
    }
    if (outcome === CALL_OUTCOME.HUMAN_REQUESTED) {
      // Prioridad alta: el mismo marcador que "marcar como prioritaria" en la lista.
      await prisma.call.updateMany({ where: { id: input.callId, orgId }, data: { isFavorite: true } })
    }
  }
  return { leadStatus, meetingCreated, taskCreated }
}

export const CALL_RESULT_OUTCOMES = CALL_OUTCOMES

export interface CallResultPatch {
  outcome?: string
  summary?: string | null
  callbackAt?: string | null
  meetingAt?: string | null
  notes?: string
}

/**
 * Corrección manual del resultado (PATCH /api/calls/:id). Si cambia el
 * resultado se reaplican sus efectos sobre el lead, la reunión y la tarea de
 * seguimiento; todo queda en el registro de auditoría.
 */
export async function updateCallResult(orgId: string, callId: string, patch: CallResultPatch, actor: { userId: string; name?: string | null }) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId } })
  if (!call) return null
  let outcome: CallOutcome | undefined
  if (patch.outcome !== undefined) {
    const normalized = normalizeCallOutcome(patch.outcome)
    if (!normalized) throw new InvalidCallOutcomeError(String(patch.outcome))
    outcome = normalized
  }
  const data: Prisma.CallUpdateInput = {}
  if (outcome !== undefined) data.outcome = outcome
  if (patch.summary !== undefined) data.summary = patch.summary === null ? null : patch.summary.trim().slice(0, 4000) || null
  if (patch.callbackAt !== undefined) data.callbackAt = patch.callbackAt === null ? null : parseIsoDate(patch.callbackAt) ?? undefined
  if (patch.meetingAt !== undefined) data.meetingAt = patch.meetingAt === null ? null : parseIsoDate(patch.meetingAt) ?? undefined

  const updated = Object.keys(data).length
    ? await prisma.call.update({ where: { id: call.id }, data })
    : call

  if (patch.notes?.trim()) {
    await prisma.leadNote.create({
      data: { orgId, leadId: call.leadId, callId: call.id, text: patch.notes.trim().slice(0, 4000), authorName: actor.name ?? 'Usuario' },
    })
  }

  const outcomeChanged = outcome !== undefined && outcome !== call.outcome
  const callbackOutcome = updated.outcome === CALL_OUTCOME.CALLBACK_REQUESTED || updated.outcome === CALL_OUTCOME.HUMAN_REQUESTED
  let effects = { leadStatus: null as string | null, meetingCreated: false, taskCreated: false }
  if (outcome !== undefined || (patch.meetingAt !== undefined && updated.outcome === CALL_OUTCOME.MEETING_SCHEDULED) || (patch.callbackAt !== undefined && callbackOutcome)) {
    // El estado del lead solo lo decide su llamada más reciente: corregir una
    // antigua reaplica reunión y tarea, pero no revierte lo que pasó después.
    const latest = await prisma.call.findFirst({ where: { orgId, leadId: call.leadId }, orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }], select: { id: true } })
    effects = await applyCallOutcomeEffects(orgId, {
      callId: call.id, leadId: call.leadId, campaignId: call.campaignId,
      outcome: updated.outcome, callbackAt: updated.callbackAt, meetingAt: updated.meetingAt,
      applyLeadStatus: !latest || latest.id === call.id,
    })
  }

  await writeAuditLog({
    orgId, actorUserId: actor.userId, action: 'call.result.update', entityType: 'Call', entityId: call.id,
    before: { outcome: call.outcome, summary: call.summary, callbackAt: call.callbackAt, meetingAt: call.meetingAt },
    after: { outcome: updated.outcome, summary: updated.summary, callbackAt: updated.callbackAt, meetingAt: updated.meetingAt, effects },
  })
  if (outcomeChanged) {
    await logSalesActivity({
      orgId, type: 'call', leadId: call.leadId, source: 'call', sourceId: call.id,
      metadata: { status: updated.status, outcome: updated.outcome, durationSeconds: updated.durationSeconds, correctedBy: actor.userId, previousOutcome: call.outcome },
    })
  }
  return { call: updated, effects }
}

export async function createAutoMeeting(orgId: string, leadId: string, callId: string, scheduledAt: Date) {
  return (await ensureAutoMeeting(orgId, leadId, callId, scheduledAt)).meeting
}

/** Solo con fecha real: una reunión "mañana a las diez" inventada no es una reunión. */
async function ensureAutoMeeting(orgId: string, leadId: string, callId: string, scheduledAt: Date, db: Prisma.TransactionClient = prisma) {
  const lead = await db.lead.findFirst({ where: { id: leadId, orgId } })
  const existing = await db.meeting.findFirst({ where: { id: `auto-call-${callId}`, orgId, callId } })
    ?? await db.meeting.findFirst({ where: { orgId, callId } })
  if (existing) {
    if (existing.id !== `auto-call-${callId}`) return { meeting: existing, created: false, reactivated: false }
    if (existing.status === 'cancelled' && existing.outcome === 'call_result_corrected') {
      const changed = await db.meeting.updateMany({
        where: { id: existing.id, orgId, status: 'cancelled', outcome: 'call_result_corrected' },
        data: { status: 'scheduled', scheduledAt, outcome: null },
      })
      return { meeting: { ...existing, status: 'scheduled' as const, scheduledAt, outcome: null }, created: false, reactivated: changed.count > 0 }
    }
    if (existing.status === 'scheduled' && existing.scheduledAt.getTime() !== scheduledAt.getTime()) {
      const meeting = await db.meeting.update({ where: { id: existing.id }, data: { scheduledAt } })
      return { meeting, created: false }
    }
    return { meeting: existing, created: false }
  }

  // The deterministic id closes the race between two provider retries even
  // before a dedicated business unique index is present in every database.
  const id = `auto-call-${callId}`
  const inserted = await db.meeting.createMany({
    skipDuplicates: true,
    data: {
      id, orgId, leadId, callId,
      title: `Reunión con ${lead?.name ?? 'contacto'}`,
      scheduledAt, status: 'scheduled',
      notes: 'Acordada en la llamada del agente de voz.',
    },
  })
  const meeting = await db.meeting.findFirst({ where: { id, orgId, callId } })
  if (!meeting) throw new Error('Automatic meeting could not be persisted')
  return { meeting, created: inserted.count > 0, reactivated: false }
}

/**
 * Llamadas en curso: sin `endedAt`. El despacho crea filas `no_answer|busy|failed`
 * ya cerradas (con `endedAt`) que no son "en curso" aunque su estado no sea
 * `completed`.
 */
export async function listLiveCalls(orgId: string) {
  return prisma.call.findMany({
    where: { orgId, endedAt: null, status: { not: 'completed' } },
    include: { lead: true, agent: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function bulkActions(
  orgId: string,
  ids: string[],
  action: 'follow_up' | 'priority',
  userId: string
) {
  if (action === 'priority') {
    const result = await prisma.call.updateMany({
      where: { id: { in: ids }, orgId },
      data: { isFavorite: true },
    })
    return result.count
  }

  // follow_up: create a CallTask per owned call
  const calls = await prisma.call.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, leadId: true },
  })
  let updated = 0
  for (const call of calls) {
    await prisma.callTask.create({
      data: { orgId, callId: call.id, userId, title: 'Seguimiento' },
    })
    updated += 1
  }
  return updated
}

export async function listCallNotes(orgId: string, callId: string) {
  return prisma.leadNote.findMany({
    where: { callId, orgId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createCallNote(orgId: string, callId: string, userId: string, text: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId } })
  if (!call) return null
  const user = await prisma.user.findUnique({ where: { id: userId } })
  return prisma.leadNote.create({
    data: {
      orgId,
      leadId: call.leadId,
      callId,
      text,
      authorName: user?.name ?? 'Usuario',
    },
  })
}

export async function updateCallNote(orgId: string, callId: string, noteId: string, text: string) {
  return prisma.leadNote.updateMany({
    where: { id: noteId, orgId, callId },
    data: { text },
  })
}

export async function deleteCallNote(orgId: string, callId: string, noteId: string) {
  return prisma.leadNote.deleteMany({
    where: { id: noteId, orgId, callId },
  })
}

export async function toggleCallFavorite(orgId: string, callId: string, favorite?: boolean) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId } })
  if (!call) return null
  const isFavorite = favorite !== undefined ? favorite : !call.isFavorite
  await prisma.call.updateMany({ where: { id: callId, orgId }, data: { isFavorite } })
  return isFavorite
}

export async function listCallTasks(orgId: string, callId: string) {
  return prisma.callTask.findMany({
    where: { callId, orgId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createCallTask(
  orgId: string,
  callId: string,
  userId: string,
  data: { title: string; dueAt?: string }
) {
  return prisma.callTask.create({
    data: {
      orgId,
      callId,
      userId,
      title: data.title,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
    },
  })
}

export async function updateCallTask(
  orgId: string,
  callId: string,
  taskId: string,
  data: { title?: string; done?: boolean; dueAt?: string }
) {
  return prisma.callTask.updateMany({
    where: { id: taskId, orgId, callId },
    data: {
      title: data.title,
      done: data.done,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
    },
  })
}
