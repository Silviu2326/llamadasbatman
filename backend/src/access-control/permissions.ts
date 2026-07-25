import {
  PERMISSIONS,
  ROLE_GRANTS,
  ROLE_KEYS,
  type KnownRole,
  type Permission,
  type PermissionScope,
} from './catalog'

const knownRoles = new Set<string>(ROLE_KEYS)
const knownPermissions = new Set<string>(PERMISSIONS)
const scopeRank: Readonly<Record<PermissionScope, number>> = { own: 0, team: 1, org: 2 }

export function isPermissionScope(value: unknown): value is PermissionScope {
  return value === 'own' || value === 'team' || value === 'org'
}

export function isKnownRole(role: unknown): role is KnownRole {
  return typeof role === 'string' && knownRoles.has(role)
}

export function isPermission(permission: unknown): permission is Permission {
  return typeof permission === 'string' && knownPermissions.has(permission)
}

export function permissionsForRole(role: unknown): readonly Permission[] {
  if (!isKnownRole(role)) return []
  return ROLE_GRANTS[role].map(({ permission }) => permission)
}

/**
 * Comprueba la matriz estática. Los valores desconocidos se deniegan siempre.
 * Si se solicita alcance, el concedido debe ser igual o más restrictivo.
 */
export function hasPermission(role: unknown, permission: unknown, requestedScope?: PermissionScope): boolean {
  if (!isKnownRole(role) || !isPermission(permission)) return false
  const grant = ROLE_GRANTS[role].find((candidate) => candidate.permission === permission)
  if (!grant) return false
  return requestedScope === undefined || scopeRank[grant.scope] >= scopeRank[requestedScope]
}

export function grantedScope(role: unknown, permission: unknown): PermissionScope | null {
  if (!isKnownRole(role) || !isPermission(permission)) return null
  return ROLE_GRANTS[role].find((candidate) => candidate.permission === permission)?.scope ?? null
}
