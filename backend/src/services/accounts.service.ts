import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'

/** Errores de dominio para que el controller pueda mapear a códigos HTTP, mismo patrón que leads.service. */
export class OwnershipError extends Error {
  constructor(public field: string) {
    super(`${field} no pertenece a la organización`)
    this.name = 'OwnershipError'
  }
}

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account not found')
    this.name = 'AccountNotFoundError'
  }
}

export class LeadNotFoundError extends Error {
  constructor() {
    super('Lead not found')
    this.name = 'LeadNotFoundError'
  }
}

/**
 * Normaliza un dominio/URL a su forma comparable: minúsculas, sin protocolo,
 * sin "www.", sin path/query ni puerto. Devuelve null si no queda nada útil.
 */
function normalizeDomain(input?: string | null): string | null {
  if (!input) return null
  let value = input.trim().toLowerCase()
  if (!value) return null
  value = value.replace(/^https?:\/\//, '')
  value = value.replace(/^www\./, '')
  value = value.split('/')[0].split('?')[0].split('#')[0]
  value = value.split(':')[0] // descarta el puerto, si lo hubiera
  return value || null
}

async function assertOwnedOwner(orgId: string, ownerId?: string | null) {
  if (!ownerId) return
  const owner = await prisma.user.findFirst({ where: { id: ownerId, orgId }, select: { id: true } })
  if (!owner) throw new OwnershipError('ownerId')
}

interface AccountInput {
  name: string
  domain?: string
  industry?: string
  sizeBand?: string
  website?: string
  phone?: string
  address?: string
  ownerId?: string | null
  source?: string
  lifecycleStatus?: string
  customFields?: Record<string, unknown>
}

/**
 * Crea una Account. Dedupe simple por dominio normalizado dentro de la org:
 * en vez de fallar con un 409 (que rompería flujos de creación rápida desde
 * el frontend), si ya existe una Account con el mismo dominio se devuelve la
 * existente con `deduped: true` para que la UI pueda avisar sin bloquear al
 * usuario. Sin dominio (ni en `domain` ni en `website`) no hay forma fiable
 * de deduplicar por nombre solo, así que se crea siempre.
 */
export async function createAccount(
  orgId: string,
  actorUserId: string | null | undefined,
  data: AccountInput
) {
  await assertOwnedOwner(orgId, data.ownerId)

  const normalizedName = data.name.trim().toLowerCase()
  const domain = normalizeDomain(data.domain ?? data.website)

  if (domain) {
    const existing = await prisma.account.findFirst({ where: { orgId, domain } })
    if (existing) {
      return { ...existing, deduped: true as const }
    }
  }

  const account = await prisma.account.create({
    data: {
      orgId,
      name: data.name.trim(),
      normalizedName,
      domain,
      industry: data.industry,
      sizeBand: data.sizeBand,
      website: data.website,
      phone: data.phone,
      address: data.address,
      ownerId: data.ownerId ?? undefined,
      source: data.source,
      lifecycleStatus: data.lifecycleStatus ?? undefined,
      customFields: data.customFields as any,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'account.create',
    entityType: 'Account',
    entityId: account.id,
    after: account,
  })

  return { ...account, deduped: false as const }
}

export async function updateAccount(
  orgId: string,
  actorUserId: string | null | undefined,
  id: string,
  data: Partial<AccountInput>
) {
  await assertOwnedOwner(orgId, data.ownerId)

  const before = await prisma.account.findFirst({ where: { id, orgId } })
  if (!before) throw new AccountNotFoundError()

  const updateData: Record<string, unknown> = { ...data }
  if (data.name !== undefined) updateData.normalizedName = data.name.trim().toLowerCase()
  if (data.domain !== undefined || data.website !== undefined) {
    updateData.domain = normalizeDomain(data.domain ?? data.website ?? before.domain)
  }

  const result = await prisma.account.updateMany({
    where: { id, orgId },
    data: updateData as any,
  })
  if (result.count === 0) throw new AccountNotFoundError()

  const after = await prisma.account.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'account.update',
    entityType: 'Account',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  return after
}

interface AccountFilters {
  search?: string
  ownerId?: string
  page?: number
  limit?: number
}

/** Listado paginado, mismo patrón que listLeads (LE-101). */
export async function listAccounts(orgId: string, filters: AccountFilters = {}) {
  const { search, ownerId, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (ownerId) where.ownerId = ownerId
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { domain: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.account.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getAccount(orgId: string, id: string) {
  const account = await prisma.account.findFirst({
    where: { id, orgId },
    include: {
      leads: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } },
      opportunities: { select: { id: true, name: true, stage: true, value: true, createdAt: true } },
    },
  })
  return account
}

/**
 * Vincula (o desvincula con `accountId: null`) un Lead a una Account.
 * Valida que ambos pertenezcan a la organización antes de tocar la base.
 */
export async function assignLeadToAccount(
  orgId: string,
  actorUserId: string | null | undefined,
  leadId: string,
  accountId: string | null
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  if (!lead) throw new LeadNotFoundError()

  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, orgId }, select: { id: true } })
    if (!account) throw new OwnershipError('accountId')
  }

  const result = await prisma.lead.updateMany({
    where: { id: leadId, orgId },
    data: { accountId },
  })
  if (result.count === 0) throw new LeadNotFoundError()

  const after = await prisma.lead.findFirst({ where: { id: leadId, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'lead.account.assign',
    entityType: 'Lead',
    entityId: leadId,
    before: lead,
    after: after ?? undefined,
  })

  return after
}
