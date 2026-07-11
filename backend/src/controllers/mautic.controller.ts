import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as mauticSync from '../services/mauticSync.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/** GET / — overview agregado para la página de Email marketing (Plan Completo). */
export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, mauticEnabled: true } })
  if (org?.plan !== 'completo' || !org.mauticEnabled) {
    return reply.status(403).send({ error: 'Email marketing no está incluido en tu plan' })
  }
  return reply.send(await mauticSync.getOverview(orgId))
}
