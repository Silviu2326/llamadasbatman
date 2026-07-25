import { FastifyRequest, FastifyReply } from 'fastify'
import * as authService from '../services/auth.service'
import { getWorkspaceGrantsForUser } from '../services/workspaceAccess.service'
import { authError, getRequestLocale } from '../lib/locale'

interface LoginBody {
  email: string
  password: string
}

const REFRESH_COOKIE = 'vozia_refresh'

function readCookie(request: FastifyRequest, name: string) {
  const raw = request.headers.cookie
  if (!raw) return undefined
  const match = raw.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))
  if (!match) return undefined
  try {
    return decodeURIComponent(match.slice(name.length + 1))
  } catch {
    return undefined
  }
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  const attributes = [
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}`,
    `Max-Age=${authService.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60}`,
    'Path=/api/auth',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')
  reply.header('Set-Cookie', attributes.join('; '))
}

function clearRefreshCookie(reply: FastifyReply) {
  const attributes = [`${REFRESH_COOKIE}=`, 'Max-Age=0', 'Path=/api/auth', 'HttpOnly', 'SameSite=Lax']
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')
  reply.header('Set-Cookie', attributes.join('; '))
}

function accessToken(request: FastifyRequest, user: { id: string; orgId: string; role: string; email: string }, sessionId: string) {
  return request.server.jwt.sign(
    {
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
      tokenType: 'access',
      sessionId,
      workspaceScope: 'org',
      workspaceGrants: getWorkspaceGrantsForUser({ userId: user.id, email: user.email, orgId: user.orgId, role: user.role }),
    },
    { expiresIn: authService.ACCESS_TOKEN_TTL }
  )
}

export async function login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
  const locale = getRequestLocale(request)
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = typeof request.body?.password === 'string' ? request.body.password : ''
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return reply.status(401).send({ error: authError(locale) })
  }

  const user = await authService.findUserByEmail(email)
  if (!user) {
    return reply.status(401).send({ error: authError(locale) })
  }

  const valid = await authService.verifyPassword(password, user.passwordHash)
  if (!valid) {
    return reply.status(401).send({ error: authError(locale) })
  }

  const { session, refreshToken } = await authService.createRefreshSession(user.id)
  setRefreshCookie(reply, refreshToken)
  const token = accessToken(request, user, session.id)

  return reply.send({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      workspaces: getWorkspaceGrantsForUser({ userId: user.id, email: user.email, orgId: user.orgId, role: user.role }).map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
    },
  })
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const locale = getRequestLocale(request)
  const rotated = await authService.rotateRefreshSession(readCookie(request, REFRESH_COOKIE))
  if (!rotated) {
    clearRefreshCookie(reply)
    return reply.status(401).send({ error: authError(locale, true) })
  }

  setRefreshCookie(reply, rotated.refreshToken)
  return reply.send({
    token: accessToken(request, rotated.user, rotated.session.id),
    user: {
      id: rotated.user.id,
      name: rotated.user.name,
      email: rotated.user.email,
      role: rotated.user.role,
      orgId: rotated.user.orgId,
      workspaces: rotated.user.workspaceGrants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
    },
  })
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  await authService.revokeRefreshSession(request.user.sessionId, request.user.userId)
  clearRefreshCookie(reply)
  return reply.send({ ok: true })
}
