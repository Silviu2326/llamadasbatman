import { prisma } from '../lib/prisma'

/**
 * Audiencias del nivel de campaña global. Una audiencia con campaignId es de
 * esa campaña; con campaignId null es reutilizable en toda la organización.
 * No se borran nunca: se archivan, porque un brief antiguo debe poder seguir
 * diciendo a quién apuntaba.
 */

export interface AudienceInput {
  name?: string
  campaignId?: string | null
  segment?: string | null
  location?: string | null
  ageRange?: string | null
  interests?: string[]
  customAudiences?: string[]
  exclusions?: string[]
  estimatedSize?: number | null
  dataSource?: string | null
  consentBasis?: string | null
}

/**
 * Con campaignId: las de esa campaña más las org-level (reutilizables). Sin
 * él: todas las de la organización. Las archivadas solo salen si se piden
 * explícitamente; por defecto una audiencia archivada no debe poder elegirse.
 */
export async function listAudiences(
  orgId: string,
  opts: { campaignId?: string; includeArchived?: boolean } = {}
) {
  return prisma.adAudience.findMany({
    where: {
      orgId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.campaignId ? { OR: [{ campaignId: opts.campaignId }, { campaignId: null }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/** Devuelve null si la campaña indicada no existe o es de otra organización. */
export async function createAudience(orgId: string, input: AudienceInput & { name: string }) {
  if (input.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: input.campaignId, orgId },
      select: { id: true },
    })
    if (!campaign) return null
  }
  return prisma.adAudience.create({
    data: {
      orgId,
      name: input.name,
      campaignId: input.campaignId ?? null,
      segment: input.segment ?? null,
      location: input.location ?? null,
      ageRange: input.ageRange ?? null,
      interests: input.interests ?? [],
      customAudiences: input.customAudiences ?? [],
      exclusions: input.exclusions ?? [],
      estimatedSize: input.estimatedSize ?? null,
      dataSource: input.dataSource ?? null,
      consentBasis: input.consentBasis ?? null,
    },
  })
}

export async function updateAudience(orgId: string, audienceId: string, patch: AudienceInput) {
  const audience = await prisma.adAudience.findFirst({ where: { id: audienceId, orgId } })
  if (!audience) return null
  // Reasignar la audiencia a una campaña exige que esa campaña sea de la org:
  // aceptar un id ajeno filtraría la existencia de campañas de otros clientes.
  if (patch.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: patch.campaignId, orgId },
      select: { id: true },
    })
    if (!campaign) return null
  }
  return prisma.adAudience.update({
    where: { id: audience.id },
    data: {
      name: patch.name,
      campaignId: patch.campaignId,
      segment: patch.segment,
      location: patch.location,
      ageRange: patch.ageRange,
      interests: patch.interests,
      customAudiences: patch.customAudiences,
      exclusions: patch.exclusions,
      estimatedSize: patch.estimatedSize,
      dataSource: patch.dataSource,
      consentBasis: patch.consentBasis,
    },
  })
}

/**
 * Idempotente a propósito: archivar dos veces no es un error y no debe mover
 * la fecha original (la primera vez que dejó de usarse es la que importa).
 */
export async function archiveAudience(orgId: string, audienceId: string) {
  const audience = await prisma.adAudience.findFirst({ where: { id: audienceId, orgId } })
  if (!audience) return null
  if (!audience.archivedAt) {
    await prisma.adAudience.update({ where: { id: audience.id }, data: { archivedAt: new Date() } })
  }
  return { ok: true as const }
}
