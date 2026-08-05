import { FastifyReply, FastifyRequest } from 'fastify'
import * as radar from '../services/contentOpportunity.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/**
 * El Radar (`docs/xarly/pantallas.md` §1). La lectura es barata —lee lo ya
 * analizado—; el refresco es el que llama al modelo y por eso exige permiso de
 * coste, igual que el generador de contenido.
 */
export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await radar.listOpportunities(orgId))
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await radar.refreshOpportunities(orgId))
  } catch (error) {
    if (error instanceof radar.ContentOpportunityError) {
      // Falta de configuración o material insuficiente: es un estado del
      // producto, no un fallo del servidor.
      return reply.status(409).send({ error: error.message })
    }
    throw error
  }
}

export async function dismiss(
  request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await radar.dismissOpportunity(orgId, request.params.id, request.body?.reason))
  } catch (error) {
    if (error instanceof radar.ContentOpportunityError) return reply.status(404).send({ error: error.message })
    throw error
  }
}

/** Evidencias: conteos y referencias, nunca transcripción cruda (README). */
export async function evidence(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await radar.opportunityEvidence(orgId, request.params.id))
  } catch (error) {
    if (error instanceof radar.ContentOpportunityError) return reply.status(404).send({ error: error.message })
    throw error
  }
}
