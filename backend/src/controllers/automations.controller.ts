import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as automationsService from '../services/automations.service'
import { AUTOMATION_ACTION_TYPES } from '../services/automations.service'
import { parseRequest } from '../lib/validation'
import { writeAuditLog } from '../lib/audit'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const actionSchema = z.object({
  type: z.enum(AUTOMATION_ACTION_TYPES),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

const triggerSchema = z.object({
  event: z.string().trim().min(1).max(80).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
}).strict()
  .refine((t) => Boolean(t.event || t.type), { message: 'trigger.event es requerido' })

const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: triggerSchema,
  actions: z.array(actionSchema).max(20),
  isActive: z.boolean().optional(),
}).strict()

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

/** GET /health — estado del motor: outbox, runs 24h y scheduler (P0-10). */
export async function health(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await automationsService.getEngineHealth(orgId))
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
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createAutomationSchema, request.body)
  if (!data) return
  try {
    const automation = await automationsService.createAutomation(orgId, data)
    await writeAuditLog({
      orgId,
      actorUserId: userId,
      action: 'automation.create',
      entityType: 'Automation',
      entityId: automation.id,
      after: automation,
    })
    return reply.status(201).send(automation)
  } catch (err) {
    return reply.status(400).send({ error: (err as Error).message })
  }
}

export async function toggle(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const before = await automationsService.getAutomation(orgId, request.params.id)
  if (!before) return reply.status(404).send({ error: 'Automation not found' })
  try {
    const after = await automationsService.toggleAutomation(orgId, request.params.id)
    await writeAuditLog({
      orgId,
      actorUserId: userId,
      action: after.isActive ? 'automation.activate' : 'automation.pause',
      entityType: 'Automation',
      entityId: after.id,
      before: { isActive: before.isActive },
      after: { isActive: after.isActive },
    })
    return reply.send(after)
  } catch (err) {
    return reply.status(404).send({ error: (err as Error).message })
  }
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const before = await automationsService.getAutomation(orgId, request.params.id)
  if (!before) return reply.status(404).send({ error: 'Automation not found' })
  try {
    await automationsService.deleteAutomation(orgId, request.params.id)
    await writeAuditLog({
      orgId,
      actorUserId: userId,
      action: 'automation.delete',
      entityType: 'Automation',
      entityId: before.id,
      before,
    })
    return reply.send({ ok: true })
  } catch (err) {
    return reply.status(404).send({ error: (err as Error).message })
  }
}
