import { FastifyRequest, FastifyReply } from 'fastify'
import { getAccessPrincipal, isKnownRole } from '../access-control'

/** Roles that may change shared organization data or trigger paid providers. */
export const MUTATING_ROLES = ['admin', 'agent'] as const

export function authorize(roles: readonly string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = getAccessPrincipal(request)
    const allowedRoles = new Set(roles.filter(isKnownRole))
    if (!principal || !allowedRoles.has(principal.role)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
