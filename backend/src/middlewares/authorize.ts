import { FastifyRequest, FastifyReply } from 'fastify'

export function authorize(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { userId: string; orgId: string; role: string; email: string }
    if (!roles.includes(user?.role)) {
      reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
