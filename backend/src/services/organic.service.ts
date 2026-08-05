import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { getOrganicDataQuality } from './organicDataQuality.service'
import { buildOrganicNarrative, getUnifiedFunnel } from './organicChannels.service'
import { applyHoursToSnapshots, getHoursPerQualified, getPieceRanking } from './organicEffort.service'
import { evaluateMaturedActions, getOutcomeSummary } from './organicOutcome.service'
import { getTopOrganicPages } from './organicGoogleIngest.service'
import { getAutonomyConfig } from './organicAutonomy.service'
import { getPolicy } from './adPolicy.service'
import { writeAuditLog } from '../lib/audit'

export const ORGANIC_INTEGRATION_PROVIDERS = [
  'search_console',
  'ga4',
  'google_business_profile',
] as const

export type OrganicIntegrationProvider = (typeof ORGANIC_INTEGRATION_PROVIDERS)[number]

export interface CreateOrganicProjectInput {
  name: string
  website?: string | null
  services?: string[]
  locations?: string[]
  averageLeadValueCents?: number | null
  currency?: string
  config?: Record<string, unknown> | null
}

export type UpdateOrganicProjectInput = Partial<CreateOrganicProjectInput> & { isActive?: boolean }

export interface CreateOrganicAssetInput {
  projectId?: string
  opportunityId?: string | null
  type: string
  title: string
  content?: Record<string, unknown> | null
  targetUrl?: string | null
}

export interface CreateOrganicActionInput {
  type: string
  title: string
  description?: string | null
  priority?: number
  dueAt?: string | null
  metadata?: Record<string, unknown> | null
}

export class OrganicProjectNotFoundError extends Error {
  constructor() {
    super('Proyecto Organic Leads no encontrado')
    this.name = 'OrganicProjectNotFoundError'
  }
}

export class OrganicProjectAlreadyExistsError extends Error {
  constructor() {
    super('La organización ya tiene un proyecto Organic Leads')
    this.name = 'OrganicProjectAlreadyExistsError'
  }
}

export class OrganicOpportunityNotFoundError extends Error {
  constructor() {
    super('Oportunidad orgánica no encontrada')
    this.name = 'OrganicOpportunityNotFoundError'
  }
}

export class OrganicProjectOwnershipError extends Error {
  constructor() {
    super('El recurso no pertenece al proyecto Organic Leads indicado')
    this.name = 'OrganicProjectOwnershipError'
  }
}

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined
  return value === null ? Prisma.DbNull : value as Prisma.InputJsonValue
}

function asDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

async function findProject(orgId: string) {
  return prisma.organicProject.findUnique({ where: { orgId } })
}

async function requireProject(orgId: string, projectId?: string) {
  const project = projectId
    ? await prisma.organicProject.findFirst({ where: { id: projectId, orgId } })
    : await findProject(orgId)
  if (!project) throw new OrganicProjectNotFoundError()
  return project
}

async function ensureIntegrationRows(orgId: string, projectId: string) {
  await prisma.organicIntegration.createMany({
    data: ORGANIC_INTEGRATION_PROVIDERS.map(provider => ({ orgId, projectId, provider })),
    skipDuplicates: true,
  })
}

export async function getOrganicProject(orgId: string) {
  const project = await findProject(orgId)
  if (!project) return null
  await ensureIntegrationRows(orgId, project.id)
  return prisma.organicProject.findUnique({
    where: { id: project.id },
    include: { integrations: { orderBy: { provider: 'asc' } } },
  })
}

export async function createOrganicProject(
  orgId: string,
  actorUserId: string,
  input: CreateOrganicProjectInput,
) {
  if (await findProject(orgId)) throw new OrganicProjectAlreadyExistsError()

  const project = await prisma.organicProject.create({
    data: {
      orgId,
      name: input.name,
      website: input.website,
      services: input.services ?? [],
      locations: input.locations ?? [],
      averageLeadValueCents: input.averageLeadValueCents,
      currency: input.currency ?? 'EUR',
      config: asJson(input.config),
      integrations: {
        create: ORGANIC_INTEGRATION_PROVIDERS.map(provider => ({ orgId, provider })),
      },
    },
    include: { integrations: { orderBy: { provider: 'asc' } } },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.project.create',
    entityType: 'OrganicProject',
    entityId: project.id,
    after: project,
  })
  return project
}

export async function updateOrganicProject(
  orgId: string,
  actorUserId: string,
  input: UpdateOrganicProjectInput,
) {
  const before = await requireProject(orgId)
  const project = await prisma.organicProject.update({
    where: { id: before.id },
    data: {
      name: input.name,
      website: input.website,
      services: input.services,
      locations: input.locations,
      averageLeadValueCents: input.averageLeadValueCents,
      currency: input.currency,
      config: asJson(input.config),
      isActive: input.isActive,
    },
    include: { integrations: { orderBy: { provider: 'asc' } } },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.project.update',
    entityType: 'OrganicProject',
    entityId: project.id,
    before,
    after: project,
  })
  return project
}

export async function createOrganicAssetDraft(
  orgId: string,
  actorUserId: string,
  input: CreateOrganicAssetInput,
) {
  const project = await requireProject(orgId, input.projectId)
  if (input.opportunityId) {
    const opportunity = await prisma.organicOpportunity.findFirst({
      where: { id: input.opportunityId, orgId, projectId: project.id },
    })
    if (!opportunity) throw new OrganicOpportunityNotFoundError()
  }

  const asset = await prisma.organicAsset.create({
    data: {
      orgId,
      projectId: project.id,
      opportunityId: input.opportunityId,
      type: input.type,
      title: input.title,
      status: 'draft',
      content: asJson(input.content),
      targetUrl: input.targetUrl,
      createdById: actorUserId,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.asset.create_draft',
    entityType: 'OrganicAsset',
    entityId: asset.id,
    after: asset,
  })
  return asset
}

export async function createOrganicActionFromOpportunity(
  orgId: string,
  actorUserId: string,
  opportunityId: string,
  input: CreateOrganicActionInput,
) {
  const opportunity = await prisma.organicOpportunity.findFirst({ where: { id: opportunityId, orgId } })
  if (!opportunity) throw new OrganicOpportunityNotFoundError()

  const action = await prisma.organicAction.create({
    data: {
      orgId,
      projectId: opportunity.projectId,
      opportunityId: opportunity.id,
      type: input.type,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 0,
      dueAt: asDate(input.dueAt),
      metadata: asJson(input.metadata),
      createdById: actorUserId,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.action.create',
    entityType: 'OrganicAction',
    entityId: action.id,
    after: action,
  })
  return action
}

/** Períodos admitidos por la página. `period` dejaba de filtrar: era decorativo. */
// '12m' es la etiqueta que usa el selector de la pagina; se acepta tal cual
// en vez de obligar al front a hablar otro idioma.
const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365, '365d': 365 }
const DEFAULT_PERIOD = '90d'

function resolvePeriod(period?: string) {
  const key = period && PERIOD_DAYS[period] ? period : DEFAULT_PERIOD
  return { key, days: PERIOD_DAYS[key], since: new Date(Date.now() - PERIOD_DAYS[key] * 86_400_000) }
}

/**
 * Bloque `policy` del contrato §7.1. Es lo que la pantalla necesita para no
 * prometer autonomía que no existe: el nivel concedido, si sigue en sombra y si
 * alguien tiró del freno compartido con Ads.
 */
async function autonomyPolicyBlock(orgId: string) {
  const [config, adPolicy] = await Promise.all([getAutonomyConfig(orgId), getPolicy(orgId)])
  return {
    autonomyLevel: adPolicy.killSwitchEnabled ? 'N1' : config.level,
    mode: config.shadowMode ? 'shadow' : 'live',
    killSwitchEnabled: adPolicy.killSwitchEnabled,
    killSwitchReason: adPolicy.killSwitchReason,
  }
}

export async function getOrganicOverview(orgId: string, options: { period?: string; projectId?: string } = {}) {
  const period = resolvePeriod(options.period)
  const project = await getOrganicProject(orgId)
  if (!project) {
    return {
      project: null,
      kpis: {
        organicLeads: 0,
        opportunities: 0,
        openOpportunities: 0,
        estimatedValueCents: 0,
        assets: 0,
        draftAssets: 0,
        actions: 0,
        pendingActions: 0,
      },
      opportunities: [],
      actions: [],
      assets: [],
      integrations: [],
      setupRequired: true,
      // Contrato de organico.md §7.1. Sin proyecto no se mide nada, y eso se
      // dice con `null` en vez de con ceros que parecerian resultados.
      period: { key: period.key, days: period.days },
      profile: { sectors: [], onboarding: { status: 'not_started', level: 0 } },
      dataQuality: await getOrganicDataQuality(orgId, null),
      summary: {
        fast: { organicLeads: null, visits: null, presence: null },
        mature: { qualified: null, opportunities: null, sales: null, hoursInvested: null, hoursPerQualified: null },
        deepestEligibleSignal: null,
      },
      funnel: [],
      channels: [],
      recommendations: [],
      weeklyNarrative: null,
      policy: await autonomyPolicyBlock(orgId),
    }
  }

  const [
    opportunityCount,
    openOpportunityCount,
    valueAggregate,
    assetCount,
    draftAssetCount,
    actionCount,
    pendingActionCount,
    opportunities,
    actions,
    assets,
    eventLeads,
    opportunityLeads,
  ] = await Promise.all([
    prisma.organicOpportunity.count({ where: { orgId, projectId: project.id } }),
    prisma.organicOpportunity.count({ where: { orgId, projectId: project.id, status: { notIn: ['closed', 'closed_won', 'closed_lost', 'archived'] } } }),
    prisma.organicOpportunity.aggregate({
      where: { orgId, projectId: project.id, status: { notIn: ['closed_lost', 'archived'] } },
      _sum: { estimatedValueCents: true },
    }),
    prisma.organicAsset.count({ where: { orgId, projectId: project.id } }),
    prisma.organicAsset.count({ where: { orgId, projectId: project.id, status: 'draft' } }),
    prisma.organicAction.count({ where: { orgId, projectId: project.id } }),
    prisma.organicAction.count({ where: { orgId, projectId: project.id, status: { in: ['pending', 'in_progress'] } } }),
    prisma.organicOpportunity.findMany({ where: { orgId, projectId: project.id }, orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }], take: 50 }),
    prisma.organicAction.findMany({ where: { orgId, projectId: project.id }, orderBy: [{ status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }], take: 50 }),
    prisma.organicAsset.findMany({ where: { orgId, projectId: project.id }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    prisma.acquisitionEvent.findMany({
      where: {
        orgId,
        leadId: { not: null },
        // El período dejó de ser decorativo: filtra de verdad.
        createdAt: { gte: period.since },
        OR: [
          { source: { contains: 'organic', mode: 'insensitive' } },
          { medium: { contains: 'organic', mode: 'insensitive' } },
          { type: { in: ['prospect_import', 'landing_lead'] } },
        ],
        // Mismo criterio que el embudo (`isOrganicEvent`): un `landing_lead`
        // de una campaña de pago no es un lead orgánico.
        NOT: {
          OR: [
            { medium: { in: ['paid_social', 'cpc', 'ppc', 'paid', 'display', 'retargeting'] } },
            { source: { in: ['meta', 'facebook_ads', 'google_ads', 'adwords', 'tiktok_ads'] } },
          ],
        },
      },
      select: { leadId: true },
      distinct: ['leadId'],
    }),
    prisma.organicOpportunity.findMany({ where: { orgId, projectId: project.id, leadId: { not: null } }, select: { leadId: true }, distinct: ['leadId'] }),
  ])

  const organicLeadIds = new Set([
    ...eventLeads.map(item => item.leadId).filter((id): id is string => Boolean(id)),
    ...opportunityLeads.map(item => item.leadId).filter((id): id is string => Boolean(id)),
  ])

  const kpis = {
    organicLeads: organicLeadIds.size,
    opportunities: opportunityCount,
    openOpportunities: openOpportunityCount,
    estimatedValueCents: valueAggregate._sum.estimatedValueCents ?? 0,
    assets: assetCount,
    draftAssets: draftAssetCount,
    actions: actionCount,
    pendingActions: pendingActionCount,
  }

  // ── Contrato de organico.md §7.1 ──────────────────────────────────────────
  // Se recorre el mismo hilo que Ads y con las mismas definiciones: un lead
  // cualificado no puede contar distinto según el canal que lo trajo (§5.2).
  const leadIds = Array.from(organicLeadIds)
  const [qualifiedLeads, leadOpportunities] = leadIds.length
    ? await Promise.all([
        prisma.lead.count({
          where: { orgId, id: { in: leadIds }, calls: { some: { outcome: { in: [...QUALIFYING_CALL_OUTCOMES] } } } },
        }),
        prisma.opportunity.findMany({
          where: { orgId, leadId: { in: leadIds } },
          select: { stage: true },
        }),
      ])
    : [0, [] as Array<{ stage: string }>]

  const sales = leadOpportunities.filter(item => item.stage === 'closed_won').length
  const dataQuality = await getOrganicDataQuality(orgId, project.id)
  // El orden importa: `getUnifiedFunnel` reconstruye los snapshots cuando están
  // caducados, y esa reconstrucción los escribe con `hoursInvested` a null. Si
  // las horas se aplicaran antes, la reconstrucción las borraría.
  const unified = await getUnifiedFunnel(orgId, project.id, period.key, period.days)
  await applyHoursToSnapshots(orgId, project.id, period.key, period.days)
  const [hoursPerQualified, pieces, pages] = await Promise.all([
    getHoursPerQualified(orgId, project.id, period.key),
    getPieceRanking(orgId, period.since),
    // El detalle que hace útil la ingesta de GA4: a qué páginas llega el
    // tráfico orgánico, no solo cuánto hay.
    getTopOrganicPages(orgId, project.id, period.since),
  ])
  const hoursByChannel = new Map(hoursPerQualified.map(item => [item.channel, item]))
  const hourValues = hoursPerQualified
    .map(item => item.hoursInvested)
    .filter((value): value is number => value != null)
  // `null` si no hay ni una pieza publicada: 0 h diria que se publico gratis.
  const totalHours = hourValues.length
    ? Math.round(hourValues.reduce((sum, value) => sum + value, 0) * 10) / 10
    : null

  // El informe recibe los canales ya enriquecidos con sus horas, para poder
  // hablar del coste en tiempo sin recalcularlo.
  const channelsWithHours = unified.channels.map(channel => ({
    ...channel,
    hoursInvested: hoursByChannel.get(channel.channel)?.hoursInvested ?? channel.hoursInvested,
    hoursPerQualified: hoursByChannel.get(channel.channel)?.hoursPerQualified ?? null,
  }))

  // Se evalua lo que haya madurado antes de redactar: el informe debe poder
  // decir que paso con lo que se recomendo, no solo que se recomendo algo.
  await evaluateMaturedActions(orgId)
  const outcomes = await getOutcomeSummary(orgId)

  const narrative = buildOrganicNarrative({
    periodDays: period.days,
    funnel: unified.funnel,
    channels: channelsWithHours,
    outcomes,
  })

  return {
    project,
    kpis,
    opportunities,
    actions,
    assets,
    integrations: project.integrations,
    setupRequired: opportunityCount === 0 && assetCount === 0 && actionCount === 0 && organicLeadIds.size === 0,

    period: { key: period.key, days: period.days },
    profile: {
      sectors: Array.isArray((project.config as Record<string, unknown> | null)?.sectors)
        ? (project.config as { sectors: string[] }).sectors
        : [],
      // El onboarding adaptativo (§4) llega en la fase 1: se declara su
      // ausencia en vez de fingir que el perfil está completo.
      onboarding: { status: 'not_started', level: 0 },
    },
    dataQuality,
    summary: {
      fast: {
        organicLeads: organicLeadIds.size,
        // Del embudo, que ya suma lo ingerido de GA4 y del Perfil de Empresa.
        // Siguen siendo `null` —no cero— mientras esas fuentes no traigan nada:
        // "sin medición" y "nadie visitó la web" son afirmaciones distintas.
        visits: unified.funnel.find(step => step.key === 'visit')?.value ?? null,
        presence: unified.funnel.find(step => step.key === 'presence')?.value ?? null,
      },
      mature: {
        qualified: leadIds.length ? qualifiedLeads : null,
        opportunities: leadIds.length ? leadOpportunities.length : null,
        sales: leadIds.length ? sales : null,
        hoursInvested: totalHours,
        hoursPerQualified: totalHours != null && qualifiedLeads > 0
          ? Math.round((totalHours / qualifiedLeads) * 10) / 10
          : null,
      },
      deepestEligibleSignal: sales > 0 ? 'sale' : qualifiedLeads > 0 ? 'qualified_lead' : organicLeadIds.size > 0 ? 'lead' : null,
    },
    funnel: unified.funnel,
    /** Cada canal con su coste en tiempo al lado (§5.2). */
    channels: channelsWithHours,
    /** Ranking por pieza: qué publicación concreta trajo leads (§5.4). */
    pieces,
    /** Páginas con más tráfico orgánico, de la ingesta de GA4. */
    pages,
    /** Qué pasó con lo despachado: la prueba de valor de la fase 3. */
    outcomes,
    // Las recomendaciones con prioridad económica y despacho a los brazos son
    // la fase 2: se declaran vacías en vez de inventarlas.
    recommendations: [],
    weeklyNarrative: narrative,
    policy: await autonomyPolicyBlock(orgId),
  }
}

export async function getOrganicIntegrations(orgId: string) {
  const project = await getOrganicProject(orgId)
  return {
    integrations: project?.integrations ?? [],
    setupRequired: !project,
  }
}
