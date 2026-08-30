import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { requireStrongSecret } from './securityConfig'
import {
  KEYRING_CIPHERTEXT_PREFIX,
  decryptSecretWithKeyring,
  encryptSecretWithKeyring,
  isEncryptionKeyringConfigured,
} from './organizationCredentialsCrypto'

/**
 * Cifrado de tokens Organic separado del secreto de Meta.
 * Requiere ORGANIC_TOKEN_ENCRYPTION_KEY (>=32 caracteres aleatorios).
 *
 * Unificación (02-FUNDAMENTOS §4): con el keyring v2 configurado, los cifrados
 * nuevos usan el módulo canónico (`v2.<keyId>....`, rotable); los payloads
 * legacy (tres bloques base64url sin prefijo de versión) se siguen
 * descifrando aquí con su clave de siempre. Migración perezosa.
 */
function key(): Buffer {
  return createHash('sha256').update(requireStrongSecret('ORGANIC_TOKEN_ENCRYPTION_KEY')).digest()
}

export function encryptOrganicToken(value: string): string {
  if (isEncryptionKeyringConfigured()) return encryptSecretWithKeyring(value)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.')
}

export function decryptOrganicToken(payload: string): string {
  // Detección por prefijo: `v2.` viene del canónico; el resto es legacy.
  if (payload.startsWith(KEYRING_CIPHERTEXT_PREFIX)) return decryptSecretWithKeyring(payload)
  const [ivValue, tagValue, ciphertextValue] = payload.split('.')
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Token Organic cifrado inválido')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
