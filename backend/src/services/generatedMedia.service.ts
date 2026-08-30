import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Almacén mínimo para imágenes generadas con IA (gpt-image-1 devuelve base64,
 * nunca una URL). Metricool y Meta necesitan una URL pública descargable, así
 * que el PNG se guarda en disco y se sirve desde GET /api/public/media/:file.
 *
 * Desde la fase 2 guarda también las **slides de carrusel con plantilla de
 * marca** (SVG, idea 7) y las **locuciones** del guion de Reel (idea 8). Es el
 * mismo problema —un archivo que alguien de fuera tiene que poder descargar— y
 * duplicar el almacén habría duplicado también el patrón de nombre y la ruta
 * pública, que es justo lo que protege de servir archivos arbitrarios.
 */
// ponytail: disco local — mover a S3/R2 si el backend escala a varias réplicas.
// Exportado para que lib/storage.ts pueda usar el MISMO directorio como
// fallback de desarrollo sin duplicar la ruta en dos sitios.
export const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'generated')
const FILE_NAME_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp|svg|wav|mp3)$/

export const MEDIA_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
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
  return saveMediaBuffer(Buffer.from(base64, 'base64'), 'png')
}

/** Para subidas del navegador: rechaza cualquier cosa que no sea una imagen real. */
export async function saveUploadedImage(buffer: Buffer): Promise<{ fileName: string; publicUrl: string } | null> {
  const type = detectImageType(buffer)
  if (!type) return null
  return saveMediaBuffer(buffer, type)
}

/**
 * Guarda un archivo que no es una imagen de IA: la slide SVG de un carrusel con
 * plantilla de marca o la locución de un Reel. La extensión se comprueba contra
 * el mismo diccionario que sirve la ruta pública, para que nunca se pueda
 * escribir un archivo que después haya que servir adivinando su tipo.
 */
export async function saveGeneratedFile(buffer: Buffer, extension: string): Promise<{ fileName: string; publicUrl: string } | null> {
  if (!MEDIA_CONTENT_TYPES[extension]) return null
  return saveMediaBuffer(buffer, extension)
}

async function saveMediaBuffer(buffer: Buffer, extension: string): Promise<{ fileName: string; publicUrl: string } | null> {
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
