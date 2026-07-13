import { prisma } from '../lib/prisma'
import { TaskPriority, TaskStatus } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'

interface TaskFilters {
  ownerId?: string
  leadId?: string
  opportunityId?: string
  meetingId?: string
  status?: TaskStatus
  dueBefore?: string
  page?: number
  limit?: number
}

/** Errores de dominio para que el controller pueda mapear a códigos HTTP. */
export class OwnershipError extends Error {
  constructor(public field: string) {
    super(`${field} no pertenece a la organización`)
    this.name = 'OwnershipError'
  }
}

/** Error de dominio para 404: la fila no existe o no pertenece a la org. */
export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found')
    this.name = 'TaskNotFoundError'
  }
}

export async function listTasks(orgId: string, filters: TaskFilters = {}) {
  const { ownerId, leadId, opportunityId, meetingId, status, dueBefore, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (ownerId) where.ownerId = ownerId
  if (leadId) where.leadId = leadId
  if (opportunityId) where.opportunityId = opportunityId
  if (meetingId) where.meetingId = meetingId
  if (status) where.status = status
  if (dueBefore) where.dueAt = { lte: new Date(dueBefore) }

  const [data, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }],
      skip,
      take: limit,
      include: {
        owner: { select: { id: true, name: true, role: true } },
        lead: { select: { id: true, name: true, company: true } },
      },
    }),
    prisma.task.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getTask(orgId: string, id: string) {
  return prisma.task.findFirst({
    where: { id, orgId },
    include: {
      owner: { select: { id: true, name: true, role: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })
}

/**
 * Valida que las referencias recibidas del cliente (owner, lead, opportunity,
 * meeting, conversation) pertenezcan a la organización antes de dejarlas
 * tocar la base (mismo patrón que meetings.service.ts).
 */
async function assertOwnedReferences(orgId: string, refs: {
  ownerId?: string
  leadId?: string
  opportunityId?: string
  meetingId?: string
  conversationId?: string
}) {
  const checks: Promise<void>[] = []

  if (refs.ownerId) {
    checks.push(
      prisma.user.findFirst({ where: { id: refs.ownerId, orgId }, select: { id: true } }).then((user) => {
        if (!user) throw new OwnershipError('ownerId')
      })
    )
  }
  if (refs.leadId) {
    checks.push(
      prisma.lead.findFirst({ where: { id: refs.leadId, orgId }, select: { id: true } }).then((lead) => {
        if (!lead) throw new OwnershipError('leadId')
      })
    )
  }
  if (refs.opportunityId) {
    checks.push(
      prisma.opportunity.findFirst({ where: { id: refs.opportunityId, orgId }, select: { id: true } }).then((opportunity) => {
        if (!opportunity) throw new OwnershipError('opportunityId')
      })
    )
  }
  if (refs.meetingId) {
    checks.push(
      prisma.meeting.findFirst({ where: { id: refs.meetingId, orgId }, select: { id: true } }).then((meeting) => {
        if (!meeting) throw new OwnershipError('meetingId')
      })
    )
  }
  if (refs.conversationId) {
    checks.push(
      prisma.conversation.findFirst({ where: { id: refs.conversationId, orgId }, select: { id: true } }).then((conversation) => {
        if (!conversation) throw new OwnershipError('conversationId')
      })
    )
  }

  await Promise.all(checks)
}

export interface CreateTaskInput {
  type?: string
  title: string
  description?: string
  ownerId?: string
  priority?: TaskPriority
  dueAt?: string
  reminderAt?: string
  leadId?: string
  opportunityId?: string
  meetingId?: string
  conversationId?: string
  source?: string
  sourceId?: string
}

export async function createTask(orgId: string, actorUserId: string | null | undefined, data: CreateTaskInput) {
  await assertOwnedReferences(orgId, {
    ownerId: data.ownerId,
    leadId: data.leadId,
    opportunityId: data.opportunityId,
    meetingId: data.meetingId,
    conversationId: data.conversationId,
  })

  const task = await prisma.task.create({
    data: {
      orgId,
      type: data.type,
      title: data.title,
      description: data.description,
      ownerId: data.ownerId,
      priority: data.priority,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      reminderAt: data.reminderAt ? new Date(data.reminderAt) : undefined,
      leadId: data.leadId,
      opportunityId: data.opportunityId,
      meetingId: data.meetingId,
      conversationId: data.conversationId,
      source: data.source,
      sourceId: data.sourceId,
      createdById: actorUserId ?? undefined,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'task.create',
    entityType: 'Task',
    entityId: task.id,
    after: task,
  })

  return task
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  priority?: TaskPriority
  dueAt?: string
  reminderAt?: string
  ownerId?: string
}

export async function updateTask(orgId: string, actorUserId: string | null | undefined, id: string, data: UpdateTaskInput) {
  await assertOwnedReferences(orgId, { ownerId: data.ownerId })

  const before = await prisma.task.findFirst({ where: { id, orgId } })
  if (!before) throw new TaskNotFoundError()

  const result = await prisma.task.updateMany({
    where: { id, orgId },
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      ownerId: data.ownerId,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      reminderAt: data.reminderAt ? new Date(data.reminderAt) : undefined,
    },
  })

  if (result.count === 0) throw new TaskNotFoundError()

  const after = await prisma.task.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'task.update',
    entityType: 'Task',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  return after
}

export async function completeTask(orgId: string, actorUserId: string | null | undefined, id: string) {
  const before = await prisma.task.findFirst({ where: { id, orgId } })
  if (!before) throw new TaskNotFoundError()

  const result = await prisma.task.updateMany({
    where: { id, orgId },
    data: { status: TaskStatus.completed, completedAt: new Date() },
  })
  if (result.count === 0) throw new TaskNotFoundError()

  const after = await prisma.task.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'task.complete',
    entityType: 'Task',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  return after
}

export async function cancelTask(orgId: string, actorUserId: string | null | undefined, id: string) {
  const before = await prisma.task.findFirst({ where: { id, orgId } })
  if (!before) throw new TaskNotFoundError()

  const result = await prisma.task.updateMany({
    where: { id, orgId },
    data: { status: TaskStatus.cancelled },
  })
  if (result.count === 0) throw new TaskNotFoundError()

  const after = await prisma.task.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'task.cancel',
    entityType: 'Task',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  return after
}
