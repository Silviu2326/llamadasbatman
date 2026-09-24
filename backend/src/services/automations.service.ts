import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { createNativeEmailDelivery, resolveNativeEmailDraft, sendNativeMarketingDelivery } from './nativeMarketingEmail.service'
import { assertEmailSendAllowed, type EmailSendBlockReason } from '../lib/emailCompliance'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'
import { leadCampaignCallDedupeKey } from './leadCallGate'
import { sendWhatsApp } from './whatsapp.service'
import { suggestConversationReply } from './conversationAi.service'
import * as tasksService from './tasks.service'
import { generateCorrelationId } from '../lib/correlationId'

export const CANONICAL_AUTOMATION_EVENTS = [
  'call.completed', 'lead.inactive.7d', 'meeting.scheduled.24h',
  'opportunity.proposal.3d', 'lead.created', 'lead.inactive.30d', 'message.received',
  // AU-107: eventos de dominio de Reunión/Tarea.
  'meeting.created', 'meeting.rescheduled', 'meeting.completed', 'meeting.cancelled', 'meeting.no_show',
  'task.due', 'task.overdue',
  // AU-107: eventos de dominio de Oportunidad. pipeline.service.ts ya los
  // publicaba al outbox (createOpportunity/moveStage/reopen) desde la Fase 1,
  // pero al faltar aquí, normalizeAutomationEvent() los descartaba y
  // runAutomationsForEvent() no llegaba a evaluar ninguna automatización —
  // el evento se procesaba (marcaba processed en el outbox) sin disparar
  // nada. Corregido: hallazgo de revisión posterior a la Fase 1.
  'opportunity.created', 'opportunity.stage.changed', 'opportunity.won', 'opportunity.lost', 'opportunity.reopened',
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
  'meeting.created': 'meeting.created', reunion_creada: 'meeting.created', 'reunión creada': 'meeting.created',
  'meeting.rescheduled': 'meeting.rescheduled', reunion_reprogramada: 'meeting.rescheduled', 'reunión reprogramada': 'meeting.rescheduled',
  'meeting.completed': 'meeting.completed', reunion_completada: 'meeting.completed', 'reunión completada': 'meeting.completed',
  'meeting.cancelled': 'meeting.cancelled', reunion_cancelada: 'meeting.cancelled', 'reunión cancelada': 'meeting.cancelled',
  'meeting.no_show': 'meeting.no_show', reunion_no_show: 'meeting.no_show', 'no show': 'meeting.no_show',
  'task.due': 'task.due', tarea_por_vencer: 'task.due',
  'task.overdue': 'task.overdue', tarea_vencida: 'task.overdue',
  'opportunity.created': 'opportunity.created', oportunidad_creada: 'opportunity.created',
  'opportunity.stage.changed': 'opportunity.stage.changed', oportunidad_cambio_etapa: 'opportunity.stage.changed', 'cambio de etapa': 'opportunity.stage.changed',
  'opportunity.won': 'opportunity.won', oportunidad_ganada: 'opportunity.won',
  'opportunity.lost': 'opportunity.lost', oportunidad_perdida: 'opportunity.lost',
  'opportunity.reopened': 'opportunity.reopened', oportunidad_reabierta: 'opportunity.reopened',
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
  'log', 'update_lead_status',
  'send_whatsapp_template', 'queue_voice_call', 'send_email_template', 'ai_reply_whatsapp',
  // AU-108: nuevas acciones CRM.
  'create_task', 'set_owner', 'add_tag', 'update_field', 'create_opportunity', 'notify',
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
    if (typed.type === 'send_email_template' && !String(typed.params?.emailDraftId ?? '').trim()) {
      throw new Error('send_email_template requiere emailDraftId')
    }
    if (typed.type === 'create_task' && !String(typed.params?.title ?? '').trim()) {
      throw new Error('create_task requiere title')
    }
    if (typed.type === 'set_owner' && !String(typed.params?.ownerId ?? '').trim()) {
      throw new Error('set_owner requiere ownerId')
    }
    if (typed.type === 'add_tag' && !String(typed.params?.tag ?? '').trim()) {
      throw new Error('add_tag requiere tag')
    }
    if (typed.type === 'update_field' && !String(typed.params?.field ?? '').trim()) {
      throw new Error('update_field requiere field')
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

// Un run puede volver a ser recogido después de un fallo del proceso. Para
// acciones que solo escriben en nuestra base de datos es seguro reintentarlo;
// para efectos externos no hay una garantía end-to-end si el proceso muere
// entre la llamada al proveedor y la actualización de AutomationStepRun.
// En ese caso elegimos no repetir el efecto y lo dejamos bloqueado para
// revisión, en vez de poder enviar dos mensajes o iniciar dos llamadas.
const EXTERNAL_EFFECT_ACTIONS = new Set<string>([
  'send_whatsapp_template',
  'queue_voice_call',
  'send_email_template',
  'ai_reply_whatsapp',
])
const MAX_AUTOMATION_RUN_ATTEMPTS = Math.max(1, Number(process.env.AUTOMATION_RUN_MAX_ATTEMPTS ?? 3))
const AUTOMATION_RUN_LEASE_MS = Math.max(60_000, Number(process.env.AUTOMATION_RUN_LEASE_MS ?? 10 * 60_000))

function isExternalEffectAction(actionType: string) {
  return EXTERNAL_EFFECT_ACTIONS.has(actionType)
}

function automationStepIdempotencyKey(runId: string, stepKey: string) {
  // Es estable a través de los reintentos del mismo run y se conserva tanto
  // en AutomationStepRun como en la metadata de los proveedores que la
  // soportan. No se afirma que los proveedores la apliquen como garantía.
  return `automation-${runId}-step-${stepKey}`
}

async function executeAutomationAction(
  orgId: string,
  automation: { id: string; name: string },
  run: { id: string },
  action: { type: string; params?: Record<string, unknown> },
  event: string,
  payload: Record<string, unknown>,
  conversationId: string | undefined,
  idempotencyKey: string
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
        metadata: { automationId: automation.id, automationRunId: run.id, automationStepIdempotencyKey: idempotencyKey },
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
      // Con campaña, la misma clave que startCampaign/importación para no
      // marcar dos veces al mismo lead; sin campaña, una llamada por evento.
      const queued = lead.campaignId
        ? await enqueueLeadCall(orgId, leadId, leadCampaignCallDedupeKey(leadId, lead.campaignId), 0, { campaignId: lead.campaignId, onFinished: 'ignore' })
        : await enqueueLeadCall(orgId, leadId)
      if (!queued) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'La cola de llamadas no está disponible' }
      if (conversationId) {
        await prisma.message.create({ data: { orgId, conversationId, leadId, channel: 'voice', provider: 'twilio', address: lead.phone, direction: 'outbound', contentType: 'call', body: 'Llamada automática solicitada', status: 'queued', metadata: { automationId: automation.id, automationRunId: run.id, automationStepIdempotencyKey: idempotencyKey } } })
      }
      return { status: 'succeeded', output: { leadId, channel: 'voice' } }
    }
    case 'send_email_template': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.email) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene email' }
      const emailDraftId = String(action.params?.emailDraftId ?? '').trim()
      const content = await resolveNativeEmailDraft(orgId, emailDraftId)
      if (!content) return { status: 'blocked', errorCode: 'EMAIL_DRAFT_NOT_FOUND', errorDetail: 'El borrador de email no existe o no pertenece a esta organización' }
      const emailDecision = await assertEmailSendAllowed(orgId, leadId, 'marketing')
      if (!emailDecision.allowed) return { status: 'blocked', errorCode: EMAIL_BLOCK_ERROR_CODE[emailDecision.reason], errorDetail: `Envío bloqueado por cumplimiento: ${emailDecision.reason}` }
      const delivery = await createNativeEmailDelivery({ orgId, leadId, emailDraftId, toAddress: lead.email, idempotencyScope: idempotencyKey, purpose: 'marketing', content })
      if (delivery.status === 'accepted' || delivery.status === 'delivered') return { status: 'succeeded', output: { leadId, emailDraftId, deliveryId: delivery.id, deduplicated: true } }
      const workerId = `automation-${run.id}`
      const claimed = await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: 'queued' }, data: { status: 'processing', workerId, lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), providerAttemptedAt: new Date(), attempts: { increment: 1 } } })
      if (!claimed.count) return { status: 'blocked', errorCode: 'DELIVERY_ALREADY_CLAIMED', errorDetail: 'El envío ya está siendo procesado.' }
      const outcome = await sendNativeMarketingDelivery(delivery.id, workerId)
      if (outcome !== 'accepted') return { status: 'blocked', errorCode: outcome === 'uncertain' ? 'DELIVERY_UNCERTAIN' : 'PROVIDER_UNAVAILABLE', errorDetail: 'Resend no confirmó el envío; revisa el registro antes de reintentarlo.' }
      const latest = await prisma.emailDelivery.findUnique({ where: { id: delivery.id }, select: { providerMessageId: true } })
      if (conversationId) {
        await prisma.message.create({ data: { orgId, conversationId, leadId, channel: 'email', provider: 'resend', address: lead.email, direction: 'outbound', contentType: 'html', body: `${content.subject}\n\n${content.html}`, status: 'sent', sentAt: new Date(), providerMessageId: latest?.providerMessageId ?? undefined, metadata: { emailDraftId, deliveryId: delivery.id, automationId: automation.id, automationRunId: run.id, automationStepIdempotencyKey: idempotencyKey } } })
      }
      return { status: 'succeeded', output: { leadId, emailDraftId, deliveryId: delivery.id, providerMessageId: latest?.providerMessageId ?? null } }
    }    case 'ai_reply_whatsapp': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      if (!conversationId || payload.channel !== 'whatsapp') return { status: 'skipped', errorCode: 'UNSUPPORTED_CONTEXT', errorDetail: 'Requiere conversationId y canal whatsapp' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.phone) return { status: 'blocked', errorCode: 'ADDRESS_MISSING', errorDetail: 'El lead no tiene teléfono' }
      if (!(await hasConsent(orgId, leadId, 'whatsapp'))) return { status: 'blocked', errorCode: 'CONSENT_MISSING', errorDetail: 'Sin consentimiento de WhatsApp' }
      const suggestion = await suggestConversationReply(orgId, conversationId, String(action.params?.tone ?? 'consultivo'))
      if (!suggestion) return { status: 'blocked', errorCode: 'PROVIDER_UNAVAILABLE', errorDetail: 'No se pudo generar la respuesta de IA' }
      await sendWhatsApp({ orgId, leadId, conversationId, to: lead.phone, body: suggestion.text, metadata: { aiGenerated: true, aiReason: suggestion.reason, automationId: automation.id, automationRunId: run.id, automationStepIdempotencyKey: idempotencyKey } })
      return { status: 'succeeded', output: { leadId, channel: 'whatsapp', aiGenerated: true } }
    }
    // AU-108: crea una tarea real de seguimiento para el owner del lead.
    case 'create_task': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const title = String(action.params?.title ?? '').trim()
      if (!title) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta title en params' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      const dueInDays = Number(action.params?.dueInDays ?? 3)
      const dueAt = new Date(Date.now() + (Number.isFinite(dueInDays) ? dueInDays : 3) * 24 * 60 * 60 * 1000)
      const priorityParam = action.params?.priority as string | undefined
      const priority = priorityParam && ['low', 'normal', 'high', 'urgent'].includes(priorityParam) ? priorityParam as 'low' | 'normal' | 'high' | 'urgent' : undefined
      const task = await tasksService.createSystemTask(orgId, null, {
        type: 'automation',
        title,
        leadId,
        ownerId: lead.ownerId ?? undefined,
        priority,
        dueAt: dueAt.toISOString(),
        source: 'automation',
        sourceId: `${automation.id}:${run.id}:create_task`,
      })
      return { status: 'succeeded', output: { taskId: task.id, leadId } }
    }
    // AU-108: reasigna el owner del lead (o el assignee de la oportunidad).
    case 'set_owner': {
      const ownerId = String(action.params?.ownerId ?? '').trim()
      if (!ownerId) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta ownerId en params' }
      const owner = await prisma.user.findFirst({ where: { id: ownerId, orgId }, select: { id: true } })
      if (!owner) return { status: 'skipped', errorCode: 'OWNER_NOT_FOUND', errorDetail: 'El usuario no pertenece a la organización' }
      if (action.params?.entityType === 'opportunity') {
        if (!payload.opportunityId) return { status: 'skipped', errorCode: 'OPPORTUNITY_ID_MISSING', errorDetail: 'El evento no incluye opportunityId' }
        const opportunityId = String(payload.opportunityId)
        const updated = await prisma.opportunity.updateMany({ where: { id: opportunityId, orgId }, data: { assignedTo: ownerId } })
        if (updated.count === 0) return { status: 'skipped', errorCode: 'OPPORTUNITY_NOT_FOUND', errorDetail: 'Oportunidad no encontrada' }
        return { status: 'succeeded', output: { opportunityId, ownerId } }
      }
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const updated = await prisma.lead.updateMany({ where: { id: leadId, orgId }, data: { ownerId } })
      if (updated.count === 0) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      return { status: 'succeeded', output: { leadId, ownerId } }
    }
    // AU-108: añade un tag al lead evitando duplicados.
    case 'add_tag': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const tag = String(action.params?.tag ?? '').trim()
      if (!tag) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta tag en params' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { tags: true } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      if (!lead.tags.includes(tag)) {
        await prisma.lead.update({ where: { id: leadId }, data: { tags: { push: tag } } })
      }
      return { status: 'succeeded', output: { leadId, tag } }
    }
    // AU-108: actualiza un campo dentro de Lead.customFields — nunca un campo
    // arbitrario del modelo, para no permitir escrituras fuera del sandbox.
    case 'update_field': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const field = String(action.params?.field ?? '').trim()
      if (!field) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta field en params' }
      if (!action.params || !('value' in action.params)) return { status: 'skipped', errorCode: 'MISSING_PARAM', errorDetail: 'Falta value en params' }
      const value = action.params.value
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { customFields: true } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      const customFields = lead.customFields && typeof lead.customFields === 'object' && !Array.isArray(lead.customFields)
        ? { ...(lead.customFields as Record<string, unknown>) }
        : {}
      customFields[field] = value
      await prisma.lead.update({ where: { id: leadId }, data: { customFields: customFields as Prisma.InputJsonValue } })
      return { status: 'succeeded', output: { leadId, field } }
    }
    // AU-108: crea una oportunidad básica si el lead no tiene ya una abierta.
    // Se usa prisma directo (no pipeline.service.ts) para no crear una
    // dependencia circular entre servicios — excepción razonable acordada.
    case 'create_opportunity': {
      if (!payload.leadId) return { status: 'skipped', errorCode: 'LEAD_ID_MISSING', errorDetail: 'El evento no incluye leadId' }
      const leadId = String(payload.leadId)
      const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
      if (!lead) return { status: 'skipped', errorCode: 'LEAD_NOT_FOUND', errorDetail: 'Lead no encontrado' }
      const existingOpen = await prisma.opportunity.findFirst({
        where: { orgId, leadId, stage: { notIn: ['closed_won', 'closed_lost'] } },
        select: { id: true },
      })
      if (existingOpen) return { status: 'skipped', errorCode: 'OPPORTUNITY_ALREADY_OPEN', errorDetail: 'El lead ya tiene una oportunidad abierta' }
      const name = String(action.params?.name ?? '').trim() || `Oportunidad — ${lead.name}`
      const opportunity = await prisma.opportunity.create({ data: { orgId, leadId, name, stage: 'lead' } })
      return { status: 'succeeded', output: { opportunityId: opportunity.id, leadId } }
    }
    // AU-108: notificación interna mínima — una Task de tipo 'notification'
    // asignada al owner (no hay sistema de push, es deliberado).
    case 'notify': {
      let ownerId = action.params?.ownerId ? String(action.params.ownerId).trim() : ''
      if (!ownerId && payload.leadId) {
        const lead = await prisma.lead.findFirst({ where: { id: String(payload.leadId), orgId }, select: { ownerId: true } })
        ownerId = lead?.ownerId ?? ''
      }
      if (!ownerId) return { status: 'skipped', errorCode: 'OWNER_MISSING', errorDetail: 'No hay ownerId ni owner de lead para notificar' }
      const owner = await prisma.user.findFirst({ where: { id: ownerId, orgId }, select: { id: true } })
      if (!owner) return { status: 'skipped', errorCode: 'OWNER_NOT_FOUND', errorDetail: 'El usuario no pertenece a la organización' }
      const message = String(action.params?.message ?? `Notificación de automatización: ${automation.name}`)
      const task = await tasksService.createSystemTask(orgId, null, {
        type: 'notification',
        title: message.slice(0, 200),
        description: message,
        ownerId,
        leadId: payload.leadId ? String(payload.leadId) : undefined,
        source: 'automation',
        sourceId: `${automation.id}:${run.id}:notify`,
      })
      return { status: 'succeeded', output: { taskId: task.id, ownerId } }
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

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * AU-102: compara la copia de trabajo con la última versión publicada. Una
 * automatización sin versiones publicadas nunca tiene «cambios sin publicar»
 * porque todavía corre con su copia de trabajo.
 */
export function describePublicationState(
  automation: { name: string; description: string | null; trigger: unknown; actions: unknown },
  latestVersion: { version: number; name: string; description: string | null; trigger: unknown; actions: unknown } | null,
) {
  if (!latestVersion) return { latestVersion: null, hasUnpublishedChanges: false }
  const changed = automation.name !== latestVersion.name
    || (automation.description ?? null) !== (latestVersion.description ?? null)
    || stableJson(automation.trigger) !== stableJson(latestVersion.trigger)
    || stableJson(automation.actions) !== stableJson(latestVersion.actions)
  return { latestVersion: latestVersion.version, hasUnpublishedChanges: changed }
}

export async function getAutomationWithPublicationState(orgId: string, id: string) {
  const automation = await prisma.automation.findFirst({ where: { id, orgId } })
  if (!automation) return null
  const latest = await prisma.automationVersion.findFirst({
    where: { orgId, automationId: id },
    orderBy: { version: 'desc' },
    select: { version: true, name: true, description: true, trigger: true, actions: true },
  })
  return { ...automation, ...describePublicationState(automation, latest) }
}

/**
 * Edita la copia de trabajo. Si ya existe una versión publicada, los runs
 * siguen usando esa versión (trigger y acciones) hasta que se publique otra:
 * editar equivale a preparar un borrador de la siguiente versión.
 */
export async function updateAutomation(orgId: string, id: string, data: {
  name?: string
  description?: string | null
  trigger?: Record<string, unknown>
  actions?: unknown[]
}) {
  const automation = await prisma.automation.findFirst({ where: { id, orgId } })
  if (!automation) return null
  const trigger = data.trigger ? normalizeAutomationTrigger(data.trigger) : undefined
  if (data.actions) validateAutomationActions(data.actions)
  const nextActions = data.actions ?? (Array.isArray(automation.actions) ? automation.actions : [])
  if (automation.isActive && nextActions.length === 0) {
    throw new Error('No se puede dejar sin acciones una automatización activa; páusala antes')
  }
  const updated = await prisma.automation.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(trigger ? { trigger: trigger as any } : {}),
      ...(data.actions ? { actions: data.actions as any } : {}),
    },
  })
  const latest = await prisma.automationVersion.findFirst({
    where: { orgId, automationId: id },
    orderBy: { version: 'desc' },
    select: { version: true, name: true, description: true, trigger: true, actions: true },
  })
  return { before: automation, after: { ...updated, ...describePublicationState(updated, latest) } }
}

// El orquestador guarda su ledger de ejecución como Automation privada
// ("[orchestration] <planId>", ver orchestration.service.ts); no es un flujo
// de usuario y no debe aparecer ni poder activarse desde la lista.
export const ORCHESTRATION_LEDGER_PREFIX = '[orchestration] '

export async function listAutomations(orgId: string) {
  return prisma.automation.findMany({
    where: { orgId, NOT: { name: { startsWith: ORCHESTRATION_LEDGER_PREFIX } } },
    orderBy: { createdAt: 'desc' },
  })
}

// AU-104: historial de runs — la automation debe pertenecer a la org antes
// de exponer cualquier run; devolvemos un conteo de pasos por estado en vez
// del detalle completo de stepRuns para mantener la lista liviana.
export const AUTOMATION_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead_letter'] as const
export type AutomationRunStatus = typeof AUTOMATION_RUN_STATUSES[number]

export async function listRuns(orgId: string, automationId: string, filters: {
  status?: AutomationRunStatus
  page?: number
  limit?: number
} = {}) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, orgId } })
  if (!automation) return null

  const page = filters.page && filters.page > 0 ? filters.page : 1
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 20

  const where: any = { orgId, automationId }
  if (filters.status) where.status = filters.status

  const [items, total] = await Promise.all([
    prisma.automationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      // AU-102: version es la que quedó atada en el momento del run — puede
      // no coincidir con la última publicada si la automation se republicó después.
      include: { stepRuns: { select: { status: true } }, automationVersion: { select: { version: true } } },
    }),
    prisma.automationRun.count({ where }),
  ])

  const runs = items.map(({ stepRuns, automationVersion, ...run }) => {
    const stepCounts = { succeeded: 0, skipped: 0, blocked: 0, failed: 0, pending: 0 }
    for (const step of stepRuns) {
      if (step.status in stepCounts) stepCounts[step.status as keyof typeof stepCounts] += 1
    }
    return { ...run, stepCounts, stepsTotal: stepRuns.length, automationVersionNumber: automationVersion?.version ?? null }
  })

  return { items: runs, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

export async function getRunDetail(orgId: string, automationId: string, runId: string) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, orgId } })
  if (!automation) return null

  const run = await prisma.automationRun.findFirst({
    where: { id: runId, orgId, automationId },
    include: { stepRuns: { orderBy: { stepKey: 'asc' } } },
  })
  return run
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

// AU-102: versionado inmutable — cada publicación congela un snapshot de
// name/description/trigger/actions en una fila nueva de AutomationVersion.
// Los runs futuros quedan atados a esa versión exacta (ver runAutomationsForEvent),
// así el historial sigue siendo explicable aunque la automatización se edite después.
export async function publishAutomation(orgId: string, actorUserId: string | undefined, id: string) {
  const automation = await prisma.automation.findFirst({ where: { id, orgId } })
  if (!automation) throw new Error('Automation not found')

  const actions = Array.isArray(automation.actions) ? automation.actions : []
  if (actions.length === 0) {
    throw new Error('No se puede publicar una automatización sin acciones configuradas')
  }

  return prisma.$transaction(async (tx) => {
    const existingCount = await tx.automationVersion.count({ where: { automationId: id } })
    const version = await tx.automationVersion.create({
      data: {
        orgId,
        automationId: id,
        version: existingCount + 1,
        name: automation.name,
        description: automation.description,
        trigger: automation.trigger as any,
        actions: automation.actions as any,
        publishedById: actorUserId ?? null,
      },
    })
    if (automation.status === 'draft') {
      await tx.automation.update({ where: { id }, data: { status: 'active' } })
    }
    return version
  })
}

// AU-102: solo lectura — la automation debe pertenecer a la org antes de
// exponer su historial de versiones publicadas.
export async function listAutomationVersions(orgId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, orgId } })
  if (!automation) return null
  return prisma.automationVersion.findMany({
    where: { orgId, automationId },
    orderBy: { version: 'desc' },
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

  // AU-102: si la automatización tiene versión publicada, el disparador que
  // cuenta es el de esa versión; así editar la copia de trabajo (PUT /:id)
  // no cambia qué eventos la activan hasta publicar de nuevo.
  const publishedTriggers = new Map<string, unknown>()
  if (automations.length) {
    const versions = await prisma.automationVersion.findMany({
      where: { orgId, automationId: { in: automations.map(a => a.id) } },
      orderBy: { version: 'desc' },
      select: { automationId: true, trigger: true },
    })
    for (const version of versions ?? []) {
      if (!publishedTriggers.has(version.automationId)) publishedTriggers.set(version.automationId, version.trigger)
    }
  }
  const matching = automations.filter((a) => {
    const trigger = (publishedTriggers.get(a.id) ?? a.trigger) as Record<string, unknown>
    return normalizeAutomationEvent(trigger?.event ?? trigger?.type) === canonicalEvent
  })

  for (const automation of matching) {
    const triggerEventId = String(payload.eventId ?? `${canonicalEvent}:${payload.leadId ?? payload.id ?? 'unknown'}`)
    const conversationId = payload.conversationId ? String(payload.conversationId) : undefined
    // FND-06: reusa el correlationId del evento entrante (payload u OutboxEvent)
    // si viene, o genera uno propio — mejor tener uno rastreable que null.
    const incomingCorrelationId = String(payload.correlationId ?? '').trim()
    const correlationId = incomingCorrelationId || generateCorrelationId()
    // AU-102: si ya hay al menos una versión publicada, el run queda atado a
    // la más reciente. Automatizaciones sin ninguna versión publicada aún
    // (creadas antes de AU-102) simplemente corren con automationVersionId null.
    // Corrección: además de guardar el id para trazabilidad, hay que EJECUTAR
    // el snapshot de esa versión (trigger.actions congelados al publicar), no
    // `automation.actions` en vivo — si no, editar una automatización después
    // de publicar cambia silenciosamente qué corre un run ya iniciado o uno
    // nuevo que debería seguir atado a la versión que dice usar.
    const latestVersion = await prisma.automationVersion.findFirst({
      where: { orgId, automationId: automation.id },
      orderBy: { version: 'desc' },
      select: { id: true, actions: true },
    })
    const run = await prisma.automationRun.upsert({
      where: { orgId_automationId_triggerEventId: { orgId, automationId: automation.id, triggerEventId } },
      create: {
        orgId,
        automationId: automation.id,
        automationVersionId: latestVersion?.id ?? null,
        conversationId,
        triggerEventId,
        correlationId,
        status: 'queued',
        attempt: 0,
        input: payload as any,
      },
      update: {},
    })
    if (run.status === 'succeeded' || run.status === 'dead_letter') continue

    const now = new Date()
    const staleBefore = new Date(now.getTime() - AUTOMATION_RUN_LEASE_MS)
    // Un proceso terminado abruptamente deja el run en `running`. Solo se
    // recupera tras expirar el lease; así no compiten dos workers sanos. Los
    // reintentos están acotados y el último estado se conserva como DLQ de
    // runs para que el outbox pueda avanzar sin crear un ciclo infinito.
    // Un run `running` con lease vigente nunca se envía a DLQ por un evento
    // duplicado: el worker original todavía es quien puede resolverlo.
    if (run.attempt >= MAX_AUTOMATION_RUN_ATTEMPTS) {
      await prisma.automationRun.updateMany({
        where: {
          id: run.id,
          OR: [
            { status: { in: ['queued', 'failed'] } },
            { status: 'running', startedAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: 'dead_letter',
          errorCode: 'MAX_ATTEMPTS_EXCEEDED',
          error: `Se agotaron ${MAX_AUTOMATION_RUN_ATTEMPTS} intentos del run`,
          finishedAt: new Date(),
        },
      })
      continue
    }
    const claimed = await prisma.automationRun.updateMany({
      where: {
        id: run.id,
        attempt: { lt: MAX_AUTOMATION_RUN_ATTEMPTS },
        OR: [
          { status: { in: ['queued', 'failed'] } },
          { status: 'running', startedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'running', attempt: { increment: 1 }, startedAt: now, finishedAt: null, error: null, errorCode: null },
    })
    if (!claimed.count) continue

    // Ejecuta el snapshot inmutable de la versión atada a ESTE run
    // (`run.automationVersionId`, ya fijado en el upsert de arriba), no la
    // versión "más reciente" en abstracto — un run existente que se reintenta
    // después de publicarse una versión nueva debe seguir corriendo con la
    // definición que tenía cuando se creó, nunca cambiar de versión a mitad
    // de ejecución (invariante de automatización, 05-arquitectura-objetivo §8.3).
    let versionActions: unknown = null
    if (run.automationVersionId === latestVersion?.id) {
      versionActions = latestVersion?.actions ?? null
    } else if (run.automationVersionId) {
      const runVersion = await prisma.automationVersion.findUnique({
        where: { id: run.automationVersionId },
        select: { actions: true },
      })
      versionActions = runVersion?.actions ?? null
    }
    const actions = (versionActions ?? automation.actions) as Array<{ type: string; params?: Record<string, unknown> }>

    try {
      for (let index = run.currentStep; index < actions.length; index += 1) {
        const action = actions[index]
        const stepKey = String(index)
        const idempotencyKey = automationStepIdempotencyKey(run.id, stepKey)

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
            if (isExternalEffectAction(existing.type)) {
              return tx.automationStepRun.update({
                where: { id: existing.id },
                data: {
                  status: 'blocked',
                  errorCode: 'OUTCOME_UNKNOWN',
                  errorDetail: 'El proceso se interrumpió antes de confirmar el resultado del proveedor; no se reintenta para evitar un efecto externo duplicado.',
                  finishedAt: new Date(),
                },
              })
            }
            return tx.automationStepRun.update({
              where: { id: existing.id },
              data: { status: 'pending', attempt: { increment: 1 }, startedAt: new Date(), finishedAt: null, idempotencyKey: existing.idempotencyKey ?? idempotencyKey, errorCode: null, errorDetail: null },
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
              idempotencyKey,
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
          result = await executeAutomationAction(orgId, automation, run, action, canonicalEvent, payload, conversationId, idempotencyKey)
        } catch (actionError) {
          if (isExternalEffectAction(action.type)) {
            // El proveedor puede haber aceptado el efecto y fallar antes de
            // devolver respuesta. Registrar el caso para revisión es más
            // seguro que repetir a ciegas un envío o una llamada.
            await prisma.automationStepRun.update({
              where: { id: stepRun.id },
              data: {
                status: 'blocked',
                errorCode: 'OUTCOME_UNKNOWN',
                errorDetail: (actionError as Error).message,
                finishedAt: new Date(),
              },
            })
            await prisma.automationRun.update({ where: { id: run.id }, data: { currentStep: index + 1 } })
            continue
          }
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

  const [oldestPendingOutbox, pendingOutboxCount, failingOutboxCount, deadLetterOutboxCount, runsByStatus, overdueTriggers, pendingTriggers] = await Promise.all([
    prisma.outboxEvent.findFirst({
      where: { orgId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.outboxEvent.count({ where: { orgId, status: 'pending' } }),
    prisma.outboxEvent.count({ where: { orgId, status: 'pending', attempts: { gte: 5 } } }),
    prisma.outboxEvent.count({ where: { orgId, status: 'dead_letter' } }),
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
      deadLetter: deadLetterOutboxCount,
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

