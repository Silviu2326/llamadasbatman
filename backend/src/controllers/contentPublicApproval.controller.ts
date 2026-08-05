import { FastifyReply, FastifyRequest } from 'fastify'
import * as approval from '../services/contentApproval.service'
import { resolveApprovalLink } from '../services/contentApprovalLink.service'
import { StudioError } from '../services/contentStudio.service'
import { prisma } from '../lib/prisma'

/**
 * Sala de aprobación para el cliente de una agencia — `roadmap.md` fase 3.
 *
 * Todo entra por un token en la URL y **nada más**: no hay sesión, no hay
 * usuario y no hay JWT. Por eso este controlador no comparte nada con el
 * autenticado salvo el servicio: lo que aquí se puede hacer es la lista corta
 * de acciones que se le permiten a alguien de fuera, escrita entera, sin
 * heredar por descuido un endpoint que se añada mañana.
 *
 * Lo que devuelve también es menos: la pieza, su formato y su informe, sin las
 * evidencias internas ni los identificadores de campaña. El cliente aprueba lo
 * que se va a publicar; el material que lo sustenta es del negocio.
 */

type TokenParams = { token: string }

async function withLink<T>(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
  run: (context: { orgId: string; actor: approval.PieceActor }) => Promise<T>,
) {
  const link = await resolveApprovalLink(request.params.token)
  // Mismo 404 para inexistente, caducado y revocado: distinguirlos enseñaría a
  // quien prueba tokens cuál de ellos existió alguna vez.
  if (!link) return reply.status(404).send({ error: 'Este enlace de aprobación no es válido o ha caducado.' })

  try {
    return reply.send(await run({ orgId: link.orgId, actor: { label: link.label ?? 'Cliente' } }))
  } catch (error) {
    if (error instanceof StudioError) return reply.status(409).send({ error: error.message })
    throw error
  }
}

/** Cola de piezas pendientes, con lo justo para poder decidir. */
export async function queue(request: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) {
  return withLink(request, reply, async ({ orgId }) => {
    const [{ pieces }, organization] = await Promise.all([
      approval.listQueue(orgId),
      prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ])
    return {
      business: organization?.name ?? null,
      pieces: pieces.map(piece => ({
        id: piece.id,
        format: piece.format,
        objective: piece.objective,
        channels: piece.channels,
        body: piece.body,
        imageUrl: piece.imageUrl,
        audioUrl: piece.audioUrl,
        status: piece.status,
        // El informe del editor sí viaja: si una pieza lleva una frase sin dato
        // que la sostenga, quien la aprueba tiene que verlo.
        review: piece.reviewReport,
        specificity: piece.specificity,
        createdAt: piece.createdAt,
      })),
      reasons: approval.REJECTION_REASONS,
    }
  })
}

export async function history(
  request: FastifyRequest<{ Params: TokenParams & { id: string } }>,
  reply: FastifyReply,
) {
  return withLink(request, reply, ({ orgId }) => approval.pieceHistory(orgId, request.params.id))
}

export async function comment(
  request: FastifyRequest<{ Params: TokenParams & { id: string }; Body: { message?: string } }>,
  reply: FastifyReply,
) {
  return withLink(request, reply, ({ orgId, actor }) =>
    approval.commentPiece(orgId, request.params.id, request.body?.message ?? '', actor))
}

export async function approve(
  request: FastifyRequest<{ Params: TokenParams & { id: string } }>,
  reply: FastifyReply,
) {
  // Aprobar desde fuera **no publica**: deja la pieza aprobada y es la agencia
  // quien crea el borrador. Publicar consume la integración del negocio y es
  // una decisión suya, no del cliente que da el visto bueno.
  return withLink(request, reply, async ({ orgId, actor }) => {
    const piece = await approval.approvePiece(orgId, actor, request.params.id)
    return { id: piece.id, status: piece.status }
  })
}

export async function reject(
  request: FastifyRequest<{ Params: TokenParams & { id: string }; Body: { reason?: string; comment?: string } }>,
  reply: FastifyReply,
) {
  return withLink(request, reply, async ({ orgId, actor }) => {
    const piece = await approval.rejectPiece(orgId, actor, request.params.id, request.body ?? {})
    return { id: piece.id, status: piece.status }
  })
}
