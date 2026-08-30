import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { applyWorkspaceContext, WorkspaceAccessError } from '../services/workspaceAccess.service'
import { getAccessPrincipal } from '../access-control'
import { looksLikeApiKey, resolveApiKey } from '../services/apiKeys.service'

/**
 * Extrae la clave de API de `X-API-Key` o de `Authorization: Bearer vk_…`. El
 * mismo encabezado sirve para JWT y para clave: el prefijo `vk_` los distingue.
 */
function apiKeyFromRequest(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key']
  const direct = Array.isArray(header) ? header[0] : header
  if (looksLikeApiKey(direct)) return direct
  const authorization = request.headers.authorization
  if (typeof authorization !== 'string') return null
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null
  return looksLikeApiKey(bearer) ? bearer : null
}

function isDatabaseUnavailable(error: unknown): boolean {
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  const text = `${String(candidate?.name ?? '')} ${String(candidate?.code ?? '')} ${String(candidate?.message ?? '')}`.toLowerCase()
  return text.includes('prismaclientinitializationerror')
    || text.includes('prismaclientknownrequesterror') && (text.includes('p1001') || text.includes('p1017'))
    || text.includes("can't reach database server")
    || text.includes('database server is not reachable')
    || text.includes('connection terminated unexpectedly')
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const rawApiKey = apiKeyFromRequest(request)
    if (rawApiKey) {
      const principal = await resolveApiKey(rawApiKey)
      if (!principal) return reply.status(401).send({ error: 'Unauthorized' })
      // Se rellenan los mismos claims que emite un login. A partir de aquí el
      // resto del stack —permisos, entitlements, workspaces— no distingue si
      // detrás hay una persona o una integración, y no debe distinguirlo.
      request.user = {
        userId: principal.userId,
        orgId: principal.orgId,
        role: principal.role,
        email: principal.email,
        tokenType: 'api_key',
        apiKeyId: principal.id,
        workspaceScope: 'org',
      }
      if (!getAccessPrincipal(request)) return reply.status(403).send({ error: 'Forbidden' })
      await applyWorkspaceContext(request)
      if (!getAccessPrincipal(request)) return reply.status(403).send({ error: 'Forbidden' })
      return
    }

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
        select: { id: true, activeOrgId: true, user: { select: { id: true, orgId: true, role: true } } },
      })
      const claims = request.user as { orgId?: unknown; role?: unknown }
      const activeOrgId = session?.activeOrgId ?? session?.user.orgId
      const membership = session && typeof claims.orgId === 'string'
        ? await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId: claims.orgId, userId: session.user.id } }, select: { role: true, status: true } })
        : null
      if (!session || session.user.id !== user.userId || activeOrgId !== claims.orgId || !membership || membership.status !== 'active' || membership.role !== claims.role) {
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
    if (isDatabaseUnavailable(error)) {
      return reply.status(503).send({
        error: 'La base de datos no está disponible temporalmente',
        code: 'DATABASE_UNAVAILABLE',
      })
    }
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
