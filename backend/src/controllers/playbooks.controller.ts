import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as playbooksService from '../services/playbooks.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export const playbookStepSchema = z.object({
  id: z.string().trim().max(64).optional(),
  title: z.string().trim().min(1).max(160),
  instruction: z.string().trim().max(2_000).optional(),
  goal: z.string().trim().max(400).optional(),
}).strict()

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20)

export const createPlaybookSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4_000).optional(),
  steps: z.array(playbookStepSchema).max(40).optional(),
  tags: tagsSchema.optional(),
}).strict()

export const updatePlaybookSchema = createPlaybookSchema.partial().extend({
  isActive: z.boolean().optional(),
}).strict()

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'Datos no válidos', code: 'VALIDATION_ERROR', details: error.flatten() })
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const playbook = await playbooksService.getPlaybook(orgId, request.params.id)
  if (!playbook) return reply.status(404).send({ error: 'Not found' })
  const agents = await playbooksService.agentsUsingPlaybook(orgId, playbook.id).catch(() => [])
  return reply.send({ ...playbook, agents })
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await playbooksService.listPlaybooks(orgId))
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = createPlaybookSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const playbook = await playbooksService.createPlaybook(orgId, parsed.data)
  return reply.status(201).send(playbook)
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = updatePlaybookSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const result = await playbooksService.updatePlaybook(orgId, request.params.id, parsed.data)
  if (!result.count) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ ok: true })
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await playbooksService.removePlaybook(orgId, request.params.id)
  if (!result.count) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ ok: true })
}
