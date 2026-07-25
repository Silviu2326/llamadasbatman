import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { requireStrongSecret } from './securityConfig'

/**
 * Cifrado de tokens Organic separado del secreto de Meta.
 * Requiere ORGANIC_TOKEN_ENCRYPTION_KEY (>=32 caracteres aleatorios).
 */
function key(): Buffer {
  return createHash('sha256').update(requireStrongSecret('ORGANIC_TOKEN_ENCRYPTION_KEY')).digest()
}

export function encryptOrganicToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.')
}

export function decryptOrganicToken(payload: string): string {
  const [ivValue, tagValue, ciphertextValue] = payload.split('.')
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Token Organic cifrado inválido')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
