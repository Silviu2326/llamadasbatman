import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { requireStrongSecret } from './securityConfig'

/**
 * Módulo canónico de cifrado de secretos (02-FUNDAMENTOS §4).
 *
 * Dos formatos versionados, siempre AES-256-GCM:
 *  - `v1.<iv>.<tag>.<ct>`          — clave única INTEGRATION_CREDENTIALS_ENCRYPTION_KEY.
 *  - `v2.<keyId>.<iv>.<tag>.<ct>`  — keyring con rotación vía
 *    INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS (`keyId:secreto,keyId2:secreto2`).
 *
 * Regla del keyring: la PRIMERA clave cifra, TODAS descifran. Rotar = añadir
 * la clave nueva delante y dejar las viejas detrás hasta recifrar lo antiguo.
 * Sin keyring configurado se sigue cifrando en v1 con la clave única, así que
 * un deployment existente no cambia de comportamiento hasta que opta por v2.
 * Descifrar v1 funciona siempre que la clave vieja siga presente: la
 * migración es perezosa y nada ya cifrado se rompe.
 */

const V1 = 'v1'
const V2 = 'v2'

/** Prefijo que identifica un payload del formato canónico con keyring. */
export const KEYRING_CIPHERTEXT_PREFIX = `${V2}.`

const MIN_SECRET_LENGTH = 32
// El keyId viaja dentro del payload separado por puntos: el formato prohíbe
// el punto (y la coma/los dos puntos, separadores de la variable de entorno).
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

type KeyringEntry = { keyId: string; key: Buffer }

// Cada secreto de entorno se hashea a 32 bytes exactos (misma decisión que
// las libs legacy): no obligamos a un formato concreto de clave.
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function legacyEncryptionKey(): Buffer {
  return deriveKey(requireStrongSecret('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY'))
}

/**
 * Se parsea en cada operación (no se cachea) para que los tests puedan fijar
 * la variable y porque el coste es despreciable frente al cifrado en sí.
 */
function parseKeyring(): KeyringEntry[] | null {
  const raw = process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS?.trim()
  if (!raw) return null
  const entries: KeyringEntry[] = []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const item = part.trim()
    if (!item) continue
    // Solo el primer ':' separa keyId de secreto; el secreto puede llevar ':'.
    const separator = item.indexOf(':')
    const keyId = separator > 0 ? item.slice(0, separator).trim() : ''
    const secret = separator > 0 ? item.slice(separator + 1).trim() : ''
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error(`INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS contiene un keyId inválido (${keyId || 'vacío'}): usa [A-Za-z0-9_-]`)
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: el secreto de "${keyId}" debe tener al menos ${MIN_SECRET_LENGTH} caracteres`)
    }
    if (seen.has(keyId)) throw new Error(`INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: keyId duplicado "${keyId}"`)
    seen.add(keyId)
    entries.push({ keyId, key: deriveKey(secret) })
  }
  if (!entries.length) return null
  return entries
}

/** True cuando el keyring v2 está configurado y por tanto v2 cifra. */
export function isEncryptionKeyringConfigured(): boolean {
  return parseKeyring() !== null
}

/**
 * Indica si un ciphertext leído debe volver a cifrarse con la primera clave
 * del keyring. Cubre tanto v1/legacy como v2 creado con una clave anterior.
 * No valida ni descifra el payload: el caller solo debe usarlo después de un
 * descifrado correcto y actualizar con compare-and-swap.
 */
export function credentialCiphertextNeedsReencryption(payload: string): boolean {
  const primary = parseKeyring()?.[0]
  if (!primary) return false
  const [version, keyId] = payload.split('.', 2)
  return version !== V2 || keyId !== primary.keyId
}

function encryptRaw(plaintext: string): string {
  const iv = randomBytes(12)
  const keyring = parseKeyring()
  if (keyring) {
    // La primera clave del keyring es siempre la que cifra.
    const { keyId, key } = keyring[0]
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return [V2, keyId, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
  }
  // Compatibilidad total hacia atrás: sin keyring se cifra en v1 como siempre.
  const cipher = createCipheriv('aes-256-gcm', legacyEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [V1, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

function decryptWithKey(key: Buffer, ivValue: string, tagValue: string, ciphertextValue: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function decryptRaw(payload: string): string {
  const parts = payload.split('.')
  if (parts[0] === V2) {
    const [, keyId, ivValue, tagValue, ciphertextValue] = parts
    if (parts.length !== 5 || !keyId || !ivValue || !tagValue || !ciphertextValue) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
    // Todas las claves del keyring descifran: se busca por keyId explícito,
    // así rotar el orden nunca rompe lo ya cifrado.
    const entry = parseKeyring()?.find(candidate => candidate.keyId === keyId)
    if (!entry) throw new Error(`CREDENCIAL_CIFRADA_CLAVE_DESCONOCIDA:${keyId}`)
    return decryptWithKey(entry.key, ivValue, tagValue, ciphertextValue)
  }
  const [version, ivValue, tagValue, ciphertextValue] = parts
  if (version !== V1 || parts.length !== 4 || !ivValue || !tagValue || !ciphertextValue) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
  // v1 se descifra siempre con la clave única legacy, exista o no keyring.
  return decryptWithKey(legacyEncryptionKey(), ivValue, tagValue, ciphertextValue)
}

/** Encrypts the whole provider configuration, including tokens and secrets. */
export function encryptOrganizationCredential(value: Record<string, unknown>): string {
  return encryptRaw(JSON.stringify(value))
}

export function decryptOrganizationCredential(payload: string): Record<string, unknown> {
  const value = decryptRaw(payload)
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
  return parsed as Record<string, unknown>
}

/**
 * Cifra un secreto plano (tokens Meta/Organic) con el keyring canónico.
 * Exige keyring configurado a propósito: sin él, el resultado sería un `v1.`
 * indistinguible por prefijo para las libs legacy y su detección se rompería.
 */
export function encryptSecretWithKeyring(value: string): string {
  if (!isEncryptionKeyringConfigured()) {
    throw new Error('INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS debe configurarse antes de cifrar con el keyring canónico')
  }
  return encryptRaw(value)
}

/** Descifra un payload `v2.` producido por encryptSecretWithKeyring. */
export function decryptSecretWithKeyring(payload: string): string {
  if (!payload.startsWith(KEYRING_CIPHERTEXT_PREFIX)) throw new Error('CREDENCIAL_CIFRADA_INVALIDA')
  return decryptRaw(payload)
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
