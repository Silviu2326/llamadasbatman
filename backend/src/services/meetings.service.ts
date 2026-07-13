import { prisma } from '../lib/prisma'
import { MeetingStatus } from '@prisma/client'
import { sendScheduleEvent } from './metaConversions.service'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'

interface MeetingFilters {
  assignedTo?: string
  status?: MeetingStatus
  dateFrom?: string
  dateTo?: string
  /** RE-103: busca por título de la reunión o nombre del lead asociado. */
  search?: string
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

export async function getMeeting(orgId: string, id: string) {
  return prisma.meeting.findFirst({
    where: { id, orgId },
    include: { lead: true, assignee: { select: { id: true, name: true, role: true } } },
  })
}

export async function listMeetings(orgId: string, filters: MeetingFilters = {}) {
  const { assignedTo, status, dateFrom, dateTo, search, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (assignedTo) where.assignedTo = assignedTo
  if (status) where.status = status
  if (dateFrom || dateTo) {
    where.scheduledAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    }
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { lead: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      include: { lead: true, assignee: { select: { id: true, name: true, role: true } } },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.meeting.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * Valida que las referencias recibidas del cliente (lead, call, usuario asignado)
 * pertenezcan a la organización antes de dejarlas tocar la base (P0-01/VE-01).
 */
async function assertOwnedReferences(orgId: string, refs: {
  leadId?: string
  callId?: string
  assignedTo?: string
}) {
  const checks: Promise<void>[] = []

  if (refs.leadId !== undefined) {
    checks.push(
      prisma.lead.findFirst({ where: { id: refs.leadId, orgId }, select: { id: true } }).then((lead) => {
        if (!lead) throw new OwnershipError('leadId')
      })
    )
  }
  if (refs.callId) {
    checks.push(
      prisma.call.findFirst({ where: { id: refs.callId, orgId }, select: { id: true } }).then((call) => {
        if (!call) throw new OwnershipError('callId')
      })
    )
  }
  if (refs.assignedTo) {
    checks.push(
      prisma.user.findFirst({ where: { id: refs.assignedTo, orgId }, select: { id: true } }).then((user) => {
        if (!user) throw new OwnershipError('assignedTo')
      })
    )
  }

  await Promise.all(checks)
}

export async function createMeeting(orgId: string, actorUserId: string | null | undefined, data: {
  leadId: string
  callId?: string
  assignedTo?: string
  title: string
  scheduledAt: string
  durationMinutes?: number
  notes?: string
  meetingUrl?: string
}) {
  await assertOwnedReferences(orgId, {
    leadId: data.leadId,
    callId: data.callId,
    assignedTo: data.assignedTo,
  })

  const meeting = await prisma.meeting.create({
    data: {
      orgId,
      leadId: data.leadId,
      callId: data.callId,
      assignedTo: data.assignedTo,
      title: data.title,
      scheduledAt: new Date(data.scheduledAt),
      durationMinutes: data.durationMinutes ?? 30,
      notes: data.notes,
      meetingUrl: data.meetingUrl,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'meeting.create',
    entityType: 'Meeting',
    entityId: meeting.id,
    after: meeting,
  })

  await sendScheduleEvent(orgId, meeting).catch(() => {})

  await logSalesActivity({
    orgId,
    type: 'meeting',
    leadId: data.leadId,
    meetingId: meeting.id,
    actorUserId,
    subject: data.title,
    source: 'meeting_created',
    sourceId: meeting.id,
  })

  return meeting
}

/** Error de dominio para 404 (P0-02): la fila no existe o no pertenece a la org. */
export class MeetingNotFoundError extends Error {
  constructor() {
    super('Meeting not found')
    this.name = 'MeetingNotFoundError'
  }
}

export async function updateMeeting(orgId: string, actorUserId: string | null | undefined, id: string, data: {
  title?: string
  scheduledAt?: string
  durationMinutes?: number
  status?: MeetingStatus
  notes?: string
  meetingUrl?: string
  assignedTo?: string
}) {
  await assertOwnedReferences(orgId, { assignedTo: data.assignedTo })

  const before = await prisma.meeting.findFirst({ where: { id, orgId } })
  if (!before) throw new MeetingNotFoundError()

  const result = await prisma.meeting.updateMany({
    where: { id, orgId },
    data: {
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
  })

  if (result.count === 0) throw new MeetingNotFoundError()

  const after = await prisma.meeting.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: data.status === 'cancelled' && before.status !== 'cancelled' ? 'meeting.cancel' : 'meeting.update',
    entityType: 'Meeting',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  if (data.status === 'cancelled' && before.status !== 'cancelled') {
    await logSalesActivity({
      orgId,
      type: 'meeting',
      leadId: before.leadId,
      meetingId: id,
      actorUserId,
      subject: 'Reunión cancelada',
      source: 'meeting_cancelled',
      sourceId: id,
    })
  }

  return after
}

/**
 * RE-102: reprogramar una reunión de verdad — actualiza scheduledAt (y
 * vuelve el status a 'scheduled' si estaba cancelada/no_show/completed, que
 * son los únicos estados desde los que tiene sentido reprogramar) y deja
 * rastro en SalesActivity con el from/to para que se pueda ver el historial.
 * No usamos updateMeeting() porque necesitamos capturar el scheduledAt
 * anterior atómicamente junto con la comprobación de ownership.
 */
export async function rescheduleMeeting(
  orgId: string,
  actorUserId: string | null | undefined,
  id: string,
  data: { scheduledAt: string; reason?: string }
) {
  const before = await prisma.meeting.findFirst({ where: { id, orgId } })
  if (!before) throw new MeetingNotFoundError()

  const oldScheduledAt = before.scheduledAt
  const newScheduledAt = new Date(data.scheduledAt)

  const result = await prisma.meeting.updateMany({
    where: { id, orgId },
    data: {
      scheduledAt: newScheduledAt,
      status: 'scheduled',
    },
  })

  if (result.count === 0) throw new MeetingNotFoundError()

  const after = await prisma.meeting.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'meeting.reschedule',
    entityType: 'Meeting',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  await logSalesActivity({
    orgId,
    type: 'meeting',
    leadId: before.leadId,
    meetingId: id,
    actorUserId,
    subject: 'Reunión reprogramada',
    source: 'meeting_rescheduled',
    metadata: {
      from: oldScheduledAt.toISOString(),
      to: newScheduledAt.toISOString(),
      reason: data.reason ?? null,
    },
  })

  return after
}
