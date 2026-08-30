import { prisma } from '../lib/prisma'
import { CallStatus, Prisma } from '@prisma/client'
import { enqueueAutomationEvent } from '../jobs/automationRunner'
import { ensureConversationForLead } from './conversations.service'
import { logSalesActivity } from '../lib/salesActivity'
import { CALL_OUTCOMES, normalizeCallOutcome } from '../lib/callOutcome'
import { recordWhiteLabelVoiceUsage } from './whiteLabel.service'
import { recordUsage } from '../lib/usage'
import { triggerContextualMicroapps } from '../microapps/contextualAutomation'

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
  const { agentId, campaignId, status, outcome, dateFrom, dateTo, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (agentId) where.agentId = agentId
  if (campaignId) where.campaignId = campaignId
  if (status) where.status = status
  if (outcome) where.outcome = outcome
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
  return prisma.call.findFirst({
    where: { id, orgId },
    include: { lead: true, agent: true, campaign: true, meetings: true },
  })
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
    leadId: string
    agentId?: string
    campaignId?: string
    duration?: number
    recordingUrl?: string
    transcript?: string
    transcriptWords?: unknown
    sentiment?: string
    sentimentScore?: number
    summary?: string
    outcome?: string
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
          status: 'completed',
          durationSeconds: data.duration,
          recordingUrl: data.recordingUrl,
          transcript: data.transcript,
          transcriptWords: data.transcriptWords ? (data.transcriptWords as Prisma.InputJsonValue) : undefined,
          sentiment: data.sentiment,
          sentimentScore: data.sentimentScore,
          summary: data.summary,
          outcome: data.outcome ?? 'none',
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
        sentiment: data.sentiment,
        sentimentScore: data.sentimentScore,
        summary: data.summary,
        outcome: incomingOutcome,
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
      provider: 'twilio+voz',
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
        provider: 'twilio',
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

  // Update lead status to contacted if it was new
  if (created) {
    await recordWhiteLabelVoiceUsage(orgId, call.durationSeconds)
    await prisma.lead.updateMany({
      where: { id: data.leadId, orgId, status: 'new' },
      data: { status: 'contacted' },
    })

    // Update campaign stats only once for the initial call event.
    if (data.campaignId) {
      await prisma.campaign.updateMany({
        where: { id: data.campaignId, orgId },
        data: { contacted: { increment: 1 } },
      })
    }
  }

  // Auto-create meeting if outcome is meeting_scheduled
  if (effectiveOutcome === 'meeting_scheduled') {
    const meetingResult = await ensureAutoMeeting(orgId, data.leadId, call.id)

    if (meetingResult.created && effectiveCampaignId) {
      await prisma.campaign.updateMany({
        where: { id: effectiveCampaignId, orgId },
        data: { meetingsScheduled: { increment: 1 } },
      })
    }
  }

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

export async function createAutoMeeting(orgId: string, leadId: string, callId: string) {
  return (await ensureAutoMeeting(orgId, leadId, callId)).meeting
}

async function ensureAutoMeeting(orgId: string, leadId: string, callId: string) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  const existing = await prisma.meeting.findFirst({ where: { orgId, callId } })
  if (existing) return { meeting: existing, created: false }

  // The deterministic id closes the race between two provider retries even
  // before a dedicated business unique index is present in every database.
  const id = `auto-call-${callId}`
  try {
    const meeting = await prisma.meeting.create({
      data: {
        id,
        orgId,
        leadId,
        callId,
        title: `Meeting with ${lead?.name ?? 'Lead'}`,
        scheduledAt: tomorrow,
        status: 'scheduled',
      },
    })
    return { meeting, created: true }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const raced = await prisma.meeting.findFirst({ where: { orgId, callId } })
    if (raced) return { meeting: raced, created: false }
    throw error
  }
}

export async function listLiveCalls(orgId: string) {
  return prisma.call.findMany({
    where: { orgId, status: { not: 'completed' } },
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
