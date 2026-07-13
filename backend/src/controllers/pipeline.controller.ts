import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as pipelineService from '../services/pipeline.service'
import { OwnershipError, OpportunityNotFoundError } from '../services/pipeline.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const OPPORTUNITY_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const
// Monedas soportadas por el formulario de oportunidad (ver OpportunityDetailPage.jsx).
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN'] as const

const expectedCloseDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expectedCloseDate no es una fecha válida' })

const createOpportunitySchema = z
  .object({
    leadId: z.string().trim().min(1, 'leadId es requerido'),
    assignedTo: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1, 'name es requerido').max(200),
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
    value: z.coerce.number().min(0).optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: expectedCloseDateSchema.optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict()

const updateOpportunitySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
    value: z.coerce.number().min(0).optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: expectedCloseDateSchema.optional(),
    notes: z.string().trim().max(5000).optional(),
    assignedTo: z.string().trim().min(1).optional(),
  })
  .strict()

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const opp = await pipelineService.getOpportunity(orgId, request.params.id)
  if (!opp) return reply.status(404).send({ error: 'Not found' })
  return reply.send(opp)
}

export async function listByStage(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await pipelineService.listByStage(orgId)
  return reply.send(result)
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createOpportunitySchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.createOpportunity(orgId, userId, data)
    return reply.status(201).send(opp)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function insights(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineInsights(orgId))
}

export async function prediction(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelinePrediction(orgId))
}

export async function actions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineActions(orgId))
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, updateOpportunitySchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.updateOpportunity(orgId, userId, request.params.id, data)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}
