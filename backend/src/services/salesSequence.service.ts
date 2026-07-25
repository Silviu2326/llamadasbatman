import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { createEmailDelivery, sendEmailToLead } from './mauticSync.service'
import { createSystemTask } from './tasks.service'

const DAY_MS = 86_400_000
const DEFAULT_LEASE_MS = 60_000
const MAX_LEADS_PER_ENROLLMENT = 1_000
const MAX_STEPS = 20
const WORKER_ID = process.env.SALES_SEQUENCE_WORKER_ID?.trim() || `sales-sequence-${process.pid}`

export type SalesSequenceStepType = 'email' | 'task' | 'meeting'

export interface SalesSequenceStepConfig {
  key?: string
  type: SalesSequenceStepType
  delayDays?: number
  templateExternalId?: string
  purpose?: string
  title?: string
  description?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  durationMinutes?: number
  meetingUrl?: string
}

export class SalesSequenceError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) {
    super(message)
    this.name = 'SalesSequenceError'
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readConfig(config: unknown): { leadIds: string[]; steps: SalesSequenceStepConfig[] } {
  const raw = asObject(config)
  const leadIds = Array.isArray(raw.leadIds)
    ? [...new Set(raw.leadIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))]
    : []
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  if (!rawSteps.length || rawSteps.length > MAX_STEPS) {
    throw new SalesSequenceError('SEQUENCE_STEPS_INVALID', `La secuencia necesita entre 1 y ${MAX_STEPS} pasos.`)
  }

  const steps = rawSteps.map((rawStep, index) => {
    const step = asObject(rawStep)
    const type = String(step.type ?? step.kind ?? '').trim() as SalesSequenceStepType
    if (!['email', 'task', 'meeting'].includes(type)) {
      throw new SalesSequenceError('SEQUENCE_STEP_TYPE_INVALID', `Tipo de paso no soportado en la posición ${index + 1}.`)
    }
    const delayDays = Number(step.delayDays ?? 0)
    if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 365) {
      throw new SalesSequenceError('SEQUENCE_DELAY_INVALID', `El retraso del paso ${index + 1} debe ser un entero entre 0 y 365 días.`)
    }
    const parsed: SalesSequenceStepConfig = {
      key: String(step.key ?? `step-${index + 1}`).trim().slice(0, 80) || `step-${index + 1}`,
      type,
      delayDays,
      templateExternalId: typeof step.templateExternalId === 'string' ? step.templateExternalId.trim() : undefined,
      purpose: typeof step.purpose === 'string' ? step.purpose.trim() : undefined,
      title: typeof step.title === 'string' ? step.title.trim() : undefined,
      description: typeof step.description === 'string' ? step.description.trim() : undefined,
      priority: ['low', 'normal', 'high', 'urgent'].includes(String(step.priority)) ? String(step.priority) as SalesSequenceStepConfig['priority'] : undefined,
      durationMinutes: Number.isInteger(Number(step.durationMinutes)) ? Number(step.durationMinutes) : undefined,
      meetingUrl: typeof step.meetingUrl === 'string' ? step.meetingUrl.trim() : undefined,
    }
    if (type === 'email' && !parsed.templateExternalId) {
      throw new SalesSequenceError('SEQUENCE_TEMPLATE_REQUIRED', `El paso de email ${index + 1} necesita templateExternalId.`)
    }
    if ((type === 'task' || type === 'meeting') && !parsed.title) {
      throw new SalesSequenceError('SEQUENCE_TITLE_REQUIRED', `El paso ${index + 1} necesita un título.`)
    }
    return parsed
  })

  return { leadIds, steps }
}

async function getOwnedSequence(orgId: string, programId: string) {
  const program = await prisma.growthProgram.findFirst({
    where: { id: programId, orgId, type: 'sales_sequence', archivedAt: null },
  })
  if (!program) throw new SalesSequenceError('SEQUENCE_NOT_FOUND', 'La secuencia no existe o no pertenece a la organización.', 404)
  return { program, ...readConfig(program.config) }
}

function nextRunAtForStep(enrolledAt: Date, steps: SalesSequenceStepConfig[], stepIndex: number): Date {
  const delayDays = steps.slice(0, stepIndex + 1).reduce((total, step) => total + (step.delayDays ?? 0), 0)
  return new Date(enrolledAt.getTime() + delayDays * DAY_MS)
}

export async function enrollSalesSequence(
  orgId: string,
  programId: string,
  leadIds?: string[],
  actorUserId?: string,
) {
  const { program, leadIds: configuredLeadIds, steps } = await getOwnedSequence(orgId, programId)
  const selectedLeadIds = [...new Set((leadIds?.length ? leadIds : configuredLeadIds).map(value => value.trim()).filter(Boolean))]
  if (!selectedLeadIds.length) throw new SalesSequenceError('SEQUENCE_LEADS_REQUIRED', 'La secuencia necesita al menos un lead.')
  if (selectedLeadIds.length > MAX_LEADS_PER_ENROLLMENT) throw new SalesSequenceError('SEQUENCE_LEAD_LIMIT_EXCEEDED', `No se pueden matricular más de ${MAX_LEADS_PER_ENROLLMENT} leads en una operación.`)

  const leads = await prisma.lead.findMany({
    where: { orgId, id: { in: selectedLeadIds } },
    select: { id: true, email: true, ownerId: true },
  })
  if (leads.length !== selectedLeadIds.length) throw new SalesSequenceError('SEQUENCE_LEAD_NOT_FOUND', 'Uno o más leads no pertenecen a la organización.')

  const requiresEmail = steps.some(step => step.type === 'email')
  let created = 0
  let alreadyEnrolled = 0
  let blocked = 0
  const enrolledAt = new Date()

  for (const lead of leads) {
    const consent = requiresEmail
      ? await assertEmailSendAllowed(orgId, lead.id, steps.find(step => step.type === 'email')?.purpose || 'marketing')
      : { allowed: true as const }
    const enrollmentStatus = consent.allowed ? 'active' : 'blocked'
    const reason = consent.allowed ? null : `EMAIL_${consent.reason.toUpperCase()}`
    const existing = await prisma.salesSequenceEnrollment.findUnique({
      where: { programId_leadId: { programId, leadId: lead.id } },
      select: { id: true },
    })
    if (existing) {
      alreadyEnrolled++
      continue
    }

    await prisma.$transaction(async tx => {
      const enrollment = await tx.salesSequenceEnrollment.create({
        data: {
          orgId,
          programId,
          leadId: lead.id,
          status: enrollmentStatus,
          nextRunAt: consent.allowed ? nextRunAtForStep(enrolledAt, steps, 0) : null,
          stopReason: reason,
        },
      })
      await tx.salesSequenceStepRun.createMany({
        data: steps.map((step, index) => ({
          orgId,
          programId,
          enrollmentId: enrollment.id,
          leadId: lead.id,
          stepKey: step.key || `step-${index + 1}`,
          stepIndex: index,
          type: step.type,
          status: consent.allowed ? 'pending' : 'blocked',
          dueAt: nextRunAtForStep(enrolledAt, steps, index),
          availableAt: nextRunAtForStep(enrolledAt, steps, index),
          lastErrorCode: reason,
          lastError: reason ? 'El consentimiento de email bloquea la secuencia.' : undefined,
        })),
      })
    })
    if (consent.allowed) created++
    else blocked++
  }

  if (program.status === 'draft' || program.status === 'paused') {
    await prisma.growthProgram.updateMany({ where: { id: programId, orgId, archivedAt: null }, data: { status: 'active' } })
  }

  return { programId, created, alreadyEnrolled, blocked, total: selectedLeadIds.length, actorUserId: actorUserId ?? null }
}

export async function listSalesSequenceEnrollments(orgId: string, programId: string) {
  await getOwnedSequence(orgId, programId)
  return prisma.salesSequenceEnrollment.findMany({
    where: { orgId, programId },
    orderBy: { enrolledAt: 'desc' },
    include: {
      lead: { select: { id: true, name: true, email: true, status: true } },
      steps: { orderBy: { stepIndex: 'asc' } },
    },
  })
}

export async function pauseSalesSequence(orgId: string, programId: string) {
  await getOwnedSequence(orgId, programId)
  await prisma.growthProgram.updateMany({ where: { id: programId, orgId, archivedAt: null }, data: { status: 'paused' } })
  await prisma.salesSequenceEnrollment.updateMany({ where: { orgId, programId, status: 'active' }, data: { status: 'paused' } })
  return { programId, status: 'paused' }
}

export async function stopSalesSequence(orgId: string, programId: string, reason = 'manual') {
  await getOwnedSequence(orgId, programId)
  const stoppedAt = new Date()
  await prisma.growthProgram.updateMany({ where: { id: programId, orgId, archivedAt: null }, data: { status: 'paused' } })
  const enrollments = await prisma.salesSequenceEnrollment.updateMany({
    where: { orgId, programId, status: { in: ['active', 'paused', 'blocked'] } },
    data: { status: 'stopped', stoppedAt, stopReason: reason, nextRunAt: null },
  })
  await prisma.salesSequenceStepRun.updateMany({
    where: { orgId, programId, status: { in: ['pending', 'processing'] } },
    data: { status: 'blocked', lastErrorCode: 'SEQUENCE_STOPPED', lastError: `Secuencia detenida: ${reason}.`, leaseExpiresAt: null, lockedAt: null, workerId: null },
  })
  return { programId, status: 'stopped', stoppedEnrollments: enrollments.count }
}

export async function resumeSalesSequence(orgId: string, programId: string) {
  await getOwnedSequence(orgId, programId)
  const now = new Date()
  await prisma.growthProgram.updateMany({ where: { id: programId, orgId, archivedAt: null }, data: { status: 'active' } })
  await prisma.salesSequenceEnrollment.updateMany({ where: { orgId, programId, status: 'paused' }, data: { status: 'active', nextRunAt: now } })
  await prisma.salesSequenceStepRun.updateMany({ where: { orgId, programId, status: 'pending' }, data: { availableAt: now } })
  return { programId, status: 'active' }
}

export async function stopSalesSequenceForLead(orgId: string, leadId: string, reason: 'reply' | 'unsubscribe' | 'bounce' | 'complaint') {
  const stoppedAt = new Date()
  const result = await prisma.salesSequenceEnrollment.updateMany({
    where: { orgId, leadId, status: { in: ['active', 'paused', 'blocked'] } },
    data: { status: 'stopped', stoppedAt, stopReason: reason, nextRunAt: null, lastRespondedAt: reason === 'reply' ? stoppedAt : undefined },
  })
  if (result.count) {
    await prisma.salesSequenceStepRun.updateMany({
      where: { orgId, leadId, status: { in: ['pending', 'processing'] } },
      data: { status: 'blocked', lastErrorCode: `STOPPED_${reason.toUpperCase()}`, lastError: `Secuencia detenida por ${reason}.`, leaseExpiresAt: null, lockedAt: null, workerId: null },
    })
  }
  return result.count
}

async function markStepBlocked(stepId: string, code: string, message: string) {
  const step = await prisma.salesSequenceStepRun.update({ where: { id: stepId }, data: { status: 'blocked', lastErrorCode: code, lastError: message, completedAt: new Date(), lockedAt: null, leaseExpiresAt: null, workerId: null } })
  await prisma.salesSequenceEnrollment.updateMany({ where: { id: step.enrollmentId, status: 'active' }, data: { status: 'blocked', nextRunAt: null, lastErrorCode: code, lastError: message } })
}

async function markStepSuccess(stepId: string, output: Record<string, unknown>) {
  const now = new Date()
  const step = await prisma.salesSequenceStepRun.update({ where: { id: stepId }, data: { status: 'succeeded', output: output as Prisma.InputJsonValue, completedAt: now, lockedAt: null, leaseExpiresAt: null, workerId: null } })
  const next = await prisma.salesSequenceStepRun.findFirst({ where: { enrollmentId: step.enrollmentId, status: 'pending' }, orderBy: { stepIndex: 'asc' }, select: { stepIndex: true, dueAt: true } })
  await prisma.salesSequenceEnrollment.updateMany({
    where: { id: step.enrollmentId, status: 'active' },
    data: next
      ? { currentStep: next.stepIndex, nextRunAt: next.dueAt, lastErrorCode: null, lastError: null }
      : { currentStep: step.stepIndex + 1, nextRunAt: null, status: 'completed', lastErrorCode: null, lastError: null },
  })
}

async function scheduleStepRetry(stepId: string, attempt: number, code: string, message: string) {
  const now = new Date()
  const delay = Math.min(86_400_000, 5_000 * (2 ** Math.max(0, attempt - 1)))
  await prisma.salesSequenceStepRun.update({
    where: { id: stepId },
    data: { status: attempt >= 5 ? 'failed' : 'pending', availableAt: new Date(now.getTime() + delay), lastErrorCode: code, lastError: message, lockedAt: null, leaseExpiresAt: null, workerId: null, ...(attempt >= 5 ? { completedAt: now } : {}) },
  })
  if (attempt >= 5) await prisma.salesSequenceEnrollment.updateMany({ where: { id: (await prisma.salesSequenceStepRun.findUniqueOrThrow({ where: { id: stepId }, select: { enrollmentId: true } })).enrollmentId, status: 'active' }, data: { status: 'blocked', nextRunAt: null, lastErrorCode: code, lastError: message } })
}

async function executeClaimedStep(stepId: string, workerId: string): Promise<void> {
  const current = await prisma.salesSequenceStepRun.findUnique({
    where: { id: stepId },
    include: { enrollment: true, lead: true, program: true },
  })
  if (!current || current.status !== 'processing' || current.enrollment.status !== 'active') return
  const { steps } = readConfig(current.program.config)
  const config = steps[current.stepIndex]
  if (!config) return markStepBlocked(stepId, 'STEP_CONFIG_MISSING', 'El paso ya no existe en la configuración publicada.')
  const sourceId = `sequence:${current.programId}:${current.enrollmentId}:${current.stepKey}`

  try {
    if (config.type === 'email') {
      if (!current.lead.email) return markStepBlocked(stepId, 'LEAD_EMAIL_MISSING', 'El lead no tiene email.')
      const consent = await assertEmailSendAllowed(current.orgId, current.leadId, config.purpose || 'marketing')
      if (!consent.allowed) return markStepBlocked(stepId, `EMAIL_${consent.reason.toUpperCase()}`, 'El consentimiento actual no permite este envío.')
      const delivery = await createEmailDelivery(current.orgId, current.leadId, {
        templateExternalId: config.templateExternalId,
        toAddress: current.lead.email,
        idempotencyScope: sourceId,
      })
      await prisma.salesSequenceStepRun.updateMany({ where: { id: stepId, status: 'processing' }, data: { emailDeliveryId: delivery.id } })
      await sendEmailToLead(current.leadId, config.templateExternalId!, current.orgId, delivery.id, workerId)
      const latest = await prisma.emailDelivery.findUnique({ where: { id: delivery.id }, select: { status: true, providerMessageId: true } })
      if (latest?.status === 'accepted' || latest?.status === 'delivered') return markStepSuccess(stepId, { emailDeliveryId: delivery.id, providerMessageId: latest.providerMessageId ?? null })
      if (latest?.status === 'uncertain') return markStepBlocked(stepId, 'EMAIL_OUTCOME_UNKNOWN', 'El proveedor no confirmó el resultado; requiere revisión antes de reintentar.')
      return scheduleStepRetry(stepId, current.attempts, 'EMAIL_NOT_ACCEPTED', 'El proveedor no aceptó todavía el email.')
    }

    if (config.type === 'task') {
      const existing = await prisma.task.findFirst({ where: { orgId: current.orgId, source: 'sequence', sourceId }, select: { id: true } })
      const task = existing ?? await createSystemTask(current.orgId, null, {
        type: 'sequence',
        title: config.title!,
        description: config.description,
        priority: config.priority,
        dueAt: new Date().toISOString(),
        leadId: current.leadId,
        source: 'sequence',
        sourceId,
      })
      return markStepSuccess(stepId, { taskId: task.id })
    }

    const meetingId = `sequence-meeting-${current.id}`
    const existingMeeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } })
    const meeting = existingMeeting ?? await prisma.meeting.create({
      data: {
        id: meetingId,
        orgId: current.orgId,
        leadId: current.leadId,
        title: config.title!,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMinutes: config.durationMinutes && config.durationMinutes > 0 ? config.durationMinutes : 30,
        meetingUrl: config.meetingUrl,
      },
      select: { id: true },
    })
    return markStepSuccess(stepId, { meetingId: meeting.id })
  } catch (error) {
    return scheduleStepRetry(stepId, current.attempts, 'STEP_EXECUTION_ERROR', error instanceof Error ? error.message : 'Error desconocido ejecutando el paso.')
  }
}

export async function processSalesSequenceTick(limit = 25, workerId = WORKER_ID) {
  const now = new Date()
  const candidates = await prisma.salesSequenceStepRun.findMany({
    where: {
      OR: [
        { status: 'pending', availableAt: { lte: now } },
        { status: 'processing', leaseExpiresAt: { lte: now } },
      ],
      enrollment: { status: 'active' },
    },
    orderBy: { availableAt: 'asc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  })
  let claimed = 0
  for (const candidate of candidates) {
    const result = await prisma.salesSequenceStepRun.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: 'processing', leaseExpiresAt: { lte: now } },
        ],
      },
      data: { status: 'processing', attempts: { increment: 1 }, startedAt: now, lockedAt: now, leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS), workerId },
    })
    if (!result.count) continue
    claimed++
    await executeClaimedStep(candidate.id, workerId)
  }
  return { candidates: candidates.length, claimed }
}
