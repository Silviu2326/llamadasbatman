export {
  APP_ROLES,
  LEGACY_ROLES,
  ROLE_KEYS,
  PERMISSIONS,
  ROLE_CATALOG,
  ROLE_GRANTS,
  ROLE_PERMISSIONS,
  type AppRole,
  type LegacyRole,
  type KnownRole,
  type Permission,
  type PermissionAction,
  type PermissionGrant,
  type PermissionResource,
  type PermissionScope,
  type RoleDefinition,
} from './catalog'

export {
  grantedScope,
  hasPermission,
  isKnownRole,
  isPermission,
  isPermissionScope,
  permissionsForRole,
} from './permissions'

export {
  getAccessPrincipal,
  requireAnyPermission,
  requirePermission,
  type AccessPrincipal,
  type PermissionOptions,
  type PermissionRequirement,
} from './requirePermission'

export {
  CAPABILITIES,
  LIMIT_RESOURCES,
  PLAN_KEYS,
  EntitlementError,
  assertCapability,
  assertUsageLimit,
  getEntitlementSnapshot,
  hasCapability,
  isCapability,
  isLimitResource,
  normalisePlan,
  planPolicy,
  type Capability,
  type EntitlementDatabase,
  type EntitlementSnapshot,
  type LimitResource,
  type PlanKey,
  type PlanPolicy,
} from './entitlements'

export { requireEntitlement, type EntitlementOptions } from './requireEntitlement'

export {
  getPlatformActor,
  isPlatformAdmin,
  requirePlatformAdmin,
  type PlatformActor,
} from './platformAdmin'

export {
  CONSUMPTION_RESOURCES,
  assertConsumptionLimit,
  consumptionSnapshot,
  consumptionUsage,
  type ConsumptionResource,
} from './consumption'

export {
  APPROVAL_RULES,
  SENSITIVE_ACTIONS,
  ApprovalPolicyError,
  approvalRule,
  assertCanApproveSensitiveAction,
  canApproveSensitiveAction,
  canRequestSensitiveAction,
  isSensitiveAction,
  type ApprovalRule,
  type SensitiveAction,
} from './approvalPolicy'
