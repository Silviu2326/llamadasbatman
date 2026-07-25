import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as agentsService from '../services/agents.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const AGENT_TYPES = ['sales', 'receptionist', 'qualification', 'appointment', 'support', 'collections', 'handoff'] as const
const CALL_DIRECTIONS = ['inbound', 'outbound', 'both'] as const

const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  agentType: z.enum(AGENT_TYPES).optional(),
  callDirection: z.enum(CALL_DIRECTIONS).optional(),
  personality: z.string().trim().max(2_000).optional(),
  voiceId: z.string().trim().max(200).optional(),
  systemPrompt: z.string().trim().max(12_000).optional(),
  language: z.string().trim().max(32).optional(),
}).strict()

const updateAgentSchema = createAgentSchema.partial().extend({
  isActive: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
}).strict()

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
