import { FastifyReply, FastifyRequest } from 'fastify'
import * as studio from '../services/contentStudio.service'
import * as approval from '../services/contentApproval.service'
import { refreshOwnerVoice, getOwnerVoice } from '../services/ownerVoice.service'
import { brandKitSchema, getBrandKit, saveBrandKit } from '../services/brandKit.service'
import { createApprovalLink, listApprovalLinks, revokeApprovalLink } from '../services/contentApprovalLink.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/** Traduce los errores de negocio del Estudio a 409, no a 500. */
async function guard<T>(reply: FastifyReply, run: () => Promise<T>) {
  try {
    return reply.send(await run())
  } catch (error) {
    if (error instanceof studio.StudioError) return reply.status(409).send({ error: error.message })
    throw error
  }
}

export async function generate(
  request: FastifyRequest<{ Body: { opportunityId?: string; campaignId?: string; channels?: string[]; objective?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const opportunityId = request.body?.opportunityId
  if (!opportunityId) return reply.status(400).send({ error: 'opportunityId es obligatorio' })
  return guard(reply, () => studio.generatePieces(orgId, opportunityId, { ...request.body, createdById: userId }))
}

export async function pieces(
  request: FastifyRequest<{ Querystring: { opportunityId?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  return reply.send({ items: await studio.listPieces(orgId, request.query?.opportunityId) })
}

export async function queue(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await approval.listQueue(orgId))
}

export async function submit(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => approval.submitForApproval(orgId, request.params.id, { userId }))
}

export async function edit(
  request: FastifyRequest<{ Params: { id: string }; Body: { body?: unknown } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => approval.editPiece(orgId, request.params.id, request.body?.body, { userId }))
}

/** Historial y comentarios de una pieza (§3). */
export async function history(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return guard(reply, () => approval.pieceHistory(orgId, request.params.id))
}

export async function comment(
  request: FastifyRequest<{ Params: { id: string }; Body: { message?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => approval.commentPiece(orgId, request.params.id, request.body?.message ?? '', { userId }))
}

/**
 * Imagen de la pieza (§2). Recibe una URL ya pública —la que devuelven
 * `POST /api/metricool/media` al subir y `POST /api/metricool/ai/image` al
 * generar—, no el archivo: subir y decidir qué pieza la lleva son dos pasos, y
 * así reintentar uno no obliga a repetir el otro.
 */
export async function setImage(
  request: FastifyRequest<{ Params: { id: string }; Body: { imageUrl?: string | null } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, studio.pieceImageSchema, request.body)
  if (!body) return
  return guard(reply, () => studio.setPieceImage(orgId, request.params.id, body.imageUrl))
}

export async function approve(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => approval.approvePiece(orgId, { userId }, request.params.id))
}

export async function reject(
  request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string; comment?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => approval.rejectPiece(orgId, { userId }, request.params.id, request.body ?? {}))
}

export async function approveAll(
  request: FastifyRequest<{ Body: { pieceIds?: string[]; platforms?: string[] } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const pieceIds = request.body?.pieceIds
  if (!Array.isArray(pieceIds) || !pieceIds.length) return reply.status(400).send({ error: 'pieceIds es obligatorio' })
  return guard(reply, () => approval.approveAndDraft(orgId, { userId }, pieceIds, { platforms: request.body?.platforms }))
}

/**
 * Libro de marca (idea 7): los colores y el logo con los que se maquetan los
 * carruseles. Sin él la plantilla usa los colores neutros por defecto y lo dice.
 */
export async function brand(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ brand: await getBrandKit(orgId) })
}

export async function saveBrand(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, brandKitSchema, request.body)
  if (!body) return
  return reply.send({ brand: await saveBrandKit(orgId, body) })
}

/** Enlaces públicos de solo-aprobación para clientes de agencias (fase 3). */
export async function approvalLinks(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ links: await listApprovalLinks(orgId) })
}

export async function createLink(
  request: FastifyRequest<{ Body: { label?: string; days?: number } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, async () => {
    const link = await createApprovalLink(orgId, userId, request.body ?? {})
    return {
      link,
      // La URL se compone aquí porque el backend es quien sabe dónde vive el
      // front público; el token no se vuelve a poder leer después.
      url: `${(process.env.PUBLIC_APP_URL ?? process.env.PUBLIC_HOST ?? '').replace(/\/$/, '')}/aprobar/${link.token}`,
      notice: 'Guarda el enlace ahora: el token no se puede volver a consultar.',
    }
  })
}

export async function revokeLink(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return guard(reply, () => revokeApprovalLink(orgId, request.params.id))
}

export async function results(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await approval.contentResults(orgId))
}

export async function voice(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ profile: await getOwnerVoice(orgId) })
}

/** Recalcula el perfil de voz. Es determinista: no consume LLM. */
export async function refreshVoice(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const profile = await refreshOwnerVoice(orgId)
  return reply.send({
    profile,
    reason: profile ? null : 'No hay suficientes intervenciones del negocio en las transcripciones para extraer un perfil.',
  })
}
