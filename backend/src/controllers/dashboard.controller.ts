import { FastifyRequest, FastifyReply } from 'fastify'
import * as dashboardService from '../services/dashboard.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function statsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await dashboardService.getStats(orgId)
  return reply.send(result)
}

export async function activity(
  request: FastifyRequest<{ Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const limit = request.query.limit ? parseInt(request.query.limit) : 20
  const result = await dashboardService.getActivity(orgId, limit)
  return reply.send(result)
}
