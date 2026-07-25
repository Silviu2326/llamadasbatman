import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/accessControl.service'
import { listAccessibleWorkspaces } from '../services/workspaceAccess.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idParamsSchema = z.object({ userId: z.string().trim().min(1).max(128) }).strict()
const requestIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const jsonObjectSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 100_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El payload no puede superar 100 KB' })
  }
})
const requestQuerySchema = z.object({
  status: z.enum(service.ACCESS_REQUEST_STATUSES).optional(),
  type: z.enum(service.ACCESS_REQUEST_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
}).strict()
const createRequestSchema = z.object({
  type: z.enum(service.ACCESS_REQUEST_TYPES),
  targetUserId: z.string().trim().min(1).max(128).nullable().optional(),
  resourceType: z.string().trim().min(1).max(80).nullable().optional(),
  resourceId: z.string().trim().min(1).max(128).nullable().optional(),
  reason: z.string().trim().min(8).max(4_000),
  payload: jsonObjectSchema.nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.expiresAt && value.expiresAt <= new Date()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt debe estar en el futuro' })
  }
  if (value.expiresAt && value.expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt no puede superar 90 dias' })
  }
})
const assignmentSchema = z.object({
  role: z.enum(service.ASSIGNABLE_ROLES),
  approvalRequestId: z.string().trim().min(1).max(128).optional(),
}).strict()
const decisionSchema = z.object({
  comment: z.string().trim().min(2).max(4_000).optional(),
}).strict()

function actor(request: FastifyRequest): service.Actor {
  const user = request.user as JWTUser
  return { userId: user.userId, orgId: user.orgId, role: user.role, correlationId: request.correlationId }
}

async function respond(reply: FastifyReply, operation: () => Promise<unknown>) {
  try {
    return reply.send(await operation())
  } catch (error) {
    if (error instanceof service.AccessControlError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code })
    }
    throw error
  }
}

export async function getCatalog(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTUser
  return reply.send(service.getCatalog(user.role))
}

export async function listWorkspaces(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JWTUser
  return respond(reply, () => listAccessibleWorkspaces({
    userId: user.userId,
    email: user.email,
    orgId: user.orgId,
    role: user.role,
  }))
}

export async function listMembers(request: FastifyRequest, reply: FastifyReply) {
  return respond(reply, () => service.listMembers(actor(request)))
}

export async function listRequests(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, requestQuerySchema, request.query)
  if (!query) return
  return respond(reply, () => service.listRequests(actor(request), query))
}

export async function createRequest(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, createRequestSchema, request.body)
  if (!body) return
  return respond(reply, async () => {
    const created = await service.createRequest(actor(request), body)
    return { ok: true, request: created }
  })
}

export async function assignMemberRole(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, assignmentSchema, request.body)
  if (!params || !body) return
  return respond(reply, () => service.assignMemberRole(actor(request), params.userId, body.role, body.approvalRequestId))
}

async function decide(
  decision: 'approved' | 'rejected',
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = parseRequest(reply, requestIdParamsSchema, request.params)
  const body = parseRequest(reply, decisionSchema, request.body ?? {})
  if (!params || !body) return
  return respond(reply, async () => {
    const updated = await service.decideRequest(actor(request), params.id, decision, body.comment)
    if (decision === 'approved' && updated.type === 'role_elevation' && updated.targetUserId) {
      const payload = updated.payload && typeof updated.payload === 'object' && !Array.isArray(updated.payload)
        ? updated.payload as Record<string, unknown>
        : {}
      const requestedRole = typeof payload.requestedRole === 'string' ? payload.requestedRole : ''
      if (service.ASSIGNABLE_ROLES.includes(requestedRole as service.AssignableRole)) {
        const assignment = await service.assignMemberRole(
          actor(request),
          updated.targetUserId,
          requestedRole as service.AssignableRole,
          updated.id,
        )
        return { ok: true, request: { ...updated, status: 'consumed' }, member: assignment.member }
      }
    }
    return { ok: true, request: updated }
  })
}

export async function approveRequest(request: FastifyRequest, reply: FastifyReply) {
  return decide('approved', request, reply)
}

export async function rejectRequest(request: FastifyRequest, reply: FastifyReply) {
  return decide('rejected', request, reply)
}
