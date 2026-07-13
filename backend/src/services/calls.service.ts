import { prisma } from '../lib/prisma'
import { CallStatus, Prisma } from '@prisma/client'
import { enqueueAutomationEvent } from '../jobs/automationRunner'
import { ensureConversationForLead } from './conversations.service'
import { logSalesActivity } from '../lib/salesActivity'

interface CallFilters {
  agentId?: string
  campaignId?: string
  status?: CallStatus
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export async function listCalls(orgId: string, filters: CallFilters = {}) {
  const { agentId, campaignId, status, dateFrom, dateTo, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (agentId) where.agentId = agentId
  if (campaignId) where.campaignId = campaignId
  if (status) where.status = status
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
    startedAt?: string
    endedAt?: string
  }
) {
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
    ?? (data.outcome === 'meeting_scheduled' ? 'Llamada completada · reunión agendada' : 'Llamada completada')

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
        deliveredAt: data.endedAt ? new Date(data.endedAt) : new Date(),
        metadata: {
          callId: call.id,
          externalCallId: data.externalCallId ?? null,
          durationSeconds: data.duration ?? null,
          outcome: data.outcome ?? 'none',
          recordingUrl: data.recordingUrl ?? null,
          sentiment: data.sentiment ?? null,
        },
      },
      update: {
        body: messageBody,
        status: 'recorded',
        metadata: {
          callId: call.id,
          externalCallId: data.externalCallId ?? null,
          durationSeconds: data.duration ?? null,
          outcome: data.outcome ?? 'none',
          recordingUrl: data.recordingUrl ?? null,
          sentiment: data.sentiment ?? null,
        },
      },
    })
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: data.endedAt ? new Date(data.endedAt) : new Date() },
    })
    if (created) {
      await tx.outboxEvent.create({
        data: {
          orgId,
          topic: 'call.completed',
          aggregateType: 'Call',
          aggregateId: call.id,
          payload: {
            eventId,
            callId: call.id,
            leadId: data.leadId,
            conversationId: conversation.id,
            campaignId: data.campaignId ?? null,
            outcome: data.outcome ?? 'none',
            durationSeconds: data.duration ?? null,
          },
        },
      })
    }
  })

  if (!created) return call

  // Update lead status to contacted if it was new
  await prisma.lead.updateMany({
    where: { id: data.leadId, orgId, status: 'new' },
    data: { status: 'contacted' },
  })

  // Update campaign stats
  if (data.campaignId) {
    await prisma.campaign.updateMany({
      where: { id: data.campaignId, orgId },
      data: { contacted: { increment: 1 } },
    })
  }

  // Auto-create meeting if outcome is meeting_scheduled
  if (data.outcome === 'meeting_scheduled') {
    await createAutoMeeting(orgId, data.leadId, call.id)

    if (data.campaignId) {
      await prisma.campaign.updateMany({
        where: { id: data.campaignId, orgId },
        data: { meetingsScheduled: { increment: 1 } },
      })
    }
  }

  await enqueueAutomationEvent(orgId, 'call.completed', {
    eventId,
    callId: call.id,
    leadId: data.leadId,
    conversationId: conversation.id,
    campaignId: data.campaignId,
    outcome: data.outcome ?? 'none',
    durationSeconds: data.duration,
  }, eventId)

  return call
}

export async function createAutoMeeting(orgId: string, leadId: string, callId: string) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })

  return prisma.meeting.create({
    data: {
      orgId,
      leadId,
      callId,
      title: `Meeting with ${lead?.name ?? 'Lead'}`,
      scheduledAt: tomorrow,
      status: 'scheduled',
    },
  })
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
