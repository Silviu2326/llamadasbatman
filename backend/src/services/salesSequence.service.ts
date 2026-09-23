import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { createNativeEmailDelivery, resolveNativeEmailDraft, sendNativeMarketingDelivery } from './nativeMarketingEmail.service'
import { createSystemTask } from './tasks.service'
import { consentGranted } from './conversations.service'
import { sendWhatsApp } from './whatsapp.service'
import { OutboundEmailError, sendOutboundEmail } from './outboundEmail.service'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'
import { canCall, nextCallWindow, normalizeE164 } from '../voice/compliance'

const DAY_MS = 86_400_000
const DEFAULT_LEASE_MS = 60_000
const MAX_LEADS_PER_ENROLLMENT = 1_000
const MAX_STEPS = 20
const WORKER_ID = process.env.SALES_SEQUENCE_WORKER_ID?.trim() || `sales-sequence-${process.pid}`

/**
 * `call` y `whatsapp` no traen motor propio: reutilizan la cola de llamadas
 * (`enqueueLeadCall`, con el agente de voz al otro lado) y `sendWhatsApp`, con
 * las mismas puertas de consentimiento que usa la bandeja de entrada. Una
 * secuencia puede así enviar dos emails y llamar al tercer día sin que exista
 * un segundo camino de envío que mantener.
 */
export type SalesSequenceStepType = 'email' | 'task' | 'meeting' | 'call' | 'whatsapp' | 'ai_email'

const STEP_TYPES: SalesSequenceStepType[] = ['email', 'task', 'meeting', 'call', 'whatsapp', 'ai_email']

/** Canales que exigen teléfono del lead, para el aviso temprano al matricular. */
const PHONE_STEP_TYPES: SalesSequenceStepType[] = ['call', 'whatsapp']

export interface SalesSequenceStepConfig {
  key?: string
  type: SalesSequenceStepType
  delayDays?: number
  /** Borrador local de newsletter para email. */
  emailDraftId?: string
  /** contentSid aprobado para WhatsApp. */
  templateExternalId?: string
  purpose?: string
  title?: string
  description?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  durationMinutes?: number
  meetingUrl?: string
  /** Texto libre de WhatsApp: solo se entrega dentro de la ventana de 24 h. */
  body?: string
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
    if (!STEP_TYPES.includes(type)) {
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
      emailDraftId: typeof step.emailDraftId === 'string' ? step.emailDraftId.trim() : undefined,
      templateExternalId: typeof step.templateExternalId === 'string' ? step.templateExternalId.trim() : undefined,
      purpose: typeof step.purpose === 'string' ? step.purpose.trim() : undefined,
      title: typeof step.title === 'string' ? step.title.trim() : undefined,
      description: typeof step.description === 'string' ? step.description.trim() : undefined,
      priority: ['low', 'normal', 'high', 'urgent'].includes(String(step.priority)) ? String(step.priority) as SalesSequenceStepConfig['priority'] : undefined,
      durationMinutes: Number.isInteger(Number(step.durationMinutes)) ? Number(step.durationMinutes) : undefined,
      meetingUrl: typeof step.meetingUrl === 'string' ? step.meetingUrl.trim() : undefined,
      body: typeof step.body === 'string' ? step.body.trim().slice(0, 1_000) : undefined,
    }
    if (type === 'email' && !parsed.emailDraftId) {
      throw new SalesSequenceError('SEQUENCE_TEMPLATE_REQUIRED', `El paso de email ${index + 1} necesita emailDraftId local.`)
    }
    if ((type === 'task' || type === 'meeting') && !parsed.title) {
      throw new SalesSequenceError('SEQUENCE_TITLE_REQUIRED', `El paso ${index + 1} necesita un título.`)
    }
    // WhatsApp sin plantilla solo se entrega dentro de la ventana de 24 h desde
    // el último mensaje entrante. Un paso programado a días vista casi nunca
    // cae dentro, así que se exige plantilla al configurarlo en lugar de
    // fallar en ejecución delante del cliente.
    if (type === 'whatsapp' && !parsed.templateExternalId) {
      throw new SalesSequenceError('SEQUENCE_TEMPLATE_REQUIRED', `El paso de WhatsApp ${index + 1} necesita una plantilla aprobada (contentSid).`)
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
  const config = readConfig(program.config)
  for (const step of config.steps.filter(item => item.type === 'email')) {
    const draft = await prisma.emailNewsletterDraft.findFirst({ where: { id: step.emailDraftId, orgId }, select: { id: true } })
    if (!draft) throw new SalesSequenceError('SEQUENCE_TEMPLATE_NOT_FOUND', 'Un borrador de email no existe o no pertenece a esta organización.')
  }
  return { program, ...config }
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
    select: { id: true, email: true, phone: true, ownerId: true },
  })
  if (leads.length !== selectedLeadIds.length) throw new SalesSequenceError('SEQUENCE_LEAD_NOT_FOUND', 'Uno o más leads no pertenecen a la organización.')

  // `ai_email` también escribe: pasa por la misma barrera de consentimiento
  // que un envío con plantilla, aunque el cuerpo lo redacte el modelo.
  const requiresEmail = steps.some(step => step.type === 'email' || step.type === 'ai_email')
  const requiresPhone = steps.some(step => PHONE_STEP_TYPES.includes(step.type))
  let created = 0
  let alreadyEnrolled = 0
  let blocked = 0
  const enrolledAt = new Date()

  for (const lead of leads) {
    const emailConsent = requiresEmail
      ? await assertEmailSendAllowed(orgId, lead.id, steps.find(step => step.type === 'email' || step.type === 'ai_email')?.purpose || 'marketing')
      : { allowed: true as const }
    // Sin teléfono, un paso de llamada o WhatsApp no puede ejecutarse nunca:
    // se dice al matricular y no días después, cuando ya nadie mira.
    const consent = emailConsent.allowed && requiresPhone && !lead.phone
      ? { allowed: false as const, reason: 'lead_phone_missing' }
      : emailConsent
    const enrollmentStatus = consent.allowed ? 'active' : 'blocked'
    const reason = consent.allowed
      ? null
      : consent.reason === 'lead_phone_missing' ? 'LEAD_PHONE_MISSING' : `EMAIL_${consent.reason.toUpperCase()}`
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
          lastError: reason
            ? reason === 'LEAD_PHONE_MISSING'
              ? 'El lead no tiene teléfono y la secuencia incluye llamada o WhatsApp.'
              : 'El consentimiento de email bloquea la secuencia.'
            : undefined,
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
  // Reanudar no debe saltarse la espera configurada para cada paso. Conserva
  // el vencimiento futuro y libera ahora solo los pasos que ya vencieron.
  await prisma.$executeRawUnsafe(
    'UPDATE "SalesSequenceStepRun" SET "availableAt" = GREATEST("dueAt", $3) WHERE "orgId" = $1 AND "programId" = $2 AND "status" = $4',
    orgId,
    programId,
    now,
    'pending',
  )
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

async function executeClaimedStep(stepId: string, workerId: string, scope?: SalesSequenceWorkerScope): Promise<void> {
  const current = await prisma.salesSequenceStepRun.findUnique({
    where: { id: stepId },
    include: { enrollment: true, lead: true, program: true },
  })
  if (!current || current.status !== 'processing' || current.workerId !== workerId || current.enrollment.status !== 'active') return
  if (current.program.status !== 'active' || current.program.archivedAt || current.stepIndex !== current.enrollment.currentStep) {
    await prisma.salesSequenceStepRun.updateMany({ where: { id: stepId, workerId, status: 'processing' }, data: { status: 'pending', workerId: null, leaseExpiresAt: null, lockedAt: null } })
    return
  }
  const { steps } = readConfig(current.program.config)
  const config = steps[current.stepIndex]
  if (!config) return markStepBlocked(stepId, 'STEP_CONFIG_MISSING', 'El paso ya no existe en la configuración publicada.')
  if (scope && (current.orgId !== scope.orgId || config.type !== scope.type)) {
    await prisma.salesSequenceStepRun.updateMany({ where: { id: stepId, workerId, status: 'processing' }, data: { status: 'pending', workerId: null, leaseExpiresAt: null, lockedAt: null, attempts: { decrement: 1 } } })
    return
  }
  const sourceId = `sequence:${current.programId}:${current.enrollmentId}:${current.stepKey}`

  try {
    if (config.type === 'email') {
      if (!current.lead.email) return markStepBlocked(stepId, 'LEAD_EMAIL_MISSING', 'El lead no tiene email.')
      const consent = await assertEmailSendAllowed(current.orgId, current.leadId, config.purpose || 'marketing')
      if (!consent.allowed) return markStepBlocked(stepId, `EMAIL_${consent.reason.toUpperCase()}`, 'El consentimiento actual no permite este envío.')
      const emailDraftId = config.emailDraftId!
      const content = await resolveNativeEmailDraft(current.orgId, emailDraftId)
      if (!content) return markStepBlocked(stepId, 'EMAIL_DRAFT_NOT_FOUND', 'El borrador local ya no está disponible.')
      const delivery = await createNativeEmailDelivery({ orgId: current.orgId, leadId: current.leadId, emailDraftId, toAddress: current.lead.email, purpose: config.purpose || 'marketing', idempotencyScope: sourceId, content })
      await prisma.salesSequenceStepRun.updateMany({ where: { id: stepId, status: 'processing' }, data: { emailDeliveryId: delivery.id } })
      if (delivery.status === 'accepted' || delivery.status === 'delivered') return markStepSuccess(stepId, { emailDeliveryId: delivery.id, providerMessageId: delivery.providerMessageId ?? null, deduplicated: true })
      if (delivery.status === 'uncertain') return markStepBlocked(stepId, 'EMAIL_OUTCOME_UNKNOWN', 'El proveedor no confirmó el resultado; requiere revisión antes de reintentar.')
      const claimed = await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: 'queued' }, data: { status: 'processing', workerId, lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + DEFAULT_LEASE_MS), providerAttemptedAt: new Date(), attempts: { increment: 1 } } })
      if (!claimed.count) return scheduleStepRetry(stepId, current.attempts, 'EMAIL_DELIVERY_BUSY', 'La entrega está siendo procesada por otro worker.')
      const outcome = await sendNativeMarketingDelivery(delivery.id, workerId)
      const latest = await prisma.emailDelivery.findUnique({ where: { id: delivery.id }, select: { status: true, providerMessageId: true } })
      if (outcome === 'accepted' && latest?.status === 'accepted') return markStepSuccess(stepId, { emailDeliveryId: delivery.id, providerMessageId: latest.providerMessageId ?? null })
      if (outcome === 'uncertain' || latest?.status === 'uncertain') return markStepBlocked(stepId, 'EMAIL_OUTCOME_UNKNOWN', 'El proveedor no confirmó el resultado; requiere revisión antes de reintentar.')
      return scheduleStepRetry(stepId, current.attempts, 'EMAIL_NOT_ACCEPTED', 'El proveedor no aceptó todavía el email.')
    }    // Se redacta aquí y no al matricular: la auditoría del día en que toca
    // escribir es la buena. Entre configurar la secuencia y el tercer paso el
    // negocio puede haber arreglado justo lo que íbamos a echarle en cara.
    if (config.type === 'ai_email') {
      if (!current.lead.email) return markStepBlocked(stepId, 'LEAD_EMAIL_MISSING', 'El lead no tiene email.')
      try {
        // Cuántos `ai_email` quedan por delante, contando este. Con uno solo,
        // el redactor cierra el hilo en vez de insistir otra vez.
        const remainingAttempts = steps.filter((step, index) => step.type === 'ai_email' && index >= current.stepIndex).length
        const result = await sendOutboundEmail(current.orgId, current.leadId, { idempotencyScope: sourceId, remainingAttempts })
        if (result.status !== 'accepted') {
          return scheduleStepRetry(stepId, current.attempts, 'OUTBOUND_NOT_ACCEPTED', 'El proveedor no aceptó el email.')
        }
        return markStepSuccess(stepId, { emailDeliveryId: result.deliveryId, subject: result.subject, messageId: result.messageId })
      } catch (error) {
        // Falta de auditoría, de hallazgos o de consentimiento no se arreglan
        // reintentando: bloquean y lo dicen. Lo demás sí se reintenta.
        if (error instanceof OutboundEmailError) {
          return markStepBlocked(stepId, error.code, error.message)
        }
        throw error
      }
    }

    if (config.type === 'call') {
      if (!current.lead.phone) return markStepBlocked(stepId, 'LEAD_PHONE_MISSING', 'El lead no tiene teléfono.')
      // Mismas puertas que cualquier otra llamada del producto: lista Robinson,
      // horario legal y consentimiento de voz si la organización lo exige.
      const allowed = await canCall(current.orgId, current.lead.phone, current.leadId)
      if (!allowed.allowed) {
        // Fuera de horario no es un fallo de la secuencia: se reintenta.
        if (allowed.reason === 'outside_hours') {
          const fields = asObject(current.lead.customFields)
          const availableAt = nextCallWindow(normalizeE164(current.lead.phone) || current.lead.phone, new Date(), typeof fields.callTimeZone === 'string' ? fields.callTimeZone : undefined)
          if (!availableAt) return markStepBlocked(stepId, 'CALL_TIMEZONE_INVALID', 'Revisa la zona horaria del contacto.')
          await prisma.salesSequenceStepRun.updateMany({ where: { id: stepId, workerId, status: 'processing' }, data: { status: 'pending', availableAt, attempts: { decrement: 1 }, workerId: null, leaseExpiresAt: null, lockedAt: null, lastErrorCode: 'CALL_OUTSIDE_HOURS' } })
          return
        }
        return markStepBlocked(stepId, `CALL_${allowed.reason.toUpperCase()}`, 'El cumplimiento no permite llamar a este lead.')
      }
      // `sourceId` como jobId: si el lease caduca entre encolar y marcar el
      // paso, BullMQ descarta el duplicado y el prospecto no recibe dos llamadas.
      const queued = await enqueueLeadCall(current.orgId, current.leadId, sourceId)
      if (!queued) return scheduleStepRetry(stepId, current.attempts, 'CALL_QUEUE_UNAVAILABLE', 'La cola de llamadas no está disponible.')
      return markStepSuccess(stepId, { callQueued: true, dedupeKey: sourceId })
    }

    if (config.type === 'whatsapp') {
      if (!current.lead.phone) return markStepBlocked(stepId, 'LEAD_PHONE_MISSING', 'El lead no tiene teléfono.')
      if (!await consentGranted(current.orgId, current.leadId, 'whatsapp')) {
        return markStepBlocked(stepId, 'WHATSAPP_CONSENT_MISSING', 'El lead no tiene consentimiento de WhatsApp concedido.')
      }
      // Solo la entrega de este paso lo completa; un mensaje manual u otro
      // paso de la secuencia no demuestra que este haya sido enviado.
      const alreadySent = await prisma.message.findFirst({
        where: { orgId: current.orgId, leadId: current.leadId, channel: 'whatsapp', direction: 'outbound', metadata: { path: ['sourceId'], equals: sourceId }, status: { in: ['sent', 'delivered', 'read', 'queued', 'accepted', 'sending'] }, providerMessageId: { not: null } },
        select: { id: true, providerMessageId: true },
      })
      if (alreadySent) return markStepSuccess(stepId, { messageId: alreadySent.id, providerMessageId: alreadySent.providerMessageId, deduplicated: true })
      const sent = await sendWhatsApp({
        orgId: current.orgId,
        leadId: current.leadId,
        to: current.lead.phone,
        contentSid: config.templateExternalId,
        body: config.body,
        metadata: { source: 'sequence', sourceId },
        idempotencyKey: sourceId,
      })
      return markStepSuccess(stepId, { messageId: sent.id ?? null, providerMessageId: sent.providerMessageId })
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

export interface SalesSequenceWorkerScope { orgId: string; type: SalesSequenceStepType }

export async function findRunnableSalesSequenceSteps(limit = 25, now = new Date(), scope?: SalesSequenceWorkerScope) {
  // Compare the two tables before LIMIT. Filtering future steps in JavaScript
  // can fill every batch with ineligible rows and starve all other contacts.
  const batchSize = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 25
  return prisma.$queryRaw<Array<{ id: string; stepIndex: number }>>(Prisma.sql`
    SELECT s."id", s."stepIndex"
    FROM "SalesSequenceStepRun" s
    JOIN "SalesSequenceEnrollment" e ON e."id" = s."enrollmentId" AND e."orgId" = s."orgId"
    JOIN "GrowthProgram" p ON p."id" = s."programId" AND p."orgId" = s."orgId"
    WHERE e."status" = 'active' AND p."status" = 'active' AND p."archivedAt" IS NULL
      ${scope ? Prisma.sql`AND s."orgId" = ${scope.orgId} AND s."type" = ${scope.type}` : Prisma.empty}
      AND s."stepIndex" = e."currentStep"
      AND ((s."status" = 'pending' AND s."availableAt" <= ${now})
        OR (s."status" = 'processing' AND s."leaseExpiresAt" <= ${now}))
    ORDER BY s."availableAt", s."id" LIMIT ${batchSize}
  `)
}

export async function processSalesSequenceTick(limit = 25, workerId = WORKER_ID, scope?: SalesSequenceWorkerScope) {
  const now = new Date()
  const candidates = await findRunnableSalesSequenceSteps(limit, now, scope)
  let claimed = 0
  for (const candidate of candidates) {
    const result = await prisma.salesSequenceStepRun.updateMany({
      where: {
        id: candidate.id,
        ...(scope ? { orgId: scope.orgId, type: scope.type } : {}),
        enrollment: { status: 'active', currentStep: candidate.stepIndex },
        program: { status: 'active', archivedAt: null },
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: 'processing', leaseExpiresAt: { lte: now } },
        ],
      },
      data: { status: 'processing', attempts: { increment: 1 }, startedAt: now, lockedAt: now, leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS), workerId },
    })
    if (!result.count) continue
    claimed++
    await executeClaimedStep(candidate.id, workerId, scope)
  }
  return { candidates: candidates.length, claimed }
}




