import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as meetingsService from '../services/meetings.service'
import { OwnershipError, MeetingNotFoundError, MeetingStateError } from '../services/meetings.service'
import type { MeetingStatus } from '@prisma/client'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string; workspaceScope?: 'own' | 'team' | 'org' }

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

// RE-107: completar una reunión exige un outcome real (no un booleano vacío).
const completeMeetingSchema = z
  .object({
    outcome: z.string().trim().min(1, 'outcome es requerido').max(500),
    agreements: z.string().trim().max(2000).optional(),
    createFollowUpTask: z.boolean().optional(),
  })
  .strict()

const noShowMeetingSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
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
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const meeting = await meetingsService.getMeeting(orgId, { userId, role, workspaceScope }, request.params.id)
  if (!meeting) return reply.status(404).send({ error: 'Not found' })
  return reply.send(meeting)
}

/** GET /:id/prep — RE-108: contexto real (lead, notas, llamadas, oportunidad
 * abierta, actividad y reuniones previas) para preparar la reunión. */
export async function prep(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  try {
    const result = await meetingsService.getMeetingPrep(orgId, { userId, role, workspaceScope }, request.params.id)
    return reply.send(result)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
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
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const query = parseRequest(reply, listMeetingsQuerySchema, request.query)
  if (!query) return
  const result = await meetingsService.listMeetings(orgId, { userId, role, workspaceScope }, {
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
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, createMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.createMeeting(orgId, userId, role, data, workspaceScope)
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
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, updateMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.updateMeeting(orgId, userId, role, request.params.id, data, workspaceScope)
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
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, rescheduleMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.rescheduleMeeting(orgId, userId, role, request.params.id, data, workspaceScope)
    return reply.send(meeting)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

/** POST /:id/complete — RE-107: cierra la reunión con outcome/acuerdos y, salvo
 * que se pida lo contrario, crea la tarea de seguimiento (+2 días). */
export async function complete(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, completeMeetingSchema, request.body)
  if (!data) return

  try {
    const result = await meetingsService.completeMeeting(orgId, userId, role, request.params.id, data, workspaceScope)
    return reply.send(result)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof MeetingStateError) {
      return reply.status(409).send({ error: err.message })
    }
    throw err
  }
}

/** POST /:id/no-show — RE-107: registra que el lead no se presentó. */
export async function noShow(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, noShowMeetingSchema, request.body)
  if (!data) return

  try {
    const meeting = await meetingsService.markNoShow(orgId, userId, role, request.params.id, data, workspaceScope)
    return reply.send(meeting)
  } catch (err) {
    if (err instanceof MeetingNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof MeetingStateError) {
      return reply.status(409).send({ error: err.message })
    }
    throw err
  }
}
