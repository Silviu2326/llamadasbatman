import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as knowledgeService from '../services/knowledge.service'
import { KnowledgeError, KNOWLEDGE_TYPES } from '../services/knowledge.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const fileSchema = z.object({
  name: z.string().trim().min(1).max(255).regex(/\.[A-Za-z0-9]{1,8}$/, 'El nombre del archivo necesita extensión'),
  // 10 MB en base64 (+ margen). El tamaño real se comprueba tras decodificar.
  contentBase64: z.string().min(1).max(14_400_000),
}).strict()

export const createKnowledgeSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  content: z.string().max(120_000).optional(),
  sourceUrl: z.string().trim().max(2_048).optional(),
  fileUrl: z.string().max(14_400_000).optional(),
  file: fileSchema.optional(),
}).strict()

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  content: z.string().max(120_000).optional(),
  fileUrl: z.string().trim().url().max(2_048).optional(),
  isActive: z.boolean().optional(),
}).strict()

const agentLinksSchema = z.object({
  agentId: z.string().trim().min(1).max(128),
  /** null = usar todos los documentos de la organización. */
  knowledgeIds: z.array(z.string().trim().min(1).max(128)).max(500).nullable(),
}).strict()

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof KnowledgeError) return reply.status(error.status).send({ error: error.message, code: error.code })
  throw error
}

function validationError(reply: FastifyReply, issue: z.ZodError) {
  return reply.status(400).send({ error: 'Datos no válidos', code: 'VALIDATION_ERROR', details: issue.flatten() })
}

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

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = createKnowledgeSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const item = await knowledgeService.createKnowledgeBase(orgId, parsed.data)
    return reply.status(201).send(item)
  } catch (error) {
    return sendError(reply, error)
  }
}

/** Subida de PDF/DOCX/TXT/MD/CSV/JSON en base64 con extracción de texto en servidor. */
export async function upload(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = createKnowledgeSchema.required({ file: true }).safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const item = await knowledgeService.createKnowledgeBase(orgId, { ...parsed.data, type: parsed.data.type ?? 'document' })
    return reply.status(201).send(item)
  } catch (error) {
    return sendError(reply, error)
  }
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
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = updateSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    await knowledgeService.updateKnowledgeBase(orgId, request.params.id, parsed.data)
  } catch (error) {
    return sendError(reply, error)
  }
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

function agentIdFromQuery(request: FastifyRequest): string | null {
  const raw = (request.query as Record<string, unknown> | undefined)?.agentId
  return typeof raw === 'string' && raw.trim() && raw.length <= 128 ? raw.trim() : null
}

/** GET /api/knowledge/agent-links?agentId= — documentos de la org y cuáles usa el agente. */
export async function agentLinks(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const agentId = agentIdFromQuery(request)
  if (!agentId) return reply.status(400).send({ error: 'Falta agentId', code: 'VALIDATION_ERROR' })
  try {
    return reply.send(await knowledgeService.getAgentKnowledgeLinks(orgId, agentId))
  } catch (error) {
    return sendError(reply, error)
  }
}

/** PUT /api/knowledge/agent-links — guarda Agent.settings.knowledgeIds. */
export async function setAgentLinks(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = agentLinksSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    return reply.send(await knowledgeService.setAgentKnowledgeIds(orgId, parsed.data.agentId, parsed.data.knowledgeIds))
  } catch (error) {
    return sendError(reply, error)
  }
}

/** GET /api/knowledge/prompt-preview?agentId=&leadId= — el prompt real y sus fuentes. */
export async function promptPreview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const agentId = agentIdFromQuery(request)
  if (!agentId) return reply.status(400).send({ error: 'Falta agentId', code: 'VALIDATION_ERROR' })
  const query = request.query as Record<string, unknown>
  const leadId = typeof query.leadId === 'string' && query.leadId.trim() ? query.leadId.trim().slice(0, 128) : null
  const lastUserTurn = typeof query.lastUserTurn === 'string' ? query.lastUserTurn.slice(0, 1_000) : null
  try {
    return reply.send(await knowledgeService.agentPromptPreview(orgId, agentId, { leadId, lastUserTurn }))
  } catch (error) {
    return sendError(reply, error)
  }
}
