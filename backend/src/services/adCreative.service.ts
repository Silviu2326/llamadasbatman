import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { AdPlanConflictError } from './adPlan.service'

/**
 * Briefs y creatividades del nivel de campaña global.
 *
 * `CreativeBrief` es el puente hacia el Creator Studio: encarga piezas para un
 * canal y una audiencia. `AdCreative` es la pieza producida, con flujo de
 * aprobación (draft → in_review → approved | rejected) porque una creatividad
 * publicada gasta dinero real y alguien tiene que responder por ella.
 * `assetId` es una referencia blanda a `Asset` —mismo criterio que
 * Asset.campaignId—: borrar la biblioteca no rompe la creatividad.
 */

/** Entrada inválida detectable en el servicio (defensa además del Zod del controller). */
export class CreativeValidationError extends Error {
  readonly statusCode = 400
  constructor(message: string) {
    super(message)
    this.name = 'CreativeValidationError'
  }
}

export interface BriefCreateInput {
  campaignId: string
  activationId?: string | null
  audienceId?: string | null
  channel?: 'meta' | 'google'
  format?: string | null
  message?: Record<string, unknown>
  cta?: string | null
  destination?: string | null
  references?: string[]
  restrictions?: string | null
  variantCount?: number | null
}

export type BriefPatchInput = Omit<BriefCreateInput, 'campaignId'>

/**
 * Comprueba que la activación pertenezca a la org y a esa campaña, y que la
 * audiencia sea de la org y utilizable por la campaña (propia u org-level).
 * Devuelve false ante cualquier referencia ajena: el controller lo traduce a
 * 404 sin distinguir "no existe" de "no es tuya".
 */
async function referencesAreUsable(
  orgId: string,
  campaignId: string,
  refs: { activationId?: string | null; audienceId?: string | null }
) {
  if (refs.activationId) {
    const activation = await prisma.adActivation.findFirst({
      where: { id: refs.activationId, orgId, campaignId },
      select: { id: true },
    })
    if (!activation) return false
  }
  if (refs.audienceId) {
    const audience = await prisma.adAudience.findFirst({
      where: { id: refs.audienceId, orgId, OR: [{ campaignId }, { campaignId: null }] },
      select: { id: true },
    })
    if (!audience) return false
  }
  return true
}

export async function createBrief(orgId: string, input: BriefCreateInput) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, orgId },
    select: { id: true, landingSlug: true },
  })
  if (!campaign) return null
  const usable = await referencesAreUsable(orgId, campaign.id, input)
  if (!usable) return null

  return prisma.creativeBrief.create({
    data: {
      orgId,
      campaignId: campaign.id,
      activationId: input.activationId ?? null,
      audienceId: input.audienceId ?? null,
      channel: input.channel ?? 'meta',
      format: input.format ?? null,
      // El destino por defecto es la landing de la campaña global: un brief
      // sin destino mandaría tráfico pagado a ninguna parte.
      destination: input.destination ?? campaign.landingSlug ?? null,
      message: (input.message ?? undefined) as object | undefined,
      cta: input.cta ?? null,
      references: input.references ?? [],
      restrictions: input.restrictions ?? null,
      variantCount: input.variantCount ?? 1,
    },
  })
}

export async function updateBrief(orgId: string, briefId: string, patch: BriefPatchInput) {
  const brief = await prisma.creativeBrief.findFirst({ where: { id: briefId, orgId } })
  if (!brief) return null
  const usable = await referencesAreUsable(orgId, brief.campaignId, patch)
  if (!usable) return null

  return prisma.creativeBrief.update({
    where: { id: brief.id },
    data: {
      activationId: patch.activationId,
      audienceId: patch.audienceId,
      channel: patch.channel,
      format: patch.format,
      message: patch.message as object | undefined,
      cta: patch.cta,
      destination: patch.destination,
      references: patch.references,
      restrictions: patch.restrictions,
      // variantCount no es anulable en el esquema: "límpialo" equivale a no tocarlo.
      variantCount: patch.variantCount ?? undefined,
    },
  })
}

/**
 * Cambia el estado del brief. 'delivered' significa "el Studio entregó las
 * piezas": marcarlo sin ninguna creatividad sería declarar entregado un
 * encargo vacío, y se bloquea.
 */
export async function setBriefStatus(orgId: string, briefId: string, status: string) {
  const brief = await prisma.creativeBrief.findFirst({
    where: { id: briefId, orgId },
    include: { _count: { select: { creatives: true } } },
  })
  if (!brief) return null
  if (status === 'delivered' && brief._count.creatives === 0) {
    throw new AdPlanConflictError(
      'No se puede marcar como entregado un brief sin creatividades.',
      'BRIEF_WITHOUT_CREATIVES'
    )
  }
  return prisma.creativeBrief.update({ where: { id: brief.id }, data: { status } })
}

export interface CreativeCreateInput {
  campaignId: string
  briefId?: string
  assetId?: string | null
  format?: string | null
  headline?: string | null
  primaryText?: string | null
  description?: string | null
  cta?: string | null
}

export type CreativePatchInput = Omit<CreativeCreateInput, 'campaignId' | 'briefId'>

export async function createCreative(orgId: string, input: CreativeCreateInput) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, orgId },
    select: { id: true },
  })
  if (!campaign) return null

  let brief: { id: string; status: string } | null = null
  if (input.briefId) {
    brief = await prisma.creativeBrief.findFirst({
      where: { id: input.briefId, orgId, campaignId: campaign.id },
      select: { id: true, status: true },
    })
    if (!brief) return null
  }

  // La versión cuenta dentro del brief: la tercera pieza del encargo es la v3
  // aunque la org lleve cien creatividades. Sin brief no hay serie: v1.
  const version = brief ? (await prisma.adCreative.count({ where: { briefId: brief.id } })) + 1 : 1

  const creative = await prisma.adCreative.create({
    data: {
      orgId,
      campaignId: campaign.id,
      briefId: brief?.id ?? null,
      assetId: input.assetId ?? null,
      format: input.format ?? null,
      headline: input.headline ?? null,
      primaryText: input.primaryText ?? null,
      description: input.description ?? null,
      cta: input.cta ?? null,
      version,
      approvalStatus: 'draft',
    },
  })

  // La primera pieza saca el brief de 'draft': ya hay alguien trabajándolo.
  if (brief && brief.status === 'draft') {
    await prisma.creativeBrief.update({ where: { id: brief.id }, data: { status: 'in_studio' } })
  }
  return creative
}

/**
 * Editable solo en draft o rejected. Editar una rechazada la devuelve a draft
 * y limpia el motivo: la nueva versión tiene que volver a pasar por revisión
 * y no debe cargar con el veredicto de la anterior.
 */
export async function updateCreative(orgId: string, creativeId: string, patch: CreativePatchInput) {
  const creative = await prisma.adCreative.findFirst({ where: { id: creativeId, orgId } })
  if (!creative) return null
  if (creative.approvalStatus !== 'draft' && creative.approvalStatus !== 'rejected') {
    throw new AdPlanConflictError(
      `Una creatividad en "${creative.approvalStatus}" no se puede editar.`,
      'CREATIVE_NOT_EDITABLE'
    )
  }
  return prisma.adCreative.update({
    where: { id: creative.id },
    data: {
      assetId: patch.assetId,
      format: patch.format,
      headline: patch.headline,
      primaryText: patch.primaryText,
      description: patch.description,
      cta: patch.cta,
      ...(creative.approvalStatus === 'rejected'
        ? { approvalStatus: 'draft', rejectedReason: null }
        : {}),
    },
  })
}

function assertApprovalTransition(current: string, expected: string, target: string) {
  if (current !== expected) {
    throw new AdPlanConflictError(
      `Una creatividad en "${current}" no puede pasar a "${target}".`,
      'INVALID_STATUS_TRANSITION'
    )
  }
}

export async function submitCreative(orgId: string, creativeId: string) {
  const creative = await prisma.adCreative.findFirst({ where: { id: creativeId, orgId } })
  if (!creative) return null
  assertApprovalTransition(creative.approvalStatus, 'draft', 'in_review')
  return prisma.adCreative.update({ where: { id: creative.id }, data: { approvalStatus: 'in_review' } })
}

export async function approveCreative(orgId: string, actorUserId: string, creativeId: string) {
  const creative = await prisma.adCreative.findFirst({ where: { id: creativeId, orgId } })
  if (!creative) return null
  assertApprovalTransition(creative.approvalStatus, 'in_review', 'approved')
  const updated = await prisma.adCreative.update({
    where: { id: creative.id },
    data: { approvalStatus: 'approved', approvedById: actorUserId, approvedAt: new Date() },
  })
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.creative.approved',
    entityType: 'AdCreative',
    entityId: creative.id,
    before: { approvalStatus: creative.approvalStatus },
    after: { approvalStatus: updated.approvalStatus },
  })
  return updated
}

/**
 * El motivo es obligatorio: es lo único que aprende el equipo (y el Studio)
 * de un rechazo. Se valida también aquí, no solo en el Zod del controller,
 * para que ningún llamador interno pueda rechazar en silencio.
 */
export async function rejectCreative(orgId: string, actorUserId: string, creativeId: string, reason: string) {
  const trimmed = reason?.trim()
  if (!trimmed || trimmed.length < 3) {
    throw new CreativeValidationError('Explica por qué rechazas la creatividad.')
  }
  const creative = await prisma.adCreative.findFirst({ where: { id: creativeId, orgId } })
  if (!creative) return null
  assertApprovalTransition(creative.approvalStatus, 'in_review', 'rejected')
  const updated = await prisma.adCreative.update({
    where: { id: creative.id },
    data: { approvalStatus: 'rejected', rejectedReason: trimmed },
  })
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.creative.rejected',
    entityType: 'AdCreative',
    entityId: creative.id,
    before: { approvalStatus: creative.approvalStatus },
    after: { approvalStatus: updated.approvalStatus, rejectedReason: trimmed },
  })
  return updated
}
