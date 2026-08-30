import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { publishAsset } from './assets.service'
import { StudioServiceError } from './studio.service'

const TOKEN_BYTES = 32
const DEFAULT_TTL_DAYS = 30
const MAX_TTL_DAYS = 180

export function hashStudioReviewToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function assetProductionId(params: unknown): string | null {
  return params && typeof params === 'object' && !Array.isArray(params) && typeof (params as Record<string, unknown>).productionId === 'string'
    ? (params as Record<string, unknown>).productionId as string
    : null
}

export function isStudioReviewTimecodeValid(timecodeMs: number, durationMs: number | null | undefined): boolean {
  const maximum = durationMs && durationMs > 0 ? durationMs : 24 * 60 * 60 * 1000
  return Number.isInteger(timecodeMs) && timecodeMs >= 0 && timecodeMs <= maximum
}

export async function createStudioReviewLink(input: {
  orgId: string
  productionId: string
  assetId: string
  createdById: string
  label?: string
  days?: number
}) {
  const production = await prisma.production.findFirst({ where: { id: input.productionId, orgId: input.orgId, archivedAt: null }, select: { id: true } })
  if (!production) throw new StudioServiceError('Producción no encontrada', 'PRODUCTION_NOT_FOUND', 404)
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, orgId: input.orgId, kind: 'video' }, select: { id: true, params: true } })
  if (!asset || assetProductionId(asset.params) !== production.id) {
    throw new StudioServiceError('El master no pertenece a esta producción', 'STUDIO_MASTER_NOT_FOUND', 404)
  }
  const published = await publishAsset({ orgId: input.orgId, id: asset.id })
  if (!published?.publishedUrl) throw new StudioServiceError('El master necesita una copia pública inmutable', 'STUDIO_MASTER_PUBLISH_FAILED', 502)
  const days = Math.min(Math.max(Math.round(input.days ?? DEFAULT_TTL_DAYS), 1), MAX_TTL_DAYS)
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const link = await prisma.studioReviewLink.create({
    data: {
      orgId: input.orgId,
      productionId: production.id,
      assetId: asset.id,
      tokenHash: hashStudioReviewToken(token),
      label: input.label?.trim().slice(0, 120) || null,
      createdById: input.createdById,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
  })
  await prisma.production.update({ where: { id: production.id }, data: { status: 'review' } })
  return { id: link.id, token, label: link.label, assetId: link.assetId, expiresAt: link.expiresAt, reviewPath: `/revisar/studio/${token}` }
}

export async function listStudioReviewLinks(orgId: string, productionId: string) {
  const links = await prisma.studioReviewLink.findMany({
    where: { orgId, productionId },
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const now = Date.now()
  return links.map(link => ({
    id: link.id,
    label: link.label,
    assetId: link.assetId,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    comments: link._count.comments,
    active: !link.revokedAt && link.expiresAt.getTime() > now,
  }))
}

export async function listStudioReviewComments(orgId: string, productionId: string) {
  return prisma.studioReviewComment.findMany({
    where: { orgId, link: { productionId } },
    select: {
      id: true, linkId: true, timecodeMs: true, body: true, authorName: true,
      status: true, resolvedAt: true, resolvedById: true, createdAt: true, updatedAt: true,
      link: { select: { label: true, assetId: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 1_000,
  })
}

export async function revokeStudioReviewLink(orgId: string, productionId: string, linkId: string) {
  const updated = await prisma.studioReviewLink.updateMany({
    where: { id: linkId, orgId, productionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (!updated.count) {
    const exists = await prisma.studioReviewLink.findFirst({ where: { id: linkId, orgId, productionId }, select: { id: true } })
    if (!exists) throw new StudioServiceError('Enlace de revisión no encontrado', 'STUDIO_REVIEW_LINK_NOT_FOUND', 404)
  }
}

async function resolveLiveLink(token: string) {
  if (!token || token.length < 20) return null
  const link = await prisma.studioReviewLink.findUnique({
    where: { tokenHash: hashStudioReviewToken(token) },
    include: {
      production: { select: { id: true, title: true, status: true } },
      asset: { select: { id: true, mimeType: true, durationMs: true, publishedUrl: true, accessClass: true } },
    },
  })
  if (!link || link.revokedAt || link.expiresAt <= new Date() || !link.asset.publishedUrl || link.asset.accessClass !== 'published') return null
  await prisma.studioReviewLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } })
  return link
}

export async function getPublicStudioReview(token: string) {
  const link = await resolveLiveLink(token)
  if (!link) return null
  const comments = await prisma.studioReviewComment.findMany({
    where: { orgId: link.orgId, linkId: link.id, status: { not: 'hidden' } },
    select: { id: true, timecodeMs: true, body: true, authorName: true, status: true, resolvedAt: true, createdAt: true },
    orderBy: [{ timecodeMs: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
  })
  return {
    production: link.production,
    asset: { id: link.asset.id, mimeType: link.asset.mimeType, durationMs: link.asset.durationMs, url: link.asset.publishedUrl },
    label: link.label,
    expiresAt: link.expiresAt,
    comments,
  }
}

export async function addPublicStudioReviewComment(input: { token: string; timecodeMs: number; body: string; authorName?: string }) {
  const link = await resolveLiveLink(input.token)
  if (!link) return null
  if (!isStudioReviewTimecodeValid(input.timecodeMs, link.asset.durationMs)) {
    throw new StudioServiceError('El timecode queda fuera de la duración del vídeo', 'STUDIO_REVIEW_TIMECODE_INVALID', 400)
  }
  return prisma.studioReviewComment.create({
    data: {
      orgId: link.orgId,
      linkId: link.id,
      timecodeMs: input.timecodeMs,
      body: input.body.trim(),
      authorName: input.authorName?.trim().slice(0, 80) || null,
    },
    select: { id: true, timecodeMs: true, body: true, authorName: true, status: true, createdAt: true },
  })
}

export async function moderateStudioReviewComment(input: {
  orgId: string
  productionId: string
  commentId: string
  status: 'open' | 'resolved' | 'hidden'
  actorUserId: string
}) {
  const comment = await prisma.studioReviewComment.findFirst({
    where: { id: input.commentId, orgId: input.orgId, link: { productionId: input.productionId } },
    select: { id: true },
  })
  if (!comment) throw new StudioServiceError('Comentario no encontrado', 'STUDIO_REVIEW_COMMENT_NOT_FOUND', 404)
  return prisma.studioReviewComment.update({
    where: { id: comment.id },
    data: {
      status: input.status,
      resolvedAt: input.status === 'resolved' ? new Date() : null,
      resolvedById: input.status === 'resolved' || input.status === 'hidden' ? input.actorUserId : null,
    },
  })
}
