import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'

/**
 * Nivel de campaña global del centro de Ads.
 *
 * `Campaign` es la estrategia multicanal (objetivo, presupuesto total, periodo,
 * landing y meta comercial); `AdActivation` es su presencia en cada plataforma
 * publicitaria. Los campos metaCampaignId/metaAdSetId/metaAdId/adStatus de
 * `Campaign` siguen siendo el almacenamiento real del canal Meta —todos los
 * servicios existentes los leen y escriben—, así que la activación 'meta' se
 * DERIVA de ellos mientras no exista una fila `AdActivation` propia. Crear la
 * fila no migra nada: solo materializa lo que ya se derivaba.
 */

/** Conflictos de negocio del plan: el `code` viaja tal cual al frontend. */
export class AdPlanConflictError extends Error {
  readonly statusCode = 409
  constructor(message: string, readonly code: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'AdPlanConflictError'
  }
}

export const ACTIVATION_PLATFORMS = ['meta', 'google'] as const

// Transiciones admitidas del ciclo de vida de una activación. El estado es la
// promesa de qué revisiones se han hecho (draft→ready pasa por configurar la
// cuenta, ready→active por decidir gastar), no una etiqueta libre: cualquier
// salto no listado se rechaza aunque "parezca" avanzar.
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  unconfigured: ['draft'],
  draft: ['ready'],
  ready: ['active'],
  active: ['paused', 'finished'],
  paused: ['active', 'finished'],
  finished: [],
}

type LegacyMetaFields = {
  status: string
  metaCampaignId: string | null
  metaAdSetId: string | null
  metaAdId: string | null
  adStatus: string | null
  adPlaybookId: string | null
}

export interface ActivationView {
  /** null cuando la activación es derivada y aún no tiene fila propia */
  id: string | null
  platform: string
  status: string
  objective: string | null
  budgetCents: number | null
  startDate: Date | null
  endDate: Date | null
  adAccountRef: string | null
  conversionEvent: string | null
  health: unknown
  derivedFromLegacy: boolean
  remote: {
    metaCampaignId: string | null
    metaAdSetId: string | null
    metaAdId: string | null
    adStatus: string | null
  } | null
}

/**
 * Estado del canal Meta leído de los campos legacy de la campaña. Con id de
 * campaña remota, el canal existe de verdad: activo o pausado según la campaña
 * global. Sin id pero con borrador (adStatus o playbook), hay trabajo hecho
 * que no se debe presentar como "sin configurar".
 */
function deriveMetaStatus(campaign: LegacyMetaFields): string {
  if (campaign.metaCampaignId) return campaign.status === 'active' ? 'active' : 'paused'
  if (campaign.adStatus === 'draft' || campaign.adPlaybookId) return 'draft'
  return 'unconfigured'
}

/** Señal remota de Meta; null cuando no hay ningún rastro (nunca un objeto de nulls). */
function metaRemote(campaign: LegacyMetaFields) {
  const { metaCampaignId, metaAdSetId, metaAdId, adStatus } = campaign
  if (!metaCampaignId && !metaAdSetId && !metaAdId && !adStatus) return null
  return { metaCampaignId, metaAdSetId, metaAdId, adStatus }
}

type ActivationRow = {
  id: string
  platform: string
  status: string
  objective: string | null
  budgetCents: number | null
  startDate: Date | null
  endDate: Date | null
  adAccountRef: string | null
  conversionEvent: string | null
  health: unknown
}

function persistedActivationView(row: ActivationRow, campaign: LegacyMetaFields): ActivationView {
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    objective: row.objective,
    budgetCents: row.budgetCents,
    startDate: row.startDate,
    endDate: row.endDate,
    adAccountRef: row.adAccountRef,
    conversionEvent: row.conversionEvent,
    health: row.health ?? null,
    derivedFromLegacy: false,
    remote: row.platform === 'meta' ? metaRemote(campaign) : null,
  }
}

function derivedActivationView(platform: string, campaign: LegacyMetaFields, metaAccountId: string | null): ActivationView {
  const isMeta = platform === 'meta'
  return {
    id: null,
    platform,
    status: isMeta ? deriveMetaStatus(campaign) : 'unconfigured',
    objective: null,
    budgetCents: null,
    startDate: null,
    endDate: null,
    adAccountRef: isMeta ? metaAccountId : null,
    conversionEvent: null,
    health: null,
    derivedFromLegacy: isMeta,
    remote: isMeta ? metaRemote(campaign) : null,
  }
}

async function findConnectedMetaAccountId(orgId: string): Promise<string | null> {
  const account = await prisma.metaAdAccount.findFirst({
    where: { orgId, status: 'connected' },
    select: { id: true },
  })
  return account?.id ?? null
}

/**
 * Guardarraíl de presupuesto: la suma de lo asignado a las plataformas nunca
 * puede superar el presupuesto global de la campaña. Para sumar, una activación
 * sin presupuesto cuenta como 0 —no es una medición, es que aún no reserva
 * nada—; la distinción null/0 se conserva en las vistas, no aquí.
 */
async function assertBudgetFits(
  campaign: { id: string; budgetCents: number | null },
  proposedCents: number | null | undefined,
  exclude: { activationId?: string; platform?: string }
) {
  if (campaign.budgetCents == null || proposedCents == null) return
  const siblings = await prisma.adActivation.findMany({
    where: {
      campaignId: campaign.id,
      ...(exclude.activationId ? { id: { not: exclude.activationId } } : {}),
      ...(exclude.platform ? { platform: { not: exclude.platform } } : {}),
    },
    select: { budgetCents: true },
  })
  const assignedCents = siblings.reduce((sum, row) => sum + (row.budgetCents ?? 0), 0) + proposedCents
  if (assignedCents > campaign.budgetCents) {
    throw new AdPlanConflictError(
      'La suma de presupuestos por plataforma supera el presupuesto global de la campaña.',
      'BUDGET_EXCEEDS_GLOBAL',
      { assignedCents, globalCents: campaign.budgetCents }
    )
  }
}

/**
 * Todas las campañas globales de la organización, tengan o no señal de Meta:
 * este listado es el punto de entrada del plan, no el de las campañas ya
 * publicadas.
 */
export async function listGlobalCampaigns(orgId: string) {
  return prisma.campaign.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      objective: true,
      goal: true,
      status: true,
      budgetCents: true,
      startDate: true,
      endDate: true,
      landingSlug: true,
      totalLeads: true,
      contacted: true,
      meetingsScheduled: true,
      metaCampaignId: true,
      adStatus: true,
      createdAt: true,
    },
  })
}

/**
 * Composición completa del plan de una campaña global: presupuesto, las dos
 * activaciones (persistidas o derivadas), audiencias utilizables, briefs y
 * creatividades. Devuelve null si la campaña no existe o es de otra org.
 */
export async function getPlan(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) return null

  const [activations, audiences, briefs, creatives, spend, metaAccountId] = await Promise.all([
    prisma.adActivation.findMany({ where: { orgId, campaignId } }),
    // Las de la campaña más las reutilizables de la org (campaignId null);
    // las archivadas no aparecen en el plan: para eso está includeArchived
    // en el listado dedicado.
    prisma.adAudience.findMany({
      where: { orgId, archivedAt: null, OR: [{ campaignId }, { campaignId: null }] },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.creativeBrief.findMany({
      where: { orgId, campaignId },
      orderBy: { createdAt: 'desc' },
      include: { audience: { select: { name: true } }, _count: { select: { creatives: true } } },
    }),
    prisma.adCreative.findMany({ where: { orgId, campaignId }, orderBy: { createdAt: 'desc' } }),
    prisma.adInsightSnapshot.aggregate({
      where: { orgId, campaignId },
      _sum: { spendCents: true },
      _count: true,
    }),
    findConnectedMetaAccountId(orgId),
  ])

  // Siempre dos entradas, meta y google, exista o no fila propia: la página
  // del plan razona sobre plataformas, no sobre filas.
  const activationViews = ACTIVATION_PLATFORMS.map(platform => {
    const row = activations.find(activation => activation.platform === platform)
    return row ? persistedActivationView(row, campaign) : derivedActivationView(platform, campaign, metaAccountId)
  })

  // null = sin medición, 0 = medido y salió cero. Sin snapshots no hay gasto
  // conocido (no "gasto cero"), y sin ninguna activación con presupuesto no
  // hay reparto que mostrar.
  const withBudget = activations.filter(activation => activation.budgetCents != null)
  const assignedCents = withBudget.length
    ? withBudget.reduce((sum, activation) => sum + (activation.budgetCents ?? 0), 0)
    : null
  const spentCents = spend._count === 0 ? null : spend._sum.spendCents ?? 0
  const globalCents = campaign.budgetCents
  const availableCents = globalCents != null && spentCents != null ? globalCents - spentCents : null

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      goal: campaign.goal,
      status: campaign.status,
      budgetCents: campaign.budgetCents,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      landingSlug: campaign.landingSlug,
      totalLeads: campaign.totalLeads,
      contacted: campaign.contacted,
      meetingsScheduled: campaign.meetingsScheduled,
      marginPerSaleCents: campaign.marginPerSaleCents,
      acquisitionSharePct: campaign.acquisitionSharePct,
    },
    budget: { globalCents, assignedCents, spentCents, availableCents },
    activations: activationViews,
    audiences,
    briefs: briefs.map(({ _count, audience, ...brief }) => ({
      ...brief,
      audienceName: audience?.name ?? null,
      creativeCount: _count.creatives,
    })),
    creatives,
  }
}

export interface ActivationCreateInput {
  campaignId: string
  platform: (typeof ACTIVATION_PLATFORMS)[number]
  objective?: string | null
  budgetCents?: number | null
  startDate?: Date | null
  endDate?: Date | null
  conversionEvent?: string | null
}

/**
 * Materializa la activación de una plataforma. Para meta con señal legacy la
 * fila nace con el status que ya se derivaba y la cuenta conectada: crear la
 * fila no puede "resetear" un canal que ya estaba activo.
 */
export async function createActivation(orgId: string, input: ActivationCreateInput) {
  const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, orgId } })
  if (!campaign) return null

  const existing = await prisma.adActivation.findFirst({
    where: { campaignId: campaign.id, platform: input.platform },
    select: { id: true },
  })
  if (existing) {
    throw new AdPlanConflictError(
      `La campaña ya tiene una activación para ${input.platform}.`,
      'ACTIVATION_EXISTS'
    )
  }

  await assertBudgetFits(campaign, input.budgetCents ?? null, { platform: input.platform })

  let status = 'draft'
  let adAccountRef: string | null = null
  if (input.platform === 'meta') {
    const derived = deriveMetaStatus(campaign)
    if (derived !== 'unconfigured') {
      status = derived
      adAccountRef = await findConnectedMetaAccountId(orgId)
    }
  }

  const row = await prisma.adActivation.create({
    data: {
      orgId,
      campaignId: campaign.id,
      platform: input.platform,
      status,
      objective: input.objective ?? null,
      budgetCents: input.budgetCents ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      conversionEvent: input.conversionEvent ?? null,
      adAccountRef,
    },
  })
  return persistedActivationView(row, campaign)
}

export interface ActivationPatchInput {
  objective?: string | null
  budgetCents?: number | null
  startDate?: Date | null
  endDate?: Date | null
  conversionEvent?: string | null
  status?: string
}

/**
 * Edita una activación persistida. El cambio de estado se valida contra el
 * ciclo de vida y queda auditado: activar o parar una plataforma es una
 * decisión de gasto, no un ajuste cosmético.
 */
export async function updateActivation(
  orgId: string,
  actorUserId: string,
  activationId: string,
  patch: ActivationPatchInput
) {
  const row = await prisma.adActivation.findFirst({
    where: { id: activationId, orgId },
    include: { campaign: true },
  })
  if (!row) return null

  // Repetir el estado actual no es una transición: se ignora en vez de
  // castigar a un frontend que reenvía el formulario completo.
  const statusChanges = patch.status !== undefined && patch.status !== row.status
  if (statusChanges) {
    const allowed = VALID_STATUS_TRANSITIONS[row.status] ?? []
    if (!allowed.includes(patch.status as string)) {
      throw new AdPlanConflictError(
        `Una activación en "${row.status}" no puede pasar a "${patch.status}".`,
        'INVALID_STATUS_TRANSITION'
      )
    }
  }

  if (patch.budgetCents !== undefined) {
    await assertBudgetFits(row.campaign, patch.budgetCents, { activationId: row.id })
  }

  const updated = await prisma.adActivation.update({
    where: { id: row.id },
    data: {
      objective: patch.objective,
      budgetCents: patch.budgetCents,
      startDate: patch.startDate,
      endDate: patch.endDate,
      conversionEvent: patch.conversionEvent,
      status: statusChanges ? patch.status : undefined,
    },
  })

  if (statusChanges) {
    await writeAuditLog({
      orgId,
      actorUserId,
      action: 'ads.activation.status_changed',
      entityType: 'AdActivation',
      entityId: row.id,
      before: { status: row.status },
      after: { status: updated.status },
    })
  }
  return persistedActivationView(updated, row.campaign)
}
