// Consentimiento de identidad — docs/plataforma-abierta/08-SEGURIDAD-Y-DERECHOS.md §2.
//
// `ConsentGrant` cubre el uso de la identidad de una persona en contenido
// generado (voz clonada, rostro, avatar, personaje, testimonio, estilo
// escrito). Es hermano del `ContactConsent` existente, que cubre el canal de
// contacto comercial: no se mezclan.
//
// La evaluación de validez (caducidad + alcance) vive en una función pura
// (`evaluateConsent`) para poder testearla sin base de datos.
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export const CONSENT_KINDS = ['voice', 'face', 'avatar', 'character', 'testimonial', 'written_style'] as const
export type ConsentKind = (typeof CONSENT_KINDS)[number]

export const CONSENT_STATUSES = ['active', 'expired', 'revoked'] as const
export type ConsentStatus = (typeof CONSENT_STATUSES)[number]

/** Alcance del consentimiento. Listas vacías = sin restricción en esa dimensión. */
export interface ConsentScope {
  channels?: string[]
  regions?: string[]
  purposes?: string[]
  exclusions?: string[]
}

export interface ConsentCheckResult {
  valid: boolean
  reason?: string
  /** Para mensajes accionables ("bloqueado: consentimiento de <sujeto> revocado"). */
  subjectName?: string
}

/** Forma mínima del grant que necesita la evaluación pura. */
export interface EvaluableGrant {
  status: string
  revokedAt: Date | null
  expiresAt: Date | null
  scope: unknown
}

function scopeList(scope: unknown, key: keyof ConsentScope): string[] {
  if (!scope || typeof scope !== 'object') return []
  const value = (scope as Record<string, unknown>)[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim().toLowerCase())
}

/**
 * Lógica pura de validez de un consentimiento: estado, caducidad y alcance.
 *
 * - `null` → no existe (o no es de la org): inválido.
 * - Revocado o caducado → inválido, aunque el status en BD no se haya
 *   actualizado todavía (`expiredNow` avisa al servicio para que lo marque).
 * - `scope.purposes`/`scope.channels`: listas vacías = sin restricción; con
 *   contenido, lo pedido tiene que estar incluido.
 * - `scope.exclusions` gana siempre: algo listado ahí queda fuera aunque el
 *   resto del alcance lo permita.
 */
export function evaluateConsent(
  grant: EvaluableGrant | null,
  opts: { purpose?: string; channel?: string; now?: Date } = {},
): ConsentCheckResult & { expiredNow?: boolean } {
  if (!grant) return { valid: false, reason: 'El consentimiento no existe' }
  const now = opts.now ?? new Date()

  if (grant.status === 'revoked' || grant.revokedAt) {
    return { valid: false, reason: 'El consentimiento fue revocado' }
  }
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) {
    // Si en BD sigue 'active', el servicio lo marca 'expired' de paso.
    return { valid: false, reason: 'El consentimiento ha caducado', expiredNow: grant.status === 'active' }
  }
  if (grant.status !== 'active') {
    return { valid: false, reason: `El consentimiento no está activo (estado: ${grant.status})` }
  }

  const exclusions = scopeList(grant.scope, 'exclusions')
  const purpose = opts.purpose?.trim().toLowerCase()
  const channel = opts.channel?.trim().toLowerCase()

  if (purpose && exclusions.includes(purpose)) {
    return { valid: false, reason: `El propósito «${opts.purpose}» está excluido explícitamente del consentimiento` }
  }
  if (channel && exclusions.includes(channel)) {
    return { valid: false, reason: `El canal «${opts.channel}» está excluido explícitamente del consentimiento` }
  }

  if (purpose) {
    const purposes = scopeList(grant.scope, 'purposes')
    if (purposes.length && !purposes.includes(purpose)) {
      return { valid: false, reason: `El propósito «${opts.purpose}» no está dentro del alcance consentido` }
    }
  }
  if (channel) {
    const channels = scopeList(grant.scope, 'channels')
    if (channels.length && !channels.includes(channel)) {
      return { valid: false, reason: `El canal «${opts.channel}» no está dentro del alcance consentido` }
    }
  }

  return { valid: true }
}

export interface CreateConsentGrantInput {
  orgId: string
  subjectName: string
  subjectContact?: string | null
  kind: ConsentKind
  scope?: ConsentScope
  evidenceAssetId?: string | null
  grantedAt?: Date
  expiresAt?: Date | null
  createdById: string
}

export async function createConsentGrant(input: CreateConsentGrantInput) {
  if (input.evidenceAssetId) {
    const evidence = await prisma.asset.findFirst({
      where: { id: input.evidenceAssetId, orgId: input.orgId },
      select: { id: true },
    })
    if (!evidence) throw Object.assign(new Error('El asset de evidencia no existe en esta organización.'), { code: 'CONSENT_EVIDENCE_INVALID', statusCode: 422 })
  }
  return prisma.consentGrant.create({
    data: {
      orgId: input.orgId,
      subjectName: input.subjectName,
      subjectContact: input.subjectContact ?? null,
      kind: input.kind,
      scope: {
        channels: input.scope?.channels ?? [],
        regions: input.scope?.regions ?? [],
        purposes: input.scope?.purposes ?? [],
        exclusions: input.scope?.exclusions ?? [],
      } as Prisma.InputJsonObject,
      evidenceAssetId: input.evidenceAssetId ?? null,
      grantedAt: input.grantedAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
      createdById: input.createdById,
    },
  })
}

export async function listConsentGrants(params: { orgId: string; kind?: ConsentKind; status?: ConsentStatus }) {
  return prisma.consentGrant.findMany({
    where: {
      orgId: params.orgId,
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function getConsentGrant(params: { orgId: string; id: string }) {
  return prisma.consentGrant.findFirst({ where: { id: params.id, orgId: params.orgId } })
}

/**
 * Revoca un consentimiento y publica `consent.revoked` al outbox (08 §2.4):
 * un suscriptor puede listar los assets afectados y pausar publicaciones
 * programadas que los usen. El update y el evento van en la misma transacción
 * para que no pueda quedar la revocación sin su evento.
 */
export async function revokeConsentGrant(params: { orgId: string; id: string; revokedById: string }) {
  const grant = await prisma.consentGrant.findFirst({ where: { id: params.id, orgId: params.orgId } })
  if (!grant) return null
  if (grant.status === 'revoked') return grant

  return prisma.$transaction(async (tx) => {
    const revoked = await tx.consentGrant.update({
      where: { id: grant.id },
      data: { status: 'revoked', revokedAt: new Date() },
    })
    // Mismo patrón que meetings.service.ts: eventId estable en el payload para
    // que el dispatcher pueda dedupe si la revocación se reintenta.
    await tx.outboxEvent.create({
      data: {
        orgId: params.orgId,
        topic: 'consent.revoked',
        aggregateType: 'ConsentGrant',
        aggregateId: grant.id,
        payload: {
          eventId: `consent.revoked:${grant.id}`,
          consentGrantId: grant.id,
          revokedById: params.revokedById,
        } as Prisma.InputJsonObject,
      },
    })
    return revoked
  })
}

/**
 * ¿Es válido este consentimiento para este uso? Si el grant caducó pero su
 * status en BD sigue 'active', se marca 'expired' de paso (reconciliación
 * perezosa: no hace falta un cron para que la verdad de la BD converja).
 */
export async function isConsentValid(params: {
  orgId: string
  consentGrantId: string
  purpose?: string
  channel?: string
}): Promise<ConsentCheckResult> {
  const grant = await prisma.consentGrant.findFirst({
    where: { id: params.consentGrantId, orgId: params.orgId },
  })
  const result = evaluateConsent(grant, { purpose: params.purpose, channel: params.channel })
  if (result.expiredNow && grant) {
    await prisma.consentGrant
      .update({ where: { id: grant.id }, data: { status: 'expired' } })
      .catch(() => {}) // marcar el estado es mantenimiento, no puede tumbar la comprobación
  }
  return { valid: result.valid, ...(result.reason ? { reason: result.reason } : {}), ...(grant ? { subjectName: grant.subjectName } : {}) }
}

/** Assets que usan un consentimiento: qué queda afectado por una revocación. */
export async function listAssetsUsingGrant(params: { orgId: string; consentGrantId: string }) {
  return prisma.asset.findMany({
    where: { orgId: params.orgId, consentGrantId: params.consentGrantId },
    select: {
      id: true,
      kind: true,
      mimeType: true,
      status: true,
      campaignId: true,
      contentPieceId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
}

/** Profundidad máxima al subir por la genealogía de un asset (08 §2.3). */
const CONSENT_CHAIN_MAX_DEPTH = 5

export interface ConsentLineageNode {
  consentGrantId: string | null
  parentAssetIds: string[]
}

/** Recorrido puro N:M, reutilizable en tests: ciclos no cuelgan y un asset
 * compuesto puede arrastrar más de un consentimiento. */
export async function collectConsentGrantIds(
  assetId: string,
  load: (id: string) => Promise<ConsentLineageNode | null>,
  maxDepth = CONSENT_CHAIN_MAX_DEPTH,
): Promise<string[]> {
  const seen = new Set<string>()
  const grants = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = [{ id: assetId, depth: 0 }]
  while (queue.length) {
    const current = queue.shift()!
    if (seen.has(current.id) || current.depth >= maxDepth) continue
    seen.add(current.id)
    const node = await load(current.id)
    if (!node) continue
    if (node.consentGrantId) grants.add(node.consentGrantId)
    for (const parentAssetId of node.parentAssetIds) {
      if (!seen.has(parentAssetId)) queue.push({ id: parentAssetId, depth: current.depth + 1 })
    }
  }
  return [...grants]
}

/**
 * Resuelve el `consentGrantId` de la cadena de un asset: el suyo o, si no
 * tiene, el de su antecesor más cercano (`parentAssetId`), con límite de
 * profundidad y detección de ciclos.
 */
export async function resolveAssetConsentGrantIds(orgId: string, assetId: string): Promise<string[]> {
  return collectConsentGrantIds(assetId, async currentId => {
    const [asset, relations] = await Promise.all([
      prisma.asset.findFirst({ where: { id: currentId, orgId }, select: { consentGrantId: true, parentAssetId: true } }),
      prisma.assetRelation.findMany({ where: { orgId, childId: currentId }, select: { parentId: true } }),
    ])
    if (!asset) return null
    return {
      consentGrantId: asset.consentGrantId,
      // parentAssetId sigue durante la migración; Set evita recorrer dos veces
      // cuando la relación legacy también se materializó como AssetRelation.
      parentAssetIds: [...new Set([asset.parentAssetId, ...relations.map(relation => relation.parentId)].filter((id): id is string => Boolean(id)))],
    }
  })
}

/** Compatibilidad para consumidores antiguos que solo admiten un grant. */
export async function resolveAssetConsentGrantId(orgId: string, assetId: string): Promise<string | null> {
  return (await resolveAssetConsentGrantIds(orgId, assetId))[0] ?? null
}

/**
 * Guard de publicación (08 §2.3): comprueba que los assets de una pieza no
 * arrastran un consentimiento revocado/caducado o fuera de alcance para los
 * canales de destino. Assets sin `consentGrantId` en su cadena no bloquean
 * nada: hoy es lo normal y el comportamiento no cambia.
 */
export async function checkAssetsConsentForPublication(params: {
  orgId: string
  assetIds: string[]
  channels?: string[]
}): Promise<ConsentCheckResult & { assetId?: string }> {
  for (const assetId of params.assetIds) {
    const consentGrantIds = await resolveAssetConsentGrantIds(params.orgId, assetId)
    const channels = params.channels?.length ? params.channels : [undefined]
    for (const consentGrantId of consentGrantIds) {
      for (const channel of channels) {
        const check = await isConsentValid({ orgId: params.orgId, consentGrantId, channel })
        if (!check.valid) return { ...check, assetId }
      }
    }
  }
  return { valid: true }
}
