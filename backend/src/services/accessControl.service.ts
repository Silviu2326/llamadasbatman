import {
  AccessRequestStatus,
  AccessRequestType,
  Prisma,
  UserRole,
} from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  PERMISSIONS,
  ROLE_CATALOG,
  ROLE_GRANTS,
  hasPermission,
  permissionsForRole,
  type Permission,
} from '../access-control'

export const ACCESS_REQUEST_TYPES = ['role_elevation', 'paid_experiment', 'playbook_change'] as const
export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'consumed'] as const
export const ASSIGNABLE_ROLES = [
  'owner',
  'admin',
  'revenue_ops',
  'sales_manager',
  'sales_rep',
  'marketing_growth',
  'analyst',
  'compliance',
  'finance_controller',
  'guest',
  'agent',
  'viewer',
] as const

export type AccessRequestKind = typeof ACCESS_REQUEST_TYPES[number]
export type AssignableRole = typeof ASSIGNABLE_ROLES[number]

const DIRECT_DEMOTION_ROLES = new Set<AssignableRole>(['guest', 'viewer'])

export class AccessControlError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 = 400,
    public readonly code = 'ACCESS_CONTROL_ERROR',
  ) {
    super(message)
    this.name = 'AccessControlError'
  }
}

export interface Actor {
  userId: string
  orgId: string
  role: string
  correlationId?: string
}

export interface CreateAccessRequestInput {
  type: AccessRequestKind
  targetUserId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  reason: string
  payload?: Record<string, unknown> | null
  expiresAt?: Date | null
}

export interface ListAccessRequestsInput {
  status?: typeof ACCESS_REQUEST_STATUSES[number]
  type?: AccessRequestKind
  limit?: number
}

function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function inputJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

function canManageMembers(role: string): boolean {
  return hasPermission(role, 'access_control.manage')
}

function canApprove(role: string, type: AccessRequestKind): boolean {
  return hasPermission(role, `access_request.approve.${type}` as Permission)
}

/** Catalogo seguro por defecto; el modulo de permisos puede enriquecerlo. */
export function getCatalog(actorRole: string) {
  return {
    currentRole: actorRole,
    canManage: canManageMembers(actorRole),
    grantedPermissions: permissionsForRole(actorRole),
    permissions: PERMISSIONS.map(key => ({ key, label: key, group: key.split('.')[0] })),
    principles: ['least_privilege', 'deny_by_default', 'separation_of_duties'],
    roles: Object.values(ROLE_CATALOG).map(role => ({ ...role, grants: ROLE_GRANTS[role.key] })),
    requestTypes: ACCESS_REQUEST_TYPES.map(type => ({
      id: type,
      canRequest: hasPermission(actorRole, `access_request.create.${type}` as Permission),
      canApprove: canApprove(actorRole, type),
      approverRoles: ASSIGNABLE_ROLES.filter(role => canApprove(role, type)),
    })),
  }
}

export async function listMembers(actor: Actor) {
  if (!hasPermission(actor.role, 'access_control.read')) {
    throw new AccessControlError('No tienes permiso para consultar miembros', 403, 'FORBIDDEN')
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: { orgId: actor.orgId, status: 'active' },
    select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  return memberships.map(row => ({ ...row.user, role: row.role, createdAt: row.createdAt }))
}

function visibleRequestWhere(actor: Actor): Prisma.AccessControlRequestWhereInput {
  if (canManageMembers(actor.role) || actor.role === 'admin' || actor.role === 'compliance') return { orgId: actor.orgId }
  const approvable = ACCESS_REQUEST_TYPES.filter(type => canApprove(actor.role, type))
  return {
    orgId: actor.orgId,
    OR: [
      { requesterUserId: actor.userId },
      { targetUserId: actor.userId },
      ...(approvable.length ? [{ type: { in: approvable as AccessRequestType[] } }] : []),
    ],
  }
}

export async function listRequests(actor: Actor, filters: ListAccessRequestsInput) {
  return prisma.accessControlRequest.findMany({
    where: {
      ...visibleRequestWhere(actor),
      status: filters.status as AccessRequestStatus | undefined,
      type: filters.type as AccessRequestType | undefined,
    },
    include: {
      requester: { select: { id: true, name: true, email: true, role: true } },
      targetUser: { select: { id: true, name: true, email: true, role: true } },
      decider: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit ?? 100, 250),
  })
}

function requestedRole(payload: Record<string, unknown>): AssignableRole | null {
  const value = payload.requestedRole
  return typeof value === 'string' && isAssignableRole(value) ? value : null
}

function authorUserId(payload: Record<string, unknown>): string | null {
  return typeof payload.authorUserId === 'string' ? payload.authorUserId : null
}

function validateRequestInput(actor: Actor, input: CreateAccessRequestInput): Record<string, unknown> {
  if (!hasPermission(actor.role, `access_request.create.${input.type}` as Permission)) {
    throw new AccessControlError('Tu rol no puede crear este tipo de solicitud', 403, 'FORBIDDEN')
  }
  if (!hasPermission(actor.role, 'access_request.create')) {
    throw new AccessControlError('Tu rol no puede crear solicitudes de aprobacion', 403, 'FORBIDDEN')
  }
  const payload = { ...(input.payload ?? {}) }
  if (input.type === 'role_elevation') {
    const role = requestedRole(payload)
    if (!role) throw new AccessControlError('La elevacion requiere un requestedRole valido')
    if (!input.targetUserId) throw new AccessControlError('La elevacion requiere targetUserId')
    if (input.targetUserId !== actor.userId && !canManageMembers(actor.role)) {
      throw new AccessControlError('Solo administradores pueden solicitar un rol para otra persona', 403, 'FORBIDDEN')
    }
  }
  if (input.type === 'paid_experiment') {
    const budgetCents = payload.budgetCents
    if (typeof budgetCents !== 'number' || !Number.isInteger(budgetCents) || budgetCents <= 0) {
      throw new AccessControlError('El experimento de pago requiere budgetCents positivo')
    }
    if (!input.resourceId) throw new AccessControlError('El experimento de pago requiere resourceId')
    payload.authorUserId = actor.userId
  }
  if (input.type === 'playbook_change') {
    if (!input.resourceId) throw new AccessControlError('El cambio de playbook requiere resourceId')
    payload.authorUserId = actor.userId
  }
  return payload
}

export async function createRequest(actor: Actor, input: CreateAccessRequestInput) {
  const payload = validateRequestInput(actor, input)
  const resourceType = input.type === 'playbook_change'
    ? 'playbook'
    : input.type === 'paid_experiment'
      ? 'revenue_experiment'
      : input.resourceType ?? null
  if (input.targetUserId) {
    const target = await prisma.organizationMembership.findFirst({ where: { userId: input.targetUserId, orgId: actor.orgId, status: 'active' }, select: { userId: true, role: true } })
    if (!target) throw new AccessControlError('Miembro no encontrado', 404, 'NOT_FOUND')
    if (input.type === 'role_elevation' && requestedRole(payload) === target.role) {
      throw new AccessControlError('El miembro ya tiene ese rol', 409, 'NO_ROLE_CHANGE')
    }
    if (input.type === 'role_elevation') payload.previousRole = target.role
  }
  if (input.type === 'paid_experiment') {
    const experiment = await prisma.revenueExperiment.findFirst({ where: { id: input.resourceId!, orgId: actor.orgId }, select: { id: true } })
    if (!experiment) throw new AccessControlError('Experimento no encontrado', 404, 'NOT_FOUND')
  }
  if (input.type === 'playbook_change') {
    const playbook = await prisma.playbook.findFirst({ where: { id: input.resourceId!, orgId: actor.orgId }, select: { id: true } })
    if (!playbook) throw new AccessControlError('Playbook no encontrado', 404, 'NOT_FOUND')
  }

  const duplicate = await prisma.accessControlRequest.findFirst({
    where: {
      orgId: actor.orgId,
      type: input.type as AccessRequestType,
      status: 'pending',
      requesterUserId: actor.userId,
      targetUserId: input.targetUserId ?? null,
      resourceType,
      resourceId: input.resourceId ?? null,
    },
    select: { id: true },
  })
  if (duplicate) throw new AccessControlError('Ya existe una solicitud pendiente equivalente', 409, 'DUPLICATE_REQUEST')

  const expiresAt = input.expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  try {
    return await prisma.$transaction(async tx => {
      const request = await tx.accessControlRequest.create({
        data: {
          orgId: actor.orgId,
          type: input.type as AccessRequestType,
          requesterUserId: actor.userId,
          targetUserId: input.targetUserId ?? null,
          resourceType,
          resourceId: input.resourceId ?? null,
          reason: input.reason,
          payload: inputJson(payload),
          expiresAt,
        },
      })
      await tx.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.userId,
          action: 'access_request.create',
          entityType: 'AccessControlRequest',
          entityId: request.id,
          after: { type: request.type, status: request.status, targetUserId: request.targetUserId, resourceType: request.resourceType, resourceId: request.resourceId },
          correlationId: actor.correlationId,
        },
      })
      return request
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AccessControlError('Ya existe una solicitud pendiente equivalente', 409, 'DUPLICATE_REQUEST')
    }
    throw error
  }
}

export function assertCanDecide(actor: Actor, request: {
  type: AccessRequestType
  requesterUserId: string
  payload: Prisma.JsonValue | null
}) {
  const type = request.type as AccessRequestKind
  if (request.requesterUserId === actor.userId) {
    throw new AccessControlError('Nadie puede decidir su propia solicitud', 403, 'SELF_APPROVAL_FORBIDDEN')
  }
  if (!canApprove(actor.role, type)) {
    throw new AccessControlError('Tu rol no puede decidir esta solicitud', 403, 'FORBIDDEN')
  }
  if (type === 'role_elevation' && requestedRole(jsonObject(request.payload)) === 'owner' && actor.role !== 'owner') {
    throw new AccessControlError('Solo un propietario puede aprobar otro propietario', 403, 'OWNER_APPROVAL_REQUIRED')
  }
  if (authorUserId(jsonObject(request.payload)) === actor.userId) {
    throw new AccessControlError('El autor del cambio no puede aprobarlo', 403, 'AUTHOR_APPROVAL_FORBIDDEN')
  }
}

export async function decideRequest(
  actor: Actor,
  requestId: string,
  decision: 'approved' | 'rejected',
  decisionComment?: string,
) {
  const current = await prisma.accessControlRequest.findFirst({
    where: { id: requestId, orgId: actor.orgId },
  })
  if (!current) throw new AccessControlError('Solicitud no encontrada', 404, 'NOT_FOUND')
  if (current.status !== 'pending') throw new AccessControlError('La solicitud ya fue decidida', 409, 'ALREADY_DECIDED')
  if (current.expiresAt && current.expiresAt <= new Date()) throw new AccessControlError('La solicitud ha caducado', 409, 'REQUEST_EXPIRED')
  assertCanDecide(actor, current)

  return prisma.$transaction(async tx => {
    const changed = await tx.accessControlRequest.updateMany({
      where: { id: current.id, orgId: actor.orgId, status: 'pending' },
      data: { status: decision, decidedByUserId: actor.userId, decisionComment, decidedAt: new Date() },
    })
    if (changed.count !== 1) throw new AccessControlError('La solicitud fue decidida por otro usuario', 409, 'CONCURRENT_DECISION')
    const updated = await tx.accessControlRequest.findUniqueOrThrow({ where: { id: current.id } })
    await tx.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.userId,
        action: decision === 'approved' ? 'access_request.approve' : 'access_request.reject',
        entityType: 'AccessControlRequest',
        entityId: current.id,
        before: { status: current.status },
        after: { status: updated.status, decidedByUserId: actor.userId, decisionComment: decisionComment ?? null },
        correlationId: actor.correlationId,
      },
    })
    return updated
  })
}

export async function assignMemberRole(actor: Actor, targetUserId: string, role: AssignableRole, approvalRequestId?: string) {
  if (!canManageMembers(actor.role)) throw new AccessControlError('No tienes permiso para asignar roles', 403, 'FORBIDDEN')
  if (targetUserId === actor.userId) throw new AccessControlError('No puedes cambiar tu propio rol', 403, 'SELF_ROLE_CHANGE_FORBIDDEN')
  if (role === 'owner' && actor.role !== 'owner') {
    throw new AccessControlError('Solo un propietario puede asignar el rol propietario', 403, 'OWNER_ASSIGNMENT_REQUIRED')
  }

  const target = await prisma.organizationMembership.findFirst({ where: { userId: targetUserId, orgId: actor.orgId, status: 'active' }, select: { userId: true, role: true } })
  if (!target) throw new AccessControlError('Miembro no encontrado', 404, 'NOT_FOUND')
  if (target.role === role) return { member: { id: target.userId, role: target.role }, changed: false }
  if (target.role === 'owner' && actor.role !== 'owner') {
    throw new AccessControlError('Solo un propietario puede cambiar el rol de otro propietario', 403, 'OWNER_MANAGEMENT_REQUIRED')
  }

  const needsApproval = !DIRECT_DEMOTION_ROLES.has(role)
  const approved = needsApproval
    ? await prisma.accessControlRequest.findFirst({
        where: {
          id: approvalRequestId ?? '',
          orgId: actor.orgId,
          type: 'role_elevation',
          status: 'approved',
          targetUserId,
          consumedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })
    : null
  if (needsApproval && (!approved || requestedRole(jsonObject(approved.payload)) !== role)) {
    throw new AccessControlError('La asignacion requiere una elevacion aprobada y vigente', 409, 'APPROVAL_REQUIRED')
  }
  if (approved && jsonObject(approved.payload).previousRole !== target.role) {
    throw new AccessControlError('El rol actual ya no coincide con la solicitud aprobada', 409, 'APPROVAL_STALE')
  }

  try {
    return await prisma.$transaction(async tx => {
      const currentTarget = await tx.organizationMembership.findFirst({
        where: { userId: targetUserId, orgId: actor.orgId, status: 'active' },
        select: { userId: true, role: true },
      })
      if (!currentTarget) throw new AccessControlError('Miembro no encontrado', 404, 'NOT_FOUND')
      if (currentTarget.role !== target.role) throw new AccessControlError('El rol del miembro cambio durante la operacion', 409, 'CONCURRENT_ROLE_CHANGE')
      if (currentTarget.role === 'owner') {
        const owners = await tx.organizationMembership.count({ where: { orgId: actor.orgId, role: 'owner', status: 'active' } })
        if (owners <= 1) throw new AccessControlError('No se puede degradar al ultimo propietario', 409, 'LAST_OWNER')
      }
      if (approved) {
        const consumed = await tx.accessControlRequest.updateMany({
          where: { id: approved.id, orgId: actor.orgId, status: 'approved', consumedAt: null },
          data: { status: 'consumed', consumedAt: new Date() },
        })
        if (consumed.count !== 1) throw new AccessControlError('La aprobacion ya fue consumida', 409, 'APPROVAL_CONSUMED')
      }
      const changed = await tx.organizationMembership.updateMany({
        where: { userId: targetUserId, orgId: actor.orgId, role: target.role, status: 'active' },
        data: { role: role as UserRole },
      })
      if (changed.count !== 1) throw new AccessControlError('El rol del miembro cambio durante la operacion', 409, 'CONCURRENT_ROLE_CHANGE')
      // User.role queda sincronizado solo para la organización primaria; las
      // demás membresías nunca deben pisar esa compatibilidad legacy.
      await tx.user.updateMany({ where: { id: targetUserId, orgId: actor.orgId }, data: { role: role as UserRole } })
      const memberRow = await tx.organizationMembership.findFirstOrThrow({
        where: { userId: targetUserId, orgId: actor.orgId, status: 'active' },
        select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      })
      const member = { ...memberRow.user, role: memberRow.role, createdAt: memberRow.createdAt }
      await tx.authSession.updateMany({ where: { userId: targetUserId, activeOrgId: actor.orgId, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.userId,
          action: 'member.role.assign',
          entityType: 'User',
          entityId: targetUserId,
          before: { role: target.role },
          after: { role, approvalRequestId: approved?.id ?? null },
          correlationId: actor.correlationId,
        },
      })
      return { member, changed: true, approvalRequestId: approved?.id ?? null }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new AccessControlError('Conflicto concurrente al asignar el rol; vuelve a intentarlo', 409, 'CONCURRENT_ROLE_CHANGE')
    }
    throw error
  }
}
