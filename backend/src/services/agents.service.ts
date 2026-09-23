import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { isQualifyingOutcome } from '../lib/callOutcome'
import { invalidateAgentConfigCache } from '../voice/agentConfig'
import { CALL_STRATEGIES, callStrategy } from '../voice/callStrategies'
import { consentIsCurrent, scopeIncludesAgent } from './voiceConsent.service'
import { countTestCallsToday, listVoiceTestNumbers, MAX_TEST_CALLS_PER_DAY } from './voiceTestCall.service'

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
  description?: string
  agentType?: string
  callDirection?: string
  personality?: string
  voiceId?: string
  systemPrompt?: string
  language?: string
  settings?: Record<string, unknown>
  phoneNumber?: string
  monthlyMinuteLimit?: number | null
}, actorUserId?: string) {
  const agent = await prisma.agent.create({
    data: {
      orgId,
      name: data.name,
      role: data.role,
      description: data.description,
      agentType: data.agentType,
      callDirection: data.callDirection,
      personality: data.personality,
      voiceId: data.voiceId,
      systemPrompt: data.systemPrompt,
      language: data.language,
      settings: data.settings as Prisma.InputJsonValue | undefined,
      phoneNumber: data.phoneNumber,
      monthlyMinuteLimit: data.monthlyMinuteLimit,
    },
  })
  await recordAgentVersion(orgId, agent.id, actorUserId, agent, Object.keys(data))
  invalidateAgentConfigCache(orgId)
  return agent
}

export async function getAgent(orgId: string, id: string) {
  return prisma.agent.findFirst({ where: { id, orgId } })
}

export async function updateAgent(orgId: string, id: string, data: {
  name?: string
  role?: string
  description?: string
  agentType?: string
  callDirection?: string
  personality?: string
  voiceId?: string
  systemPrompt?: string
  language?: string
  isActive?: boolean
  settings?: Record<string, unknown>
  phoneNumber?: string | null
  lifecycleStatus?: string
  monthlyMinuteLimit?: number | null
}, actorUserId?: string) {
  const before = await prisma.agent.findFirst({ where: { id, orgId } })
  if (!before) return { count: 0 }
  const changedFields = Object.keys(data).filter(key => JSON.stringify((before as any)[key]) !== JSON.stringify((data as any)[key]))
  if (!changedFields.length) return { count: 1 }
  const after = await prisma.agent.update({ where: { id }, data: { ...data, settings: data.settings as Prisma.InputJsonValue | undefined } })
  await recordAgentVersion(orgId, id, actorUserId, after, changedFields)
  await prisma.auditLog.create({ data: { orgId, actorUserId, action: 'agent.update', entityType: 'Agent', entityId: id, before: before as unknown as Prisma.InputJsonValue, after: after as unknown as Prisma.InputJsonValue } })
  invalidateAgentConfigCache(orgId)
  return { count: 1 }
}

export async function deactivateAgent(orgId: string, id: string) {
  const result = await prisma.agent.updateMany({
    where: { id, orgId },
    data: { isActive: false },
  })
  if (result.count > 0) invalidateAgentConfigCache(orgId)
  return result
}

const SNAPSHOT_FIELDS = ['name', 'role', 'description', 'agentType', 'callDirection', 'personality', 'voiceId', 'systemPrompt', 'language', 'isActive', 'phoneNumber', 'lifecycleStatus', 'monthlyMinuteLimit', 'settings'] as const

function snapshotAgent(agent: Record<string, unknown>) {
  return Object.fromEntries(SNAPSHOT_FIELDS.map(key => [key, agent[key]]))
}

async function recordAgentVersion(orgId: string, agentId: string, actorUserId: string | undefined, agent: unknown, changedFields: string[]) {
  const latest = await prisma.agentVersion.findFirst({ where: { agentId }, orderBy: { version: 'desc' }, select: { version: true } })
  return prisma.agentVersion.create({ data: { orgId, agentId, actorUserId, version: (latest?.version ?? 0) + 1, snapshot: snapshotAgent(agent as Record<string, unknown>) as Prisma.InputJsonValue, changedFields } })
}

export async function getAgentWorkspace(orgId: string, id: string) {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const [agent, campaigns, calls, versions, consents, transfers, testNumbers, testCallsToday] = await Promise.all([
    prisma.agent.findFirst({ where: { id, orgId } }),
    prisma.campaign.findMany({ where: { orgId }, select: { id: true, name: true, status: true, agentId: true }, orderBy: { createdAt: 'desc' } }),
    prisma.call.findMany({ where: { orgId, agentId: id }, select: { id: true, status: true, durationSeconds: true, outcome: true, transcript: true, createdAt: true, leadId: true, isTest: true, voiceEvaluation: true, meetings: { select: { id: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.agentVersion.findMany({ where: { orgId, agentId: id }, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { version: 'desc' }, take: 30 }),
    prisma.consentGrant.findMany({ where: { orgId, kind: 'voice' }, orderBy: { createdAt: 'desc' } }),
    prisma.voiceCallEvent.findMany({ where: { orgId, call: { agentId: id }, type: 'transfer.completed' }, select: { callId: true } }),
    listVoiceTestNumbers(orgId),
    countTestCallsToday(orgId),
  ])
  if (!agent) return null
  const matchingConsents = consents.filter(item => scopeIncludesAgent(item.scope, id, agent.voiceId))
  const now = new Date()
  const activeConsent = matchingConsents.find(item => consentIsCurrent(item, now))
  const completedEvaluations = calls.flatMap(call => call.voiceEvaluation?.status === 'completed' ? [{ ...call.voiceEvaluation, callId: call.id, callCreatedAt: call.createdAt }] : [])
  const latestEvaluation = completedEvaluations[0] ?? null
  const readiness = [
    { key: 'voice', label: 'Voz seleccionada', ready: Boolean(agent.voiceId) },
    { key: 'instructions', label: 'Instrucciones completas', ready: Boolean(agent.systemPrompt?.trim()) },
    { key: 'phone', label: 'Número desde el que llama', ready: Boolean(agent.phoneNumber) },
    { key: 'consent', label: 'Consentimiento de voz vigente', ready: Boolean(activeConsent) },
    { key: 'test', label: 'Prueba real satisfactoria (75/100)', ready: Boolean(latestEvaluation?.overall != null && latestEvaluation.overall >= 75 && !(Array.isArray(latestEvaluation.criticalErrors) && latestEvaluation.criticalErrors.length)) },
  ]
  // Las pruebas gastan minutos reales, así que cuentan en consumo y coste. No
  // son actividad comercial: no cuentan en resultados, objeciones ni pérdidas.
  const businessCalls = calls.filter(call => !call.isTest)
  const monthCalls = calls.filter(call => call.createdAt >= monthStart)
  const seconds = monthCalls.reduce((sum, call) => sum + (call.durationSeconds ?? 0), 0)
  const minutes = Math.ceil(seconds / 60)
  const pricePerMinute = Number(process.env.VOICE_PRICE_CENTS_PER_MINUTE || 8)
  const costCents = Math.round((seconds / 60) * pricePerMinute)
  const leadIds = [...new Set(businessCalls.map(call => call.leadId))]
  const opportunities = leadIds.length ? await prisma.opportunity.findMany({ where: { orgId, leadId: { in: leadIds } }, select: { stage: true, lossReason: true, value: true } }) : []
  const countTerms = (terms: string[]) => businessCalls.reduce((sum, call) => sum + (terms.some(term => call.transcript?.toLowerCase().includes(term)) ? 1 : 0), 0)
  const objections = [
    { label: 'Precio', count: countTerms(['caro', 'precio', 'presupuesto']) },
    { label: 'Sin interés', count: countTerms(['no me interesa', 'no interesa']) },
    { label: 'Sin tiempo', count: countTerms(['no tengo tiempo', 'ahora no']) },
    { label: 'Ya tiene solución', count: countTerms(['ya tenemos', 'ya uso']) },
  ].filter(item => item.count).sort((a, b) => b.count - a.count)
  const lossMap = new Map<string, number>()
  opportunities.filter(item => item.stage === 'closed_lost').forEach(item => lossMap.set(item.lossReason || 'Sin motivo indicado', (lossMap.get(item.lossReason || 'Sin motivo indicado') || 0) + 1))
  // Requisitos de la llamada de prueba: todo lo que exige publicar menos la
  // propia prueba. La puerta de verdad la aplican `voiceTestCall.service.ts` y
  // la pasarela; esto solo explica en la ficha qué falta.
  const testCallBlockers = readiness.filter(item => item.key !== 'test' && !item.ready).map(item => item.label)
  if (!testNumbers.some(item => item.active)) testCallBlockers.push('Un número propio autorizado para pruebas')
  if (testCallsToday >= MAX_TEST_CALLS_PER_DAY) testCallBlockers.push(`Máximo de ${MAX_TEST_CALLS_PER_DAY} pruebas al día alcanzado`)
  return {
    agent,
    campaigns: campaigns.map(campaign => ({ ...campaign, assigned: campaign.agentId === id })), readiness: { ready: readiness.every(item => item.ready), checks: readiness },
    versions, consents: matchingConsents, activeConsent: activeConsent ?? null, latestEvaluation,
    calls: calls.slice(0, 20).map(call => ({ id: call.id, status: call.status, createdAt: call.createdAt, outcome: call.outcome, durationSeconds: call.durationSeconds, isTest: call.isTest, evaluation: call.voiceEvaluation })),
    testCall: { numbers: testNumbers, callsToday: testCallsToday, dailyLimit: MAX_TEST_CALLS_PER_DAY, ready: !testCallBlockers.length, blockers: testCallBlockers },
    usage: { minutes, costCents, averageCostCents: monthCalls.length ? Math.round(costCents / monthCalls.length) : 0, monthlyMinuteLimit: agent.monthlyMinuteLimit, percentage: agent.monthlyMinuteLimit ? Math.min(100, Math.round(minutes / agent.monthlyMinuteLimit * 100)) : 0 },
    commercial: { total: businessCalls.length, answered: businessCalls.filter(call => call.status === 'completed' || (call.durationSeconds ?? 0) > 0).length, meetings: businessCalls.reduce((sum, call) => sum + call.meetings.length, 0), transfers: new Set(transfers.map(item => item.callId)).size, sales: opportunities.filter(item => item.stage === 'closed_won').length, salesValue: opportunities.filter(item => item.stage === 'closed_won').reduce((sum, item) => sum + Number(item.value || 0), 0), objections, lossReasons: [...lossMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) },
  }
}

export async function publishAgent(orgId: string, id: string, actorUserId?: string) {
  const workspace = await getAgentWorkspace(orgId, id)
  if (!workspace) return { status: 'not_found' as const }
  const blockers = workspace.readiness.checks.filter(item => !item.ready)
  if (blockers.length) return { status: 'blocked' as const, blockers }
  await updateAgent(orgId, id, { isActive: true, lifecycleStatus: 'active' }, actorUserId)
  return { status: 'published' as const }
}

export async function assignCampaigns(orgId: string, id: string, campaignIds: string[]) {
  if (!await prisma.agent.findFirst({ where: { id, orgId }, select: { id: true } })) return false
  await prisma.$transaction([
    prisma.campaign.updateMany({ where: { orgId, agentId: id, id: { notIn: campaignIds } }, data: { agentId: null } }),
    prisma.campaign.updateMany({ where: { orgId, id: { in: campaignIds } }, data: { agentId: id } }),
  ])
  return true
}

export async function restoreAgentVersion(orgId: string, id: string, versionId: string, actorUserId?: string) {
  const version = await prisma.agentVersion.findFirst({ where: { id: versionId, agentId: id, orgId } })
  if (!version) return false
  await updateAgent(orgId, id, version.snapshot as Record<string, unknown>, actorUserId)
  return true
}

export async function revokeAgentConsent(orgId: string, id: string, consentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { voiceId: true } })
  const consent = await prisma.consentGrant.findFirst({ where: { id: consentId, orgId, kind: 'voice' } })
  if (!agent || !consent || !scopeIncludesAgent(consent.scope, id, agent.voiceId)) return false
  await prisma.$transaction([prisma.consentGrant.update({ where: { id: consentId }, data: { status: 'revoked', revokedAt: new Date() } }), prisma.agent.update({ where: { id }, data: { isActive: false, lifecycleStatus: 'paused' } })])
  invalidateAgentConfigCache(orgId)
  return true
}

export async function createAgentConsent(orgId: string, id: string, actorUserId: string, data: { subjectName: string; subjectContact?: string; evidenceAssetId?: string; expiresAt?: Date }) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { id: true, voiceId: true } })
  if (!agent?.voiceId) return null
  return prisma.consentGrant.create({
    data: {
      orgId,
      subjectName: data.subjectName,
      subjectContact: data.subjectContact,
      kind: 'voice',
      scope: { channels: ['voice'], purposes: ['agent_calls'], agentIds: [id], voiceIds: [agent.voiceId] },
      evidenceAssetId: data.evidenceAssetId,
      grantedAt: new Date(),
      expiresAt: data.expiresAt,
      createdById: actorUserId,
    },
  })
}

export async function cloneAgent(orgId: string, id: string, actorUserId: string | undefined, options: Record<string, boolean>, name?: string) {
  const source = await prisma.agent.findFirst({ where: { id, orgId } })
  if (!source) return null
  const original = jsonRecord(source.settings); const settings: Record<string, unknown> = {}
  if (options.strategy) ['strategyId', 'escalationRules', 'keyMessages', 'behavior', 'runtime'].forEach(key => { if (original[key] !== undefined) settings[key] = original[key] })
  if (options.playbook) ['activePlaybookId', 'activePlaybookVersion'].forEach(key => { if (original[key] !== undefined) settings[key] = original[key] })
  if (options.documents && original.knowledgeSources !== undefined) settings.knowledgeSources = original.knowledgeSources
  return createAgent(orgId, { name: name?.trim() || `${source.name} (copia)`, role: source.role, description: source.description || undefined, agentType: source.agentType, callDirection: source.callDirection, personality: source.personality || undefined, voiceId: options.voice ? source.voiceId || undefined : undefined, systemPrompt: options.strategy ? source.systemPrompt || undefined : undefined, language: source.language, settings, monthlyMinuteLimit: options.limits ? source.monthlyMinuteLimit : null }, actorUserId)
}

export async function archiveAgent(orgId: string, id: string, actorUserId?: string) { return updateAgent(orgId, id, { isActive: false, lifecycleStatus: 'archived' }, actorUserId) }

export async function permanentlyDeleteAgent(orgId: string, id: string) {
  const found = await prisma.agent.findFirst({ where: { id, orgId }, select: { lifecycleStatus: true, _count: { select: { calls: true, campaigns: true } } } })
  if (!found || found.lifecycleStatus !== 'archived' || found._count.calls || found._count.campaigns) return false
  await prisma.agent.delete({ where: { id } }); return true
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
