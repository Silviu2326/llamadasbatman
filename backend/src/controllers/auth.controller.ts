import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as authService from '../services/auth.service'
import * as billing from '../services/billing.service'
import { getWorkspaceGrantsForUserAsync } from '../services/workspaceAccess.service'
import { brandForOrg } from '../services/whiteLabel.service'
import { authError, getRequestLocale } from '../lib/locale'
import { parseRequest } from '../lib/validation'
import { requestPasswordReset, resetPassword } from '../services/passwordReset.service'

interface LoginBody {
  email: string
  password: string
}

const REFRESH_COOKIE = 'vendrava_refresh'

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

async function accessToken(request: FastifyRequest, user: { id: string; orgId: string; role: string; email: string }, sessionId: string) {
  const workspaceGrants = await getWorkspaceGrantsForUserAsync({ userId: user.id, email: user.email, orgId: user.orgId, role: user.role })
  return request.server.jwt.sign(
    {
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
      tokenType: 'access',
      sessionId,
      workspaceScope: 'org',
      workspaceGrants,
    },
    { expiresIn: authService.ACCESS_TOKEN_TTL }
  )
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  orgName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  // Mismo mínimo que el reseteo de contraseña (passwordReset.service.ts:41).
  password: z.string().min(10).max(1024),
  plan: z.string().trim().regex(/^[a-z0-9_]{1,40}$/).optional(),
}).strict()

/**
 * Crea organización + usuario owner y deja la sesión abierta. Si llega un plan
 * de pago y Stripe está configurado, devuelve además la URL de checkout; el
 * webhook ya existente es quien sube el plan al confirmarse el pago.
 */
export async function register(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, registerSchema, request.body)
  if (!body) return

  let user
  try {
    user = await authService.registerOrganization(body)
  } catch (error) {
    // Carrera con otro alta simultánea: la restricción única del email decide.
    if ((error as { code?: string }).code === 'P2002') user = null
    else throw error
  }
  if (!user) return reply.status(409).send({ error: 'Ese email ya tiene cuenta', code: 'EMAIL_TAKEN' })

  const { session, refreshToken, identity } = await authService.createRefreshSession(user.id)
  setRefreshCookie(reply, refreshToken)

  let checkoutUrl: string | undefined
  if (body.plan && body.plan !== 'free' && billing.billingEnabled()) {
    checkoutUrl = await billing.createCheckoutSession(user.orgId, user.email, body.plan).catch(error => {
      console.warn('[AUTH] alta creada pero el checkout falló:', (error as Error).message)
      return undefined
    })
  }

  const grants = await getWorkspaceGrantsForUserAsync({ userId: identity.id, email: identity.email, orgId: identity.orgId, role: identity.role })
  return reply.status(201).send({
    token: await accessToken(request, identity, session.id),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: identity.role,
      orgId: identity.orgId,
      workspaces: grants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
    },
    brand: await brandForOrg(identity.orgId),
    ...(checkoutUrl ? { checkoutUrl } : {}),
  })
}

export async function login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
  const locale = getRequestLocale(request)
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = typeof request.body?.password === 'string' ? request.body.password : ''
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return reply.status(401).send({ error: authError(locale) })
  }

  try {
    const user = await authService.findUserByEmail(email)
    if (!user) {
      return reply.status(401).send({ error: authError(locale) })
    }

    const valid = await authService.verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: authError(locale) })
    }

    const { session, refreshToken, identity } = await authService.createRefreshSession(user.id)
    setRefreshCookie(reply, refreshToken)
    const grants = await getWorkspaceGrantsForUserAsync({ userId: identity.id, email: identity.email, orgId: identity.orgId, role: identity.role })
    const token = await accessToken(request, identity, session.id)

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: identity.role,
        orgId: identity.orgId,
        workspaces: grants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
      },
      brand: await brandForOrg(identity.orgId),
    })
  } catch (error) {
    request.log.error({ err: error }, 'Login failed because an authentication dependency is unavailable')
    return reply.status(503).send({
      error: locale === 'en'
        ? 'The access service is temporarily unavailable. Check the database connection and try again.'
        : 'El servicio de acceso no está disponible temporalmente. Comprueba la conexión con la base de datos y vuelve a intentarlo.',
    })
  }
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
    token: await accessToken(request, rotated.user, rotated.session.id),
    user: {
      id: rotated.user.id,
      name: rotated.user.name,
      email: rotated.user.email,
      role: rotated.user.role,
      orgId: rotated.user.orgId,
    workspaces: rotated.user.workspaceGrants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
    },
    brand: await brandForOrg(rotated.user.orgId),
  })
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  await authService.revokeRefreshSession(request.user.sessionId, request.user.userId)
  clearRefreshCookie(reply)
  return reply.send({ ok: true })
}

export async function organizations(request: FastifyRequest, reply: FastifyReply) {
  const rows = await authService.listUserOrganizations(request.user.userId)
  return reply.send({ organizations: rows.map(row => ({ id: row.orgId, name: row.org.name, plan: row.org.plan, role: row.role, isDefault: row.isDefault })) })
}

const selectOrganizationSchema = z.object({ orgId: z.string().trim().min(1).max(128) }).strict()

export async function selectOrganization(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, selectOrganizationSchema, request.body ?? {})
  if (!body) return
  if (request.user.tokenType !== 'access' || !request.user.sessionId) {
    return reply.status(403).send({ error: 'La selección de organización requiere una sesión de usuario', code: 'SESSION_REQUIRED' })
  }
  const selected = await authService.selectOrganizationForSession({ userId: request.user.userId, sessionId: request.user.sessionId, orgId: body.orgId })
  if (!selected) return reply.status(403).send({ error: 'No tienes una membresía activa en esa organización', code: 'MEMBERSHIP_REQUIRED' })
  const grants = await getWorkspaceGrantsForUserAsync({ userId: selected.id, email: selected.email, orgId: selected.orgId, role: selected.role })
  const user = { ...selected, workspaceGrants: grants }
  return reply.send({
    token: await accessToken(request, user, request.user.sessionId),
    user: { id: selected.id, name: selected.name, email: selected.email, role: selected.role, orgId: selected.orgId, workspaces: grants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })) },
    organization: selected.org,
    brand: await brandForOrg(selected.orgId),
  })
}

/**
 * Nunca revela si el email existe: responde 200 en los dos casos. Un atacante
 * no puede usar este endpoint para enumerar cuentas.
 */
export async function forgotPassword(request: FastifyRequest<{ Body: { email?: string } }>, reply: FastifyReply) {
  const appUrl = process.env.APP_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:5173'
  const result = await requestPasswordReset(String(request.body?.email ?? ''), appUrl).catch(error => {
    console.warn('[AUTH] forgotPassword falló:', (error as Error).message)
    return {} as { debugLink?: string }
  })
  return reply.send({ ok: true, ...(result.debugLink ? { debugLink: result.debugLink } : {}) })
}

export async function resetPasswordHandler(
  request: FastifyRequest<{ Body: { token?: string; password?: string } }>,
  reply: FastifyReply,
) {
  const outcome = await resetPassword(String(request.body?.token ?? ''), String(request.body?.password ?? ''))
  if (outcome === 'ok') return reply.send({ ok: true })
  if (outcome === 'weak_password') return reply.status(400).send({ error: 'La contraseña debe tener al menos 10 caracteres', code: 'WEAK_PASSWORD' })
  if (outcome === 'expired') return reply.status(400).send({ error: 'El enlace ha caducado. Pide uno nuevo.', code: 'RESET_EXPIRED' })
  return reply.status(400).send({ error: 'El enlace no es válido o ya se ha usado.', code: 'RESET_INVALID' })
}
