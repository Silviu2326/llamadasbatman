import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { isQualifyingOutcome } from '../lib/callOutcome'
import { invalidateAgentConfigCache } from '../voice/agentConfig'
import { CALL_STRATEGIES, callStrategy } from '../voice/callStrategies'

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

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
  settings?: Record<string, unknown>
}) {
  const agent = await prisma.agent.create({
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
      settings: data.settings as Prisma.InputJsonValue | undefined,
    },
  })
  invalidateAgentConfigCache(orgId)
  return agent
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
  settings?: Record<string, unknown>
}) {
  const result = await prisma.agent.updateMany({
    where: { id, orgId },
    data: { ...data, settings: data.settings as Prisma.InputJsonValue | undefined },
  })
  if (result.count > 0) invalidateAgentConfigCache(orgId)
  return result
}

export async function deactivateAgent(orgId: string, id: string) {
  const result = await prisma.agent.updateMany({
    where: { id, orgId },
    data: { isActive: false },
  })
  if (result.count > 0) invalidateAgentConfigCache(orgId)
  return result
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

export async function getAgentStrategyPerformance(orgId: string, id: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const [agent, calls] = await Promise.all([
    prisma.agent.findFirst({ where: { id, orgId }, select: { agentType: true, callDirection: true, settings: true } }),
    prisma.call.findMany({
      where: { orgId, agentId: id, createdAt: { gte: since } },
      select: { outcome: true, durationSeconds: true, runtimeSnapshot: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ])

  if (!agent) return null
  const settings = jsonRecord(agent.settings)
  const direction = agent.callDirection === 'inbound' ? 'inbound' : 'outbound'
  const current = callStrategy(typeof settings.strategyId === 'string' ? settings.strategyId : null, agent.agentType, direction)
  const buckets = new Map<string, { calls: number; success: number; meetings: number; duration: number; durationCount: number }>()

  for (const call of calls) {
    const snapshot = jsonRecord(call.runtimeSnapshot)
    const strategyId = typeof snapshot.strategyId === 'string' ? snapshot.strategyId : 'unattributed'
    const bucket = buckets.get(strategyId) ?? { calls: 0, success: 0, meetings: 0, duration: 0, durationCount: 0 }
    bucket.calls += 1
    if (isQualifyingOutcome(call.outcome)) bucket.success += 1
    if (call.outcome === 'meeting_scheduled') bucket.meetings += 1
    if (call.durationSeconds != null) {
      bucket.duration += call.durationSeconds
      bucket.durationCount += 1
    }
    buckets.set(strategyId, bucket)
  }

  return {
    days,
    currentStrategyId: current.id,
    totalCalls: calls.length,
    strategies: [...buckets.entries()].map(([strategyId, bucket]) => ({
      strategyId,
      label: CALL_STRATEGIES.find(strategy => strategy.id === strategyId)?.label ?? 'Sin atribuir',
      calls: bucket.calls,
      successRate: bucket.calls ? Math.round((bucket.success / bucket.calls) * 100) : 0,
      meetings: bucket.meetings,
      avgDurationSeconds: bucket.durationCount ? Math.round(bucket.duration / bucket.durationCount) : null,
    })).sort((left, right) => right.calls - left.calls),
  }
}
