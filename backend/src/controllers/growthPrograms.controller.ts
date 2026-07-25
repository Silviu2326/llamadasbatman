import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/growthPrograms.service'
import * as sequenceService from '../services/salesSequence.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const programTypeSchema = z.enum(service.GROWTH_PROGRAM_TYPES)
const programStatusSchema = z.enum(['draft', 'active', 'paused', 'scheduled', 'completed'])
const listStatusSchema = z.enum(['draft', 'active', 'paused', 'scheduled', 'completed', 'archived'])
const dateSchema = z.string().trim().min(1).max(64).refine(value => !Number.isNaN(Date.parse(value)), 'Fecha inválida')

const jsonObjectSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 250_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El objeto no puede superar 250 KB' })
  }
})

const createSchema = z.object({
  type: programTypeSchema,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4_000).optional(),
  status: programStatusSchema.optional(),
  config: jsonObjectSchema.nullable().optional(),
  metrics: jsonObjectSchema.nullable().optional(),
  startsAt: dateSchema.nullable().optional(),
  endsAt: dateSchema.nullable().optional(),
}).strict()

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
  status: programStatusSchema.optional(),
  config: jsonObjectSchema.nullable().optional(),
  metrics: jsonObjectSchema.nullable().optional(),
  startsAt: dateSchema.nullable().optional(),
  endsAt: dateSchema.nullable().optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')

const listQuerySchema = z.object({
  type: programTypeSchema.optional(),
  status: listStatusSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

const enrollSchema = z.object({
  leadIds: z.array(z.string().trim().min(1).max(128)).max(1_000).optional(),
}).strict()

const stopSchema = z.object({
  reason: z.enum(['manual', 'reply', 'unsubscribe', 'bounce', 'complaint']).default('manual'),
}).strict()

function handleServiceError(err: unknown, reply: FastifyReply) {
  if (err instanceof service.GrowthProgramNotFoundError) return reply.status(404).send({ error: 'Programa no encontrado' })
  if (err instanceof service.GrowthProgramArchivedError) return reply.status(409).send({ error: err.message })
  if (err instanceof service.GrowthProgramScheduleError) return reply.status(400).send({ error: err.message })
  if (err instanceof sequenceService.SalesSequenceError) return reply.status(err.statusCode).send({ error: err.message, code: err.code })
  throw err
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  return reply.send(await service.listGrowthPrograms(orgId, query))
}

export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await service.getGrowthProgramsDashboard(orgId))
}

export async function get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.getGrowthProgram(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function create(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createSchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createGrowthProgram(orgId, userId, body))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateSchema, request.body)
  if (!params || !body) return
  try {
    return reply.send(await service.updateGrowthProgram(orgId, userId, params.id, body))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function archive(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.archiveGrowthProgram(orgId, userId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function enroll(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, enrollSchema, request.body)
  if (!params || !body) return
  try {
    return reply.status(201).send(await sequenceService.enrollSalesSequence(orgId, params.id, body.leadIds, userId))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function enrollments(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await sequenceService.listSalesSequenceEnrollments(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function pause(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await sequenceService.pauseSalesSequence(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function resume(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await sequenceService.resumeSalesSequence(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

export async function stop(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, stopSchema, request.body)
  if (!params || !body) return
  try {
    return reply.send(await sequenceService.stopSalesSequence(orgId, params.id, body.reason))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}
