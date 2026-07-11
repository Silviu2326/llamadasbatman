import { prisma } from '../lib/prisma'
import { MeetingStatus } from '@prisma/client'
import { sendScheduleEvent } from './metaConversions.service'

interface MeetingFilters {
  assignedTo?: string
  status?: MeetingStatus
  dateFrom?: string
  dateTo?: string
}

export async function getMeeting(orgId: string, id: string) {
  return prisma.meeting.findFirst({
    where: { id, orgId },
    include: { lead: true, assignee: { select: { id: true, name: true, role: true } } },
  })
}

export async function listMeetings(orgId: string, filters: MeetingFilters = {}) {
  const { assignedTo, status, dateFrom, dateTo } = filters

  const where: Record<string, unknown> = { orgId }
  if (assignedTo) where.assignedTo = assignedTo
  if (status) where.status = status
  if (dateFrom || dateTo) {
    where.scheduledAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    }
  }

  return prisma.meeting.findMany({
    where,
    include: { lead: true, assignee: { select: { id: true, name: true, role: true } } },
    orderBy: { scheduledAt: 'asc' },
  })
}

export async function createMeeting(orgId: string, data: {
  leadId: string
  callId?: string
  assignedTo?: string
  title: string
  scheduledAt: string
  durationMinutes?: number
  notes?: string
  meetingUrl?: string
}) {
  const meeting = await prisma.meeting.create({
    data: {
      orgId,
      leadId: data.leadId,
      callId: data.callId,
      assignedTo: data.assignedTo,
      title: data.title,
      scheduledAt: new Date(data.scheduledAt),
      durationMinutes: data.durationMinutes ?? 30,
      notes: data.notes,
      meetingUrl: data.meetingUrl,
    },
  })
  await sendScheduleEvent(orgId, meeting).catch(() => {})
  return meeting
}

export async function updateMeeting(orgId: string, id: string, data: {
  title?: string
  scheduledAt?: string
  durationMinutes?: number
  status?: MeetingStatus
  notes?: string
  meetingUrl?: string
  assignedTo?: string
}) {
  return prisma.meeting.updateMany({
    where: { id, orgId },
    data: {
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
  })
}
