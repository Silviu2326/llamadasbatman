import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// AES-256-GCM con crypto nativo de Node — sin dependencia nueva. La key de
// entorno se hashea a 32 bytes para no obligar a un formato exacto.
function getKey(): Buffer {
  const secret = process.env.META_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('META_TOKEN_ENCRYPTION_KEY no configurada')
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.')
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}
