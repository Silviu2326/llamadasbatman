import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as agentsService from '../services/agents.service'
import * as voiceTestCallService from '../services/voiceTestCall.service'
import { parseRequest } from '../lib/validation'
import { CALL_STRATEGY_IDS, publicCallStrategies } from '../voice/callStrategies'
import { evaluateVoiceCall } from '../voice/evaluation/callJudgeService'
import { prisma } from '../lib/prisma'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const AGENT_TYPES = ['sales', 'receptionist', 'qualification', 'appointment', 'support', 'collections', 'handoff'] as const
const CALL_DIRECTIONS = ['inbound', 'outbound', 'both'] as const

const runtimeNodeSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  enabled: z.boolean().optional(),
}).strict()

const guruRuntimeSchema = runtimeNodeSchema.extend({
  structure: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(4_000),
  contextMode: z.enum(['full', 'conversation']).optional(),
})

const agentRuntimeSchema = z.object({
  primaryLlm: runtimeNodeSchema,
  guru: guruRuntimeSchema,
  // Compatibilidad con configuraciones guardadas antes de convertir el
  // fallback en un estratega fuera del camino de voz.
  fallbackLlm: runtimeNodeSchema.optional(),
  transcriptionStt: runtimeNodeSchema,
  emotionStt: runtimeNodeSchema,
  tts: runtimeNodeSchema,
  temperature: z.enum(['0.2', '0.4', '0.58', '0.8']).optional(),
  transcriptionLanguage: z.enum(['auto', 'es', 'en']).optional(),
  emotionMode: z.enum(['turn', 'important', 'off']).optional(),
  turnTaking: z.enum(['fast', 'balanced', 'natural']).optional(),
}).strict()

const agentSettingsSchema = z.object({
  strategyId: z.enum(CALL_STRATEGY_IDS).optional(),
  activePlaybookId: z.string().trim().max(128).nullable().optional(),
  activePlaybookVersion: z.number().int().min(1).max(1_000).optional(),
  escalationRules: z.string().trim().max(4_000).optional(),
  keyMessages: z.string().trim().max(4_000).optional(),
  speechSpeed: z.enum(['0.8', '0.9', '1.0', '1.1', '1.2']).optional(),
  runtime: agentRuntimeSchema.optional(),
  // Comportamiento en llamada. Lo consume promptContext.renderBehaviorNotes;
  // los textos libres van capados porque entran enteros en el system prompt.
  behavior: z.object({
    formality: z.enum(['auto', 'tu', 'usted']).optional(),
    verbosity: z.enum(['brief', 'balanced', 'detailed']).optional(),
    openingLine: z.string().trim().max(300).optional(),
    structure: z.string().trim().max(2_000).optional(),
    doNotSay: z.string().trim().max(1_000).optional(),
  }).optional(),
}).catchall(z.unknown())

const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  agentType: z.enum(AGENT_TYPES).optional(),
  callDirection: z.enum(CALL_DIRECTIONS).optional(),
  personality: z.string().trim().max(2_000).optional(),
  voiceId: z.string().trim().max(200).optional(),
  systemPrompt: z.string().trim().max(12_000).optional(),
  language: z.string().trim().max(32).optional(),
  settings: agentSettingsSchema.optional(),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'El número debe usar formato internacional, por ejemplo +34910000000').optional(),
  monthlyMinuteLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
}).strict()

const updateAgentSchema = createAgentSchema.partial().extend({
  isActive: z.boolean().optional(),
  settings: agentSettingsSchema.optional(),
  lifecycleStatus: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  phoneNumber: z.union([z.string().trim().regex(/^\+[1-9]\d{7,14}$/), z.literal(''), z.null()]).optional(),
}).strict()

export async function strategies(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(publicCallStrategies())
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const agents = await agentsService.listAgents(orgId)
  return reply.send(agents)
}

const scheduleCallSchema = z.object({
  leadId: z.string().trim().min(1).max(160),
  scheduledAt: z.string().datetime(),
}).strict()

export async function scheduleOptions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const { id } = request.params as { id: string }
  const agent = await prisma.agent.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!agent) return reply.status(404).send({ error: 'Not found' })
  const leads = await prisma.lead.findMany({
    where: { orgId, phone: { not: null }, campaign: { agentId: id, status: 'active' } },
    select: { id: true, name: true, company: true, phone: true },
    orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })
  return reply.send(leads)
}

export async function scheduleCall(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, scheduleCallSchema, request.body)
  if (!body) return
  const scheduledAt = new Date(body.scheduledAt)
  if (scheduledAt.getTime() <= Date.now()) return reply.status(400).send({ error: 'La hora debe estar en el futuro.' })
  if (scheduledAt.getTime() > Date.now() + 31 * 24 * 60 * 60 * 1000) return reply.status(400).send({ error: 'Solo puedes programar llamadas dentro de los próximos 31 días.' })
  const lead = await prisma.lead.findFirst({
    where: { id: body.leadId, orgId, phone: { not: null }, campaign: { agentId: request.params.id, status: 'active' } },
    select: { id: true, name: true, company: true, phone: true },
  })
  if (!lead) return reply.status(422).send({ error: 'El contacto no tiene una campaña activa asignada a este agente o no tiene teléfono.' })
  const delayMs = scheduledAt.getTime() - Date.now()
  const dedupeKey = `scheduled:${orgId}:${request.params.id}:${lead.id}:${scheduledAt.toISOString()}`
  const queued = await enqueueLeadCall(orgId, lead.id, dedupeKey, delayMs)
  if (!queued) return reply.status(503).send({ error: 'El servicio de llamadas no está disponible.' })
  return reply.status(201).send({ queued: true, scheduledAt: scheduledAt.toISOString(), lead })
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      role: string
      agentType?: string
      callDirection?: string
      personality?: string
      voiceId?: string
      systemPrompt?: string
      language?: string
      settings?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createAgentSchema, request.body)
  if (!data) return
  const agent = await agentsService.createAgent(orgId, data, userId)
  return reply.status(201).send(agent)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const agent = await agentsService.getAgent(orgId, request.params.id)
  if (!agent) return reply.status(404).send({ error: 'Not found' })
  return reply.send(agent)
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
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
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, updateAgentSchema, request.body)
  if (!data) return
  await agentsService.updateAgent(orgId, request.params.id, { ...data, phoneNumber: data.phoneNumber || null }, userId)
  return reply.send({ ok: true })
}

export async function workspace(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await agentsService.getAgentWorkspace(orgId, request.params.id)
  return result ? reply.send(result) : reply.status(404).send({ error: 'Not found' })
}

export async function publish(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const result = await agentsService.publishAgent(orgId, request.params.id, userId)
  if (result.status === 'not_found') return reply.status(404).send({ error: 'Not found' })
  if (result.status === 'blocked') return reply.status(422).send({ error: 'El agente aún no se puede publicar.', blockers: result.blockers })
  return reply.send(result)
}

export async function campaigns(request: FastifyRequest<{ Params: { id: string }; Body: { campaignIds?: string[] } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, z.object({ campaignIds: z.array(z.string().min(1)).max(500) }), request.body)
  if (!body) return
  return await agentsService.assignCampaigns(orgId, request.params.id, body.campaignIds) ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' })
}

export async function evaluate(request: FastifyRequest<{ Params: { id: string; callId: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const call = await import('../lib/prisma').then(({ prisma }) => prisma.call.findFirst({ where: { id: request.params.callId, agentId: request.params.id, orgId }, select: { id: true, status: true } }))
  if (!call) return reply.status(404).send({ error: 'Llamada no encontrada' })
  if (call.status !== 'completed') return reply.status(422).send({ error: 'La prueba debe ser una llamada completada.' })
  return reply.send(await evaluateVoiceCall(orgId, call.id))
}

export async function restore(request: FastifyRequest<{ Params: { id: string; versionId: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  return await agentsService.restoreAgentVersion(orgId, request.params.id, request.params.versionId, userId) ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Versión no encontrada' })
}

export async function revokeConsent(request: FastifyRequest<{ Params: { id: string; consentId: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return await agentsService.revokeAgentConsent(orgId, request.params.id, request.params.consentId) ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Consentimiento no encontrado' })
}

export async function createConsent(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, z.object({
    subjectName: z.string().trim().min(1).max(200),
    subjectContact: z.string().trim().max(200).optional(),
    evidenceAssetId: z.string().trim().max(200).optional(),
    expiresAt: z.string().datetime().optional(),
    confirmed: z.literal(true),
  }).strict(), request.body)
  if (!body) return
  const consent = await agentsService.createAgentConsent(orgId, request.params.id, userId, { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined })
  return consent ? reply.status(201).send(consent) : reply.status(422).send({ error: 'Selecciona y guarda una voz antes de registrar su autorización.' })
}

export async function testNumbers(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await voiceTestCallService.listVoiceTestNumbers(orgId))
}

const TEST_NUMBER_ERRORS: Record<string, string> = {
  invalid_phone: 'El teléfono no es válido. Escríbelo en formato internacional, por ejemplo +34600000000.',
  invalid_attestation: 'Escribe la declaración de a quién pertenece el número y por qué puedes llamarlo.',
  phone_belongs_to_lead: 'Ese teléfono ya es de un contacto del CRM. Las pruebas solo se hacen contra un número propio.',
  optout: 'Ese teléfono está en la lista de bajas.',
  limit_reached: `Solo puede haber ${voiceTestCallService.MAX_TEST_NUMBERS} números de prueba activos.`,
  already_registered: 'Ese número ya está dado de alta.',
}

export async function createTestNumber(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, z.object({
    phone: z.string().trim().min(6).max(30),
    label: z.string().trim().max(120).default(''),
    attestation: z.string().trim().min(20).max(500),
    confirmed: z.literal(true),
  }).strict(), request.body)
  if (!body) return
  const result = await voiceTestCallService.registerVoiceTestNumber(orgId, userId, body)
  if (result.status !== 'ok') return reply.status(422).send({ error: TEST_NUMBER_ERRORS[result.status] ?? 'No se pudo dar de alta el número.' })
  return reply.status(201).send(result.number)
}

export async function revokeTestNumber(request: FastifyRequest<{ Params: { id: string; numberId: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  return await voiceTestCallService.revokeVoiceTestNumber(orgId, request.params.numberId, userId)
    ? reply.send({ ok: true })
    : reply.status(404).send({ error: 'Número de prueba no encontrado' })
}

export async function testCall(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, z.object({ testNumberId: z.string().trim().min(1).max(100) }).strict(), request.body)
  if (!body) return
  const result = await voiceTestCallService.startVoiceTestCall(orgId, request.params.id, body.testNumberId, userId)
  if (result.status === 'blocked') return reply.status(422).send({ error: result.message, reason: result.reason })
  if (result.status === 'failed') return reply.status(502).send({ error: 'La pasarela telefónica rechazó la llamada de prueba.', reason: result.message })
  return reply.send(result)
}

export async function clone(request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, z.object({ name: z.string().trim().max(120).optional(), voice: z.boolean().default(true), documents: z.boolean().default(true), strategy: z.boolean().default(true), limits: z.boolean().default(true), playbook: z.boolean().default(true) }), request.body)
  if (!body) return
  const { name, ...options } = body
  const created = await agentsService.cloneAgent(orgId, request.params.id, userId, options, name)
  return created ? reply.status(201).send(created) : reply.status(404).send({ error: 'Not found' })
}

export async function archive(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  return reply.send(await agentsService.archiveAgent(orgId, request.params.id, userId))
}

export async function permanentlyDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return await agentsService.permanentlyDeleteAgent(orgId, request.params.id) ? reply.send({ ok: true }) : reply.status(409).send({ error: 'Solo se puede eliminar un agente archivado sin llamadas ni campañas.' })
}

export async function deactivate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await agentsService.deactivateAgent(orgId, request.params.id)
  return reply.send({ ok: true })
}

export async function stats(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await agentsService.getAgentStats(orgId, request.params.id)
  return reply.send(result)
}

export async function timeseries(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { days?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = Number.parseInt(request.query.days ?? '30', 10)
  const days = Number.isFinite(parsed) ? Math.min(90, Math.max(7, parsed)) : 30
  const result = await agentsService.getAgentTimeseries(orgId, request.params.id, days)
  return reply.send(result)
}

export async function strategyPerformance(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { days?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = Number.parseInt(request.query.days ?? '30', 10)
  const days = Number.isFinite(parsed) ? Math.min(90, Math.max(7, parsed)) : 30
  const result = await agentsService.getAgentStrategyPerformance(orgId, request.params.id, days)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}
