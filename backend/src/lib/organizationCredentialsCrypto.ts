import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { requireStrongSecret } from './securityConfig'

const VERSION = 'v1'

function encryptionKey(): Buffer {
  return createHash('sha256')
    .update(requireStrongSecret('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY'))
    .digest()
}

/** Encrypts the whole provider configuration, including tokens and secrets. */
export function encryptOrganizationCredential(value: Record<string, unknown>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const plaintext = JSON.stringify(value)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptOrganizationCredential(payload: string): Record<string, unknown> {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split('.')
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const value = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
  return parsed as Record<string, unknown>
}

/** Safe projection for API responses and health checks. */
export function credentialMetadata(value: {
  id: string
  orgId: string
  provider: string
  slot: string
  metadata: unknown
  scopes: string[]
  status: string
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  lastRefreshedAt: Date | null
  lastUsedAt: Date | null
  revokedAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: value.id,
    orgId: value.orgId,
    provider: value.provider,
    slot: value.slot,
    metadata: value.metadata,
    scopes: value.scopes,
    status: value.status,
    accessTokenExpiresAt: value.accessTokenExpiresAt,
    refreshTokenExpiresAt: value.refreshTokenExpiresAt,
    lastRefreshedAt: value.lastRefreshedAt,
    lastUsedAt: value.lastUsedAt,
    revokedAt: value.revokedAt,
    lastError: value.lastError,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}
