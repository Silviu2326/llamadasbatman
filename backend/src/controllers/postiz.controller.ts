import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as postiz from '../services/postizSync.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

async function requirePlan(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, postizEnabled: true } })
  return org?.plan === 'completo' && org.postizEnabled
}

/** GET / — estado de la conexión (gating de Plan Completo, Fase 3 punto 2). */
export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { postizWorkspaceId: true } })
  if (!org?.postizWorkspaceId) return reply.send({ connected: false })

  const integrations = await postiz.listIntegrations(org.postizWorkspaceId)
  return reply.send({
    connected: true,
    embedUrl: postiz.buildEmbedUrl(org.postizWorkspaceId),
    integrations,
  })
}

/** POST /connect — crea el workspace si falta y devuelve la URL a embeber. */
export async function connect(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const workspaceId = await postiz.ensureWorkspace(orgId)
  if (!workspaceId) return reply.status(502).send({ error: 'Postiz no disponible' })
  return reply.send({ embedUrl: postiz.buildEmbedUrl(workspaceId) })
}

export async function analytics(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { postizWorkspaceId: true } })
  if (!org?.postizWorkspaceId) return reply.send(null)
  return reply.send(await postiz.getAnalytics(org.postizWorkspaceId))
}

/** POST /posts — "programar también como post orgánico" (Fase 3 punto 3). */
export async function createPost(
  request: FastifyRequest<{ Body: { text: string; imageUrl?: string; platforms: string[] } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { postizWorkspaceId: true } })
  if (!org?.postizWorkspaceId) return reply.status(400).send({ error: 'Conectá redes sociales primero' })

  const { text, imageUrl, platforms } = request.body ?? ({} as any)
  if (!text || !platforms?.length) return reply.status(400).send({ error: 'text y platforms son requeridos' })

  const post = await postiz.createDraftPost(org.postizWorkspaceId, { text, imageUrl, platforms })
  if (!post) return reply.status(502).send({ error: 'No se pudo crear el post en Postiz' })
  return reply.status(201).send(post)
}
