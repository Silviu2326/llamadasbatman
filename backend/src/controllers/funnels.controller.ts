import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as funnelsService from '../services/funnels.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const createFunnelSchema = z.object({
  name: z.string().trim().min(3).max(140),
  objective: z.string().trim().max(2_000).optional().nullable(),
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
