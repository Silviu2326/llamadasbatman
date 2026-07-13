import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as automationsService from '../services/automations.service'
import { AUTOMATION_ACTION_TYPES, AUTOMATION_RUN_STATUSES } from '../services/automations.service'
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
  description: z.string().max(500).optional(),
  trigger: triggerSchema,
  actions: z.array(actionSchema).max(20),
  isActive: z.boolean().optional(),
  isDraft: z.boolean().optional(),
}).strict()

const listRunsQuerySchema = z.object({
  status: z.enum(AUTOMATION_RUN_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

/** GET /:id/runs — historial de ejecuciones de una automatización (AU-104). */
export async function listRuns(
  request: FastifyRequest<{
    Params: { id: string }
    Querystring: { status?: string; page?: string; limit?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listRunsQuerySchema, request.query)
  if (!query) return
  const result = await automationsService.listRuns(orgId, request.params.id, query)
  if (!result) return reply.status(404).send({ error: 'Automation not found' })
  return reply.send(result)
}

/** GET /:id/runs/:runId — detalle de un run con sus pasos (AU-104). */
export async function getRunDetail(
  request: FastifyRequest<{ Params: { id: string; runId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const run = await automationsService.getRunDetail(orgId, request.params.id, request.params.runId)
  if (!run) return reply.status(404).send({ error: 'Run not found' })
  return reply.send(run)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      description?: string
      trigger: Record<string, unknown>
      actions: unknown[]
      isActive?: boolean
      isDraft?: boolean
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createAutomationSchema, request.body)
  if (!data) return
  try {
    const automation = await automationsService.createAutomation(orgId, { ...data, actorUserId: userId })
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
