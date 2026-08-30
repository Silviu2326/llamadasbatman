import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as agentsService from '../services/agents.service'
import { parseRequest } from '../lib/validation'
import { CALL_STRATEGY_IDS, publicCallStrategies } from '../voice/callStrategies'

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
  agentType: z.enum(AGENT_TYPES).optional(),
  callDirection: z.enum(CALL_DIRECTIONS).optional(),
  personality: z.string().trim().max(2_000).optional(),
  voiceId: z.string().trim().max(200).optional(),
  systemPrompt: z.string().trim().max(12_000).optional(),
  language: z.string().trim().max(32).optional(),
  settings: agentSettingsSchema.optional(),
}).strict()

const updateAgentSchema = createAgentSchema.partial().extend({
  isActive: z.boolean().optional(),
  settings: agentSettingsSchema.optional(),
}).strict()

export async function strategies(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(publicCallStrategies())
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const agents = await agentsService.listAgents(orgId)
  return reply.send(agents)
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
  const { orgId } = request.user as JWTUser
  const data = parseRequest(reply, createAgentSchema, request.body)
  if (!data) return
  const agent = await agentsService.createAgent(orgId, data)
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
  const { orgId } = request.user as JWTUser
  const data = parseRequest(reply, updateAgentSchema, request.body)
  if (!data) return
  await agentsService.updateAgent(orgId, request.params.id, data)
  return reply.send({ ok: true })
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
