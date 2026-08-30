import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './s3'
import { MEDIA_DIR, saveGeneratedFile } from '../services/generatedMedia.service'

/**
 * Capa de almacenamiento de la biblioteca universal de activos
 * (docs/plataforma-abierta/02-FUNDAMENTOS.md §2.1).
 *
 * Reutiliza el cliente S3/R2 de `lib/s3.ts` (mismas envs: S3_ENDPOINT,
 * S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET) con la convención de clave
 * `org/<orgId>/assets/<assetId>/<filename>`: el prefijo por organización
 * permite políticas de ciclo de vida y borrado por tenant sin listar todo
 * el bucket.
 *
 * FALLBACK LOCAL — SOLO DESARROLLO: vive en un directorio PRIVADO distinto de
 * /api/public/media. Nunca se devuelve una URL pública para un original. En
 * producción se falla cerrado si S3/R2 no está configurado.
 */

/** Prefijo que marca una clave del fallback local de desarrollo. */
const LOCAL_PREFIX = 'local:'
const PUBLISHED_LOCAL_PREFIX = 'published-local:'
const LOCAL_ASSET_DIR = path.resolve(process.env.ASSET_LOCAL_DIR?.trim() || path.join(process.cwd(), 'uploads', 'assets-private'))

const DEFAULT_TTL_SECONDS = 900

/**
 * Función pura: hay S3/R2 configurado cuando existen las cuatro envs que
 * `lib/s3.ts` necesita. Se comprueba en cada llamada (no en carga de módulo)
 * para que los tests puedan alternar entornos sin reimportar.
 */
export function isS3Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_BUCKET)
}

/**
 * Un nombre de archivo dentro de la clave nunca puede traer separadores de
 * ruta ni componer `..`: la clave la construimos nosotros, pero `filename`
 * puede venir del nombre original que subió un usuario.
 */
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_')
  return base && base !== '.' && base !== '..' ? base : 'archivo.bin'
}

export interface PutAssetObjectInput {
  orgId: string
  assetId: string
  filename: string
  body: Buffer
  contentType: string
}

/** Sube el binario de un activo y devuelve su storageKey. */
export async function putAssetObject(input: PutAssetObjectInput): Promise<{ storageKey: string }> {
  if (isS3Configured()) {
    const storageKey = `org/${input.orgId}/assets/${input.assetId}/${sanitizeFilename(input.filename)}`
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: storageKey,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: 'private, no-store',
    }))
    return { storageKey }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('S3/R2 es obligatorio en producción para almacenar assets privados')
  }
  await mkdir(LOCAL_ASSET_DIR, { recursive: true })
  const fileName = `${input.assetId}-${sanitizeFilename(input.filename)}`
  await writeFile(path.join(LOCAL_ASSET_DIR, fileName), input.body, { flag: 'wx' })
  return { storageKey: `${LOCAL_PREFIX}${fileName}` }
}

/**
 * URL de descarga temporal. Con S3/R2 es una URL prefirmada real; con el
 * fallback local es la URL pública actual (sin TTL — por eso es solo dev).
 */
export async function getPresignedAssetUrl(storageKey: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string | null> {
  if (storageKey.startsWith(LOCAL_PREFIX)) {
    // El fallback local es deliberadamente privado. La descarga se realiza
    // por el endpoint autenticado /api/assets/:id/content.
    return null
  }
  if (!isS3Configured()) return null
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storageKey }),
    { expiresIn: ttlSeconds },
  )
}

/** Lee un original para streaming autenticado o para crear una publicación. */
export async function readAssetObject(storageKey: string): Promise<Buffer | null> {
  if (storageKey.startsWith(LOCAL_PREFIX)) {
    const fileName = storageKey.slice(LOCAL_PREFIX.length)
    if (fileName !== sanitizeFilename(fileName)) return null
    return readFile(path.join(LOCAL_ASSET_DIR, fileName)).catch(() => null)
  }
  if (!isS3Configured()) return null
  const response = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storageKey }))
  if (!response.Body) return null
  return Buffer.from(await response.Body.transformToByteArray())
}

function publicAssetBaseUrl(): string | null {
  const raw = process.env.ASSET_PUBLIC_BASE_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null
    return raw.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * Crea una copia pública inmutable. Nunca cambia ACL ni URL del original
 * privado. `checksum` en la clave hace que el contenido de una URL no cambie.
 */
export async function publishAssetObject(input: {
  orgId: string
  assetId: string
  storageKey: string
  checksum: string
  extension: string
  mimeType: string
}): Promise<{ storageKey: string; publicUrl: string }> {
  if (isS3Configured()) {
    const base = publicAssetBaseUrl()
    if (!base) throw new Error('ASSET_PUBLIC_BASE_URL es obligatorio para publicar assets')
    const storageKey = `public/org/${input.orgId}/assets/${input.assetId}/${input.checksum}.${sanitizeFilename(input.extension)}`
    const source = `${process.env.S3_BUCKET!}/${input.storageKey.split('/').map(encodeURIComponent).join('/')}`
    await s3.send(new CopyObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: storageKey,
      CopySource: source,
      ContentType: input.mimeType,
      MetadataDirective: 'REPLACE',
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    const encodedKey = storageKey.split('/').map(encodeURIComponent).join('/')
    return { storageKey, publicUrl: `${base}/${encodedKey}` }
  }

  if (process.env.NODE_ENV === 'production') throw new Error('S3/R2 es obligatorio para publicar assets')
  const body = await readAssetObject(input.storageKey)
  if (!body) throw new Error('No se encontró el original privado')
  const saved = await saveGeneratedFile(body, input.extension)
  if (!saved) throw new Error(`No se puede publicar el formato ${input.extension} en desarrollo local`)
  return { storageKey: `${PUBLISHED_LOCAL_PREFIX}${saved.fileName}`, publicUrl: saved.publicUrl }
}

/** Borra el binario. Idempotente: un objeto ya ausente no es un error. */
export async function deleteAssetObject(storageKey: string): Promise<void> {
  if (storageKey.startsWith(PUBLISHED_LOCAL_PREFIX)) {
    const fileName = storageKey.slice(PUBLISHED_LOCAL_PREFIX.length)
    if (fileName !== sanitizeFilename(fileName)) return
    await unlink(path.join(MEDIA_DIR, fileName)).catch(() => undefined)
    return
  }
  if (storageKey.startsWith(LOCAL_PREFIX)) {
    const fileName = storageKey.slice(LOCAL_PREFIX.length)
    // Defensa en profundidad: la clave viene de nuestra BD, pero un nombre
    // con separadores jamás debe llegar a unlink.
    if (fileName !== sanitizeFilename(fileName)) return
    try {
      await unlink(path.join(LOCAL_ASSET_DIR, fileName))
    } catch {
      // Ya no existe o el disco es de otra réplica: nada que hacer.
    }
    return
  }
  if (!isS3Configured()) return
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storageKey }))
}
