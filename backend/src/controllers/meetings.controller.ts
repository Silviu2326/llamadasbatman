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

// RE-102: reprogramar exige una fecha futura (si se manda una fecha pasada
// no tiene sentido "reprogramar" a un hueco que ya ocurrió).
const rescheduleMeetingSchema = z
  .object({
    scheduledAt: scheduledAtSchema.refine((value) => new Date(value).getTime() > Date.now(), {
      message: 'scheduledAt debe ser una fecha futura',
    }),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()

// RE-103/RE-04: querystring de búsqueda/filtros/paginación server-side.
const listMeetingsQuerySchema = z
  .object({
    assignedTo: z.string().trim().min(1).max(128).optional(),
    status: z.enum(MEETING_STATUSES).optional(),
    dateFrom: z.string().trim().min(1).max(64).optional(),
    dateTo: z.string().trim().min(1).max(64).optional(),
    search: z.string().trim().min(1).max(200).optional(),
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
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
      search?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listMeetingsQuerySchema, request.query)
  if (!query) return
  const result = await meetingsService.listMeetings(orgId, {
    assignedTo: query.assignedTo,
    status: query.status as MeetingStatus | undefined,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    page: query.page,
    limit: query.limit,
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

export async function reschedule(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, rescheduleMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.rescheduleMeeting(orgId, userId, request.params.id, data)
    return reply.send(meeting)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}
