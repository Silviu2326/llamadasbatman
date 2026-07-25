import { prisma } from '../lib/prisma'
import bcrypt from 'bcrypt'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { getWorkspaceGrantsForUser, type WorkspaceGrant } from './workspaceAccess.service'

export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL_DAYS = 30

export type SessionUser = {
  id: string
  orgId: string
  role: string
  email: string
  name: string
  workspaceGrants: WorkspaceGrant[]
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
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
  const session = await prisma.authSession.create({
    data: { userId, tokenHash: hashRefreshSecret(secret), expiresAt: refreshExpiry() },
  })
  return { session, refreshToken: buildRefreshToken(session.id, secret) }
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

  const secret = newRefreshSecret()
  const nextExpiry = refreshExpiry()
  const rotated = await prisma.$transaction(async tx => {
    const revoked = await tx.authSession.updateMany({
      where: { id: current.id, userId: current.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    })
    if (revoked.count !== 1) return null

    return tx.authSession.create({
      data: { userId: current.userId, tokenHash: hashRefreshSecret(secret), expiresAt: nextExpiry },
      select: { id: true, expiresAt: true },
    })
  })
  if (!rotated) return null

  return {
    user: {
      id: current.user.id,
      orgId: current.user.orgId,
      role: current.user.role,
      email: current.user.email,
      name: current.user.name,
      workspaceGrants: getWorkspaceGrantsForUser({
        userId: current.user.id,
        email: current.user.email,
        orgId: current.user.orgId,
        role: current.user.role,
      }),
    },
    session: rotated,
    refreshToken: buildRefreshToken(rotated.id, secret),
  }
}

export async function revokeRefreshSession(sessionId: string | undefined, userId: string) {
  if (!sessionId) return
  await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
