import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  deleteAssetObject,
  getPresignedAssetUrl,
  publishAssetObject,
  putAssetObject,
  readAssetObject,
} from '../lib/storage'
import { detectImageType } from './generatedMedia.service'
import { checkAssetsConsentForPublication } from './consent.service'

/**
 * Biblioteca universal de activos (docs/plataforma-abierta/02-FUNDAMENTOS.md §2).
 *
 * Toda operación filtra SIEMPRE por orgId en el `where` (mismo criterio que el
 * resto de servicios y que lib/dataScope.ts): un id filtrado de otra org debe
 * comportarse como inexistente, nunca como prohibido.
 */

export type AssetKind = 'image' | 'video' | 'audio' | 'document' | 'dataset' | 'text'
export type AssetStatus = 'draft' | 'approved' | 'published' | 'archived'
export type AssetAccessClass = 'private' | 'shared' | 'published'

const MAX_ASSET_BYTES = Math.max(1, Number(process.env.ASSET_MAX_BYTES ?? 250 * 1024 * 1024))

interface DetectedFile {
  kind: AssetKind
  mimeType: string
  extension: string
}

/**
 * Detección por magic bytes: nunca se confía en el content-type declarado.
 * Las imágenes reutilizan `detectImageType` de generatedMedia.service.ts; los
 * audios cubren los dos formatos que produce contentVoiceover.service.ts
 * (WAV de Chatterbox, MP3 de ElevenLabs).
 */
export function detectAssetFile(buffer: Buffer, fallback?: { kind?: AssetKind; mimeType?: string }): DetectedFile {
  const image = detectImageType(buffer)
  if (image === 'png') return { kind: 'image', mimeType: 'image/png', extension: 'png' }
  if (image === 'jpg') return { kind: 'image', mimeType: 'image/jpeg', extension: 'jpg' }
  if (image === 'webp') return { kind: 'image', mimeType: 'image/webp', extension: 'webp' }

  // WAV: "RIFF" + "WAVE". Cuidado con WebP, que también es RIFF — ya quedó
  // descartado arriba por detectImageType.
  if (buffer.length > 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WAVE') {
    return { kind: 'audio', mimeType: 'audio/wav', extension: 'wav' }
  }
  // MP3: cabecera ID3 o frame sync MPEG (0xFF 0xE0+).
  if (buffer.length > 3 && (buffer.subarray(0, 3).toString('latin1') === 'ID3' || (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0))) {
    return { kind: 'audio', mimeType: 'audio/mpeg', extension: 'mp3' }
  }
  // SVG: es texto, no tiene magic bytes binarios; se busca la etiqueta raíz.
  const head = buffer.subarray(0, 512).toString('utf8')
  if (/<svg[\s>]/i.test(head)) return { kind: 'image', mimeType: 'image/svg+xml', extension: 'svg' }
  if (buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return { kind: 'document', mimeType: 'application/pdf', extension: 'pdf' }
  }
  // ISO-BMFF (MP4/MOV): box `ftyp` a partir del byte 4.
  if (buffer.length > 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    return { kind: 'video', mimeType: 'video/mp4', extension: 'mp4' }
  }
  // WebM/Matroska EBML y OGG (audio o vídeo).
  if (buffer.length > 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { kind: 'video', mimeType: 'video/webm', extension: 'webm' }
  }
  if (buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === 'OggS') {
    return { kind: fallback?.kind === 'video' ? 'video' : 'audio', mimeType: 'audio/ogg', extension: 'ogg' }
  }

  return {
    kind: fallback?.kind ?? 'document',
    mimeType: fallback?.mimeType ?? 'application/octet-stream',
    extension: 'bin',
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Proyección ligera compartida por lista y genealogía. */
const LIGHT_SELECT = {
  id: true,
  kind: true,
  mimeType: true,
  bytes: true,
  status: true,
  provider: true,
  model: true,
  campaignId: true,
  contentPieceId: true,
  brandScope: true,
  createdAt: true,
  accessClass: true,
  publishedUrl: true,
} as const

export interface CreateAssetInput {
  orgId: string
  buffer: Buffer
  filename?: string
  kind?: AssetKind
  mimeType?: string
  provider?: string
  model?: string
  prompt?: string
  params?: Record<string, unknown>
  costCents?: number
  jobId?: string
  parentAssetId?: string
  sourceAssets?: Array<{ id: string; role: string }>
  campaignId?: string
  contentPieceId?: string
  brandScope?: string
  createdById?: string
}

/**
 * Sube el binario y crea la fila Asset. Si la org ya tiene un asset con el
 * mismo sha256 se devuelve el existente (una regeneración idéntica no debe
 * duplicar almacenamiento ni biblioteca), salvo `allowDuplicate`.
 */
export async function createAssetFromBuffer(input: CreateAssetInput) {
  if (!input.buffer.length) throw new Error('El asset está vacío')
  if (input.buffer.length > MAX_ASSET_BYTES) throw new Error(`El asset supera el límite de ${MAX_ASSET_BYTES} bytes`)
  const checksum = sha256(input.buffer)

  const sourceAssets = [
    ...(input.parentAssetId ? [{ id: input.parentAssetId, role: 'source' }] : []),
    ...(input.sourceAssets ?? []),
  ]
  if (sourceAssets.some(source => !source.role.trim() || source.role.length > 80)) {
    throw new Error('role de genealogía inválido')
  }
  if (sourceAssets.length) {
    const sourceIds = [...new Set(sourceAssets.map(source => source.id))]
    const found = await prisma.asset.count({ where: { orgId: input.orgId, id: { in: sourceIds } } })
    if (found !== sourceIds.length) throw new Error('Uno o más assets de origen no existen en la organización')
  }

  const existing = await prisma.asset.findUnique({ where: { orgId_checksum: { orgId: input.orgId, checksum } } })
  if (existing) {
    // Deduplicar el binario no debe borrar una nueva procedencia. Un mismo
    // archivo puede participar en varias producciones/jobs y necesita todas
    // sus aristas; createMany+skipDuplicates mantiene el reintento idempotente.
    const relations = sourceAssets
      .filter(source => source.id !== existing.id)
      .map(source => ({ orgId: input.orgId, parentId: source.id, childId: existing.id, role: source.role.trim() }))
    if (relations.length) await prisma.assetRelation.createMany({ data: relations, skipDuplicates: true })
    return existing
  }

  const detected = detectAssetFile(input.buffer, { kind: input.kind, mimeType: input.mimeType })
  // El id se genera aquí (no en Prisma) porque la clave de almacenamiento lo
  // incluye y el binario se sube antes de crear la fila: si la subida falla,
  // no queda una fila apuntando a un objeto que no existe.
  const assetId = randomUUID()
  const filename = input.filename ?? `original.${detected.extension}`

  const { storageKey } = await putAssetObject({
    orgId: input.orgId,
    assetId,
    filename,
    body: input.buffer,
    contentType: detected.mimeType,
  })

  try {
    return await prisma.$transaction(async tx => tx.asset.create({
      data: {
      id: assetId,
      orgId: input.orgId,
      kind: detected.kind,
      mimeType: detected.mimeType,
      storageKey,
      bytes: BigInt(input.buffer.length),
      checksum,
      jobId: input.jobId ?? null,
      parentAssetId: input.parentAssetId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      prompt: input.prompt ?? null,
      params: (input.params ?? undefined) as never,
      costCents: input.costCents ?? null,
      campaignId: input.campaignId ?? null,
      contentPieceId: input.contentPieceId ?? null,
      brandScope: input.brandScope ?? null,
      createdById: input.createdById ?? null,
      inputs: sourceAssets.length ? {
        create: sourceAssets.map(source => ({
          orgId: input.orgId,
          parentId: source.id,
          role: source.role.trim(),
        })),
      } : undefined,
    },
    }))
  } catch (error) {
    await deleteAssetObject(storageKey).catch(() => undefined)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.asset.findUnique({ where: { orgId_checksum: { orgId: input.orgId, checksum } } })
      if (duplicate) return duplicate
    }
    throw error
  }
}

export interface CreateAssetVersionInput {
  orgId: string
  assetId: string
  buffer: Buffer
  label: string
  params?: Record<string, unknown>
  costCents?: number
  idempotencyKey?: string
}

/** Nueva versión de un asset existente ("upscaled-magnific", "subtitled-es"...). */
export async function createAssetVersion(input: CreateAssetVersionInput) {
  if (!input.buffer.length || input.buffer.length > MAX_ASSET_BYTES) throw new Error('Tamaño de versión inválido')
  const idempotencyKey = input.idempotencyKey?.trim() || undefined
  if (idempotencyKey) {
    const existing = await prisma.assetVersion.findUnique({
      where: { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey } },
    })
    if (existing) return existing
  }
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, orgId: input.orgId },
    select: { id: true, kind: true, mimeType: true },
  })
  if (!asset) return null

  const detected = detectAssetFile(input.buffer, { kind: asset.kind as AssetKind, mimeType: asset.mimeType })
  // La versión vive bajo el prefijo del asset padre; el sufijo aleatorio evita
  // pisar otra versión con el mismo label.
  const safeLabel = input.label.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'version'
  const { storageKey } = await putAssetObject({
    orgId: input.orgId,
    assetId: asset.id,
    filename: `${safeLabel}-${randomUUID().slice(0, 8)}.${detected.extension}`,
    body: input.buffer,
    contentType: detected.mimeType,
  })

  try {
    return await prisma.assetVersion.create({
      data: {
      orgId: input.orgId,
      assetId: asset.id,
      storageKey,
      label: input.label,
      params: (input.params ?? undefined) as never,
      costCents: input.costCents ?? null,
      idempotencyKey,
    },
    })
  } catch (error) {
    await deleteAssetObject(storageKey).catch(() => undefined)
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.assetVersion.findUnique({
        where: { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey } },
      })
    }
    throw error
  }
}

export interface ListAssetsInput {
  orgId: string
  kind?: AssetKind
  status?: AssetStatus
  campaignId?: string
  cursor?: string
  limit?: number
}

/** Lista paginada por cursor con proyección ligera (sin prompt/params/license). */
export async function listAssets(input: ListAssetsInput) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const items = await prisma.asset.findMany({
    where: {
      orgId: input.orgId,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    },
    select: LIGHT_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })
  const hasMore = items.length > limit
  const page = hasMore ? items.slice(0, limit) : items
  return {
    items: page.map(item => ({ ...item, bytes: item.bytes.toString() })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  }
}

/** Detalle con URL prefirmada y genealogía inmediata (padre + versiones). */
export async function getAsset(input: { orgId: string; id: string }) {
  const asset = await prisma.asset.findFirst({
    where: { id: input.id, orgId: input.orgId },
    include: {
      parent: { select: LIGHT_SELECT },
      versions: { orderBy: { createdAt: 'desc' } },
      inputs: { include: { parent: { select: LIGHT_SELECT } }, orderBy: { createdAt: 'asc' } },
      outputs: { include: { child: { select: LIGHT_SELECT } }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!asset) return null
  const url = await getPresignedAssetUrl(asset.storageKey)
  return {
    ...asset,
    bytes: asset.bytes.toString(),
    parent: asset.parent ? { ...asset.parent, bytes: asset.parent.bytes.toString() } : null,
    inputs: asset.inputs.map(relation => ({ ...relation, parent: { ...relation.parent, bytes: relation.parent.bytes.toString() } })),
    outputs: asset.outputs.map(relation => ({ ...relation, child: { ...relation.child, bytes: relation.child.bytes.toString() } })),
    url,
  }
}

/** Solo la URL de descarga temporal, para no cargar el detalle entero. */
export async function getAssetDownloadUrl(input: { orgId: string; id: string; ttlSeconds?: number }) {
  const asset = await prisma.asset.findFirst({
    where: { id: input.id, orgId: input.orgId },
    select: { storageKey: true, mimeType: true, accessClass: true, publishedUrl: true },
  })
  if (!asset) return null
  const url = await getPresignedAssetUrl(asset.storageKey, input.ttlSeconds)
  if (url) return { url, mimeType: asset.mimeType, requiresAuth: false }
  // Fallback local privado: el binario solo sale por esta ruta autenticada.
  return { url: `/api/assets/${input.id}/content`, mimeType: asset.mimeType, requiresAuth: true }
}

export async function getAssetContent(input: { orgId: string; id: string }) {
  const asset = await prisma.asset.findFirst({
    where: { id: input.id, orgId: input.orgId },
    select: { storageKey: true, mimeType: true },
  })
  if (!asset) return null
  const body = await readAssetObject(asset.storageKey)
  return body ? { body, mimeType: asset.mimeType } : null
}

/** Relaciona dos assets existentes de la misma organización, idempotente. */
export async function createAssetRelation(input: { orgId: string; parentId: string; childId: string; role: string }) {
  const role = input.role.trim()
  if (!role || role.length > 80 || input.parentId === input.childId) throw new Error('Relación de asset inválida')
  const found = await prisma.asset.count({ where: { orgId: input.orgId, id: { in: [input.parentId, input.childId] } } })
  if (found !== 2) return null
  return prisma.assetRelation.upsert({
    where: { parentId_childId_role: { parentId: input.parentId, childId: input.childId, role } },
    update: {},
    create: { orgId: input.orgId, parentId: input.parentId, childId: input.childId, role },
  })
}

/** Publica una copia estable e inmutable; el original no cambia de ACL. */
export async function publishAsset(input: { orgId: string; id: string }) {
  const asset = await prisma.asset.findFirst({ where: { id: input.id, orgId: input.orgId } })
  if (!asset) return null
  if (asset.accessClass === 'published' && asset.publishedStorageKey && asset.publishedUrl) return asset
  const consent = await checkAssetsConsentForPublication({ orgId: input.orgId, assetIds: [asset.id] })
  if (!consent.valid) {
    throw Object.assign(
      new Error(`Publicación bloqueada por consentimiento de identidad: ${consent.reason ?? 'consentimiento no válido'}`),
      { code: 'ASSET_CONSENT_INVALID', assetId: consent.assetId ?? asset.id },
    )
  }
  if (!asset.checksum) throw new Error('El asset no tiene checksum y no puede publicarse de forma inmutable')
  const extension = detectAssetFile(await readAssetObject(asset.storageKey) ?? Buffer.alloc(0), {
    kind: asset.kind as AssetKind,
    mimeType: asset.mimeType,
  }).extension
  const published = await publishAssetObject({
    orgId: input.orgId,
    assetId: asset.id,
    storageKey: asset.storageKey,
    checksum: asset.checksum,
    extension,
    mimeType: asset.mimeType,
  })
  try {
    return await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: 'published',
        accessClass: 'published',
        publishedStorageKey: published.storageKey,
        publishedUrl: published.publicUrl,
        publishedAt: new Date(),
      },
    })
  } catch (error) {
    // La clave pública es content-addressed e idempotente. No se borra aquí:
    // otra publicación concurrente podría haber enlazado ya la misma copia.
    throw error
  }
}
