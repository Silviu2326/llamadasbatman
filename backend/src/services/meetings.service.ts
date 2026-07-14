import { prisma } from '../lib/prisma'
import { MeetingStatus, Prisma } from '@prisma/client'
import { sendScheduleEvent } from './metaConversions.service'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'
import * as tasksService from './tasks.service'

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

/**
 * RE-108: contexto real para preparar una reunión — sustituye la agenda y el
 * checklist con constantes fijas que señala la auditoría (03-ventas.md) por
 * datos reales del lead. Todo se consulta en paralelo y se devuelve tal cual
 * (sin resumen generado por IA): la UI decide cómo presentarlo y cómo mostrar
 * "sin datos" cuando alguna sección viene vacía.
 */
export async function getMeetingPrep(orgId: string, meetingId: string) {
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, orgId } })
  if (!meeting) throw new MeetingNotFoundError()

  const { leadId } = meeting

  const [lead, recentNotes, recentCalls, openOpportunity, recentActivity, previousMeetings] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: leadId, orgId },
      select: {
        id: true,
        name: true,
        company: true,
        status: true,
        email: true,
        phone: true,
        source: true,
      },
    }),
    prisma.leadNote.findMany({
      where: { orgId, leadId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, text: true, authorName: true, createdAt: true },
    }),
    prisma.call.findMany({
      where: { orgId, leadId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        status: true,
        outcome: true,
        summary: true,
        sentiment: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
      },
    }),
    // Oportunidad abierta más reciente del lead (no cerrada ganada/perdida).
    prisma.opportunity.findFirst({
      where: { orgId, leadId, stage: { notIn: ['closed_won', 'closed_lost'] } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        stage: true,
        value: true,
        currency: true,
        probability: true,
        expectedCloseDate: true,
      },
    }),
    // FND-02: reutiliza el mismo timeline comercial (SalesActivity), sin
    // duplicar la lógica de escritura de lib/salesActivity.ts.
    prisma.salesActivity.findMany({
      where: { orgId, leadId },
      orderBy: { occurredAt: 'desc' },
      take: 5,
    }),
    // RE-107: reuniones anteriores con el mismo lead, con su outcome/agreements
    // si ya se completaron.
    prisma.meeting.findMany({
      where: { orgId, leadId, id: { not: meetingId } },
      orderBy: { scheduledAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        status: true,
        outcome: true,
        agreements: true,
      },
    }),
  ])

  return { lead, recentNotes, recentCalls, openOpportunity, recentActivity, previousMeetings }
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

  // AU-107: publica al outbox para que el motor de automatizaciones pueda
  // reaccionar al evento 'meeting.created' (mismo patrón que conversations.service.ts).
  await prisma.outboxEvent.create({
    data: {
      orgId,
      topic: 'meeting.created',
      aggregateType: 'Meeting',
      aggregateId: meeting.id,
      payload: {
        eventId: `meeting.created:${meeting.id}`,
        meetingId: meeting.id,
        leadId: meeting.leadId,
        scheduledAt: meeting.scheduledAt.toISOString(),
      } as Prisma.InputJsonObject,
    },
  }).catch((err) => console.error('[meetings] error publicando meeting.created', err))

  return meeting
}

/** Error de dominio para 404 (P0-02): la fila no existe o no pertenece a la org. */
export class MeetingNotFoundError extends Error {
  constructor() {
    super('Meeting not found')
    this.name = 'MeetingNotFoundError'
  }
}

/** Error de dominio para 409 (RE-107): la reunión está en un estado desde el
 * que no tiene sentido completarla / marcarla como no-show (p.ej. cancelada). */
export class MeetingStateError extends Error {
  constructor(public status: string) {
    super(`La reunión está en estado "${status}" y no admite esta acción`)
    this.name = 'MeetingStateError'
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

    // AU-107: evento de dominio 'meeting.cancelled'.
    await prisma.outboxEvent.create({
      data: {
        orgId,
        topic: 'meeting.cancelled',
        aggregateType: 'Meeting',
        aggregateId: id,
        payload: { eventId: `meeting.cancelled:${id}`, meetingId: id, leadId: before.leadId } as Prisma.InputJsonObject,
      },
    }).catch((err) => console.error('[meetings] error publicando meeting.cancelled', err))
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

  // AU-107: evento de dominio 'meeting.rescheduled'.
  await prisma.outboxEvent.create({
    data: {
      orgId,
      topic: 'meeting.rescheduled',
      aggregateType: 'Meeting',
      aggregateId: id,
      payload: {
        eventId: `meeting.rescheduled:${id}:${newScheduledAt.getTime()}`,
        meetingId: id,
        leadId: before.leadId,
        from: oldScheduledAt.toISOString(),
        to: newScheduledAt.toISOString(),
      } as Prisma.InputJsonObject,
    },
  }).catch((err) => console.error('[meetings] error publicando meeting.rescheduled', err))

  return after
}

/**
 * RE-107: cierra una reunión con su resultado real (outcome/acuerdos) — no es
 * un simple cambio de status vía updateMeeting() porque además crea la tarea
 * de seguimiento por defecto (AU-06) y deja rastro específico en el timeline
 * comercial. No se puede completar una reunión ya cancelada.
 */
export async function completeMeeting(
  orgId: string,
  actorUserId: string | null | undefined,
  id: string,
  data: { outcome: string; agreements?: string; createFollowUpTask?: boolean }
) {
  const before = await prisma.meeting.findFirst({ where: { id, orgId } })
  if (!before) throw new MeetingNotFoundError()
  if (before.status === 'cancelled') throw new MeetingStateError(before.status)

  const result = await prisma.meeting.updateMany({
    where: { id, orgId },
    data: { status: 'completed', outcome: data.outcome, agreements: data.agreements },
  })
  if (result.count === 0) throw new MeetingNotFoundError()

  const after = await prisma.meeting.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'meeting.complete',
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
    subject: 'Reunión completada',
    body: data.outcome,
    source: 'meeting_completed',
    sourceId: id,
    metadata: { outcome: data.outcome, agreements: data.agreements ?? null },
  })

  // Salvo que se pida explícitamente lo contrario, cerrar una reunión deja
  // una tarea de seguimiento real en la agenda del asignado (o de quien
  // completa la reunión si no hay asignado), a +2 días.
  let followUpTask = null
  if (data.createFollowUpTask !== false) {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    followUpTask = await tasksService.createTask(orgId, actorUserId, {
      type: 'follow_up',
      title: `Seguimiento: ${before.title}`,
      description: data.agreements ? `Acuerdos: ${data.agreements}` : undefined,
      leadId: before.leadId,
      meetingId: id,
      ownerId: before.assignedTo ?? actorUserId ?? undefined,
      dueAt: dueAt.toISOString(),
      source: 'automation',
      sourceId: `meeting-followup:${id}`,
    })
  }

  await prisma.outboxEvent.create({
    data: {
      orgId,
      topic: 'meeting.completed',
      aggregateType: 'Meeting',
      aggregateId: id,
      payload: {
        eventId: `meeting.completed:${id}`,
        meetingId: id,
        leadId: before.leadId,
        outcome: data.outcome,
        agreements: data.agreements ?? null,
      } as Prisma.InputJsonObject,
    },
  }).catch((err) => console.error('[meetings] error publicando meeting.completed', err))

  return { meeting: after, followUpTask }
}

/**
 * RE-107: registra que el lead no se presentó. Distinto de 'cancelled' (que
 * significa que la reunión se anuló de antemano) — no-show es que ocurrió el
 * hueco y el lead no apareció.
 */
export async function markNoShow(
  orgId: string,
  actorUserId: string | null | undefined,
  id: string,
  data: { notes?: string }
) {
  const before = await prisma.meeting.findFirst({ where: { id, orgId } })
  if (!before) throw new MeetingNotFoundError()
  if (before.status === 'cancelled') throw new MeetingStateError(before.status)

  const result = await prisma.meeting.updateMany({
    where: { id, orgId },
    data: { status: 'no_show', notes: data.notes ?? before.notes },
  })
  if (result.count === 0) throw new MeetingNotFoundError()

  const after = await prisma.meeting.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'meeting.no_show',
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
    subject: 'Reunión: no se presentó',
    body: data.notes,
    source: 'meeting_no_show',
    sourceId: id,
  })

  await prisma.outboxEvent.create({
    data: {
      orgId,
      topic: 'meeting.no_show',
      aggregateType: 'Meeting',
      aggregateId: id,
      payload: { eventId: `meeting.no_show:${id}`, meetingId: id, leadId: before.leadId } as Prisma.InputJsonObject,
    },
  }).catch((err) => console.error('[meetings] error publicando meeting.no_show', err))

  return after
}
