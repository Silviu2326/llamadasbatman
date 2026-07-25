import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { getAccessPrincipal } from '../access-control'
import * as actionCenterService from '../services/actionCenter.service'

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === '' ? undefined : value, schema.optional())
const statusInputSchema = emptyToUndefined(z.enum(actionCenterService.ACTION_ITEM_STATUS_INPUTS))
  .transform(value => value === undefined ? undefined : actionCenterService.normalizeActionItemStatus(value))
const querySchema = z.object({
  status: statusInputSchema,
  priority: emptyToUndefined(z.enum(actionCenterService.ACTION_ITEM_PRIORITIES)),
  limit: emptyToUndefined(z.coerce.number().int().min(1).max(100)),
}).strict()
const paramsSchema = z.object({ id: z.string().trim().min(1).max(240) }).strict()
const updateSchema = z.object({ status: z.enum(actionCenterService.ACTION_ITEM_STATUS_INPUTS) })
  .extend({
    reason: z.string().trim().min(1).max(500).optional(),
    result: z.record(z.unknown()).optional(),
  })
  .strict()
  .transform(value => ({ ...value, status: actionCenterService.normalizeActionItemStatus(value.status) }))

function getIdempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key']
  return Array.isArray(value) ? value[0] : value
}

function getOrgId(request: FastifyRequest, reply: FastifyReply): string | null {
  const principal = getAccessPrincipal(request)
  if (!principal) {
    reply.status(403).send({ error: 'Forbidden' })
    return null
  }
  return principal.orgId
}

export async function list(
  request: FastifyRequest<{ Querystring: { status?: string; priority?: string; limit?: string } }>,
  reply: FastifyReply,
) {
  const query = parseRequest(reply, querySchema, request.query ?? {})
  if (!query) return
  const orgId = getOrgId(request, reply)
  if (!orgId) return
  reply.header('cache-control', 'no-store')
  try {
    return reply.send(await actionCenterService.listActionItems(orgId, query))
  } catch (error) {
    if (error instanceof actionCenterService.ActionCenterPersistenceError) {
      return reply.status(503).send({ error: error.message, code: 'ACTION_CENTER_PERSISTENCE_UNAVAILABLE', retryable: true })
    }
    throw error
  }
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const params = parseRequest(reply, paramsSchema, request.params)
  const body = parseRequest(reply, updateSchema, request.body)
  if (!params || !body) return
  const orgId = getOrgId(request, reply)
  if (!orgId) return
  const principal = getAccessPrincipal(request)
  if (!principal) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
  try {
    return reply.send(await actionCenterService.updateActionItemStatus(orgId, params.id, body.status, {
      actorUserId: principal.userId,
      idempotencyKey: getIdempotencyKey(request),
      reason: body.reason,
      result: body.result,
    }))
  } catch (error) {
    if (error instanceof actionCenterService.ActionItemNotFoundError) {
      return reply.status(404).send({ error: error.message, code: 'ACTION_NOT_FOUND' })
    }
    if (error instanceof actionCenterService.ActionCenterUnavailableError) {
      return reply.status(503).send({ error: error.message, code: 'ACTION_CENTER_UNAVAILABLE', retryable: true })
    }
    if (error instanceof actionCenterService.ActionCenterPersistenceError) {
      return reply.status(503).send({ error: error.message, code: 'ACTION_CENTER_PERSISTENCE_UNAVAILABLE', retryable: true })
    }
    if (error instanceof actionCenterService.ActionItemIdempotencyError) {
      return reply.status(409).send({ error: error.message, code: 'IDEMPOTENCY_KEY_REUSED' })
    }
    if (error instanceof actionCenterService.ActionItemConcurrentUpdateError) {
      return reply.status(409).send({ error: error.message, code: 'ACTION_CONCURRENT_UPDATE', retryable: true })
    }
    if (error instanceof actionCenterService.ActionItemStatusError) {
      return reply.status(409).send({
        error: error.message,
        code: 'INVALID_ACTION_STATUS_TRANSITION',
        current: error.current,
        requested: error.next,
      })
    }
    throw error
  }
}
