import { FastifyRequest, FastifyReply } from 'fastify'
import * as agentsService from '../services/agents.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

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
      personality?: string
      voiceId?: string
      systemPrompt?: string
      language?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const agent = await agentsService.createAgent(orgId, request.body)
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
  await agentsService.updateAgent(orgId, request.params.id, request.body)
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
