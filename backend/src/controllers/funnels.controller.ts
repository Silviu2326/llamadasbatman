import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as funnelsService from '../services/funnels.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const createFunnelSchema = z.object({
  name: z.string().trim().min(3).max(140),
  objective: z.string().trim().max(2_000).optional().nullable(),
}).strict()

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()

// Solo estados de destino accionables desde la página; `draft` es el inicial.
const statusBodySchema = z.object({
  status: z.enum(['active', 'paused', 'done']),
}).strict()

export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await funnelsService.getFunnelsOverview(orgId))
}

export async function create(
  request: FastifyRequest<{ Body: { name: string; objective?: string | null } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, createFunnelSchema, request.body)
  if (!body) return
  return reply.status(201).send({ funnel: await funnelsService.createFunnel(orgId, body) })
}

export async function updateStatus(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, statusBodySchema, request.body)
  if (!params || !body) return
  try {
    return reply.send({ funnel: await funnelsService.updateFunnelStatus(orgId, userId, params.id, body.status) })
  } catch (err) {
    if (err instanceof funnelsService.FunnelNotFoundError) return reply.status(404).send({ error: err.message })
    if (err instanceof funnelsService.FunnelStatusError) return reply.status(409).send({ error: err.message, code: err.code })
    throw err
  }
}
