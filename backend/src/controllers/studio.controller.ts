import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import {
  BIBLE_KINDS,
  StudioServiceError,
  addBibleEntry,
  approveConcept,
  createProduction,
  estimateProduction,
  generateConcepts,
  generateScript,
  generateShotList,
  generateStoryboard,
  getProduction,
  listProductions,
  syncStoryboards,
  generateTakes,
  syncTakes,
  listTakeTable,
  selectTake,
  exportPost,
  exportProductionDocuments,
  upscaleTake,
  updateBibleEntry,
  updateProduction,
  archiveProduction,
  exportProductionMetadata,
  publishStudioMaster,
} from '../services/studio.service'
import {
  createStudioReviewLink,
  listStudioReviewComments,
  listStudioReviewLinks,
  moderateStudioReviewComment,
  revokeStudioReviewLink,
} from '../services/studioReview.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/**
 * Los errores del servicio (y del router/wallet aguas abajo) llevan statusCode
 * y mensaje seguro: se devuelven tal cual. Cualquier otra cosa es un 500 real
 * y se relanza para que el handler global de Fastify lo registre.
 */
function sendServiceError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof StudioServiceError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code })
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    const code = (error as { code?: unknown }).code
    return reply.status(statusCode).send({
      error: error instanceof Error ? error.message : 'Solicitud rechazada',
      ...(typeof code === 'string' ? { code } : {}),
    })
  }
  throw error
}

const briefSchema = z.object({
  objective: z.string().trim().min(1).max(2000),
  audience: z.string().trim().max(2000).default(''),
  channel: z.string().trim().min(1).max(80),
  durationS: z.number().int().min(2).max(180),
  cta: z.string().trim().max(300).optional(),
  references: z.array(z.string().trim().max(500)).max(20).optional(),
  constraints: z.string().trim().max(2000).optional(),
  rights: z.string().trim().max(2000).optional(),
}).strict()

const createProductionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: briefSchema,
  budgetCents: z.number().int().min(0).optional(),
  brandScope: z.string().trim().max(120).optional(),
}).strict()

export async function create(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createProductionSchema, request.body ?? {})
  if (!body) return
  const production = await createProduction({ orgId, createdById: userId, ...body })
  return reply.status(201).send(production)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await listProductions(orgId))
}

export async function get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const production = await getProduction({ orgId, productionId: request.params.id })
  if (!production) return reply.status(404).send({ error: 'Producción no encontrada' })
  return reply.send(production)
}

const updateProductionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  brief: briefSchema.partial().optional(),
  budgetCents: z.number().int().min(0).nullable().optional(),
  brandScope: z.string().trim().max(120).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Incluye al menos un cambio')

export async function update(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, updateProductionSchema, request.body ?? {})
  if (!body) return
  try { return reply.send(await updateProduction({ orgId, productionId: request.params.id, ...body })) }
  catch (error) { return sendServiceError(reply, error) }
}

export async function archive(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try { await archiveProduction({ orgId, productionId: request.params.id }); return reply.status(204).send() }
  catch (error) { return sendServiceError(reply, error) }
}

export async function metadataExport(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try { return reply.send(await exportProductionMetadata({ orgId, productionId: request.params.id })) }
  catch (error) { return sendServiceError(reply, error) }
}

export async function concepts(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await generateConcepts({ orgId, productionId: request.params.id }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function approve(
  request: FastifyRequest<{ Params: { id: string; conceptId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await approveConcept({
      orgId,
      productionId: request.params.id,
      conceptId: request.params.conceptId,
    }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function script(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await generateScript({ orgId, productionId: request.params.id }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function shotlist(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await generateShotList({ orgId, productionId: request.params.id }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const storyboardSchema = z.object({
  shotIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
}).strict()

export async function storyboard(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, storyboardSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.send(await generateStoryboard({
      orgId,
      productionId: request.params.id,
      shotIds: body.shotIds,
      createdById: userId,
    }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function storyboardSync(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await syncStoryboards({ orgId, productionId: request.params.id }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function estimate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await estimateProduction({ orgId, productionId: request.params.id }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const bibleCreateSchema = z.object({
  kind: z.enum(BIBLE_KINDS),
  name: z.string().trim().min(1).max(160),
  data: z.record(z.unknown()).default({}),
  refAssetIds: z.array(z.string().trim().min(1)).max(20).optional(),
  consentGrantId: z.string().trim().min(1).optional(),
}).strict()

export async function bibleCreate(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, bibleCreateSchema, request.body ?? {})
  if (!body) return
  try {
    const entry = await addBibleEntry({ orgId, productionId: request.params.id, ...body })
    return reply.status(201).send(entry)
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const bibleUpdateSchema = z.object({
  kind: z.enum(BIBLE_KINDS).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  data: z.record(z.unknown()).optional(),
  refAssetIds: z.array(z.string().trim().min(1)).max(20).optional(),
  // null explícito = retirar el consentimiento (y revalidar el resultado).
  consentGrantId: z.string().trim().min(1).nullable().optional(),
}).strict()

export async function bibleUpdate(
  request: FastifyRequest<{ Params: { id: string; entryId: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, bibleUpdateSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.send(await updateBibleEntry({
      orgId,
      productionId: request.params.id,
      entryId: request.params.entryId,
      ...body,
    }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const takeGenerateSchema = z.object({
  shotIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
  takesPerShot: z.number().int().min(1).max(4).default(1),
  quality: z.enum(['draft', 'final']).default('draft'),
  providerId: z.string().trim().min(1).max(80).optional(),
  // Confirmación explícita del usuario: el backend recalcula y no puede
  // superar este tope aunque la tarifa cambie entre estimate y generate.
  maxCostCents: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(180).optional(),
}).strict()

export async function takesGenerate(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, takeGenerateSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.status(202).send(await generateTakes({ orgId, productionId: request.params.id, createdById: userId, ...body }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

export async function takesSync(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try { return reply.send(await syncTakes({ orgId, productionId: request.params.id })) }
  catch (error) { return sendServiceError(reply, error) }
}

export async function takesTable(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try { return reply.send(await listTakeTable({ orgId, productionId: request.params.id })) }
  catch (error) { return sendServiceError(reply, error) }
}

export async function takeSelect(
  request: FastifyRequest<{ Params: { id: string; shotId: string; takeId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await selectTake({
      orgId,
      productionId: request.params.id,
      shotId: request.params.shotId,
      takeId: request.params.takeId,
    }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const takeUpscaleSchema = z.object({
  resolution: z.enum(['720p', '1k', '2k', '4k']).default('2k'),
  maxCostCents: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(180).optional(),
}).strict()

export async function takeUpscale(
  request: FastifyRequest<{ Params: { id: string; takeId: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, takeUpscaleSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.status(202).send(await upscaleTake({
      orgId,
      productionId: request.params.id,
      takeId: request.params.takeId,
      createdById: userId,
      ...body,
    }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const postExportSchema = z.object({
  subtitleAssetId: z.string().trim().min(1).optional(),
  audioAssetId: z.string().trim().min(1).optional(),
  publish: z.boolean().default(false),
  preset: z.enum(['source', 'vertical', 'square', 'landscape']).default('vertical'),
  maxCostCents: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(180).optional(),
}).strict()

export async function postExport(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, postExportSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.status(202).send(await exportPost({ orgId, productionId: request.params.id, createdById: userId, ...body }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const documentExportSchema = z.object({ publish: z.boolean().default(false) }).strict()

export async function documentsExport(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, documentExportSchema, request.body ?? {})
  if (!body) return
  try {
    return reply.send(await exportProductionDocuments({ orgId, productionId: request.params.id, createdById: userId, publish: body.publish }))
  } catch (error) {
    return sendServiceError(reply, error)
  }
}

const metricoolPublishSchema = z.object({
  assetId: z.string().trim().min(1).max(128),
  campaignId: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(5_000),
  platforms: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  cta: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().trim().max(80).optional(),
}).strict()

export async function metricoolPublish(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, metricoolPublishSchema, request.body ?? {})
  if (!body) return
  try { return reply.status(201).send(await publishStudioMaster({ orgId, productionId: request.params.id, ...body })) }
  catch (error) { return sendServiceError(reply, error) }
}

const reviewLinkSchema = z.object({
  assetId: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(120).optional(),
  days: z.number().int().min(1).max(180).default(30),
}).strict()

export async function reviewLinkCreate(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, reviewLinkSchema, request.body ?? {})
  if (!body) return
  try { return reply.status(201).send(await createStudioReviewLink({ orgId, productionId: request.params.id, createdById: userId, ...body })) }
  catch (error) { return sendServiceError(reply, error) }
}

export async function reviewLinksList(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await listStudioReviewLinks(orgId, request.params.id))
}

export async function reviewCommentsList(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await listStudioReviewComments(orgId, request.params.id))
}

export async function reviewLinkRevoke(request: FastifyRequest<{ Params: { id: string; linkId: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try { await revokeStudioReviewLink(orgId, request.params.id, request.params.linkId); return reply.status(204).send() }
  catch (error) { return sendServiceError(reply, error) }
}

const moderateCommentSchema = z.object({ status: z.enum(['open', 'resolved', 'hidden']) }).strict()

export async function reviewCommentModerate(request: FastifyRequest<{ Params: { id: string; commentId: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, moderateCommentSchema, request.body ?? {})
  if (!body) return
  try { return reply.send(await moderateStudioReviewComment({ orgId, productionId: request.params.id, commentId: request.params.commentId, actorUserId: userId, status: body.status })) }
  catch (error) { return sendServiceError(reply, error) }
}
