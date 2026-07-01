import { FastifyRequest, FastifyReply } from 'fastify'
import * as authService from '../services/auth.service'

interface LoginBody {
  email: string
  password: string
}

interface RefreshBody {
  refreshToken: string
}

export async function login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
  const { email, password } = request.body

  const user = await authService.findUserByEmail(email)
  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' })
  }

  const valid = await authService.verifyPassword(password, user.passwordHash)
  if (!valid) {
    return reply.status(401).send({ error: 'Invalid credentials' })
  }

  const payload = { userId: user.id, orgId: user.orgId, role: user.role, email: user.email }
  const token = request.server.jwt.sign(payload, { expiresIn: '7d' })

  return reply.send({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    },
  })
}

export async function refresh(request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) {
  const { refreshToken } = request.body

  try {
    const decoded = request.server.jwt.verify<{
      userId: string
      orgId: string
      role: string
      email: string
    }>(refreshToken)

    const token = request.server.jwt.sign(
      { userId: decoded.userId, orgId: decoded.orgId, role: decoded.role, email: decoded.email },
      { expiresIn: '7d' }
    )

    return reply.send({ token })
  } catch {
    return reply.status(401).send({ error: 'Invalid refresh token' })
  }
}

export async function logout(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ ok: true })
}
