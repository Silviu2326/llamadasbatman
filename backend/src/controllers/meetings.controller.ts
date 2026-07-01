import { FastifyRequest, FastifyReply } from 'fastify'
import * as meetingsService from '../services/meetings.service'
import { MeetingStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const meeting = await meetingsService.getMeeting(orgId, request.params.id)
  if (!meeting) return reply.status(404).send({ error: 'Not found' })
  return reply.send(meeting)
}

export async function list(
  request: FastifyRequest<{
    Querystring: {
      assignedTo?: string
      status?: string
      dateFrom?: string
      dateTo?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const q = request.query
  const result = await meetingsService.listMeetings(orgId, {
    assignedTo: q.assignedTo,
    status: q.status as MeetingStatus | undefined,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
  })
  return reply.send(result)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      leadId: string
      callId?: string
      assignedTo?: string
      title: string
      scheduledAt: string
      durationMinutes?: number
      notes?: string
      meetingUrl?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const meeting = await meetingsService.createMeeting(orgId, request.body)
  return reply.status(201).send(meeting)
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      title?: string
      scheduledAt?: string
      durationMinutes?: number
      status?: MeetingStatus
      notes?: string
      meetingUrl?: string
      assignedTo?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await meetingsService.updateMeeting(orgId, request.params.id, request.body)
  return reply.send({ ok: true })
}
