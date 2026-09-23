import { prisma } from '../lib/prisma'

/** Entitlements are server policy, never UI state. Unknown plans fail closed. */
export const PLAN_KEYS = ['free', 'pro', 'completo', 'agency'] as const
export type PlanKey = (typeof PLAN_KEYS)[number]

export const CAPABILITIES = [
  'crm',
  'ads',
  'organic',
  'social',
  'email_marketing',
  'prospecting',
  'agents',
  'automations',
  'integrations',
  'microapps',
  'growth',
  'revenue_intelligence',
  'advanced_analytics',
  'team_management',
  'multiworkspace',
] as const
export type Capability = (typeof CAPABILITIES)[number]

export const LIMIT_RESOURCES = ['users', 'leads', 'campaigns', 'agents', 'automations', 'workspaces'] as const
export type LimitResource = (typeof LIMIT_RESOURCES)[number]

export type PlanPolicy = Readonly<{
  key: PlanKey
  capabilities: readonly Capability[]
  limits: Readonly<Record<LimitResource, number>>
}>

// Ads forma parte de la captación base: cualquier plan puede consultar y
// configurar su operación. Las acciones con coste siguen requiriendo los
// permisos de Ads y de gasto definidos por cada rol.
// Agentes está disponible en todos los planes; la cuota sigue limitando
// cuántos agentes puede tener cada organización.
const CORE_CAPABILITIES: readonly Capability[] = ['crm', 'ads', 'agents']
const PRO_CAPABILITIES: readonly Capability[] = [
  ...CORE_CAPABILITIES,
  'organic', 'social', 'prospecting', 'automations',
  'integrations', 'microapps', 'growth', 'revenue_intelligence', 'advanced_analytics',
]
const COMPLETE_CAPABILITIES: readonly Capability[] = [
  ...PRO_CAPABILITIES,
  'email_marketing', 'team_management',
]

const freezeList = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values])
const freezeLimits = (values: Record<LimitResource, number>) => Object.freeze({ ...values })

const LIMITS: Readonly<Record<PlanKey, Readonly<Record<LimitResource, number>>>> = Object.freeze({
  free: freezeLimits({ users: 3, leads: 500, campaigns: 3, agents: 1, automations: 5, workspaces: 1 }),
  pro: freezeLimits({ users: 10, leads: 10_000, campaigns: 25, agents: 5, automations: 50, workspaces: 1 }),
  completo: freezeLimits({ users: 50, leads: 100_000, campaigns: 250, agents: 25, automations: 250, workspaces: 1 }),
  agency: freezeLimits({ users: 500, leads: 1_000_000, campaigns: 2_500, agents: 250, automations: 2_500, workspaces: 100 }),
})

const CAPABILITIES_BY_PLAN: Readonly<Record<PlanKey, readonly Capability[]>> = Object.freeze({
  free: freezeList(CORE_CAPABILITIES),
  pro: freezeList(PRO_CAPABILITIES),
  completo: freezeList(COMPLETE_CAPABILITIES),
  agency: freezeList<Capability>([...COMPLETE_CAPABILITIES, 'multiworkspace']),
})

const PLAN_ALIASES: Readonly<Record<string, PlanKey>> = {
  free: 'free', gratis: 'free', basic: 'free', basico: 'free', 'básico': 'free', starter: 'free',
  pro: 'pro', profesional: 'pro',
  completo: 'completo', premium: 'completo', enterprise: 'completo',
  agencia: 'agency', agency: 'agency',
}

export function normalisePlan(value: unknown): PlanKey {
  if (typeof value !== 'string') return 'free'
  const raw = value.trim().toLowerCase()
  const canonical = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return PLAN_ALIASES[raw] ?? PLAN_ALIASES[canonical] ?? 'free'
}

export function planPolicy(value: unknown): PlanPolicy {
  const key = normalisePlan(value)
  return Object.freeze({ key, capabilities: CAPABILITIES_BY_PLAN[key], limits: LIMITS[key] })
}

const knownCapabilities = new Set<string>(CAPABILITIES)
const knownLimitResources = new Set<string>(LIMIT_RESOURCES)

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && knownCapabilities.has(value)
}

export function isLimitResource(value: unknown): value is LimitResource {
  return typeof value === 'string' && knownLimitResources.has(value)
}

export function hasCapability(plan: unknown, capability: Capability): boolean {
  return isCapability(capability) && planPolicy(plan).capabilities.includes(capability)
}

export type OrganizationAccessRow = {
  id: string
  plan: string
  metricoolEnabled: boolean
}

export type EntitlementDatabase = {
  organization: { findUnique(args: unknown): Promise<OrganizationAccessRow | null> }
  user: { count(args: unknown): Promise<number> }
  lead: { count(args: unknown): Promise<number> }
  campaign: { count(args: unknown): Promise<number> }
  agent: { count(args: unknown): Promise<number> }
  automation: { count(args: unknown): Promise<number> }
}

export type EntitlementUsage = Readonly<Record<LimitResource, number>>
export type EntitlementSnapshot = Readonly<{
  orgId: string
  plan: PlanKey
  capabilities: readonly Capability[]
  limits: Readonly<Record<LimitResource, number>>
  usage: EntitlementUsage
  integrations: Readonly<{ metricoolEnabled: boolean }>
}>

export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 403 | 404 | 409,
    public readonly code: 'ORGANIZATION_NOT_FOUND' | 'PLAN_CAPABILITY_REQUIRED' | 'LIMIT_REACHED' | 'CONSUMPTION_LIMIT_REACHED' | 'INTEGRATION_DISABLED',
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'EntitlementError'
  }
}

function assertOrgId(orgId: unknown): asserts orgId is string {
  if (typeof orgId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(orgId)) {
    throw new EntitlementError('La organizacion activa no es valida', 404, 'ORGANIZATION_NOT_FOUND')
  }
}

// Only snapshots issued by this module can be reused between guards. A plain
// object attached to a request is never trusted as a policy decision.
const issuedSnapshots = new WeakSet<object>()

export async function getEntitlementSnapshot(orgId: string, db: EntitlementDatabase = prisma): Promise<EntitlementSnapshot> {
  assertOrgId(orgId)
  const organization = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, plan: true, metricoolEnabled: true },
  })
  if (!organization || organization.id !== orgId) {
    throw new EntitlementError('La organizacion activa no existe', 404, 'ORGANIZATION_NOT_FOUND', { orgId })
  }

  const policy = planPolicy(organization.plan)
  const [users, leads, campaigns, agents, automations] = await Promise.all([
    db.user.count({ where: { orgId } }),
    db.lead.count({ where: { orgId } }),
    db.campaign.count({ where: { orgId } }),
    db.agent.count({ where: { orgId } }),
    db.automation.count({ where: { orgId } }),
  ])

  const snapshot = Object.freeze({
    orgId,
    plan: policy.key,
    capabilities: policy.capabilities,
    limits: policy.limits,
    // Secondary agency workspaces are resolved by workspaceAccess. The
    // organization itself is always the primary workspace.
    usage: Object.freeze({ users, leads, campaigns, agents, automations, workspaces: 1 }),
    integrations: Object.freeze({ metricoolEnabled: Boolean(organization.metricoolEnabled) }),
  }) as EntitlementSnapshot
  issuedSnapshots.add(snapshot)
  return snapshot
}

function trustedSnapshot(orgId: string, snapshot: EntitlementSnapshot | undefined): EntitlementSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || !issuedSnapshots.has(snapshot as object) || snapshot.orgId !== orgId) return null
  return snapshot
}

export async function assertCapability(
  orgId: string,
  capability: Capability,
  options: { snapshot?: EntitlementSnapshot; integration?: 'metricool'; db?: EntitlementDatabase } = {},
): Promise<EntitlementSnapshot> {
  const snapshot = trustedSnapshot(orgId, options.snapshot) ?? await getEntitlementSnapshot(orgId, options.db)
  if (!isCapability(capability) || !snapshot.capabilities.includes(capability)) {
    throw new EntitlementError(
      `La capacidad "${String(capability)}" no esta incluida en el plan ${snapshot.plan}`,
      403,
      'PLAN_CAPABILITY_REQUIRED',
      { capability, plan: snapshot.plan, upgradeRequired: true },
    )
  }
  if (options.integration === 'metricool' && !snapshot.integrations.metricoolEnabled) {
    throw new EntitlementError('La integracion social no esta habilitada para esta organizacion', 403, 'INTEGRATION_DISABLED', { integration: 'metricool' })
  }
  return snapshot
}

export async function assertUsageLimit(
  orgId: string,
  resource: LimitResource,
  increment = 1,
  snapshot?: EntitlementSnapshot,
  db: EntitlementDatabase = prisma,
): Promise<EntitlementSnapshot> {
  if (!isLimitResource(resource) || !Number.isSafeInteger(increment) || increment < 1) {
    throw new EntitlementError('El incremento de uso no es valido', 409, 'LIMIT_REACHED', { resource })
  }
  const current = trustedSnapshot(orgId, snapshot) ?? await getEntitlementSnapshot(orgId, db)
  const limit = current.limits[resource]
  const usage = current.usage[resource]
  if (!Number.isSafeInteger(usage) || !Number.isSafeInteger(limit) || usage < 0 || limit < 0 || usage + increment > limit) {
    throw new EntitlementError(
      `Has alcanzado el limite de ${resource} de tu plan ${current.plan}`,
      409,
      'LIMIT_REACHED',
      { resource, usage, requested: increment, limit, plan: current.plan },
    )
  }
  return current
}
