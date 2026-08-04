import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { applyWorkspaceContext, WorkspaceAccessError } from '../services/workspaceAccess.service'
import { getAccessPrincipal } from '../access-control'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const user = request.user as {
      userId?: unknown
      tokenType?: unknown
      sessionId?: unknown
    }
    if (user.tokenType !== 'access' || typeof user.userId !== 'string' || !user.userId || typeof user.sessionId !== 'string' || !user.sessionId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    // El token es válido y la sesión también: si aquí no se puede construir el
    // principal es porque el CONTENIDO de los claims no autoriza (rol fuera del
    // catálogo, orgId con formato inválido, workspaceScope desconocido). Eso es
    // 403, no 401. Con 401 el cliente (src/lib/api.js) borra la sesión y redirige
    // a /login, así que un rol no reconocido dejaba al usuario en un bucle de
    // deslogueo en vez de decirle que no tiene permiso.
    if (!getAccessPrincipal(request)) return reply.status(403).send({ error: 'Forbidden' })

    // Access tokens are short-lived, but role changes and logout revoke the
    // backing session immediately. Checking it here prevents a still-valid
    // JWT from retaining access until its 15-minute expiry. Test harnesses
    // that intentionally use signed in-memory JWTs opt out with NODE_ENV=test;
    // production and development traffic remain fail-closed.
    if (process.env.NODE_ENV !== 'test') {
      const session = await prisma.authSession.findFirst({
        where: {
          id: user.sessionId,
          userId: user.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, user: { select: { id: true, orgId: true, role: true } } },
      })
      const claims = request.user as { orgId?: unknown; role?: unknown }
      if (!session || session.user.id !== user.userId || session.user.orgId !== claims.orgId || session.user.role !== claims.role) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    }
    await applyWorkspaceContext(request)
    // Mismo criterio tras el rebinding de workspace: es autorización, no identidad.
    if (!getAccessPrincipal(request)) return reply.status(403).send({ error: 'Forbidden' })
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code, ...error.details })
    }
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
