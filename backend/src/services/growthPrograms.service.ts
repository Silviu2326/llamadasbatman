import { GrowthProgram, GrowthProgramType, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'

/** Los tipos son parte del contrato de producto y no dependen de texto libre. */
export const GROWTH_PROGRAM_TYPES = [
  'newsletter',
  'lead_magnet',
  'popup',
  'automation_journey',
  'webinar',
  'referral',
  'nps',
  'sales_sequence',
  'proposal',
  'customer_health',
] as const satisfies readonly GrowthProgramType[]

export type GrowthProgramStatus = 'draft' | 'active' | 'paused' | 'scheduled' | 'completed'

export interface ProgramFilters {
  type?: GrowthProgramType
  status?: GrowthProgramStatus | 'archived'
  includeArchived?: boolean
  limit?: number
}

export interface CreateGrowthProgramInput {
  type: GrowthProgramType
  name: string
  description?: string
  status?: GrowthProgramStatus
  config?: Record<string, unknown> | null
  metrics?: Record<string, unknown> | null
  startsAt?: string | null
  endsAt?: string | null
}

export interface UpdateGrowthProgramInput {
  name?: string
  description?: string | null
  status?: GrowthProgramStatus
  config?: Record<string, unknown> | null
  metrics?: Record<string, unknown> | null
  startsAt?: string | null
  endsAt?: string | null
}

export class GrowthProgramNotFoundError extends Error {
  constructor() {
    super('Programa no encontrado')
    this.name = 'GrowthProgramNotFoundError'
  }
}

export class GrowthProgramArchivedError extends Error {
  constructor() {
    super('Un programa archivado no se puede modificar')
    this.name = 'GrowthProgramArchivedError'
  }
}

export class GrowthProgramScheduleError extends Error {
  constructor() {
    super('La fecha de inicio debe ser anterior o igual a la fecha de fin')
    this.name = 'GrowthProgramScheduleError'
  }
}

function asDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined
  // Un null de la API borra la configuración; no se persiste como el valor JSON
  // `null`, que haría ambigua la lectura para los consumidores.
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

function assertSchedule(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
    throw new GrowthProgramScheduleError()
  }
}

async function findOwned(orgId: string, id: string): Promise<GrowthProgram> {
  const program = await prisma.growthProgram.findFirst({ where: { id, orgId } })
  if (!program) throw new GrowthProgramNotFoundError()
  return program
}

/** Lista deliberadamente acotada e indexada por organización. */
export async function listGrowthPrograms(orgId: string, filters: ProgramFilters = {}) {
  const where: Prisma.GrowthProgramWhereInput = { orgId }
  if (filters.type) where.type = filters.type
  if (filters.status) where.status = filters.status
  if (!filters.includeArchived && filters.status !== 'archived') where.archivedAt = null

  const programs = await prisma.growthProgram.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: filters.limit ?? 100,
  })
  return { programs, total: programs.length }
}

export async function getGrowthProgram(orgId: string, id: string): Promise<GrowthProgram> {
  return findOwned(orgId, id)
}

export async function createGrowthProgram(
  orgId: string,
  actorUserId: string,
  input: CreateGrowthProgramInput,
): Promise<GrowthProgram> {
  const startsAt = asDate(input.startsAt)
  const endsAt = asDate(input.endsAt)
  assertSchedule(startsAt, endsAt)

  const program = await prisma.growthProgram.create({
    data: {
      orgId,
      type: input.type,
      name: input.name,
      description: input.description,
      status: input.status ?? 'draft',
      config: asJson(input.config),
      metrics: asJson(input.metrics),
      startsAt,
      endsAt,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'growth_program.create',
    entityType: 'GrowthProgram',
    entityId: program.id,
    after: program,
  })
  return program
}

export async function updateGrowthProgram(
  orgId: string,
  actorUserId: string,
  id: string,
  input: UpdateGrowthProgramInput,
): Promise<GrowthProgram> {
  const before = await findOwned(orgId, id)
  if (before.archivedAt) throw new GrowthProgramArchivedError()

  const startsAt = asDate(input.startsAt)
  const endsAt = asDate(input.endsAt)
  assertSchedule(startsAt === undefined ? before.startsAt : startsAt, endsAt === undefined ? before.endsAt : endsAt)

  const data: Prisma.GrowthProgramUpdateManyMutationInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.status !== undefined) data.status = input.status
  if (input.config !== undefined) data.config = asJson(input.config)
  if (input.metrics !== undefined) data.metrics = asJson(input.metrics)
  if (startsAt !== undefined) data.startsAt = startsAt
  if (endsAt !== undefined) data.endsAt = endsAt

  const result = await prisma.growthProgram.updateMany({ where: { id, orgId, archivedAt: null }, data })
  if (result.count !== 1) {
    // La fila puede haberse archivado entre el read y el update; no aceptamos
    // que un write tardío la reactive por accidente.
    const current = await findOwned(orgId, id)
    if (current.archivedAt) throw new GrowthProgramArchivedError()
    throw new GrowthProgramNotFoundError()
  }

  const after = await findOwned(orgId, id)
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'growth_program.update',
    entityType: 'GrowthProgram',
    entityId: id,
    before,
    after,
  })
  return after
}

/** Archivo idempotente: conserva el registro para auditoría, no lo borra. */
export async function archiveGrowthProgram(
  orgId: string,
  actorUserId: string,
  id: string,
): Promise<GrowthProgram> {
  const before = await findOwned(orgId, id)
  if (before.archivedAt) return before

  const result = await prisma.growthProgram.updateMany({
    where: { id, orgId, archivedAt: null },
    data: { archivedAt: new Date(), status: 'archived' },
  })
  if (result.count !== 1) return findOwned(orgId, id)

  const after = await findOwned(orgId, id)
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'growth_program.archive',
    entityType: 'GrowthProgram',
    entityId: id,
    before,
    after,
  })
  return after
}

/** Resumen para la portada: conteos consultables, próximos lanzamientos y actividad reciente. */
export async function getGrowthProgramsDashboard(orgId: string) {
  const now = new Date()
  const [total, archived, active, draft, paused, scheduled, completed, upcoming, grouped, recent] = await Promise.all([
    prisma.growthProgram.count({ where: { orgId } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: { not: null } } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, status: 'active' } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, status: 'draft' } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, status: 'paused' } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, status: 'scheduled' } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, status: 'completed' } }),
    prisma.growthProgram.count({ where: { orgId, archivedAt: null, startsAt: { gt: now } } }),
    prisma.growthProgram.groupBy({
      by: ['type'],
      where: { orgId, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.growthProgram.findMany({
      where: { orgId, archivedAt: null },
      select: { id: true, type: true, name: true, status: true, startsAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])

  const typeCounts = Object.fromEntries(GROWTH_PROGRAM_TYPES.map(type => [type, 0])) as Record<GrowthProgramType, number>
  for (const group of grouped) typeCounts[group.type] = group._count._all

  return {
    totals: { total, active, draft, paused, scheduled, completed, archived, upcoming },
    byType: GROWTH_PROGRAM_TYPES.map(type => ({ type, total: typeCounts[type] })),
    recent,
  }
}
