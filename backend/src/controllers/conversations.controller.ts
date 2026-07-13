import { FastifyReply, FastifyRequest } from 'fastify'
import * as conversations from '../services/conversations.service'
import { suggestConversationReply } from '../services/conversationAi.service'

type JWTUser = { userId: string; orgId: string }

export async function list(request: FastifyRequest<{ Querystring: { channel?: string; status?: string; search?: string; assignedUserId?: string; limit?: string; offset?: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await conversations.listConversations(orgId, {
    ...request.query,
    limit: request.query.limit ? Number(request.query.limit) : undefined,
    offset: request.query.offset ? Number(request.query.offset) : undefined,
  }))
}

export async function get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await conversations.getConversation(orgId, request.params.id)
  return result ? reply.send(result) : reply.status(404).send({ error: 'Conversación no encontrada' })
}

export async function sendMessage(request: FastifyRequest<{ Params: { id: string }; Body: { channel: string; body?: string; templateId?: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  if (!request.body?.channel) return reply.status(400).send({ error: 'channel es requerido' })
  try {
    const result = await conversations.sendConversationMessage(orgId, userId, request.params.id, request.body)
    return result ? reply.status(201).send(result) : reply.status(404).send({ error: 'Conversación no encontrada' })
  } catch (error) {
    return reply.status(409).send({ error: (error as Error).message })
  }
}

export async function update(request: FastifyRequest<{ Params: { id: string }; Body: { status?: string; assignedUserId?: string | null; priority?: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await conversations.updateConversation(orgId, request.params.id, request.body ?? {})
  return result ? reply.send(result) : reply.status(404).send({ error: 'Conversación no encontrada' })
}

export async function takeover(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const result = await conversations.takeoverConversation(orgId, request.params.id, userId)
  return result ? reply.send(result) : reply.status(404).send({ error: 'Conversación no encontrada' })
}

export async function templates(request: FastifyRequest<{ Querystring: { channel?: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await conversations.listTemplates(orgId, request.query.channel))
}

export async function suggest(request: FastifyRequest<{ Params: { id: string }; Body: { tone?: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await suggestConversationReply(orgId, request.params.id, request.body?.tone)
    return result ? reply.send(result) : reply.status(404).send({ error: 'Conversación no encontrada' })
  } catch (error) {
    return reply.status(503).send({ error: (error as Error).message })
  }
}

export async function acceptNextAction(request: FastifyRequest<{ Params: { conversationId: string; id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const result = await conversations.acceptNextBestAction(orgId, userId, request.params.conversationId, request.params.id)
    return reply.send(result)
  } catch (error) {
    if (error instanceof conversations.NextBestActionNotFoundError) {
      return reply.status(404).send({ error: 'Recomendación no encontrada' })
    }
    if (error instanceof conversations.NextBestActionStateError) {
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }
}

export async function dismissNextAction(request: FastifyRequest<{ Params: { conversationId: string; id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await conversations.dismissNextBestAction(orgId, request.params.id, request.params.conversationId)
    return reply.send(result)
  } catch (error) {
    if (error instanceof conversations.NextBestActionNotFoundError) {
      return reply.status(404).send({ error: 'Recomendación no encontrada' })
    }
    if (error instanceof conversations.NextBestActionStateError) {
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }
}
