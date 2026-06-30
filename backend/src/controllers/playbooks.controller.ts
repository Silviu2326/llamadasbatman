import { FastifyRequest, FastifyReply } from 'fastify'
import * as playbooksService from '../services/playbooks.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const playbook = await playbooksService.getPlaybook(orgId, request.params.id)
  if (!playbook) return reply.status(404).send({ error: 'Not found' })
  return reply.send(playbook)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await playbooksService.listPlaybooks(orgId))
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      description?: string
      steps?: unknown
      tags?: string[]
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const playbook = await playbooksService.createPlaybook(orgId, request.body)
  return reply.status(201).send(playbook)
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      description?: string
      steps?: unknown
      tags?: string[]
      isActive?: boolean
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await playbooksService.updatePlaybook(orgId, request.params.id, request.body)
  return reply.send({ ok: true })
}
