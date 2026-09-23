import { prisma } from '../lib/prisma'
import { isHumanConversation, isQualifyingOutcome } from '../lib/callOutcome'

// Test calls remain playable in activity, but never inflate sales results.
export async function getAgentTeam(orgId: string, start: Date, end: Date, previousStart: Date, db = prisma) {
  const base = { orgId, isTest: false, agentId: { not: null } }
  const activity = { orgId, agentId: { not: null } }
  const callSelect = { id: true, agentId: true, createdAt: true, status: true, isTest: true, recordingUrl: true,
    lead: { select: { name: true, company: true } } } as const
  const [counts, previousCalls, meetings, latest, recent, pipeline] = await Promise.all([
    db.call.groupBy({ by: ['agentId', 'outcome'], where: { ...base, createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
    db.call.count({ where: { ...base, createdAt: { gte: previousStart, lt: new Date(previousStart.getTime() + end.getTime() - start.getTime()) } } }),
    db.meeting.findMany({ where: { orgId, status: { not: 'cancelled' }, createdAt: { gte: start, lt: end }, call: base }, select: { call: { select: { agentId: true } } } }),
    db.call.findMany({ where: { ...activity, createdAt: { lt: end } }, distinct: ['agentId'], orderBy: { createdAt: 'desc' }, select: callSelect }),
    db.call.findMany({ where: { ...activity, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'desc' }, take: 6, select: callSelect }),
    db.opportunity.groupBy({ by: ['currency'], where: { orgId, stage: { notIn: ['closed_won', 'closed_lost'] } }, _count: { _all: true }, _sum: { value: true } }),
  ])
  const agents: Record<string, { calls: number; conversations: number; meetings: number; qualified: number }> = {}
  const row = (id: string) => agents[id] ??= { calls: 0, conversations: 0, meetings: 0, qualified: 0 }
  for (const count of counts) {
    if (!count.agentId) continue
    const agent = row(count.agentId)
    agent.calls += count._count._all
    if (isHumanConversation(count.outcome)) agent.conversations += count._count._all
    if (isQualifyingOutcome(count.outcome)) agent.qualified += count._count._all
  }
  for (const meeting of meetings) if (meeting.call?.agentId) row(meeting.call.agentId).meetings++
  // A result is a qualifying conversation, not an attributed opportunity.
  return { agents, previousCalls, latest, recent, pipeline: pipeline.map(item => ({ currency: item.currency, count: item._count._all, value: Number(item._sum.value ?? 0) })) }
}
