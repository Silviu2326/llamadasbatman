import { prisma } from '../lib/prisma'
import { sendEmailToLead, sendLeadToSegment } from './mauticSync.service'
import { assertEmailSendAllowed, type EmailSendBlockReason } from '../lib/emailCompliance'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'
import { sendWhatsApp } from './whatsapp.service'
import { suggestConversationReply } from './conversationAi.service'

export const CANONICAL_AUTOMATION_EVENTS = [
  'call.completed', 'lead.inactive.7d', 'meeting.scheduled.24h',
  'opportunity.proposal.3d', 'lead.created', 'lead.inactive.30d', 'message.received',
] as const
export type CanonicalAutomationEvent = typeof CANONICAL_AUTOMATION_EVENTS[number]
const EVENT_ALIASES: Record<string, CanonicalAutomationEvent> = {
  'call.completed': 'call.completed', llamada_completada: 'call.completed', 'llamada completada': 'call.completed',
  'lead.inactive.7d': 'lead.inactive.7d', lead_inactive_7d: 'lead.inactive.7d',
  'meeting.scheduled.24h': 'meeting.scheduled.24h', reunion_agendada_24h: 'meeting.scheduled.24h',
  'opportunity.proposal.3d': 'opportunity.proposal.3d', oportunidad_propuesta_3d: 'opportunity.proposal.3d',
  'lead.created': 'lead.created', nuevo_lead: 'lead.created',
  'lead.inactive.30d': 'lead.inactive.30d', lead_inactive_30d: 'lead.inactive.30d',
  'message.received': 'message.received', mensaje_recibido: 'message.received', 'mensaje recibido': 'message.received',
}
export function normalizeAutomationEvent(value: unknown): CanonicalAutomationEvent | null {
  return EVENT_ALIASES[String(value ?? '').trim().toLowerCase()] ?? null
}
export function normalizeAutomationTrigger(trigger: Record<string, unknown>): Record<string, unknown> {
  const event = normalizeAutomationEvent(trigger.event ?? trigger.type)
  if (!event) throw new Error('Unsupported automation trigger')
  return { ...trigger, event }
}
export const AUTOMATION_ACTION_TYPES = [
  'log', 'update_lead_status', 'send_to_mautic_segment',
  'send_whatsapp_template', 'queue_voice_call', 'send_email_template', 'ai_reply_whatsapp',
] as const
const SUPPORTED_ACTIONS = new Set<string>(AUTOMATION_ACTION_TYPES)
export function validateAutomationActions(actions: unknown[]): asserts actions is Array<{ type: string; params?: Record<string, unknown> }> {
  for (const action of actions) {
    if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string' || !SUPPORTED_ACTIONS.has((action as any).type)) {
      throw new Error('Unsupported automation action')
    }
    const typed = action as { type: string; params?: Record<string, unknown> }
    if (typed.type === 'send_whatsapp_template' && !String(typed.params?.contentSid ?? '').trim()) {
      throw new Error('send_whatsapp_template requiere contentSid')
    }
    if (typed.type === 'send_email_template' && !String(typed.params?.emailId ?? '').trim()) {
      throw new Error('send_email_template requiere emailId')
    }
  }
}

// Resultado por paso (P0-03/AU-03): una acción que no se ejecuta por falta de
// dato o consentimiento queda 'skipped'/'blocked' con un código estructurado,
// nunca se cuenta como éxito silencioso. Solo un error inesperado del
// proveedor/DB se propaga como 'failed' y hace fallar el run completo.
const EMAIL_BLOCK_ERROR_CODE: Record<EmailSendBlockReason, string> = {
  no_consent: 'CONSENT_MISSING',
  unsubscribed: 'UNSUBSCRIBED',
  bounced: 'BOUNCED',
  complaint: 'COMPLAINT',
}
export type AutomationStepStatus = 'succeeded' | 'skipped' | 'blocked'
export interface AutomationStepResult {
  status: AutomationStepStatus
  output?: Record<string, unknown>
  errorCode?: string
  errorDetail?: string
}

async function executeAutomationAction(
  orgId: string,
  automation: { id: string; name: string },
  run: { id: string },
  action: { type: string; params?: Record<string, unknown> },
  event: string,
  payload: Record<string, unknown>,
  conversationId: string | undefined
): Promise<AutomationStepResult> {
  switch (action.type) {
    case 'log': {
      console.log(`[Automation:${automation.name}] event=${event}`, payload)
      return { status: 'succeeded' }
    }
    case 'update_lead_status': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const newStatus = action.params?.status as string | undefined
      if (!newStatus) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta status en params' }
      const updated = await prisma.lead.updateMany({
        where: { id: String(payload.leadId), orgId },
        data: { status: newStatus as 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted' },
      })
      if (updated.count === 0) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado en la organización' }
      return { status: 'succeeded', output: { leadId: String(payload.leadId), status: newStatus } }
    }
    case 'send_to_mautic_segment': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const segmentAlias = action.params?.segmentAlias as string | undefined
      if (!segmentAlias) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta segmentAlias en params' }
      const ok = await sendLeadToSegment(String(payload.leadId), segmentAlias, orgId).catch(() => false)
      if (!ok) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'Mautic no confirmó la asignación al segmento' }
      return { status: 'succeeded', output: { segmentAlias } }
    }
    case 'send_whatsapp_template': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.phone) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene teléfono' }
      if (!(await hasConsent(orgId, leadId, 'whatsapp'))) return { status: 'blocked', errorCode: 'CONSENT_MISSING', errorDetail: 'Sin consentimiento de WhatsApp' }
      await sendWhatsApp({
        orgId,
        leadId,
        conversationId,
        to: lead.phone,
        contentSid: String(action.params?.contentSid),
        contentVariables: { 1: lead.name },
        metadata: { automationId: automation.id, automationRunId: run.id },
      })
      return { status: 'succeeded', output: { leadId, channel: 'whatsapp' } }
    }
    case 'queue_voice_call': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.phone) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene teléfono' }
      if (!(await hasConsent(orgId, leadId, 'voice'))) return { status: 'blocked', errorCode: 'CONSENT_MISSING', errorDetail: 'Sin consentimiento de voz' }
      const queued = await enqueueLeadCall(orgId, leadId)
      if (!queued) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'La cola de llamadas no está disponible' }
      if (conversationId) {
        await prisma.message.create({ data: { orgId, conversationId, leadId, channel: 'voice', provider: 'twilio', address: lead.phone, direction: 'outbound', contentType: 'call', body: 'Llamada automática solicitada', status: 'queued', metadata: { automationId: automation.id, automationRunId: run.id } } })
      }
      return { status: 'succeeded', output: { leadId, channel: 'voice' } }
    }
    case 'send_email_template': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.email) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene email' }
      const emailDecision = await assertEmailSendAllowed(orgId, leadId, 'contact')
      if (!emailDecision.allowed) {
        return { status: 'blocked', errorCode: EMAIL_BLOCK_ERROR_CODE[emailDecision.reason], errorDetail: `Envío bloqueado por cumplimiento: ${emailDecision.reason}` }
      }
      const emailId = String(action.params?.emailId)
      const sent = await sendEmailToLead(leadId, emailId, orgId)
      if (!sent) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'Mautic no confirmó el envío automático' }
      if (conversationId) {
        await prisma.message.create({ data: { orgId, conversationId, leadId, channel: 'email', provider: 'mautic', address: lead.email, direction: 'outbound', contentType: 'template', body: 'Email automático enviado', status: 'sent', sentAt: new Date(), metadata: { mauticEmailId: emailId, automationId: automation.id, automationRunId: run.id } } })
      }
      return { status: 'succeeded', output: { leadId, emailId } }
    }
    case 'ai_reply_whatsapp': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      if (!conversationId || payload.channel !== 'whatsapp') return { status: 'skipped', errorCode: 'UNSUPPORTED_CONTEXT', errorDetail: 'Requiere conversationId y canal whatsapp' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.phone) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene teléfono' }
      if (!(await hasConsent(orgId, leadId, 'whatsapp'))) return { status: 'blocked', errorCode: 'CONSENT_MISSING', errorDetail: 'Sin consentimiento de WhatsApp' }
      const suggestion = await suggestConversationReply(orgId, conversationId, String(action.params?.tone ?? 'consultivo'))
      if (!suggestion) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'No se pudo generar la respuesta de IA' }
      await sendWhatsApp({ orgId, leadId, conversationId, to: lead.phone, body: suggestion.text, metadata: { aiGenerated: true, aiReason: suggestion.reason, automationId: automation.id, automationRunId: run.id } })
      return { status: 'succeeded', output: { leadId, channel: 'whatsapp', aiGenerated: true } }
    }
    default:
      return { status: 'skipped', errorCode: 'UNSUPPORTED_ACTION', errorDetail: `Acción no soportada: ${action.type}` }
  }
}

async function hasConsent(orgId: string, leadId: string, channel: string) {
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel, purpose: 'contact' },
    orderBy: { occurredAt: 'desc' },
  })
  return consent?.status === 'granted'
}

export async function getAutomation(orgId: string, id: string) {
  return prisma.automation.findFirst({ where: { id, orgId } })
}

export async function listAutomations(orgId: string) {
  return prisma.automation.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createAutomation(orgId: string, data: {
  name: string
  description?: string
  trigger: Record<string, unknown>
  actions: unknown[]
  isActive?: boolean
  isDraft?: boolean
  actorUserId?: string
}) {
  const trigger = normalizeAutomationTrigger(data.trigger)
  validateAutomationActions(data.actions)
  // AU-09 (mínimo): una automatización sin acciones reales nace en draft.
  // Si trae acciones, solo queda en draft cuando el caller lo pide explícitamente
  // (isDraft) — nunca por accidente para un flujo ya configurado.
  const status = data.actions.length === 0 ? 'draft' : data.isDraft ? 'draft' : 'active'
  return prisma.automation.create({
    data: {
      orgId,
      name: data.name,
      description: data.description ?? null,
      trigger: trigger as any,
      actions: data.actions as any,
      isActive: status === 'draft' ? false : (data.isActive ?? true),
      status,
      createdById: data.actorUserId ?? null,
    },
  })
}

export async function toggleAutomation(orgId: string, id: string) {
  const automation = await prisma.automation.findFirst({ where: { id, orgId } })
  if (!automation) throw new Error('Automation not found')

  const activating = !automation.isActive
  const actions = Array.isArray(automation.actions) ? automation.actions : []
  if (activating && automation.status === 'draft' && actions.length === 0) {
    throw new Error('No se puede activar un borrador sin acciones configuradas')
  }

  return prisma.automation.update({
    where: { id },
    data: {
      isActive: activating,
      status: activating ? 'active' : automation.status === 'draft' ? 'draft' : 'paused',
    },
  })
}

export async function deleteAutomation(orgId: string, id: string) {
  const result = await prisma.automation.deleteMany({ where: { id, orgId } })
  if (result.count === 0) throw new Error('Automation not found')
}

export async function runAutomationsForEvent(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const canonicalEvent = normalizeAutomationEvent(event)
  if (!canonicalEvent) return { triggered: 0 }
  const automations = await prisma.automation.findMany({
    where: { orgId, isActive: true },
  })

  const matching = automations.filter((a) => {
    const trigger = a.trigger as Record<string, unknown>
    return normalizeAutomationEvent(trigger.event ?? trigger.type) === canonicalEvent
  })

  for (const automation of matching) {
    const triggerEventId = String(payload.eventId ?? `${canonicalEvent}:${payload.leadId ?? payload.id ?? 'unknown'}`)
    const conversationId = payload.conversationId ? String(payload.conversationId) : undefined
    const run = await prisma.automationRun.upsert({
      where: { orgId_automationId_triggerEventId: { orgId, automationId: automation.id, triggerEventId } },
      create: {
        orgId,
        automationId: automation.id,
        conversationId,
        triggerEventId,
        status: 'queued',
        attempt: 0,
        input: payload as any,
      },
      update: {},
    })
    if (run.status === 'succeeded') continue
    const claimed = await prisma.automationRun.updateMany({
      where: { id: run.id, status: { in: ['queued', 'failed'] } },
      data: { status: 'running', attempt: { increment: 1 }, startedAt: new Date(), finishedAt: null, error: null },
    })
    if (!claimed.count) continue
    const actions = automation.actions as Array<{ type: string; params?: Record<string, unknown> }>

    try {
      for (let index = run.currentStep; index < actions.length; index += 1) {
        const action = actions[index]
        const stepKey = String(index)

        // Idempotencia por paso (P0-07/AU-02): reclama/lee el AutomationStepRun
        // dentro de una transacción antes de tocar cualquier proveedor externo.
        // Si el paso ya quedó succeeded/skipped/blocked en un intento previo,
        // no se repite el efecto (evita emails/WhatsApps/llamadas duplicados
        // cuando el proceso cae entre el efecto externo y el guardado).
        const stepRun = await prisma.$transaction(async (tx) => {
          const existing = await tx.automationStepRun.findUnique({ where: { runId_stepKey: { runId: run.id, stepKey } } })
          if (existing) {
            if (existing.status === 'succeeded' || existing.status === 'skipped' || existing.status === 'blocked') {
              return existing
            }
            return tx.automationStepRun.update({
              where: { id: existing.id },
              data: { status: 'pending', attempt: { increment: 1 }, startedAt: new Date(), finishedAt: null, errorCode: null, errorDetail: null },
            })
          }
          return tx.automationStepRun.create({
            data: {
              orgId,
              runId: run.id,
              stepKey,
              type: action.type,
              status: 'pending',
              input: (action.params ?? undefined) as any,
              attempt: 1,
              startedAt: new Date(),
            },
          })
        })

        if (stepRun.status === 'succeeded' || stepRun.status === 'skipped' || stepRun.status === 'blocked') {
          if (run.currentStep <= index) {
            await prisma.automationRun.update({ where: { id: run.id }, data: { currentStep: index + 1 } })
          }
          continue
        }

        let result: AutomationStepResult
        try {
          result = await executeAutomationAction(orgId, automation, run, action, event, payload, conversationId)
        } catch (actionError) {
          await prisma.automationStepRun.update({
            where: { id: stepRun.id },
            data: { status: 'failed', errorCode: 'UNEXPECTED_ERROR', errorDetail: (actionError as Error).message, finishedAt: new Date() },
          })
          throw actionError
        }

        await prisma.automationStepRun.update({
          where: { id: stepRun.id },
          data: {
            status: result.status,
            output: (result.output ?? undefined) as any,
            errorCode: result.errorCode ?? null,
            errorDetail: result.errorDetail ?? null,
            finishedAt: new Date(),
          },
        })
        await prisma.automationRun.update({ where: { id: run.id }, data: { currentStep: index + 1 } })
      }

      // El resultado del run refleja lo que realmente ocurrió por paso, no
      // solo cuántas acciones había (P0-03/AU-03): succeeded/skipped/blocked
      // se cuentan por separado y ningún paso omitido se declara ejecutado.
      const stepRuns = await prisma.automationStepRun.findMany({ where: { runId: run.id } })
      const actionsSucceeded = stepRuns.filter((s) => s.status === 'succeeded').length
      const actionsSkipped = stepRuns.filter((s) => s.status === 'skipped').length
      const actionsBlocked = stepRuns.filter((s) => s.status === 'blocked').length

      await prisma.$transaction([
        prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            output: { actionsTotal: actions.length, actionsSucceeded, actionsSkipped, actionsBlocked },
            finishedAt: new Date(),
          },
        }),
        prisma.automation.update({ where: { id: automation.id }, data: { runsCount: { increment: 1 }, lastRunAt: new Date() } }),
      ])
    } catch (error) {
      await prisma.automationRun.update({ where: { id: run.id }, data: { status: 'failed', error: (error as Error).message, finishedAt: new Date() } })
      throw error
    }
  }

  return { triggered: matching.length }
}

// P0-10/AU-15: sin esto, el worker puede caerse silenciosamente y la app web
// sigue "saludable" mientras automatizaciones deja de correr. Expone el
// estado real de outbox, runs y scheduler para poder alertar.
export async function getEngineHealth(orgId: string) {
  const now = new Date()
  const staleThresholdMs = 10 * 60_000

  const [oldestPendingOutbox, pendingOutboxCount, failingOutboxCount, runsByStatus, overdueTriggers, pendingTriggers] = await Promise.all([
    prisma.outboxEvent.findFirst({
      where: { orgId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.outboxEvent.count({ where: { orgId, status: 'pending' } }),
    prisma.outboxEvent.count({ where: { orgId, status: 'pending', attempts: { gte: 5 } } }),
    prisma.automationRun.groupBy({
      by: ['status'],
      where: { orgId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
      _count: { _all: true },
    }),
    prisma.scheduledTrigger.count({ where: { orgId, status: 'pending', dueAt: { lte: new Date(now.getTime() - staleThresholdMs) } } }),
    prisma.scheduledTrigger.count({ where: { orgId, status: 'pending' } }),
  ])

  const oldestPendingAgeMs = oldestPendingOutbox ? now.getTime() - oldestPendingOutbox.createdAt.getTime() : 0
  const workersEnabled = process.env.BACKGROUND_WORKERS_ENABLED === 'true'
  const outboxLagging = workersEnabled && oldestPendingAgeMs > staleThresholdMs
  const schedulerLagging = workersEnabled && overdueTriggers > 0

  return {
    workersEnabled,
    status: workersEnabled && !outboxLagging && !schedulerLagging ? 'ok' : workersEnabled ? 'degraded' : 'stopped',
    outbox: {
      pending: pendingOutboxCount,
      oldestPendingAgeMs,
      failingAfterRetries: failingOutboxCount,
      lagging: outboxLagging,
    },
    runsLast24h: Object.fromEntries(runsByStatus.map(r => [r.status, r._count._all])),
    scheduler: {
      pendingTriggers,
      overdueTriggers,
      lagging: schedulerLagging,
    },
  }
}
