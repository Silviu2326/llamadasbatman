import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Almacén mínimo para imágenes generadas con IA (gpt-image-1 devuelve base64,
 * nunca una URL). Metricool y Meta necesitan una URL pública descargable, así
 * que el PNG se guarda en disco y se sirve desde GET /api/public/media/:file.
 */
// ponytail: disco local — mover a S3/R2 si el backend escala a varias réplicas.
const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'generated')
const FILE_NAME_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/

export const MEDIA_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** Solo confiamos en los magic bytes, nunca en el content-type declarado. */
export function detectImageType(buffer: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length > 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

export function publicMediaBaseUrl(): string | null {
  const host = process.env.PUBLIC_HOST?.trim()
  if (!host) return null
  return `${host.replace(/\/$/, '')}/api/public/media`
}

export async function saveGeneratedImage(base64: string): Promise<{ fileName: string; publicUrl: string } | null> {
  return saveImageBuffer(Buffer.from(base64, 'base64'), 'png')
}

/** Para subidas del navegador: rechaza cualquier cosa que no sea una imagen real. */
export async function saveUploadedImage(buffer: Buffer): Promise<{ fileName: string; publicUrl: string } | null> {
  const type = detectImageType(buffer)
  if (!type) return null
  return saveImageBuffer(buffer, type)
}

async function saveImageBuffer(buffer: Buffer, extension: string): Promise<{ fileName: string; publicUrl: string } | null> {
  const base = publicMediaBaseUrl()
  if (!base) return null
  const fileName = `${randomUUID()}.${extension}`
  await mkdir(MEDIA_DIR, { recursive: true })
  await writeFile(path.join(MEDIA_DIR, fileName), buffer)
  return { fileName, publicUrl: `${base}/${fileName}` }
}

export async function readGeneratedImage(fileName: string): Promise<Buffer | null> {
  if (!FILE_NAME_PATTERN.test(fileName)) return null
  try {
    return await readFile(path.join(MEDIA_DIR, fileName))
  } catch {
    return null
  }
}
