import type { FastifyReply, FastifyRequest } from 'fastify'
import { hasPermission, isKnownRole, isPermissionScope } from './permissions'
import type { KnownRole, Permission, PermissionScope } from './catalog'

const CLAIM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export type AccessPrincipal = Readonly<{
  userId: string
  orgId: string
  role: KnownRole
  workspaceScope: PermissionScope
}>

type ScopeResolver = PermissionScope | ((request: FastifyRequest) => PermissionScope)
type OrgResolver = (request: FastifyRequest) => string | undefined | null

export type PermissionRequirement = Readonly<{
  permission: Permission
  options?: PermissionOptions
}>

export type PermissionOptions = Readonly<{
  /** Alcance requerido por la operación; nunca se obtiene del body. */
  scope?: ScopeResolver
  /** Si la ruta expone un orgId, exige que coincida con el tenant activo. */
  resourceOrgId?: OrgResolver
}>

type RequestWithWorkspace = FastifyRequest & { workspaceId?: unknown }

function validClaimId(value: unknown): value is string {
  return typeof value === 'string' && CLAIM_ID_PATTERN.test(value) && value.trim() === value
}

/** Extrae identidad exclusivamente de los claims verificados por Fastify JWT. */
export function getAccessPrincipal(request: FastifyRequest): AccessPrincipal | null {
  const user = request.user as Partial<Record<'userId' | 'orgId' | 'role', unknown>> | undefined
  if (!user || !validClaimId(user.userId) || !validClaimId(user.orgId) || !isKnownRole(user.role)) return null

  const rawScope = (user as Record<string, unknown>).workspaceScope
  // Tokens antiguos no llevan este claim; authenticate/applyWorkspaceContext
  // lo materializa antes de ejecutar las rutas. Si aparece, debe ser válido.
  if (rawScope !== undefined && !isPermissionScope(rawScope)) return null
  const workspaceId = (request as RequestWithWorkspace).workspaceId
  if (workspaceId !== undefined && workspaceId !== user.orgId) return null

  return {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    workspaceScope: rawScope === undefined ? 'org' : rawScope,
  }
}

function allowsPermission(
  request: FastifyRequest,
  principal: AccessPrincipal,
  permission: Permission,
  options: PermissionOptions = {},
): boolean {
  const resourceOrgId = options.resourceOrgId?.(request)
  if (resourceOrgId !== undefined && resourceOrgId !== null) {
    if (!validClaimId(resourceOrgId) || resourceOrgId !== principal.orgId) return false
  }

  const requestedScope = typeof options.scope === 'function' ? options.scope(request) : options.scope
  if (requestedScope !== undefined) {
    if (!isPermissionScope(requestedScope)) return false
    const rank: Readonly<Record<PermissionScope, number>> = { own: 0, team: 1, org: 2 }
    if (rank[principal.workspaceScope] < rank[requestedScope]) return false
  }
  return hasPermission(principal.role, permission, requestedScope)
}

/** Pre-handler server-side de denegación por defecto. */
export function requirePermission(permission: Permission, options: PermissionOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = getAccessPrincipal(request)
    if (!principal || !isKnownRole(principal.role)) return reply.status(403).send({ error: 'Forbidden' })
    if (!allowsPermission(request, principal, permission, options)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}

/** Guard OR para endpoints cuyo permiso depende del recurso persistido. */
export function requireAnyPermission(...requirements: PermissionRequirement[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = getAccessPrincipal(request)
    if (!principal || !requirements.length) return reply.status(403).send({ error: 'Forbidden' })
    if (!requirements.some(({ permission, options }) => allowsPermission(request, principal, permission, options))) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}

