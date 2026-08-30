import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ApprovalPolicyError } from '../access-control'
import * as flows from '../services/flows.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const flowRunBodySchema = z.object({
  variables: z.record(z.unknown()).optional(),
  budgetCents: z.number().int().nonnegative().optional(),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
}).strict()

export function parseFlowRunRequest(body: unknown, rawHeader: unknown) {
  const parsed = flowRunBodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw new flows.FlowError('Configuración de ejecución inválida', 'FLOW_RUN_CONFIG_INVALID', 400, parsed.error.flatten())
  }
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const header = headerValue === undefined
    ? undefined
    : z.string().trim().min(8).max(180).safeParse(headerValue)
  if (header && !header.success) {
    throw new flows.FlowError('Idempotency-Key no válida', 'FLOW_IDEMPOTENCY_KEY_INVALID', 400)
  }
  if (parsed.data.idempotencyKey && header?.success && parsed.data.idempotencyKey !== header.data) {
    throw new flows.FlowError('La clave del body y la cabecera no coinciden', 'FLOW_IDEMPOTENCY_KEY_CONFLICT', 409)
  }
  return {
    ...parsed.data,
    idempotencyKey: parsed.data.idempotencyKey ?? (header?.success ? header.data : undefined),
  }
}

function sendFlowError(reply: FastifyReply, error: unknown) {
  if (error instanceof flows.FlowError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code, details: error.details })
  }
  if (error instanceof ApprovalPolicyError) {
    return reply.status(403).send({ error: error.message, code: error.code })
  }
  throw error
}

/** Lista de recetas: propias de la organización + plantillas de sistema. */
export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await flows.listFlows(orgId))
}

export async function get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await flows.getFlow(orgId, request.params.id))
  } catch (error) {
    return sendFlowError(reply, error)
  }
}

/** Crear y publicar en un paso (v1: recetas, no borradores editables). */
export async function create(
  request: FastifyRequest<{ Body: { slug?: string; name?: string; description?: string; graph?: unknown } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = request.body ?? {}
  if (!body.slug || !body.name || body.graph === undefined) {
    return reply.status(400).send({ error: 'slug, name y graph son obligatorios', code: 'FLOW_BODY_INVALID' })
  }
  try {
    const result = await flows.publishFlowVersion({
      orgId,
      slug: body.slug,
      name: body.name,
      description: body.description,
      graph: body.graph,
      createdById: userId,
    })
    return reply.status(201).send(await flows.getFlow(orgId, result.flow.id))
  } catch (error) {
    return sendFlowError(reply, error)
  }
}

export async function run(
  request: FastifyRequest<{ Params: { id: string }; Body: { variables?: Record<string, unknown>; budgetCents?: number; dryRun?: boolean; idempotencyKey?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const body = parseFlowRunRequest(request.body, request.headers['idempotency-key'])
    const flowRun = await flows.startFlowRun({
      orgId,
      flowId: request.params.id,
      variables: body.variables,
      budgetCents: body.budgetCents,
      dryRun: body.dryRun,
      createdById: userId,
      idempotencyKey: body.idempotencyKey,
    })
    return reply.status(201).send(flowRun)
  } catch (error) {
    return sendFlowError(reply, error)
  }
}

export async function listRuns(
  request: FastifyRequest<{ Querystring: { flowId?: string; limit?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const limit = request.query.limit ? Number(request.query.limit) : undefined
  return reply.send(await flows.listFlowRuns(orgId, {
    flowId: request.query.flowId,
    limit: Number.isFinite(limit) ? limit : undefined,
  }))
}

/** Timeline completo de la ejecución: run + pasos en el orden del grafo. */
export async function getRun(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await flows.getFlowRun(orgId, request.params.id))
  } catch (error) {
    return sendFlowError(reply, error)
  }
}

/**
 * Decisión humana sobre un paso 'awaiting_approval'. La separación de
 * funciones (permiso de aprobación + no autoaprobación) se aplica en el
 * servicio contra approvalPolicy con la identidad del solicitante persistida.
 */
export async function approve(
  request: FastifyRequest<{ Params: { id: string }; Body: { nodeKey?: string; approve?: boolean; comment?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = request.body ?? {}
  if (!body.nodeKey || typeof body.approve !== 'boolean') {
    return reply.status(400).send({ error: 'nodeKey y approve son obligatorios', code: 'FLOW_APPROVAL_BODY_INVALID' })
  }
  try {
    return reply.send(await flows.resolveApproval({
      orgId,
      flowRunId: request.params.id,
      nodeKey: body.nodeKey,
      approvedById: userId,
      approve: body.approve,
      comment: body.comment,
    }))
  } catch (error) {
    return sendFlowError(reply, error)
  }
}

export async function cancel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await flows.cancelFlowRun(orgId, request.params.id))
  } catch (error) {
    return sendFlowError(reply, error)
  }
}
