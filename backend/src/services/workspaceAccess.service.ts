import { prisma } from '../lib/prisma'
import { isKnownRole, planPolicy, type KnownRole, type PermissionScope } from '../access-control'

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_CONFIGURED_GRANTS = 5_000
const MAX_ISSUED_GRANTS = 100

export type WorkspaceGrant = Readonly<{
  workspaceId: string
  role: KnownRole
  scope: PermissionScope
  source: 'primary' | 'agency_config'
  agencyOrgId?: string
}>

type ConfiguredGrant = {
  agencyOrgId: string
  userId?: string
  email?: string
  workspaceId: string
  role: KnownRole
  scope: PermissionScope
}

type WorkspaceRequest = {
  headers: Record<string, string | string[] | undefined>
  user?: unknown
  workspaceId?: string
  workspacePrimaryOrgId?: string
  workspacePrimaryRole?: KnownRole
}

export class WorkspaceAccessError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 403 | 404,
    public readonly code: 'WORKSPACE_ACCESS_DENIED' | 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_CONFIGURATION_INVALID',
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'WorkspaceAccessError'
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && value.trim() === value
}

function normaliseEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const email = value.trim().toLowerCase()
  return email.length <= 320 && email.includes('@') ? email : undefined
}

function parseConfiguredGrants(): ConfiguredGrant[] {
  const raw = process.env.AGENCY_WORKSPACE_GRANTS_JSON?.trim()
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length > MAX_CONFIGURED_GRANTS) throw new Error('array')
    return parsed.flatMap((entry): ConfiguredGrant[] => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      const agencyOrgId = item.agencyOrgId
      const workspaceId = item.workspaceId
      const role = item.role
      const userId = item.userId
      const email = normaliseEmail(item.email)
      const scope = item.scope ?? 'org'
      if (!validId(agencyOrgId) || !validId(workspaceId) || !isKnownRole(role) || !isPermissionScope(scope)) return []
      if (!validId(userId) && !email) return []
      return [{
        agencyOrgId,
        workspaceId,
        role,
        scope,
        ...(validId(userId) ? { userId } : {}),
        ...(email ? { email } : {}),
      }]
    })
  } catch {
    throw new WorkspaceAccessError(
      'La configuracion de workspaces de agencia no es valida',
      403,
      'WORKSPACE_CONFIGURATION_INVALID',
    )
  }
}

function isPermissionScope(value: unknown): value is PermissionScope {
  return value === 'own' || value === 'team' || value === 'org'
}

export type WorkspaceIdentity = Readonly<{
  userId: string
  email: string
  orgId: string
  role: string
}>

/**
 * Builds server-authoritative claims. The JWT copy is only a presentation
 * hint; applyWorkspaceContext recomputes these grants from server config on
 * every request, so revoking a grant does not wait for token expiry.
 */
export function getWorkspaceGrantsForUser(identity: WorkspaceIdentity): WorkspaceGrant[] {
  if (!isKnownRole(identity.role) || !validId(identity.orgId) || !validId(identity.userId)) return []
  const email = normaliseEmail(identity.email)
  const byWorkspace = new Map<string, WorkspaceGrant>()
  byWorkspace.set(identity.orgId, { workspaceId: identity.orgId, role: identity.role, scope: 'org', source: 'primary' })

  for (const grant of parseConfiguredGrants()) {
    if (grant.agencyOrgId !== identity.orgId || grant.workspaceId === identity.orgId) continue
    const sameUser = grant.userId === identity.userId
    const sameEmail = Boolean(email && grant.email && grant.email === email)
    if (!sameUser && !sameEmail) continue
    if (!byWorkspace.has(grant.workspaceId)) {
      byWorkspace.set(grant.workspaceId, {
        workspaceId: grant.workspaceId,
        role: grant.role,
        scope: grant.scope,
        source: 'agency_config',
        agencyOrgId: grant.agencyOrgId,
      })
    }
    if (byWorkspace.size >= MAX_ISSUED_GRANTS) break
  }
  return [...byWorkspace.values()]
}

function primaryClaims(request: WorkspaceRequest, claims: Record<string, unknown>): { orgId: string; role: KnownRole } {
  const existingOrg = request.workspacePrimaryOrgId
  const existingRole = request.workspacePrimaryRole
  const tokenOrg = claims.primaryOrgId
  const tokenRole = claims.primaryRole
  const orgId = existingOrg ?? (validId(tokenOrg) ? tokenOrg : claims.orgId)
  const role = existingRole ?? (isKnownRole(tokenRole) ? tokenRole : claims.role)

  if (!validId(orgId) || !isKnownRole(role)) {
    throw new WorkspaceAccessError('Los claims de workspace no son validos', 403, 'WORKSPACE_ACCESS_DENIED')
  }
  // A first invocation must not accept a token that claims one primary tenant
  // while carrying another active tenant. Later invocations use request-local
  // immutable context and may legitimately have rebound claims.
  if (!existingOrg && (validId(tokenOrg) && claims.orgId !== tokenOrg || isKnownRole(tokenRole) && claims.role !== tokenRole)) {
    throw new WorkspaceAccessError('Los claims de workspace son inconsistentes', 403, 'WORKSPACE_ACCESS_DENIED')
  }
  request.workspacePrimaryOrgId = orgId
  request.workspacePrimaryRole = role
  claims.primaryOrgId = orgId
  claims.primaryRole = role
  return { orgId, role }
}

function requestedWorkspace(request: WorkspaceRequest, primaryOrgId: string): string {
  const raw = request.headers['x-workspace-id']
  if (Array.isArray(raw)) {
    if (raw.length !== 1 || typeof raw[0] !== 'string') {
      throw new WorkspaceAccessError('El workspace solicitado no es valido', 403, 'WORKSPACE_ACCESS_DENIED')
    }
    return raw[0].trim() || primaryOrgId
  }
  return raw?.trim() || primaryOrgId
}

function uniqueGrants(grants: readonly WorkspaceGrant[]): WorkspaceGrant[] {
  return [...new Map(grants.map(grant => [grant.workspaceId, grant] as const)).values()]
}

export async function applyWorkspaceContext(request: WorkspaceRequest): Promise<void> {
  const user = request.user
  if (!user || typeof user !== 'object') return
  const claims = user as Record<string, unknown>
  const { orgId: primaryOrgId, role: primaryRole } = primaryClaims(request, claims)
  const workspaceId = requestedWorkspace(request, primaryOrgId)
  if (!validId(workspaceId)) throw new WorkspaceAccessError('El workspace solicitado no es valido', 403, 'WORKSPACE_ACCESS_DENIED')

  const identity: WorkspaceIdentity = {
    userId: typeof claims.userId === 'string' ? claims.userId : '',
    email: typeof claims.email === 'string' ? claims.email : '',
    orgId: primaryOrgId,
    role: primaryRole,
  }
  const verified = getWorkspaceGrantsForUser(identity)

  if (workspaceId === primaryOrgId) {
    request.workspaceId = workspaceId
    claims.orgId = primaryOrgId
    claims.role = primaryRole
    claims.workspaceScope = 'org'
    return
  }

  const primaryOrganization = await prisma.organization.findUnique({ where: { id: primaryOrgId }, select: { id: true, plan: true } })
  if (!primaryOrganization) {
    throw new WorkspaceAccessError('La organizacion principal no existe', 404, 'WORKSPACE_NOT_FOUND', { workspaceId: primaryOrgId })
  }
  const policy = planPolicy(primaryOrganization.plan)
  if (!policy.capabilities.includes('multiworkspace')) {
    throw new WorkspaceAccessError('El plan de la agencia no permite cambiar de workspace', 403, 'WORKSPACE_ACCESS_DENIED', { workspaceId })
  }
  const grant = uniqueGrants(verified).slice(0, policy.limits.workspaces).find(item => item.workspaceId === workspaceId && item.source === 'agency_config')
  if (!grant || grant.agencyOrgId !== primaryOrgId) {
    throw new WorkspaceAccessError('No tienes acceso al workspace solicitado', 403, 'WORKSPACE_ACCESS_DENIED', { workspaceId })
  }
  const organization = await prisma.organization.findUnique({ where: { id: workspaceId }, select: { id: true } })
  if (!organization) throw new WorkspaceAccessError('El workspace solicitado no existe', 404, 'WORKSPACE_NOT_FOUND', { workspaceId })

  // Rebinding is always derived from the verified grant and can be repeated
  // safely without widening the scope to org or changing the primary tenant.
  request.workspaceId = workspaceId
  claims.orgId = workspaceId
  claims.role = grant.role
  claims.workspaceScope = grant.scope
}

export async function listAccessibleWorkspaces(identity: WorkspaceIdentity): Promise<Array<{
  id: string
  name: string
  role: KnownRole
  scope: PermissionScope
  primary: boolean
}>> {
  const primaryOrganization = await prisma.organization.findUnique({ where: { id: identity.orgId }, select: { id: true, plan: true } })
  if (!primaryOrganization) throw new WorkspaceAccessError('La organizacion principal no existe', 404, 'WORKSPACE_NOT_FOUND')
  const policy = planPolicy(primaryOrganization.plan)
  const configuredGrants = getWorkspaceGrantsForUser(identity)
  const grants = uniqueGrants(policy.capabilities.includes('multiworkspace') ? configuredGrants : configuredGrants.slice(0, 1))
    .slice(0, policy.limits.workspaces)
  if (!grants.length) return []
  const organizations = await prisma.organization.findMany({
    where: { id: { in: grants.map(grant => grant.workspaceId) } },
    select: { id: true, name: true },
  })
  const names = new Map(organizations.map(org => [org.id, org.name]))
  return grants.filter(grant => names.has(grant.workspaceId)).map(grant => ({
    id: grant.workspaceId,
    name: names.get(grant.workspaceId) as string,
    role: grant.role,
    scope: grant.scope,
    primary: grant.source === 'primary',
  }))
}
