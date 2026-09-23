import { Prisma, UserRole } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { hashPassword } from './auth.service'
import {
  PERMISSIONS,
  PLAN_KEYS,
  ROLE_CATALOG,
  ROLE_GRANTS,
  ROLE_KEYS,
  planPolicy,
  type PlatformActor,
} from '../access-control'

/**
 * Back office de plataforma.
 *
 * Es el único servicio que consulta y muta datos sin filtrar por la
 * organización del token. Esa excepción se sostiene sobre tres reglas que este
 * módulo aplica sin excepciones:
 *
 *  1. Solo se entra por `requirePlatformAdmin` (rutas), nunca por rol.
 *  2. Toda escritura deja un `PlatformAuditLog` con actor, antes/después y
 *     motivo, dentro de la misma transacción que el cambio.
 *  3. `User.isPlatformAdmin` no se toca desde aquí. Conceder el privilegio es
 *     una operación de servidor (scripts/grant-platform-admin.mjs); si la API
 *     pudiera otorgarlo, un operador comprometido crearía operadores nuevos y
 *     revocar el suyo dejaría de servir de nada.
 */

export const IMPERSONATION_TTL_MINUTES = 30
const MAX_PAGE_SIZE = 100

export class BackOfficeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409 = 400,
    public readonly code = 'BACK_OFFICE_ERROR',
  ) {
    super(message)
    this.name = 'BackOfficeError'
  }
}

export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended'] as const
export type MembershipStatus = typeof MEMBERSHIP_STATUSES[number]

type Paged = { page?: number; pageSize?: number }

function pagination({ page = 1, pageSize = 25 }: Paged) {
  const take = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
  const current = Math.max(page, 1)
  return { skip: (current - 1) * take, take, page: current, pageSize: take }
}

function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) }
}

/**
 * Prisma trata `contains` como sensible a mayúsculas en Postgres salvo que se
 * pida lo contrario, y buscar un email por el que ya has tecleado la mitad es
 * el uso normal de este buscador.
 */
function textFilter(value?: string) {
  const term = value?.trim()
  return term ? { contains: term, mode: Prisma.QueryMode.insensitive } : undefined
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: PlatformActor,
  entry: {
    action: string
    entityType: string
    entityId: string
    orgId?: string | null
    targetUserId?: string | null
    before?: unknown
    after?: unknown
    reason?: string | null
  },
) {
  await tx.platformAuditLog.create({
    data: {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      orgId: entry.orgId ?? null,
      targetUserId: entry.targetUserId ?? null,
      before: (entry.before ?? Prisma.DbNull) as Prisma.InputJsonValue,
      after: (entry.after ?? Prisma.DbNull) as Prisma.InputJsonValue,
      reason: entry.reason ?? null,
      ip: actor.ip ?? null,
      correlationId: actor.correlationId ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function getOverview() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const now = new Date()

  const [
    organizations,
    users,
    platformAdmins,
    activeSessions,
    impersonations,
    newOrganizations,
    newUsers,
    plans,
    roles,
    walletTotals,
    recentActions,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.user.count({ where: { isPlatformAdmin: true } }),
    prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now }, impersonatedByUserId: { not: null } } }),
    prisma.organization.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.organization.groupBy({ by: ['plan'], _count: { _all: true } }),
    prisma.organizationMembership.groupBy({ by: ['role'], _count: { _all: true }, where: { status: 'active' } }),
    prisma.wallet.aggregate({ _sum: { balanceCents: true }, _count: { _all: true } }),
    prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ])

  return {
    totals: {
      organizations,
      users,
      platformAdmins,
      activeSessions,
      impersonations,
      newOrganizations30d: newOrganizations,
      newUsers30d: newUsers,
      walletBalanceCents: walletTotals._sum.balanceCents ?? 0,
      wallets: walletTotals._count._all,
    },
    plans: plans
      .map(row => ({ plan: row.plan, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    roles: roles
      .map(row => ({ role: row.role, label: ROLE_CATALOG[row.role]?.label ?? row.role, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    recentActions,
  }
}

export async function listOrganizations(filters: Paged & { q?: string; plan?: string }) {
  const { skip, take, page, pageSize } = pagination(filters)
  const where: Prisma.OrganizationWhereInput = {
    ...(filters.plan ? { plan: filters.plan } : {}),
    ...(filters.q
      ? { OR: [{ name: textFilter(filters.q) }, { email: textFilter(filters.q) }, { website: textFilter(filters.q) }, { id: filters.q.trim() }] }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, plan: true, email: true, website: true, industry: true,
        currency: true, timezone: true, createdAt: true,
        metricoolEnabled: true, stripeCustomerId: true,
        wallet: { select: { balanceCents: true, currency: true } },
        _count: { select: { memberships: true, leads: true, campaigns: true, calls: true, agents: true } },
      },
    }),
  ])

  return { organizations: rows, ...pageMeta(total, page, pageSize) }
}

export async function getOrganization(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, plan: true, email: true, website: true, phone: true,
      industry: true, timezone: true, address: true, currency: true, createdAt: true,
      metricoolEnabled: true, stripeCustomerId: true,
      wallet: { select: { balanceCents: true, currency: true, softLimitCents: true, hardLimitCents: true, updatedAt: true } },
      whiteLabelConfig: { select: { id: true } },
      agencyClientWorkspace: { select: { agencyOrgId: true, displayName: true, status: true } },
      _count: {
        select: {
          memberships: true, leads: true, accounts: true, campaigns: true, calls: true,
          agents: true, jobs: true, assets: true, apiKeys: true, integrationCredentials: true,
        },
      },
    },
  })
  if (!org) throw new BackOfficeError('Organización no encontrada', 404, 'NOT_FOUND')

  const [members, apiKeys, integrations, agencyClients, recentAudit, walletMovements] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { orgId },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, role: true, status: true, isDefault: true, createdAt: true,
        user: { select: { id: true, name: true, email: true, createdAt: true, isPlatformAdmin: true } },
      },
    }),
    prisma.apiKey.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true, user: { select: { id: true, email: true } } },
    }),
    prisma.organizationIntegrationCredential.findMany({
      // El secreto cifrado nunca sale de la base: el back office muestra qué
      // hay conectado, no permite leer credenciales de un cliente.
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, createdAt: true, updatedAt: true },
    }).catch(() => []),
    prisma.agencyClient.findMany({
      where: { agencyOrgId: orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, status: true, clientOrgId: true, monthlyPriceCents: true, activatedAt: true },
    }),
    prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { id: true, email: true } } },
    }),
    prisma.walletTransaction.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, amountCents: true, reason: true, createdAt: true },
    }),
  ])

  return {
    organization: org,
    members,
    apiKeys,
    integrations,
    agencyClients,
    recentAudit,
    walletMovements,
    entitlements: planPolicy(org.plan),
  }
}

export async function listUsers(filters: Paged & { q?: string; role?: string; orgId?: string; platformAdminsOnly?: boolean }) {
  const { skip, take, page, pageSize } = pagination(filters)
  const membershipFilter: Prisma.OrganizationMembershipListRelationFilter | undefined =
    filters.role || filters.orgId
      ? { some: { ...(filters.role ? { role: filters.role as UserRole } : {}), ...(filters.orgId ? { orgId: filters.orgId } : {}) } }
      : undefined

  const where: Prisma.UserWhereInput = {
    ...(filters.platformAdminsOnly ? { isPlatformAdmin: true } : {}),
    ...(membershipFilter ? { memberships: membershipFilter } : {}),
    ...(filters.q
      ? { OR: [{ email: textFilter(filters.q) }, { name: textFilter(filters.q) }, { id: filters.q.trim() }] }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, role: true, orgId: true, createdAt: true, isPlatformAdmin: true,
        org: { select: { id: true, name: true, plan: true } },
        memberships: { select: { orgId: true, role: true, status: true, isDefault: true, org: { select: { name: true } } } },
        _count: { select: { authSessions: true } },
      },
    }),
  ])

  return { users: rows, ...pageMeta(total, page, pageSize) }
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, orgId: true, createdAt: true, isPlatformAdmin: true,
      org: { select: { id: true, name: true, plan: true } },
      preference: { select: { locale: true, timezone: true, theme: true } },
      memberships: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, orgId: true, role: true, status: true, isDefault: true, createdAt: true, org: { select: { id: true, name: true, plan: true } } },
      },
    },
  })
  if (!user) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')

  const [sessions, apiKeys, platformAudit, orgAudit] = await Promise.all([
    prisma.authSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true, activeOrgId: true,
        impersonator: { select: { id: true, email: true } },
      },
    }),
    prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, name: true, prefix: true, orgId: true, lastUsedAt: true, revokedAt: true, expiresAt: true, createdAt: true },
    }),
    prisma.platformAuditLog.findMany({
      where: { OR: [{ targetUserId: userId }, { entityType: 'User', entityId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.auditLog.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, orgId: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ])

  return { user, sessions, apiKeys, platformAudit, orgAudit }
}

/** Matriz RBAC completa: es el catálogo estático, no una copia editable. */
export function getPermissionMatrix() {
  return {
    roles: ROLE_KEYS.map(role => ({
      ...ROLE_CATALOG[role],
      grants: ROLE_GRANTS[role],
      permissionCount: ROLE_GRANTS[role].length,
    })),
    permissions: PERMISSIONS.map(permission => ({
      key: permission,
      group: permission.split('.')[0],
      action: permission.split('.').slice(1).join('.'),
      roles: ROLE_KEYS
        .map(role => {
          const grant = ROLE_GRANTS[role].find(candidate => candidate.permission === permission)
          return grant ? { role, scope: grant.scope } : null
        })
        .filter((entry): entry is { role: typeof ROLE_KEYS[number]; scope: 'own' | 'team' | 'org' } => entry !== null),
    })),
    plans: PLAN_KEYS.map(plan => ({ plan, policy: planPolicy(plan) })),
    // La matriz es estática y vive en el código (access-control/catalog.ts). El
    // back office la expone para poder auditarla, no para editarla en caliente:
    // un cambio de permisos debe pasar por revisión y despliegue.
    editable: false,
  }
}

export async function listSessions(filters: Paged & { userId?: string; orgId?: string; activeOnly?: boolean; impersonatedOnly?: boolean }) {
  const { skip, take, page, pageSize } = pagination(filters)
  const where: Prisma.AuthSessionWhereInput = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.orgId ? { activeOrgId: filters.orgId } : {}),
    ...(filters.activeOnly ? { revokedAt: null, expiresAt: { gt: new Date() } } : {}),
    ...(filters.impersonatedOnly ? { impersonatedByUserId: { not: null } } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.authSession.count({ where }),
    prisma.authSession.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true, activeOrgId: true,
        user: { select: { id: true, name: true, email: true } },
        impersonator: { select: { id: true, email: true } },
      },
    }),
  ])

  return { sessions: rows, ...pageMeta(total, page, pageSize) }
}

export async function listApiKeys(filters: Paged & { orgId?: string; activeOnly?: boolean }) {
  const { skip, take, page, pageSize } = pagination(filters)
  const where: Prisma.ApiKeyWhereInput = {
    ...(filters.orgId ? { orgId: filters.orgId } : {}),
    ...(filters.activeOnly ? { revokedAt: null } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
        org: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    }),
  ])

  return { apiKeys: rows, ...pageMeta(total, page, pageSize) }
}

export async function listAudit(filters: Paged & { action?: string; orgId?: string; actorUserId?: string; entityId?: string }) {
  const { skip, take, page, pageSize } = pagination(filters)
  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(filters.action ? { action: textFilter(filters.action) } : {}),
    ...(filters.orgId ? { orgId: filters.orgId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.platformAuditLog.count({ where }),
    prisma.platformAuditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
  ])

  return { entries: rows, ...pageMeta(total, page, pageSize) }
}

// ---------------------------------------------------------------------------
// Escritura — usuarios y membresías
// ---------------------------------------------------------------------------

/**
 * Degradar o suspender a la última persona con rol `owner` activo deja la
 * organización sin nadie que pueda recuperar el control desde la aplicación.
 * Se comprueba dentro de la transacción para que dos operadores simultáneos no
 * puedan quitar cada uno "el otro" propietario.
 */
async function assertNotLastOwner(tx: Prisma.TransactionClient, orgId: string, userId: string) {
  const owners = await tx.organizationMembership.count({ where: { orgId, role: 'owner', status: 'active' } })
  if (owners <= 1) {
    const current = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true, status: true },
    })
    if (current?.role === 'owner' && current.status === 'active') {
      throw new BackOfficeError('No puedes dejar la organización sin propietario activo', 409, 'LAST_OWNER')
    }
  }
}

export async function setMembershipRole(
  actor: PlatformActor,
  input: { userId: string; orgId: string; role: UserRole; reason: string },
) {
  return prisma.$transaction(async tx => {
    const membership = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
      select: { id: true, role: true, status: true },
    })
    if (!membership) throw new BackOfficeError('Esa persona no es miembro de la organización', 404, 'NOT_FOUND')
    if (membership.role === input.role) return { changed: false, membership }
    if (input.role !== 'owner') await assertNotLastOwner(tx, input.orgId, input.userId)

    const updated = await tx.organizationMembership.update({
      where: { id: membership.id },
      data: { role: input.role },
      select: { id: true, orgId: true, userId: true, role: true, status: true },
    })
    // `User.role` solo refleja la organización primaria; las demás membresías
    // no deben pisar esa compatibilidad heredada.
    await tx.user.updateMany({ where: { id: input.userId, orgId: input.orgId }, data: { role: input.role } })
    // El rol viaja dentro del JWT y `authenticate` lo compara con la membresía:
    // sin revocar, los tokens vivos seguirían operando con el rol anterior
    // durante 15 minutos.
    await tx.authSession.updateMany({
      where: { userId: input.userId, activeOrgId: input.orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await writeAudit(tx, actor, {
      action: 'backoffice.membership.role.set',
      entityType: 'OrganizationMembership',
      entityId: membership.id,
      orgId: input.orgId,
      targetUserId: input.userId,
      before: { role: membership.role },
      after: { role: input.role },
      reason: input.reason,
    })
    return { changed: true, membership: updated }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function setMembershipStatus(
  actor: PlatformActor,
  input: { userId: string; orgId: string; status: MembershipStatus; reason: string },
) {
  return prisma.$transaction(async tx => {
    const membership = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
      select: { id: true, role: true, status: true },
    })
    if (!membership) throw new BackOfficeError('Esa persona no es miembro de la organización', 404, 'NOT_FOUND')
    if (membership.status === input.status) return { changed: false, membership }
    if (input.status !== 'active') await assertNotLastOwner(tx, input.orgId, input.userId)

    const updated = await tx.organizationMembership.update({
      where: { id: membership.id },
      data: { status: input.status },
      select: { id: true, orgId: true, userId: true, role: true, status: true },
    })
    if (input.status !== 'active') {
      await tx.authSession.updateMany({
        where: { userId: input.userId, activeOrgId: input.orgId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    await writeAudit(tx, actor, {
      action: 'backoffice.membership.status.set',
      entityType: 'OrganizationMembership',
      entityId: membership.id,
      orgId: input.orgId,
      targetUserId: input.userId,
      before: { status: membership.status },
      after: { status: input.status },
      reason: input.reason,
    })
    return { changed: true, membership: updated }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function addMembership(
  actor: PlatformActor,
  input: { userId: string; orgId: string; role: UserRole; reason: string },
) {
  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
    prisma.organization.findUnique({ where: { id: input.orgId }, select: { id: true } }),
  ])
  if (!user) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')
  if (!org) throw new BackOfficeError('Organización no encontrada', 404, 'NOT_FOUND')

  return prisma.$transaction(async tx => {
    const existing = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
      select: { id: true },
    })
    if (existing) throw new BackOfficeError('Esa persona ya es miembro de la organización', 409, 'ALREADY_MEMBER')

    const hasDefault = await tx.organizationMembership.count({ where: { userId: input.userId, isDefault: true } })
    const created = await tx.organizationMembership.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
        status: 'active',
        isDefault: hasDefault === 0,
        invitedById: actor.userId,
      },
      select: { id: true, orgId: true, userId: true, role: true, status: true, isDefault: true },
    })

    await writeAudit(tx, actor, {
      action: 'backoffice.membership.create',
      entityType: 'OrganizationMembership',
      entityId: created.id,
      orgId: input.orgId,
      targetUserId: input.userId,
      after: { role: created.role, status: created.status },
      reason: input.reason,
    })
    return { membership: created }
  })
}

export async function removeMembership(
  actor: PlatformActor,
  input: { userId: string; orgId: string; reason: string },
) {
  return prisma.$transaction(async tx => {
    const membership = await tx.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: input.orgId, userId: input.userId } },
      select: { id: true, role: true, status: true, isDefault: true },
    })
    if (!membership) throw new BackOfficeError('Esa persona no es miembro de la organización', 404, 'NOT_FOUND')
    await assertNotLastOwner(tx, input.orgId, input.userId)

    const remaining = await tx.organizationMembership.count({ where: { userId: input.userId } })
    if (remaining <= 1) {
      throw new BackOfficeError('Es su única organización: quedaría sin acceso a nada', 409, 'LAST_MEMBERSHIP')
    }

    await tx.organizationMembership.delete({ where: { id: membership.id } })
    if (membership.isDefault) {
      // Sin una membresía por defecto, `activeIdentityFromMemberships` elegiría
      // por antigüedad; se fija explícitamente para que el próximo login entre
      // en una organización previsible.
      const next = await tx.organizationMembership.findFirst({
        where: { userId: input.userId, status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (next) await tx.organizationMembership.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    await tx.authSession.updateMany({
      where: { userId: input.userId, activeOrgId: input.orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await writeAudit(tx, actor, {
      action: 'backoffice.membership.delete',
      entityType: 'OrganizationMembership',
      entityId: membership.id,
      orgId: input.orgId,
      targetUserId: input.userId,
      before: { role: membership.role, status: membership.status },
      reason: input.reason,
    })
    return { removed: true }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function updateUser(
  actor: PlatformActor,
  userId: string,
  input: { name?: string; email?: string; reason: string },
) {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
  if (!current) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')

  const email = input.email?.trim().toLowerCase()
  const name = input.name?.trim()
  const emailChanged = Boolean(email && email !== current.email)
  if (!emailChanged && (!name || name === current.name)) return { changed: false, user: current }

  try {
    return await prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { ...(name ? { name } : {}), ...(emailChanged ? { email } : {}) },
        select: { id: true, name: true, email: true },
      })
      // Cambiar el email cambia la credencial de acceso: las sesiones abiertas
      // se cierran para que quien la tuviera vuelva a identificarse.
      if (emailChanged) {
        await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      await writeAudit(tx, actor, {
        action: 'backoffice.user.update',
        entityType: 'User',
        entityId: userId,
        targetUserId: userId,
        before: { name: current.name, email: current.email },
        after: { name: updated.name, email: updated.email },
        reason: input.reason,
      })
      return { changed: true, user: updated }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BackOfficeError('Ese email ya pertenece a otra cuenta', 409, 'EMAIL_TAKEN')
    }
    throw error
  }
}

/**
 * Devuelve una contraseña temporal para entregar por un canal fuera de banda.
 * No se envía correo desde aquí a propósito: el operador decide cómo hacerla
 * llegar, y el usuario tiene además el flujo normal de "he olvidado mi
 * contraseña" si prefiere no recibirla de nadie.
 */
export async function resetUserPassword(actor: PlatformActor, userId: string, input: { reason: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!user) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')

  const temporaryPassword = `Vd-${randomBytes(12).toString('base64url')}`
  const passwordHash = await hashPassword(temporaryPassword)

  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(tx, actor, {
      action: 'backoffice.user.password.reset',
      entityType: 'User',
      entityId: userId,
      targetUserId: userId,
      // La contraseña generada jamás entra en la auditoría.
      after: { sessionsRevoked: true },
      reason: input.reason,
    })
  })

  return { temporaryPassword, email: user.email }
}

// ---------------------------------------------------------------------------
// Escritura — organizaciones
// ---------------------------------------------------------------------------

// El `select` se escribe literal en lugar de derivarlo de esta lista para que
// Prisma infiera un tipo concreto: con un select construido dinámicamente
// devuelve una unión enorme y las comparaciones campo a campo dejan de tipar.
const ORGANIZATION_SELECT = {
  name: true, plan: true, email: true, website: true, phone: true, industry: true,
  timezone: true, address: true, currency: true, metricoolEnabled: true,
} as const

export type OrganizationPatch = Partial<Record<keyof typeof ORGANIZATION_SELECT, string | boolean>>

export async function updateOrganization(
  actor: PlatformActor,
  orgId: string,
  patch: OrganizationPatch,
  reason: string,
) {
  const current = await prisma.organization.findUnique({ where: { id: orgId }, select: ORGANIZATION_SELECT })
  if (!current) throw new BackOfficeError('Organización no encontrada', 404, 'NOT_FOUND')

  const snapshot = current as Record<string, string | boolean | null>
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => value !== undefined && snapshot[key] !== value),
  )
  if (!Object.keys(changes).length) return { changed: false, organization: current }

  return prisma.$transaction(async tx => {
    const updated = await tx.organization.update({ where: { id: orgId }, data: changes })
    await writeAudit(tx, actor, {
      action: 'backoffice.organization.update',
      entityType: 'Organization',
      entityId: orgId,
      orgId,
      before: Object.fromEntries(Object.keys(changes).map(key => [key, snapshot[key]])),
      after: changes,
      reason,
    })
    return { changed: true, organization: updated }
  })
}

export async function createOrganization(
  actor: PlatformActor,
  input: { name: string; plan: string; email?: string; ownerUserId?: string; reason: string },
) {
  const owner = input.ownerUserId
    ? await prisma.user.findUnique({ where: { id: input.ownerUserId }, select: { id: true } })
    : null
  if (input.ownerUserId && !owner) throw new BackOfficeError('El usuario propietario no existe', 404, 'NOT_FOUND')

  return prisma.$transaction(async tx => {
    const org = await tx.organization.create({
      data: { name: input.name.trim(), plan: input.plan, ...(input.email ? { email: input.email.trim().toLowerCase() } : {}) },
      select: { id: true, name: true, plan: true, createdAt: true },
    })
    if (owner) {
      await tx.organizationMembership.create({
        data: { orgId: org.id, userId: owner.id, role: 'owner', status: 'active', isDefault: false, invitedById: actor.userId },
      })
    }
    await writeAudit(tx, actor, {
      action: 'backoffice.organization.create',
      entityType: 'Organization',
      entityId: org.id,
      orgId: org.id,
      targetUserId: owner?.id ?? null,
      after: { name: org.name, plan: org.plan, ownerUserId: owner?.id ?? null },
      reason: input.reason,
    })
    return { organization: org }
  })
}

export async function adjustWallet(
  actor: PlatformActor,
  orgId: string,
  input: { amountCents: number; reason: string },
) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, currency: true } })
  if (!org) throw new BackOfficeError('Organización no encontrada', 404, 'NOT_FOUND')

  return prisma.$transaction(async tx => {
    const wallet = await tx.wallet.upsert({
      where: { orgId },
      create: { orgId, currency: org.currency, balanceCents: 0 },
      update: {},
      select: { id: true, balanceCents: true },
    })
    const nextBalance = wallet.balanceCents + input.amountCents
    if (nextBalance < 0) throw new BackOfficeError('El ajuste dejaría el saldo en negativo', 409, 'NEGATIVE_BALANCE')

    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: nextBalance },
      select: { id: true, balanceCents: true, currency: true },
    })
    await tx.walletTransaction.create({
      data: {
        orgId,
        walletId: wallet.id,
        amountCents: input.amountCents,
        reason: 'adjustment',
        // Identifica el movimiento como ajuste manual del back office y evita
        // que un reintento del cliente lo aplique dos veces.
        idempotencyKey: `backoffice:${actor.userId}:${Date.now()}:${randomBytes(6).toString('hex')}`,
      },
    })
    await writeAudit(tx, actor, {
      action: 'backoffice.wallet.adjust',
      entityType: 'Wallet',
      entityId: wallet.id,
      orgId,
      before: { balanceCents: wallet.balanceCents },
      after: { balanceCents: updated.balanceCents, amountCents: input.amountCents },
      reason: input.reason,
    })
    return { wallet: updated }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

// ---------------------------------------------------------------------------
// Escritura — sesiones y credenciales
// ---------------------------------------------------------------------------

export async function revokeSession(actor: PlatformActor, sessionId: string, reason: string) {
  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, activeOrgId: true, revokedAt: true },
  })
  if (!session) throw new BackOfficeError('Sesión no encontrada', 404, 'NOT_FOUND')
  if (session.revokedAt) return { changed: false }

  await prisma.$transaction(async tx => {
    await tx.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(tx, actor, {
      action: 'backoffice.session.revoke',
      entityType: 'AuthSession',
      entityId: sessionId,
      orgId: session.activeOrgId,
      targetUserId: session.userId,
      after: { revoked: true },
      reason,
    })
  })
  return { changed: true }
}

export async function revokeAllUserSessions(actor: PlatformActor, userId: string, reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')

  return prisma.$transaction(async tx => {
    const revoked = await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(tx, actor, {
      action: 'backoffice.session.revoke_all',
      entityType: 'User',
      entityId: userId,
      targetUserId: userId,
      after: { revokedCount: revoked.count },
      reason,
    })
    return { revoked: revoked.count }
  })
}

export async function revokeApiKey(actor: PlatformActor, apiKeyId: string, reason: string) {
  const key = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { id: true, orgId: true, userId: true, name: true, prefix: true, revokedAt: true },
  })
  if (!key) throw new BackOfficeError('Clave de API no encontrada', 404, 'NOT_FOUND')
  if (key.revokedAt) return { changed: false }

  await prisma.$transaction(async tx => {
    await tx.apiKey.updateMany({ where: { id: apiKeyId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(tx, actor, {
      action: 'backoffice.api_key.revoke',
      entityType: 'ApiKey',
      entityId: apiKeyId,
      orgId: key.orgId,
      targetUserId: key.userId,
      before: { name: key.name, prefix: key.prefix },
      after: { revoked: true },
      reason,
    })
  })
  return { changed: true }
}

// ---------------------------------------------------------------------------
// Suplantación
// ---------------------------------------------------------------------------

/**
 * Abre una sesión de solo 30 minutos a nombre de otra persona.
 *
 * La sesión se guarda con `impersonatedByUserId` pero su secreto de refresco
 * **no se devuelve nunca**: el operador recibe un access token de 15 minutos y
 * nada más. Así la suplantación no puede renovarse en silencio ni sustituye la
 * cookie de sesión del propio operador, que sigue intacta.
 */
export async function startImpersonation(
  actor: PlatformActor,
  input: { userId: string; orgId?: string; reason: string },
) {
  if (input.userId === actor.userId) {
    throw new BackOfficeError('No tiene sentido suplantarte a ti mismo', 400, 'SELF_IMPERSONATION')
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true, orgId: true, isPlatformAdmin: true },
  })
  if (!target) throw new BackOfficeError('Usuario no encontrado', 404, 'NOT_FOUND')
  // Suplantar a otro operador equivaldría a heredar su privilegio sin dejar su
  // nombre en la auditoría de lo que se haga después.
  if (target.isPlatformAdmin) {
    throw new BackOfficeError('No se puede suplantar a otro operador de plataforma', 403, 'TARGET_IS_PLATFORM_ADMIN')
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: target.id, status: 'active' },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { orgId: true, role: true, org: { select: { id: true, name: true, plan: true } } },
  })
  const membership = input.orgId ? memberships.find(row => row.orgId === input.orgId) : memberships[0]
  if (!membership) {
    throw new BackOfficeError('Esa persona no tiene una membresía activa en esa organización', 409, 'NO_ACTIVE_MEMBERSHIP')
  }

  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60 * 1000)
  const session = await prisma.$transaction(async tx => {
    const created = await tx.authSession.create({
      data: {
        userId: target.id,
        // La sesión existe para que `authenticate` la valide y para poder
        // cortarla, no para renovarse: el hash no corresponde a ningún secreto
        // entregado, así que /api/auth/refresh nunca puede acertarlo.
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt,
        activeOrgId: membership.orgId,
        impersonatedByUserId: actor.userId,
      },
      select: { id: true, expiresAt: true },
    })
    await writeAudit(tx, actor, {
      action: 'backoffice.impersonate.start',
      entityType: 'AuthSession',
      entityId: created.id,
      orgId: membership.orgId,
      targetUserId: target.id,
      after: { targetEmail: target.email, orgId: membership.orgId, role: membership.role, expiresAt: created.expiresAt },
      reason: input.reason,
    })
    return created
  })

  return {
    session,
    identity: { id: target.id, name: target.name, email: target.email, orgId: membership.orgId, role: membership.role },
    organization: membership.org,
    expiresAt,
  }
}

export async function stopImpersonation(actor: PlatformActor, sessionId: string) {
  const session = await prisma.authSession.findFirst({
    where: { id: sessionId, impersonatedByUserId: actor.userId },
    select: { id: true, userId: true, activeOrgId: true, revokedAt: true },
  })
  if (!session) throw new BackOfficeError('Sesión de suplantación no encontrada', 404, 'NOT_FOUND')
  if (session.revokedAt) return { changed: false }

  await prisma.$transaction(async tx => {
    await tx.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(tx, actor, {
      action: 'backoffice.impersonate.stop',
      entityType: 'AuthSession',
      entityId: sessionId,
      orgId: session.activeOrgId,
      targetUserId: session.userId,
      after: { revoked: true },
    })
  })
  return { changed: true }
}
