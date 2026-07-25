import { FastifyRequest, FastifyReply } from 'fastify'
import * as knowledgeService from '../services/knowledge.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const item = await knowledgeService.getKnowledgeBase(orgId, request.params.id, userId)
  if (!item) return reply.status(404).send({ error: 'Not found' })
  return reply.send(item)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await knowledgeService.listKnowledgeBase(orgId))
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      type?: string
      content?: string
      fileUrl?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const item = await knowledgeService.createKnowledgeBase(orgId, request.body)
  return reply.status(201).send(item)
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await knowledgeService.removeKnowledgeBase(orgId, request.params.id)
  return reply.send({ ok: true })
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      type?: string
      content?: string
      fileUrl?: string
      isActive?: boolean
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await knowledgeService.updateKnowledgeBase(orgId, request.params.id, request.body)
  const item = await knowledgeService.getKnowledgeBase(orgId, request.params.id)
  return reply.send(item)
}

export async function favorite(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const favorited = await knowledgeService.toggleFavorite(orgId, userId, request.params.id)
  return reply.send({ favorited })
}

export async function reaction(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const helpful = await knowledgeService.toggleHelpful(orgId, userId, request.params.id)
  return reply.send({ helpful })
}
