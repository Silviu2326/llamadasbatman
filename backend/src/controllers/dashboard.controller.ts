import { FastifyRequest, FastifyReply } from 'fastify'
import * as dashboardService from '../services/dashboard.service'
import { liveCallsByOrg } from '../voice/telephony/liveCalls'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function statsHandler(
  request: FastifyRequest<{ Querystring: { days?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const days = [7, 30, 90].includes(Number(request.query.days)) ? Number(request.query.days) : 7
  const result = await dashboardService.getStats(orgId, days)
  return reply.send(result)
}

export async function liveHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const calls = liveCallsByOrg(orgId)
  if (calls.length === 0) return reply.send([])
  const [leads, agents] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: calls.map(c => c.leadId) }, orgId }, select: { id: true, name: true } }),
    prisma.agent.findMany({ where: { id: { in: calls.map(c => c.agentId) }, orgId }, select: { id: true, name: true } }),
  ])
  const leadNames = Object.fromEntries(leads.map(l => [l.id, l.name]))
  const agentNames = Object.fromEntries(agents.map(a => [a.id, a.name]))
  return reply.send(calls.map(c => ({
    callSid: c.callSid,
    leadName: leadNames[c.leadId] ?? c.phone,
    agentName: agentNames[c.agentId] ?? 'Agente',
    startedAt: c.startedAt,
  })))
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
