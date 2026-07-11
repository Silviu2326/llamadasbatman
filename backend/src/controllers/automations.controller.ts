import { FastifyRequest, FastifyReply } from 'fastify'
import * as automationsService from '../services/automations.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const automation = await automationsService.getAutomation(orgId, request.params.id)
  if (!automation) return reply.status(404).send({ error: 'Not found' })
  return reply.send(automation)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await automationsService.listAutomations(orgId))
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      trigger: Record<string, unknown>
      actions: unknown[]
      isActive?: boolean
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const automation = await automationsService.createAutomation(orgId, request.body)
  return reply.status(201).send(automation)
}

export async function toggle(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await automationsService.toggleAutomation(orgId, request.params.id)
    return reply.send(result)
  } catch (err) {
    return reply.status(404).send({ error: (err as Error).message })
  }
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    await automationsService.deleteAutomation(orgId, request.params.id)
    return reply.send({ ok: true })
  } catch (err) {
    return reply.status(404).send({ error: (err as Error).message })
  }
}
