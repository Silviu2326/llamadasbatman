import { FastifyRequest, FastifyReply } from 'fastify'
import * as dashboardService from '../services/dashboard.service'
import { liveCallsByOrg } from '../voice/telephony/liveCalls'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { requirePermission, requireEntitlement } from '../access-control'
import { getBusinessAnalysis, getAnalysisRecords } from '../services/businessAnalysis.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function analysisHandler(request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) {
  const days = Number(request.query.days ?? 30)
  if (![7, 30, 90].includes(days)) return reply.code(400).send({ error: 'Elige 7, 30 o 90 días.' })
  return reply.send(await getBusinessAnalysis((request.user as JWTUser).orgId, days))
}

const recordQuery = z.object({
  start: z.string().datetime(), end: z.string().datetime(),
  kind: z.enum(['calls', 'meetings', 'won', 'closed', 'lost', 'opportunities']),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  campaignId: z.string().min(1).max(200).optional(), agentId: z.string().min(1).max(200).optional(),
  outcome: z.string().min(1).max(100).optional(), withMeeting: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
}).refine(query => {
  const duration = Date.parse(query.end) - Date.parse(query.start)
  return duration > 0 && duration <= 91 * 86400000 && Date.parse(query.end) <= Date.now() + 60000
}, 'Periodo no válido')

export async function analysisRecordsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = recordQuery.safeParse(request.query)
  if (!query.success) return reply.code(400).send({ error: 'Los filtros del detalle no son válidos.' })
  const permission = query.data.kind === 'calls' ? 'calls.read' : query.data.kind === 'meetings' ? 'meetings.read' : 'pipeline.read'
  await requirePermission(permission, { scope: 'org' })(request, reply)
  if (reply.sent) return
  if (query.data.kind !== 'calls') {
    await requireEntitlement('crm')(request, reply)
    if (reply.sent) return
  }
  return reply.send(await getAnalysisRecords((request.user as JWTUser).orgId, query.data))
}

export async function goalsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await dashboardService.getDashboardGoals((request.user as JWTUser).orgId))
}

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

export async function updateGoals(
  request: FastifyRequest<{ Body: { monthlyRevenue?: unknown; monthlyMeetings?: unknown } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const monthlyRevenue = Number(request.body?.monthlyRevenue)
  const monthlyMeetings = Number(request.body?.monthlyMeetings)
  if (!Number.isSafeInteger(monthlyRevenue) || monthlyRevenue < 1 || !Number.isSafeInteger(monthlyMeetings) || monthlyMeetings < 1) {
    return reply.status(400).send({ error: 'Los objetivos deben ser números enteros mayores que cero.' })
  }
  const goals = await dashboardService.updateDashboardGoals(orgId, {
    monthlyRevenue: Math.round(monthlyRevenue),
    monthlyMeetings: Math.round(monthlyMeetings),
  })
  return reply.send(goals)
}
