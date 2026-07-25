import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
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

export async function getOrganicOverview(orgId: string) {
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
        OR: [
          { source: { contains: 'organic', mode: 'insensitive' } },
          { medium: { contains: 'organic', mode: 'insensitive' } },
        ],
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

  return {
    project,
    kpis,
    opportunities,
    actions,
    assets,
    integrations: project.integrations,
    setupRequired: opportunityCount === 0 && assetCount === 0 && actionCount === 0 && organicLeadIds.size === 0,
  }
}

export async function getOrganicIntegrations(orgId: string) {
  const project = await getOrganicProject(orgId)
  return {
    integrations: project?.integrations ?? [],
    setupRequired: !project,
  }
}
