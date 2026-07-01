import { prisma } from '../lib/prisma'
import { CallStatus } from '@prisma/client'

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
  const call = await prisma.call.create({
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
      transcriptWords: data.transcriptWords ? (data.transcriptWords as object) : undefined,
      sentiment: data.sentiment,
      sentimentScore: data.sentimentScore,
      summary: data.summary,
      outcome: data.outcome ?? 'none',
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
    },
  })

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
