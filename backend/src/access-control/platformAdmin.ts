import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma'
import { getAccessPrincipal } from './requirePermission'

/**
 * Privilegio de operador de plataforma: el único punto del sistema que puede
 * mirar fuera de la organización activa.
 *
 * El resto del backend deriva la autorización del token (rol + orgId). Aquí no
 * basta, porque el token dura 15 minutos: si se retira el privilegio a alguien,
 * su token sigue siendo criptográficamente válido durante ese margen. Por eso
 * este guard vuelve a la base en cada petición. Es una consulta más por llamada
 * al back office, un coste irrelevante para el volumen de estas rutas frente a
 * dejar una ventana de acceso total tras la revocación.
 */

export type PlatformActor = Readonly<{
  userId: string
  email: string
  orgId: string
  correlationId?: string
  ip?: string
}>

const PLATFORM_ACTOR = Symbol('platformActor')

type RequestWithPlatformActor = FastifyRequest & { [PLATFORM_ACTOR]?: PlatformActor }

/** Actor ya verificado por `requirePlatformAdmin`; nunca se reconstruye desde el body. */
export function getPlatformActor(request: FastifyRequest): PlatformActor {
  const actor = (request as RequestWithPlatformActor)[PLATFORM_ACTOR]
  if (!actor) throw new Error('getPlatformActor requiere requirePlatformAdmin en el preHandler')
  return actor
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(403).send({ error: 'Forbidden' })

  const claims = request.user as {
    tokenType?: unknown
    sessionId?: unknown
    email?: unknown
    impersonated?: unknown
  }

  // Una clave de API nunca opera el back office. Actúa como un usuario concreto
  // (ApiKey.userId), así que si ese usuario fuese operador la clave heredaría
  // acceso total a todos los tenants — un secreto de larga vida en un archivo
  // de configuración no puede tener ese alcance.
  if (claims.tokenType !== 'access' || typeof claims.sessionId !== 'string') {
    return reply.status(403).send({ error: 'El back office requiere una sesión de usuario', code: 'SESSION_REQUIRED' })
  }

  // Suplantar no encadena: desde dentro de una suplantación no se vuelve a
  // entrar al back office. Sin esto, suplantar a cualquier usuario y navegar al
  // back office devolvería el privilegio del operador con la identidad ajena,
  // rompiendo la atribución de la auditoría.
  if (claims.impersonated === true) {
    return reply.status(403).send({ error: 'Una sesión suplantada no puede usar el back office', code: 'IMPERSONATION_ACTIVE' })
  }

  const session = await prisma.authSession.findFirst({
    where: { id: claims.sessionId, userId: principal.userId },
    select: {
      revokedAt: true,
      expiresAt: true,
      impersonatedByUserId: true,
      user: { select: { id: true, email: true, isPlatformAdmin: true } },
    },
  })
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
  if (session.impersonatedByUserId) {
    return reply.status(403).send({ error: 'Una sesión suplantada no puede usar el back office', code: 'IMPERSONATION_ACTIVE' })
  }
  if (!session.user.isPlatformAdmin) return reply.status(403).send({ error: 'Forbidden' })

  const actor: PlatformActor = {
    userId: session.user.id,
    email: session.user.email,
    orgId: principal.orgId,
    correlationId: request.correlationId,
    ip: request.ip,
  }
  ;(request as RequestWithPlatformActor)[PLATFORM_ACTOR] = actor
}

/** ¿Es este usuario operador? Lo usa /api/auth para que la UI sepa si pintar la entrada. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } })
  return user?.isPlatformAdmin === true
}
