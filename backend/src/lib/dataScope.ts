import { grantedScope, type Permission, type PermissionScope } from '../access-control'

export type DataActor = Readonly<{ userId: string; role: string; workspaceScope?: PermissionScope }>

/** Impossible cuid-like value used to fail closed without revealing existence. */
export const DENIED_RECORD_ID = '__rbac_denied__'

/**
 * Returns undefined for organization-wide access, the actor id for restricted
 * access, and DENIED_RECORD_ID when the permission is absent. Until Team is a
 * real domain model, `team` intentionally collapses to `own` (fail closed).
 */
export function scopedOwnerId(actor: DataActor, permission: Permission): string | undefined {
  const scope = grantedScope(actor.role, permission)
  if (!scope) return DENIED_RECORD_ID
  const workspaceScope = actor.workspaceScope ?? 'org'
  const rank: Readonly<Record<PermissionScope, number>> = { own: 0, team: 1, org: 2 }
  const effectiveScope = rank[scope] <= rank[workspaceScope] ? scope : workspaceScope
  if (effectiveScope === 'org') return undefined
  if (effectiveScope === 'own' || effectiveScope === 'team') return actor.userId
  return DENIED_RECORD_ID
}

export function hasOrganizationScope(actor: DataActor, permission: Permission): boolean {
  return grantedScope(actor.role, permission) === 'org'
}
