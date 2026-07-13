import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as meetingsService from '../services/meetings.service'
import { OwnershipError, MeetingNotFoundError } from '../services/meetings.service'
import type { MeetingStatus } from '@prisma/client'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const MEETING_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const

// Duración máxima razonable: 8 horas.
const MAX_DURATION_MINUTES = 480

const scheduledAtSchema = z
  .string()
  .trim()
  .min(1, 'scheduledAt es requerido')
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'scheduledAt no es una fecha válida' })

const createMeetingSchema = z
  .object({
    leadId: z.string().trim().min(1, 'leadId es requerido'),
    callId: z.string().trim().min(1).optional(),
    assignedTo: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1, 'title es requerido').max(200),
    scheduledAt: scheduledAtSchema,
    durationMinutes: z.coerce.number().int().positive().max(MAX_DURATION_MINUTES).optional(),
    notes: z.string().trim().max(5000).optional(),
    meetingUrl: z.string().trim().url('meetingUrl debe ser una URL válida').max(2048).optional(),
  })
  .strict()

const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    scheduledAt: scheduledAtSchema.optional(),
    durationMinutes: z.coerce.number().int().positive().max(MAX_DURATION_MINUTES).optional(),
    status: z.enum(MEETING_STATUSES).optional(),
    notes: z.string().trim().max(5000).optional(),
    meetingUrl: z.string().trim().url('meetingUrl debe ser una URL válida').max(2048).optional(),
    assignedTo: z.string().trim().min(1).optional(),
  })
  .strict()

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
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.createMeeting(orgId, userId, data)
    return reply.status(201).send(meeting)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, updateMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.updateMeeting(orgId, userId, request.params.id, data)
    return reply.send(meeting)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}
