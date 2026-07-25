import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

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
