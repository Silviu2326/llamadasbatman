import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getAccessPrincipal } from '../access-control'
import { parseRequest } from '../lib/validation'
import * as orchestrationService from '../services/orchestration.service'
import { ORCHESTRATION_ACTION_CATALOG, ORCHESTRATION_ACTION_KINDS } from '../services/orchestration.adapters'

const actionSchema = z.object({
  kind: z.enum(ORCHESTRATION_ACTION_KINDS),
  title: z.string().trim().min(1).max(180).optional(),
  input: z.record(z.unknown()).default({}),
  references: z.object({
    campaignId: z.string().trim().min(1).max(160).optional(),
    landingSlug: z.string().trim().min(1).max(180).optional(),
    leadId: z.string().trim().min(1).max(160).optional(),
    leadIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
    agentId: z.string().trim().min(1).max(160).optional(),
    marketingCampaignId: z.string().trim().min(1).max(160).optional(),
    templateExternalId: z.string().trim().min(1).max(240).optional(),
    budgetCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
    dailyBudgetCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
    durationDays: z.coerce.number().int().min(1).max(365).optional(),
    opportunityId: z.string().trim().min(1).max(160).optional(),
    sequenceId: z.string().trim().min(1).max(180).optional(),
  }).strict().optional(),
  estimatedCostCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
}).strict()

const planSchema = z.object({
  objective: z.string().trim().min(10).max(500).optional(),
  objetivo: z.string().trim().min(10).max(500).optional(),
  durationDays: z.coerce.number().int().min(1).max(365),
  location: z.string().trim().min(2).max(160),
  budget: z.coerce.number().finite().min(0).max(1_000_000),
  desiredOutcome: z.string().trim().min(3).max(240),
  actions: z.array(actionSchema).max(32).optional(),
}).strict().refine(value => Boolean(value.objective || value.objetivo), {
  message: 'objective es obligatorio',
  path: ['objective'],
}).transform(value => ({
  objective: value.objective ?? value.objetivo ?? '',
  durationDays: value.durationDays,
  location: value.location,
  budget: value.budget,
  desiredOutcome: value.desiredOutcome,
  actions: value.actions,
}))

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(100) }).strict()
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(orchestrationService.PLAN_LIST_MAX_LIMIT).default(10),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  status: z.enum(['proposal', 'approved', 'queued', 'running', 'executed', 'paused', 'failed', 'rejected', 'rolling_back']).optional(),
}).strict()
const commentSchema = z.object({ comment: z.string().trim().max(2_000).optional() }).strict()
const keySchema = z.string().trim().min(8).max(180).regex(/^[a-zA-Z0-9._:-]+$/, 'Idempotency-Key contiene caracteres no permitidos')

function actor(request: FastifyRequest): orchestrationService.OrchestrationActor | null {
  const principal = getAccessPrincipal(request)
  if (!principal) return null
  return { ...principal, correlationId: request.correlationId }
}

function idempotencyKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const raw = request.headers['idempotency-key']
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = keySchema.safeParse(value)
  if (!parsed.success) {
    void reply.status(400).send({ error: 'Idempotency-Key es obligatorio y debe ser válido', code: 'IDEMPOTENCY_KEY_REQUIRED' })
    return null
  }
  return parsed.data
}

function respondError(reply: FastifyReply, error: unknown) {
  if (error instanceof orchestrationService.OrchestrationError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code })
  }
  console.error('[Orchestration] request failed:', error)
  return reply.status(500).send({ error: 'No se pudo completar la operación del orquestador', code: 'ORCHESTRATION_INTERNAL_ERROR' })
}

export async function createPlan(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const body = parseRequest(reply, planSchema, request.body)
  const currentActor = actor(request)
  if (!body || !currentActor) return
  const key = idempotencyKey(request, reply)
  if (!key) return
  try {
    return reply.status(201).send(await orchestrationService.createPersistedPlan(currentActor, body, key))
  } catch (error) {
    return respondError(reply, error)
  }
}

/** Contrato consumible por la UI: referencias, efectos y política de reintento. */
export async function catalog(request: FastifyRequest, reply: FastifyReply) {
  const currentActor = actor(request)
  if (!currentActor) return
  return reply.send({ contractVersion: orchestrationService.ORCHESTRATION_CONTRACT_VERSION, actions: ORCHESTRATION_ACTION_CATALOG })
}

export async function listPlans(request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) {
  const query = parseRequest(reply, listQuerySchema, request.query ?? {})
  const currentActor = actor(request)
  if (!query || !currentActor) return
  try {
    return reply.send(await orchestrationService.listPersistedPlans(currentActor.orgId, query))
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function getPlan(request: FastifyRequest<{ Params: unknown }>, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const currentActor = actor(request)
  if (!params || !currentActor) return
  try {
    const plan = await orchestrationService.getPersistedPlan(currentActor.orgId, params.id)
    if (!plan) return reply.status(404).send({ error: 'Plan no encontrado', code: 'PLAN_NOT_FOUND' })
    return reply.send(plan)
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function approvePlan(request: FastifyRequest<{ Params: unknown; Body: unknown }>, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, commentSchema, request.body ?? {})
  const currentActor = actor(request)
  if (!params || !body || !currentActor) return
  const key = idempotencyKey(request, reply)
  if (!key) return
  try {
    return reply.send(await orchestrationService.approvePlan(currentActor, params.id, key, body.comment))
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function rejectPlan(request: FastifyRequest<{ Params: unknown; Body: unknown }>, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, commentSchema, request.body ?? {})
  const currentActor = actor(request)
  if (!params || !body || !currentActor) return
  const key = idempotencyKey(request, reply)
  if (!key) return
  try {
    return reply.send(await orchestrationService.rejectPlan(currentActor, params.id, key, body.comment))
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function executePlan(request: FastifyRequest<{ Params: unknown }>, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const currentActor = actor(request)
  if (!params || !currentActor) return
  const key = idempotencyKey(request, reply)
  if (!key) return
  try {
    return reply.send(await orchestrationService.executePlan(currentActor, params.id, key))
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function rollbackPlan(request: FastifyRequest<{ Params: unknown }>, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const currentActor = actor(request)
  if (!params || !currentActor) return
  const key = idempotencyKey(request, reply)
  if (!key) return
  try {
    return reply.send(await orchestrationService.rollbackPlan(currentActor, params.id, key))
  } catch (error) {
    return respondError(reply, error)
  }
}

export async function health(request: FastifyRequest, reply: FastifyReply) {
  const currentActor = actor(request)
  if (!currentActor) return
  try {
    return reply.send(await orchestrationService.getOrchestrationHealth(currentActor.orgId))
  } catch (error) {
    return respondError(reply, error)
  }
}
