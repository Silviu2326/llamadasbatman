import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { isQualifyingOutcome } from '../lib/callOutcome'
import { invalidateAgentConfigCache } from '../voice/agentConfig'
import { CALL_STRATEGIES, callStrategy } from '../voice/callStrategies'
import { missingRuntimeCredentials, resolveAgentRuntime, runtimeProviderLabel, unsupportedRuntimeProviders } from '../voice/runtimeConfig'
import { getPublicCatalogVoice, VoiceCatalogError } from './agentVoices.service'
import { consentIsCurrent, findActiveVoiceConsent, scopeIncludesAgent } from './voiceConsent.service'
import { countTestCallsToday, listVoiceTestNumbers, MAX_TEST_CALLS_PER_DAY } from './voiceTestCall.service'

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Error de negocio que el controlador traduce a una respuesta HTTP (422 por defecto). */
export class AgentValidationError extends Error {
  constructor(message: string, public readonly statusCode = 422, public readonly code = 'AGENT_VALIDATION') { super(message) }
}

export type LifecycleStatus = 'draft' | 'active' | 'paused' | 'archived'
const VOICE_UPLOAD_KIND = 'agent.voice.create'

/** Nota mínima de la evaluación automática para poder publicar. */
export const MIN_PUBLISH_SCORE = 75

/**
 * Una voz privada solo puede asignarse si nació de una subida completada de
 * esta organización; cualquier otra tiene que ser pública en el catálogo.
 * Así un identificador ajeno (una voz clonada de otra organización) no sirve
 * aunque alguien lo conozca.
 */
export async function assertVoiceAssignable(orgId: string, voiceId: string) {
  const owned = await prisma.job.findFirst({
    where: { orgId, kind: VOICE_UPLOAD_KIND, status: 'succeeded', output: { path: ['id'], equals: voiceId } },
    select: { id: true },
  })
  if (owned) return { source: 'private' as const }
  let voice: Awaited<ReturnType<typeof getPublicCatalogVoice>>
  try { voice = await getPublicCatalogVoice(voiceId) } catch (error) {
    if (error instanceof VoiceCatalogError) throw new AgentValidationError(error.message, error.statusCode, 'VOICE_CATALOG_UNAVAILABLE')
    throw error
  }
  if (!voice) throw new AgentValidationError('Esa voz no está disponible para tu organización: elige una del catálogo o una voz subida por tu equipo.', 422, 'VOICE_NOT_ASSIGNABLE')
  return { source: 'catalog' as const, voice }
}

/**
 * Números desde los que la pasarela puede marcar de verdad. Hoy salen del
 * entorno: la pasarela Zadarma exige que el número del agente coincida con su
 * `ZADARMA_CALLER_ID`. Si no hay ninguno configurado, la comprobación es solo
 * informativa (entorno de desarrollo o pasarela no configurada).
 */
export function listOutboundNumbers(env: NodeJS.ProcessEnv = process.env) {
  const numbers: Array<{ phone: string; provider: string; label: string }> = []
  const zadarma = env.ZADARMA_CALLER_ID?.trim()
  if (zadarma) numbers.push({ phone: zadarma, provider: 'zadarma', label: 'Línea Zadarma' })
  const twilio = env.TWILIO_FROM_NUMBER?.trim()
  if (twilio && /^\+[1-9]\d{7,14}$/.test(twilio)) numbers.push({ phone: twilio, provider: 'twilio', label: 'Número Twilio' })
  return { numbers, configured: numbers.length > 0 }
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
  if (data.voiceId) await assertVoiceAssignable(orgId, data.voiceId)
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

export type AgentUpdateInput = {
  name?: string
  role?: string
  description?: string
  agentType?: string
  callDirection?: string
  personality?: string
  voiceId?: string
  systemPrompt?: string
  language?: string
  settings?: Record<string, unknown>
  /** `null` o `''` borran el número; ausente lo deja como está. */
  phoneNumber?: string | null
  monthlyMinuteLimit?: number | null
}

/** Campos que solo cambian las transiciones de ciclo de vida (publish/pause/resume/archive). */
const LIFECYCLE_FIELDS = ['lifecycleStatus', 'isActive'] as const

/**
 * Edición de la configuración del agente. Nunca cambia el estado: `PUT`
 * no puede activar un agente saltándose consentimiento y evaluación, y una
 * restauración de versión tampoco. El estado solo se mueve con
 * `transitionAgentLifecycle`.
 */
export async function updateAgent(orgId: string, id: string, input: AgentUpdateInput & Record<string, unknown>, actorUserId?: string) {
  const data: Record<string, unknown> = { ...input }
  for (const field of LIFECYCLE_FIELDS) delete data[field]
  if ('phoneNumber' in data && !data.phoneNumber) data.phoneNumber = null
  const before = await prisma.agent.findFirst({ where: { id, orgId } })
  if (!before) return { count: 0 }
  // La ficha del agente no conoce `knowledgeIds` (lo gestiona Knowledge): si el
  // `settings` que llega no lo trae, se conserva el que ya había.
  if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) && !('knowledgeIds' in (data.settings as Record<string, unknown>))) {
    const previous = (before.settings as Record<string, unknown> | null)?.knowledgeIds
    if (previous !== undefined) data.settings = { ...(data.settings as Record<string, unknown>), knowledgeIds: previous }
  }
  const changedFields = Object.keys(data).filter(key => JSON.stringify((before as any)[key]) !== JSON.stringify(data[key]))
  if (!changedFields.length) return { count: 1 }
  if (changedFields.includes('voiceId') && typeof data.voiceId === 'string' && data.voiceId) await assertVoiceAssignable(orgId, data.voiceId)
  const after = await prisma.agent.update({ where: { id }, data: { ...data, settings: data.settings as Prisma.InputJsonValue | undefined } })
  await recordAgentVersion(orgId, id, actorUserId, after, changedFields)
  await prisma.auditLog.create({ data: { orgId, actorUserId, action: 'agent.update', entityType: 'Agent', entityId: id, before: before as unknown as Prisma.InputJsonValue, after: after as unknown as Prisma.InputJsonValue } })
  invalidateAgentConfigCache(orgId)
  return { count: 1, changedFields }
}

/**
 * Única puerta para cambiar `lifecycleStatus`/`isActive`. Queda en el
 * historial de versiones y en auditoría como cualquier otro cambio.
 */
export async function transitionAgentLifecycle(orgId: string, id: string, lifecycleStatus: LifecycleStatus, actorUserId?: string, action = `agent.${lifecycleStatus}`) {
  const before = await prisma.agent.findFirst({ where: { id, orgId } })
  if (!before) return null
  const isActive = lifecycleStatus === 'active' || lifecycleStatus === 'draft'
  if (before.lifecycleStatus === lifecycleStatus && before.isActive === isActive) return before
  const after = await prisma.agent.update({ where: { id }, data: { lifecycleStatus, isActive } })
  await recordAgentVersion(orgId, id, actorUserId, after, ['lifecycleStatus', 'isActive'].filter(key => (before as any)[key] !== (after as any)[key]))
  await prisma.auditLog.create({ data: { orgId, actorUserId, action, entityType: 'Agent', entityId: id, before: { lifecycleStatus: before.lifecycleStatus, isActive: before.isActive }, after: { lifecycleStatus, isActive } } })
  invalidateAgentConfigCache(orgId)
  return after
}

/**
 * `DELETE /agents/:id` histórico: hoy equivale a pausar. Un agente activo pasa
 * a `paused`; uno en borrador se queda en borrador pero deja de marcar.
 */
export async function deactivateAgent(orgId: string, id: string, actorUserId?: string) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { lifecycleStatus: true } })
  if (!agent) return { count: 0 }
  if (agent.lifecycleStatus === 'active') { await transitionAgentLifecycle(orgId, id, 'paused', actorUserId, 'agent.pause'); return { count: 1 } }
  const result = await prisma.agent.updateMany({ where: { id, orgId }, data: { isActive: false } })
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

/** Campos cuyo cambio invalida la prueba evaluada: la llamada ya no refleja al agente actual. */
const EVALUATION_SENSITIVE_FIELDS = ['systemPrompt', 'voiceId'] as const
const EVALUATION_SENSITIVE_SETTINGS = ['strategyId', 'activePlaybookId'] as const

type VersionLike = { createdAt: Date; changedFields: string[]; snapshot: unknown }

/**
 * Instante del último cambio que deja obsoleta una prueba: guion, voz,
 * estrategia o playbook activo. Se calcula sobre el historial de versiones
 * (las más recientes primero); `settings` se compara entre instantáneas
 * porque cambia por muchos motivos que no afectan a la conversación.
 */
export function lastEvaluationSensitiveChange(versions: VersionLike[]): Date | null {
  for (let index = 0; index < versions.length; index++) {
    const version = versions[index]
    if (version.changedFields.some(field => (EVALUATION_SENSITIVE_FIELDS as readonly string[]).includes(field))) return version.createdAt
    if (!version.changedFields.includes('settings')) continue
    const previous = versions[index + 1]
    if (!previous) return version.createdAt
    const current = jsonRecord(jsonRecord(version.snapshot).settings)
    const before = jsonRecord(jsonRecord(previous.snapshot).settings)
    if (EVALUATION_SENSITIVE_SETTINGS.some(key => JSON.stringify(current[key] ?? null) !== JSON.stringify(before[key] ?? null))) return version.createdAt
  }
  return null
}

type EvaluationCall = { id: string; createdAt: Date; isTest: boolean; campaignId?: string | null; voiceEvaluation: { status: string; overall: number | null; criticalErrors: unknown } | null }

/**
 * Evaluación que cuenta para publicar: completada, con nota, sobre una llamada
 * de prueba o de campaña, y posterior al último cambio relevante del agente.
 * Devuelve también la más reciente descartada para explicar el motivo.
 */
export function selectPublishableEvaluation<T extends EvaluationCall>(calls: T[], changedAt: Date | null) {
  const completed = calls.filter(call => call.voiceEvaluation?.status === 'completed' && call.voiceEvaluation.overall != null && (call.isTest || Boolean(call.campaignId)))
  const current = completed.find(call => !changedAt || call.createdAt > changedAt) ?? null
  const stale = !current && completed.length ? completed[0] : null
  return { current, stale }
}

export function evaluationPasses(evaluation: { overall: number | null; criticalErrors: unknown } | null | undefined) {
  return Boolean(evaluation && evaluation.overall != null && evaluation.overall >= MIN_PUBLISH_SCORE && !(Array.isArray(evaluation.criticalErrors) && evaluation.criticalErrors.length))
}

export type ReadinessCheck = { key: string; label: string; ready: boolean; detail: string; informative?: boolean }

export async function getAgentWorkspace(orgId: string, id: string) {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const [agent, campaigns, calls, versions, consents, transfers, testNumbers, testCallsToday] = await Promise.all([
    prisma.agent.findFirst({ where: { id, orgId } }),
    prisma.campaign.findMany({ where: { orgId }, select: { id: true, name: true, status: true, agentId: true }, orderBy: { createdAt: 'desc' } }),
    prisma.call.findMany({ where: { orgId, agentId: id }, select: { id: true, status: true, durationSeconds: true, outcome: true, transcript: true, createdAt: true, leadId: true, campaignId: true, isTest: true, voiceEvaluation: true, meetings: { select: { id: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
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
  const changedAt = lastEvaluationSensitiveChange(versions)
  const { current: evaluatedCall, stale: staleCall } = selectPublishableEvaluation(calls, changedAt)
  const toEvaluation = (call: typeof calls[number] | null) => call?.voiceEvaluation ? { ...call.voiceEvaluation, callId: call.id, callCreatedAt: call.createdAt, isTest: call.isTest } : null
  const latestEvaluation = toEvaluation(evaluatedCall)
  const staleEvaluation = toEvaluation(staleCall)
  const outbound = listOutboundNumbers()
  const phoneMatchesOutbound = Boolean(agent.phoneNumber && outbound.numbers.some(item => item.phone === agent.phoneNumber))
  const runtime = resolveAgentRuntime({ runtime: jsonRecord(agent.settings).runtime } as any)
  const missingCredentials = missingRuntimeCredentials(runtime)
  const unsupportedProviders = unsupportedRuntimeProviders(runtime)
  const testDetail = evaluationPasses(latestEvaluation)
    ? `Última prueba ${latestEvaluation!.overall}/100 del ${latestEvaluation!.callCreatedAt.toLocaleDateString('es-ES')}`
    : latestEvaluation ? `La última prueba obtuvo ${latestEvaluation.overall}/100${Array.isArray(latestEvaluation.criticalErrors) && latestEvaluation.criticalErrors.length ? ' con errores críticos' : ''}; hace falta ${MIN_PUBLISH_SCORE} sin errores críticos.`
      : staleEvaluation ? `La prueba de ${staleEvaluation.callCreatedAt.toLocaleDateString('es-ES')} (${staleEvaluation.overall}/100) es anterior a los cambios de guion, voz, estrategia o playbook: repite la prueba.`
        : 'Todavía no hay una llamada de prueba evaluada.'
  const readiness: ReadinessCheck[] = [
    { key: 'voice', label: 'Voz seleccionada', ready: Boolean(agent.voiceId), detail: agent.voiceId ? 'Voz asignada' : 'Elige una voz del catálogo o sube una propia.' },
    { key: 'instructions', label: 'Instrucciones completas', ready: Boolean(agent.systemPrompt?.trim()), detail: agent.systemPrompt?.trim() ? 'Guion definido' : 'Escribe qué debe hacer el agente en cada llamada.' },
    { key: 'phone', label: 'Número desde el que llama', ready: Boolean(agent.phoneNumber), detail: agent.phoneNumber ? agent.phoneNumber : 'Asigna el número de salida en formato internacional.' },
    {
      key: 'outboundNumber', label: 'Número disponible en la pasarela', informative: !outbound.configured,
      ready: !outbound.configured || phoneMatchesOutbound,
      detail: !outbound.configured ? 'No hay número de salida configurado en este entorno; no se puede comprobar.'
        : phoneMatchesOutbound ? 'Coincide con la línea configurada.'
          : `La pasarela solo marca desde ${outbound.numbers.map(item => item.phone).join(', ')}. Cambia el número del agente.`,
    },
    {
      key: 'runtimeCredentials', label: 'Proveedores de voz e IA configurados', ready: !missingCredentials.length && !unsupportedProviders.length,
      detail: unsupportedProviders.length ? `Proveedor no soportado: ${unsupportedProviders.join(', ')}.`
        : missingCredentials.length ? `Faltan credenciales en el servidor: ${missingCredentials.join(', ')}. Cambia de proveedor o pide que se configuren.`
          : `${runtimeProviderLabel(runtime.transcriptionStt.provider)} → ${runtimeProviderLabel(runtime.primaryLlm.provider)} → ${runtimeProviderLabel(runtime.tts.provider)} listos.`,
    },
    { key: 'consent', label: 'Consentimiento de voz vigente', ready: Boolean(activeConsent), detail: activeConsent ? `Autorizado por ${activeConsent.subjectName}` : 'Registra la autorización de la persona cuya voz se usa.' },
    { key: 'test', label: `Prueba real satisfactoria (${MIN_PUBLISH_SCORE}/100)`, ready: evaluationPasses(latestEvaluation), detail: testDetail },
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
    versions, consents: matchingConsents, activeConsent: activeConsent ?? null, latestEvaluation, staleEvaluation,
    lastConfigChangeAt: changedAt, outboundNumbers: outbound,
    calls: calls.slice(0, 20).map(call => ({ id: call.id, status: call.status, createdAt: call.createdAt, outcome: call.outcome, durationSeconds: call.durationSeconds, isTest: call.isTest, evaluation: call.voiceEvaluation })),
    testCall: { numbers: testNumbers, callsToday: testCallsToday, dailyLimit: MAX_TEST_CALLS_PER_DAY, ready: !testCallBlockers.length, blockers: testCallBlockers },
    usage: { minutes, costCents, averageCostCents: monthCalls.length ? Math.round(costCents / monthCalls.length) : 0, monthlyMinuteLimit: agent.monthlyMinuteLimit, percentage: agent.monthlyMinuteLimit ? Math.min(100, Math.round(minutes / agent.monthlyMinuteLimit * 100)) : 0 },
    commercial: { total: businessCalls.length, answered: businessCalls.filter(call => call.status === 'completed' || (call.durationSeconds ?? 0) > 0).length, meetings: businessCalls.reduce((sum, call) => sum + call.meetings.length, 0), transfers: new Set(transfers.map(item => item.callId)).size, sales: opportunities.filter(item => item.stage === 'closed_won').length, salesValue: opportunities.filter(item => item.stage === 'closed_won').reduce((sum, item) => sum + Number(item.value || 0), 0), objections, lossReasons: [...lossMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) },
  }
}

export async function publishAgent(orgId: string, id: string, actorUserId?: string) {
  const workspace = await getAgentWorkspace(orgId, id)
  if (!workspace) return { status: 'not_found' as const }
  if (workspace.agent.lifecycleStatus === 'archived') return { status: 'invalid_state' as const, lifecycleStatus: workspace.agent.lifecycleStatus }
  const blockers = workspace.readiness.checks.filter(item => !item.ready)
  if (blockers.length) return { status: 'blocked' as const, blockers }
  await transitionAgentLifecycle(orgId, id, 'active', actorUserId, 'agent.publish')
  return { status: 'published' as const, lifecycleStatus: 'active' as const }
}

/** Pausar solo tiene sentido desde `active`: un borrador no marca y un archivado ya está parado. */
export async function pauseAgent(orgId: string, id: string, actorUserId?: string) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { lifecycleStatus: true } })
  if (!agent) return { status: 'not_found' as const }
  if (agent.lifecycleStatus !== 'active') return { status: 'invalid_state' as const, lifecycleStatus: agent.lifecycleStatus }
  await transitionAgentLifecycle(orgId, id, 'paused', actorUserId, 'agent.pause')
  return { status: 'paused' as const, lifecycleStatus: 'paused' as const }
}

/**
 * Reanudar devuelve el agente a `draft` y exige publicar de nuevo, salvo que
 * todos los requisitos sigan cumplidos (consentimiento vigente, prueba válida
 * para la configuración actual): entonces vuelve directo a `active`.
 */
export async function resumeAgent(orgId: string, id: string, actorUserId?: string) {
  const workspace = await getAgentWorkspace(orgId, id)
  if (!workspace) return { status: 'not_found' as const }
  const { lifecycleStatus, isActive } = workspace.agent
  if (lifecycleStatus !== 'paused' && !(lifecycleStatus === 'draft' && !isActive)) return { status: 'invalid_state' as const, lifecycleStatus }
  if (workspace.readiness.ready) {
    await transitionAgentLifecycle(orgId, id, 'active', actorUserId, 'agent.resume')
    return { status: 'resumed' as const, lifecycleStatus: 'active' as const, blockers: [] as ReadinessCheck[] }
  }
  await transitionAgentLifecycle(orgId, id, 'draft', actorUserId, 'agent.resume')
  return { status: 'resumed' as const, lifecycleStatus: 'draft' as const, blockers: workspace.readiness.checks.filter(item => !item.ready) }
}

export async function assignCampaigns(orgId: string, id: string, campaignIds: string[]) {
  if (!await prisma.agent.findFirst({ where: { id, orgId }, select: { id: true } })) return false
  await prisma.$transaction([
    prisma.campaign.updateMany({ where: { orgId, agentId: id, id: { notIn: campaignIds } }, data: { agentId: null } }),
    prisma.campaign.updateMany({ where: { orgId, id: { in: campaignIds } }, data: { agentId: id } }),
  ])
  return true
}

/**
 * Restaura la configuración de una versión, nunca su estado: un agente pausado
 * por revocar un consentimiento no vuelve a activarse por restaurar. Si la
 * versión trae otra voz y esa voz no tiene consentimiento vigente, el agente
 * pasa a borrador (la evaluación ya queda invalidada por el cambio de versión).
 */
export async function restoreAgentVersion(orgId: string, id: string, versionId: string, actorUserId?: string) {
  const version = await prisma.agentVersion.findFirst({ where: { id: versionId, agentId: id, orgId } })
  if (!version) return false
  const snapshot = { ...jsonRecord(version.snapshot) }
  for (const field of LIFECYCLE_FIELDS) delete snapshot[field]
  const result = await updateAgent(orgId, id, snapshot as AgentUpdateInput, actorUserId)
  if (!result.count) return false
  const voiceChanged = Array.isArray(result.changedFields) && result.changedFields.includes('voiceId')
  if (voiceChanged) {
    const restoredVoice = typeof snapshot.voiceId === 'string' ? snapshot.voiceId : null
    const consent = restoredVoice ? await findActiveVoiceConsent(orgId, id, restoredVoice) : null
    const current = await prisma.agent.findFirst({ where: { id, orgId }, select: { lifecycleStatus: true } })
    if (!consent && current?.lifecycleStatus === 'active') await transitionAgentLifecycle(orgId, id, 'draft', actorUserId, 'agent.restore')
  }
  return true
}

export async function revokeAgentConsent(orgId: string, id: string, consentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { voiceId: true, lifecycleStatus: true } })
  const consent = await prisma.consentGrant.findFirst({ where: { id: consentId, orgId, kind: 'voice' } })
  if (!agent || !consent || !scopeIncludesAgent(consent.scope, id, agent.voiceId)) return false
  // Sin consentimiento, un agente publicado deja de marcar en el acto. Un
  // borrador se queda en borrador: ya no cumple readiness y no puede publicar.
  await prisma.$transaction([
    prisma.consentGrant.update({ where: { id: consentId }, data: { status: 'revoked', revokedAt: new Date() } }),
    ...(agent.lifecycleStatus === 'active' ? [prisma.agent.update({ where: { id }, data: { isActive: false, lifecycleStatus: 'paused' } })] : []),
  ])
  invalidateAgentConfigCache(orgId)
  return true
}

export async function createAgentConsent(orgId: string, id: string, actorUserId: string, data: { subjectName: string; subjectContact?: string; evidenceAssetId?: string; expiresAt?: Date }) {
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { id: true, voiceId: true } })
  if (!agent?.voiceId) return null
  // Registrar consentimiento sobre una voz privada ajena no la haría usable,
  // pero dejaría un rastro engañoso: solo se acepta una voz de la organización
  // o una pública del catálogo.
  await assertVoiceAssignable(orgId, agent.voiceId)
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

export async function archiveAgent(orgId: string, id: string, actorUserId?: string) {
  const agent = await transitionAgentLifecycle(orgId, id, 'archived', actorUserId, 'agent.archive')
  return agent ? { count: 1, lifecycleStatus: 'archived' as const } : { count: 0 }
}

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
