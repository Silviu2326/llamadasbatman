import { prisma } from '../lib/prisma'
import bcrypt from 'bcrypt'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { getWorkspaceGrantsForUserAsync, type WorkspaceGrant } from './workspaceAccess.service'

export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL_DAYS = 30

export type SessionUser = {
  id: string
  orgId: string
  role: string
  email: string
  name: string
  isPlatformAdmin: boolean
  workspaceGrants: WorkspaceGrant[]
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

export function activeIdentityFromMemberships<T extends { id: string; orgId: string; role: string; email: string; name: string }>(
  user: T,
  memberships: Array<{ orgId: string; role: string; status: string; isDefault: boolean; createdAt: Date }>,
  preferredOrgId?: string | null,
) {
  const active = memberships.filter(row => row.status === 'active').sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime())
  const membership = (preferredOrgId ? active.find(row => row.orgId === preferredOrgId) : undefined) ?? active[0]
  return membership ? { ...user, orgId: membership.orgId, role: membership.role } : user
}

export async function resolveActiveIdentity(user: { id: string; orgId: string; role: string; email: string; name: string }, preferredOrgId?: string | null) {
  const memberships = await prisma.organizationMembership.findMany({ where: { userId: user.id, status: 'active' }, select: { orgId: true, role: true, status: true, isDefault: true, createdAt: true } })
  return activeIdentityFromMemberships(user, memberships, preferredOrgId)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

/**
 * Alta self-service: una organización nueva en plan `free` con su usuario
 * `owner`. Devuelve `null` si el email ya existe — quien registra ya sabe si
 * tiene cuenta, así que aquí no aplica la discreción del reseteo.
 */
export async function registerOrganization(input: {
  name: string
  email: string
  password: string
  orgName: string
}) {
  const email = input.email.trim().toLowerCase()
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return null
  const passwordHash = await hashPassword(input.password)
  return prisma.$transaction(async tx => {
    const org = await tx.organization.create({ data: { name: input.orgName.trim(), plan: 'free', email } })
    const user = await tx.user.create({
      data: { orgId: org.id, email, name: input.name.trim(), role: 'owner', passwordHash },
      select: { id: true, orgId: true, email: true, name: true, role: true },
    })
    await tx.organizationMembership.create({ data: { orgId: org.id, userId: user.id, role: 'owner', status: 'active', isDefault: true } })
    return user
  })
}

function hashRefreshSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

function tokenMatches(expectedHash: string, secret: string) {
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(hashRefreshSecret(secret), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function buildRefreshToken(sessionId: string, secret: string) {
  return `${sessionId}.${secret}`
}

function parseRefreshToken(value: string | undefined) {
  if (!value) return null
  const separator = value.indexOf('.')
  if (separator <= 0 || separator === value.length - 1) return null
  const sessionId = value.slice(0, separator)
  const secret = value.slice(separator + 1)
  if (sessionId.length > 64 || secret.length < 32 || secret.length > 256) return null
  return { sessionId, secret }
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

function newRefreshSecret() {
  return randomBytes(48).toString('base64url')
}

export async function createRefreshSession(userId: string) {
  const secret = newRefreshSecret()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, orgId: true, role: true, email: true, name: true } })
  const identity = await resolveActiveIdentity(user)
  const session = await prisma.authSession.create({
    data: { userId, tokenHash: hashRefreshSecret(secret), expiresAt: refreshExpiry(), activeOrgId: identity.orgId },
  })
  return { session, refreshToken: buildRefreshToken(session.id, secret), identity }
}

/**
 * Rotates the opaque refresh credential atomically. Reusing an already
 * consumed token fails, which limits replay after an intercepted cookie.
 */
export async function rotateRefreshSession(rawRefreshToken: string | undefined): Promise<{
  user: SessionUser
  session: { id: string; expiresAt: Date }
  refreshToken: string
} | null> {
  const parsed = parseRefreshToken(rawRefreshToken)
  if (!parsed) return null

  const current = await prisma.authSession.findUnique({
    where: { id: parsed.sessionId },
    include: { user: true },
  })
  if (!current || current.revokedAt || current.expiresAt <= new Date() || !tokenMatches(current.tokenHash, parsed.secret)) {
    return null
  }
  // Una suplantación del back office dura lo que dura y no se renueva. Su
  // secreto de refresco nunca se entrega, así que llegar aquí ya sería
  // anómalo; se corta igualmente para que la caducidad de 30 minutos sea un
  // límite real y no dependa de que nadie encuentre la forma de rotarla.
  if (current.impersonatedByUserId) return null
  const activeOrgId = current.activeOrgId ?? current.user.orgId
  const membership = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId: activeOrgId, userId: current.user.id } },
    select: { role: true, status: true },
  })
  if (!membership || membership.status !== 'active') return null

  const secret = newRefreshSecret()
  const nextExpiry = refreshExpiry()
  const rotated = await prisma.$transaction(async tx => {
    const revoked = await tx.authSession.updateMany({
      where: { id: current.id, userId: current.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    })
    if (revoked.count !== 1) return null

    return tx.authSession.create({
      data: { userId: current.userId, tokenHash: hashRefreshSecret(secret), expiresAt: nextExpiry, activeOrgId },
      select: { id: true, expiresAt: true },
    })
  })
  if (!rotated) return null

  return {
    user: {
      id: current.user.id,
      orgId: activeOrgId,
      role: membership.role,
      email: current.user.email,
      name: current.user.name,
      isPlatformAdmin: current.user.isPlatformAdmin,
      workspaceGrants: await getWorkspaceGrantsForUserAsync({
        userId: current.user.id,
        email: current.user.email,
        orgId: activeOrgId,
        role: membership.role,
      }),
    },
    session: rotated,
    refreshToken: buildRefreshToken(rotated.id, secret),
  }
}

export async function selectOrganizationForSession(input: { userId: string; sessionId: string; orgId: string }) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
    include: { org: { select: { id: true, name: true, plan: true } }, user: { select: { id: true, email: true, name: true, isPlatformAdmin: true } } },
  })
  if (!membership || membership.status !== 'active') return null
  const changed = await prisma.authSession.updateMany({
    where: { id: input.sessionId, userId: input.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { activeOrgId: input.orgId, lastUsedAt: new Date() },
  })
  if (changed.count !== 1) return null
  return { id: membership.user.id, name: membership.user.name, email: membership.user.email, isPlatformAdmin: membership.user.isPlatformAdmin, orgId: membership.orgId, role: membership.role, org: membership.org }
}

export async function listUserOrganizations(userId: string) {
  return prisma.organizationMembership.findMany({
    where: { userId, status: 'active' },
    select: { orgId: true, role: true, isDefault: true, org: { select: { name: true, plan: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function revokeRefreshSession(sessionId: string | undefined, userId: string) {
  if (!sessionId) return
  await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
