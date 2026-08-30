import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'

/**
 * Claves de API para la integración con sistemas externos (Zapier, Make, código
 * propio). Una clave actúa como el usuario que la creó: hereda su rol y por
 * tanto sus permisos. No hay un catálogo de scopes aparte porque ya existe uno
 * —el de roles— y duplicarlo sería otro sitio donde equivocarse.
 */
const PREFIX = 'vk_'
const SECRET_BYTES = 32

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function mintApiKey(): { key: string; prefix: string; keyHash: string } {
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  const key = `${PREFIX}${secret}`
  return { key, prefix: `${PREFIX}${secret.slice(0, 6)}…${secret.slice(-4)}`, keyHash: hash(key) }
}

export function looksLikeApiKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.length > PREFIX.length + 20 && value.length < 256
}

export type ResolvedApiKey = Readonly<{
  id: string
  orgId: string
  userId: string
  email: string
  role: string
}>

/**
 * Devuelve el principal de la clave o `null`. La comparación va contra el hash
 * en la base y además en tiempo constante: el índice único ya hace el trabajo,
 * pero un `findUnique` que acierta o falla por prefijo filtra tiempo.
 */
export async function resolveApiKey(rawKey: string): Promise<ResolvedApiKey | null> {
  if (!looksLikeApiKey(rawKey)) return null
  const keyHash = hash(rawKey)
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true, keyHash: true, orgId: true, revokedAt: true, expiresAt: true,
      user: { select: { id: true, email: true, role: true, orgId: true } },
    },
  })
  if (!record || !record.user) return null
  const expected = Buffer.from(record.keyHash, 'hex')
  const actual = Buffer.from(keyHash, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  if (record.revokedAt || (record.expiresAt && record.expiresAt <= new Date())) return null
  // El usuario pudo cambiar de organización después de emitirse la clave.
  if (record.user.orgId !== record.orgId) return null

  // Sin await: la marca de uso es telemetría, no puede añadir latencia ni
  // tumbar una petición autenticada si la escritura falla.
  void prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return Object.freeze({
    id: record.id,
    orgId: record.orgId,
    userId: record.user.id,
    email: record.user.email,
    role: record.user.role,
  })
}

export async function listApiKeys(orgId: string) {
  return prisma.apiKey.findMany({
    where: { orgId },
    select: {
      id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
      user: { select: { name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/** El secreto se devuelve una única vez: después solo queda su hash. */
export async function createApiKey(orgId: string, userId: string, input: { name: string; expiresInDays?: number }) {
  const name = input.name.trim()
  if (!name) throw new Error('La clave necesita un nombre')
  const days = input.expiresInDays
  const { key, prefix, keyHash } = mintApiKey()
  const created = await prisma.apiKey.create({
    data: {
      orgId,
      userId,
      name,
      prefix,
      keyHash,
      ...(days && days > 0 ? { expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) } : {}),
    },
    select: { id: true, name: true, prefix: true, expiresAt: true, createdAt: true },
  })
  return { ...created, key }
}

export async function revokeApiKey(orgId: string, id: string) {
  const revoked = await prisma.apiKey.updateMany({
    where: { id, orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return revoked.count === 1
}
