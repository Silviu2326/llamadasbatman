import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as tasksService from '../services/tasks.service'
import { OwnershipError, TaskNotFoundError } from '../services/tasks.service'
import type { TaskStatus } from '@prisma/client'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string; workspaceScope?: 'own' | 'team' | 'org' }

const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

const isoDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'debe ser una fecha ISO válida' })

const createTaskSchema = z
  .object({
    type: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1, 'title es requerido').max(200),
    description: z.string().trim().max(2000).optional(),
    ownerId: z.string().trim().min(1).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: isoDateSchema.optional(),
    reminderAt: isoDateSchema.optional(),
    leadId: z.string().trim().min(1).optional(),
    opportunityId: z.string().trim().min(1).optional(),
    meetingId: z.string().trim().min(1).optional(),
    conversationId: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).max(100).optional(),
    sourceId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: isoDateSchema.optional(),
    reminderAt: isoDateSchema.optional(),
    ownerId: z.string().trim().min(1).optional(),
  })
  .strict()

export async function list(
  request: FastifyRequest<{
    Querystring: {
      ownerId?: string
      leadId?: string
      opportunityId?: string
      meetingId?: string
      status?: string
      dueAfter?: string
      dueBefore?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const querySchema = z.object({
    ownerId: z.string().optional(), leadId: z.string().optional(), opportunityId: z.string().optional(), meetingId: z.string().optional(),
    status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
    dueAfter: isoDateSchema.optional(), dueBefore: isoDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  const q = parseRequest(reply, querySchema, request.query)
  if (!q) return
  const result = await tasksService.listTasks(orgId, { userId, role, workspaceScope }, {
    ownerId: q.ownerId,
    leadId: q.leadId,
    opportunityId: q.opportunityId,
    meetingId: q.meetingId,
    status: q.status as TaskStatus | undefined,
    dueAfter: q.dueAfter,
    dueBefore: q.dueBefore,
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  })
  return reply.send(result)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const task = await tasksService.getTask(orgId, { userId, role, workspaceScope }, request.params.id)
  if (!task) return reply.status(404).send({ error: 'Not found' })
  return reply.send(task)
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, createTaskSchema, request.body)
  if (!data) return

  try {
    const task = await tasksService.createTask(orgId, { userId, role, workspaceScope }, data)
    return reply.status(201).send(task)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const data = parseRequest(reply, updateTaskSchema, request.body)
  if (!data) return

  try {
    const task = await tasksService.updateTask(orgId, { userId, role, workspaceScope }, request.params.id, data)
    return reply.send(task)
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function complete(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  try {
    const task = await tasksService.completeTask(orgId, { userId, role, workspaceScope }, request.params.id)
    return reply.send(task)
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

export async function cancel(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  try {
    const task = await tasksService.cancelTask(orgId, { userId, role, workspaceScope }, request.params.id)
    return reply.send(task)
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}
