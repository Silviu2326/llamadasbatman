import { hasPermission, isKnownRole } from './permissions'
import type { KnownRole, Permission, PermissionScope } from './catalog'

/**
 * Operaciones que producen un efecto externo o un contacto masivo.
 *
 * El permiso de operación y el permiso de aprobación son deliberadamente
 * distintos. El primero permite preparar/solicitar el efecto; el segundo lo
 * permite decidir. La separación por identidad (no autoaprobación) se aplica
 * en `assertCanApproveSensitiveAction` y en los workflows persistentes que
 * consumen esta política.
 */
export const SENSITIVE_ACTIONS = [
  'spend',
  'campaign_publish',
  'organic_publish',
  'social_publish',
  'mass_contact',
  'agentic_accept',
] as const

export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number]

export type ApprovalRule = Readonly<{
  action: SensitiveAction
  operationPermission: Permission
  approvalPermission: Permission
  operationScope: PermissionScope
  approvalScope: 'org'
  separationOfDuties: true
}>

const RULES: Readonly<Record<SensitiveAction, ApprovalRule>> = Object.freeze({
  spend: Object.freeze({
    action: 'spend',
    operationPermission: 'costs.request',
    approvalPermission: 'costs.approve',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
  campaign_publish: Object.freeze({
    action: 'campaign_publish',
    operationPermission: 'campaigns.publish',
    approvalPermission: 'campaigns.approve',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
  organic_publish: Object.freeze({
    action: 'organic_publish',
    operationPermission: 'organic.publish',
    approvalPermission: 'organic.approve',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
  social_publish: Object.freeze({
    action: 'social_publish',
    operationPermission: 'social.write',
    approvalPermission: 'social.approve',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
  mass_contact: Object.freeze({
    action: 'mass_contact',
    operationPermission: 'leads.contact',
    approvalPermission: 'leads.contact.approve',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
  agentic_accept: Object.freeze({
    action: 'agentic_accept',
    operationPermission: 'automations.write',
    approvalPermission: 'automations.publish',
    operationScope: 'org',
    approvalScope: 'org',
    separationOfDuties: true,
  }),
})

export function isSensitiveAction(value: unknown): value is SensitiveAction {
  return typeof value === 'string' && (SENSITIVE_ACTIONS as readonly string[]).includes(value)
}

/** Returns a frozen rule or null for unknown input; unknown actions fail closed. */
export function approvalRule(value: unknown): ApprovalRule | null {
  return isSensitiveAction(value) ? RULES[value] : null
}

export function canRequestSensitiveAction(role: unknown, action: unknown): boolean {
  const rule = approvalRule(action)
  return rule !== null && hasPermission(role, rule.operationPermission, rule.operationScope)
}

export function canApproveSensitiveAction(role: unknown, action: unknown): boolean {
  const rule = approvalRule(action)
  return rule !== null && hasPermission(role, rule.approvalPermission, rule.approvalScope)
}

export class ApprovalPolicyError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_ACTION' | 'FORBIDDEN' | 'SELF_APPROVAL_FORBIDDEN',
  ) {
    super(message)
    this.name = 'ApprovalPolicyError'
  }
}

/**
 * Server-side check for the deciding actor. A caller must pass the requester
 * identity loaded from the persisted request, never an id supplied by the UI.
 */
export function assertCanApproveSensitiveAction(
  actor: { userId: string; role: unknown },
  action: unknown,
  requesterUserId: string,
): void {
  const rule = approvalRule(action)
  if (!rule) throw new ApprovalPolicyError('La operación sensible no es válida', 'INVALID_ACTION')
  if (typeof requesterUserId !== 'string' || requesterUserId.length === 0) {
    throw new ApprovalPolicyError('La solicitud no tiene un solicitante válido', 'FORBIDDEN')
  }
  if (actor.userId === requesterUserId) {
    throw new ApprovalPolicyError('Nadie puede aprobar su propia operación', 'SELF_APPROVAL_FORBIDDEN')
  }
  if (!isKnownRole(actor.role) || !canApproveSensitiveAction(actor.role, action)) {
    throw new ApprovalPolicyError('El rol no puede aprobar esta operación', 'FORBIDDEN')
  }
}

/** Useful for audits and route contracts; returns a copy-free immutable catalog. */
export const APPROVAL_RULES: Readonly<Record<SensitiveAction, ApprovalRule>> = RULES
