import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { isQualifyingOutcome } from '../lib/callOutcome'

export async function listAgents(orgId: string) {
  return prisma.agent.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createAgent(orgId: string, data: {
  name: string
  role: string
  agentType?: string
  callDirection?: string
  personality?: string
  voiceId?: string
  systemPrompt?: string
  language?: string
}) {
  return prisma.agent.create({
    data: {
      orgId,
      name: data.name,
      role: data.role,
      agentType: data.agentType,
      callDirection: data.callDirection,
      personality: data.personality,
      voiceId: data.voiceId,
      systemPrompt: data.systemPrompt,
      language: data.language,
    },
  })
}

export async function getAgent(orgId: string, id: string) {
  return prisma.agent.findFirst({ where: { id, orgId } })
}

export async function updateAgent(orgId: string, id: string, data: {
  name?: string
  role?: string
  agentType?: string
  callDirection?: string
  personality?: string
  voiceId?: string
  systemPrompt?: string
  language?: string
  isActive?: boolean
  settings?: Prisma.InputJsonValue
}) {
  return prisma.agent.updateMany({
    where: { id, orgId },
    data,
  })
}

export async function deactivateAgent(orgId: string, id: string) {
  return prisma.agent.updateMany({
    where: { id, orgId },
    data: { isActive: false },
  })
}

export async function getAgentStats(orgId: string, id: string) {
  const [calls, meetingsScheduled, sentimentAgg] = await Promise.all([
    prisma.call.count({ where: { orgId, agentId: id } }),
    prisma.meeting.count({
      where: {
        orgId,
        call: { agentId: id },
      },
    }),
    prisma.call.aggregate({
      where: { orgId, agentId: id, sentimentScore: { not: null } },
      _avg: { sentimentScore: true },
    }),
  ])

  return {
    calls,
    meetingsScheduled,
    avgSentimentScore: sentimentAgg._avg.sentimentScore ?? 0,
  }
}

export async function getAgentTimeseries(orgId: string, id: string, days = 30) {
  const dayMs = 24 * 60 * 60 * 1000
  const since = new Date(Date.now() - (days - 1) * dayMs)
  since.setHours(0, 0, 0, 0)
  const calls = await prisma.call.findMany({
    where: { orgId, agentId: id, createdAt: { gte: since } },
    select: { createdAt: true, outcome: true, durationSeconds: true, sentimentScore: true },
    orderBy: { createdAt: 'asc' },
  })

  const byDay = new Map<string, { calls: number; meetings: number }>()
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(new Date(Date.now() - i * dayMs).toISOString().slice(0, 10), { calls: 0, meetings: 0 })
  }
  let durationSum = 0
  let durationCount = 0
  let sentimentSum = 0
  let sentimentCount = 0
  let success = 0
  for (const call of calls) {
    const bucket = byDay.get(call.createdAt.toISOString().slice(0, 10))
    if (bucket) {
      bucket.calls++
      if (call.outcome === 'meeting_scheduled') bucket.meetings++
    }
    if (call.durationSeconds) { durationSum += call.durationSeconds; durationCount++ }
    if (call.sentimentScore != null) { sentimentSum += call.sentimentScore; sentimentCount++ }
    if (isQualifyingOutcome(call.outcome)) success++
  }
  return {
    days,
    series: [...byDay.entries()].map(([date, value]) => ({ date, ...value })),
    totals: {
      calls: calls.length,
      successRate: calls.length ? Math.round((success / calls.length) * 100) : 0,
      avgDurationSeconds: durationCount ? Math.round(durationSum / durationCount) : null,
      avgSentiment: sentimentCount ? Math.round((sentimentSum / sentimentCount) * 100) / 100 : null,
    },
  }
}
