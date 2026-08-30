import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { hasPermission } from '../access-control'
import * as tasksService from '../services/tasks.service'
import * as meetingsService from '../services/meetings.service'
import * as pipelineService from '../services/pipeline.service'
import { getMicroapp } from './registry'
import { startMicroappRun } from './runtime'
import type { FollowUpAction, FollowUpKind } from './types'

export class FollowUpAdapterError extends Error {
  constructor(message: string, public code = 'MICROAPP_ACTION_INVALID', public statusCode = 400) { super(message) }
}

const REQUIRED_PERMISSION: Partial<Record<FollowUpKind, string>> = {
  create_task: 'tasks.write',
  create_meeting: 'meetings.write',
  queue_call: 'tasks.write',
  update_lead_field: 'leads.write',
  update_stage: 'pipeline.write',
  create_opportunity: 'pipeline.write',
  create_note: 'leads.write',
  create_lead: 'leads.write',
  create_document: 'knowledge.write',
  send_email_draft: 'leads.contact',
}

function paramsOf(action: FollowUpAction): Record<string, unknown> { return action.params ?? {} }
function textParam(params: Record<string, unknown>, key: string): string | undefined {
  return typeof params[key] === 'string' && params[key].trim() ? params[key].trim() : undefined
}

export async function applyFollowUpAction(params: {
  orgId: string
  userId: string
  role: string
  runId: string
  action: FollowUpAction
}): Promise<Record<string, unknown>> {
  const run = await prisma.microappRun.findFirst({ where: { id: params.runId, orgId: params.orgId } })
  if (!run) throw new FollowUpAdapterError('Ejecución no encontrada', 'MICROAPP_RUN_NOT_FOUND', 404)
  const manifest = getMicroapp(run.microappId)
  if (!manifest) throw new FollowUpAdapterError('La microapp ya no está disponible', 'MICROAPP_UNKNOWN', 404)
  const kind = params.action.kind as FollowUpKind
  const required = REQUIRED_PERMISSION[kind]
  if (required && !hasPermission(params.role, required)) {
    throw new FollowUpAdapterError(`Tu rol no puede ejecutar ${kind}`, 'MICROAPP_ACTION_FORBIDDEN', 403)
  }
  const payload = paramsOf(params.action)

  if (manifest.effects === 'external' || manifest.approvalAction) {
    const approval = await prisma.sensitiveApprovalRequest.create({
      data: {
        orgId: params.orgId,
        action: manifest.approvalAction ?? `microapp.${kind}`,
        requesterUserId: params.userId,
        resourceType: 'MicroappRun',
        resourceId: run.id,
        reason: `Acción ${kind} propuesta por ${manifest.name}`,
        payload: { action: params.action, runId: run.id } as never,
      },
    })
    await writeAuditLog({ orgId: params.orgId, actorUserId: params.userId, action: 'microapp.action.request_approval', entityType: 'MicroappRun', entityId: run.id, after: { kind, approvalId: approval.id } })
    return { status: 'awaiting_approval', approvalId: approval.id, message: 'La acción necesita aprobación antes de ejecutarse.' }
  }

  let output: Record<string, unknown>
  switch (kind) {
    case 'navigate':
      output = { status: 'navigated', route: textParam(payload, 'route') ?? '/microapps' }
      break
    case 'run_microapp': {
      const microappId = textParam(payload, 'microappId')
      if (!microappId) throw new FollowUpAdapterError('run_microapp necesita microappId')
      const child = await startMicroappRun({ orgId: params.orgId, microappId, input: payload.input ?? {}, createdById: params.userId, links: { leadId: run.leadId ?? undefined, accountId: run.accountId ?? undefined, callId: run.callId ?? undefined, opportunityId: run.opportunityId ?? undefined, conversationId: run.conversationId ?? undefined } })
      output = { status: 'queued', jobId: child.jobId, microappId }
      break
    }
    case 'create_task':
    case 'queue_call': {
      const task = await tasksService.createSystemTask(params.orgId, params.userId, {
        title: textParam(payload, 'title') ?? params.action.label,
        description: textParam(payload, 'description') ?? (kind === 'queue_call' ? 'Llamada propuesta desde una microapp.' : undefined),
        dueAt: textParam(payload, 'dueAt'),
        leadId: run.leadId ?? textParam(payload, 'leadId'),
        opportunityId: run.opportunityId ?? textParam(payload, 'opportunityId'),
        source: 'microapp', sourceId: run.id,
      })
      output = { status: 'succeeded', taskId: task.id, message: 'Tarea creada' }
      break
    }
    case 'create_note': {
      const leadId = run.leadId ?? textParam(payload, 'leadId')
      if (!leadId) throw new FollowUpAdapterError('create_note necesita un lead vinculado')
      const note = await prisma.leadNote.create({ data: { orgId: params.orgId, leadId, callId: run.callId ?? textParam(payload, 'callId'), authorName: 'Microapp', text: textParam(payload, 'text') ?? params.action.label } })
      output = { status: 'succeeded', noteId: note.id, message: 'Nota creada' }
      break
    }
    case 'create_lead': {
      const name = textParam(payload, 'name') ?? textParam(payload, 'companyName')
      if (!name) throw new FollowUpAdapterError('create_lead necesita name o companyName')
      const lead = await prisma.lead.create({
        data: {
          orgId: params.orgId,
          name,
          company: textParam(payload, 'companyName') ?? textParam(payload, 'company'),
          email: textParam(payload, 'email'),
          phone: textParam(payload, 'phone'),
          source: 'microapp',
          customFields: { sourceRunId: run.id, sourceMicroappId: run.microappId } as never,
        },
      })
      output = { status: 'succeeded', leadId: lead.id, message: 'Lead creado' }
      break
    }
    case 'create_document': {
      const document = await prisma.knowledgeBase.create({
        data: {
          orgId: params.orgId,
          name: textParam(payload, 'title') ?? params.action.label,
          type: 'document',
          content: textParam(payload, 'body') ?? textParam(payload, 'text') ?? '',
          sourceType: 'generated',
          isActive: false,
        },
      })
      output = { status: 'succeeded', documentId: document.id, message: 'Documento guardado como borrador' }
      break
    }
    case 'create_meeting': {
      const leadId = run.leadId ?? textParam(payload, 'leadId')
      if (!leadId) throw new FollowUpAdapterError('create_meeting necesita un lead vinculado')
      const scheduledAt = textParam(payload, 'scheduledAt') ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      const meeting = await meetingsService.createMeeting(params.orgId, params.userId, params.role, { leadId, callId: run.callId ?? textParam(payload, 'callId'), title: textParam(payload, 'title') ?? params.action.label, scheduledAt, notes: textParam(payload, 'notes') })
      output = { status: 'succeeded', meetingId: meeting.id, message: 'Reunión creada' }
      break
    }
    case 'update_lead_field': {
      const leadId = run.leadId ?? textParam(payload, 'leadId')
      const field = textParam(payload, 'field')
      if (!leadId || !field || !['status', 'company', 'role', 'customFields'].includes(field)) throw new FollowUpAdapterError('update_lead_field necesita un campo permitido y lead')
      const before = await prisma.lead.findFirst({ where: { id: leadId, orgId: params.orgId } })
      if (!before) throw new FollowUpAdapterError('Lead no encontrado', 'LEAD_NOT_FOUND', 404)
      const value = field === 'customFields' ? (payload.value && typeof payload.value === 'object' ? payload.value : {}) : textParam(payload, 'value')
      const updated = await prisma.lead.update({ where: { id: leadId }, data: { [field]: value } as never })
      output = { status: 'succeeded', leadId, field, value: updated[field as keyof typeof updated], message: 'Lead actualizado' }
      break
    }
    case 'update_stage': {
      if (payload.confirmed !== true) throw new FollowUpAdapterError('Mover de etapa requiere confirmación explícita', 'MICROAPP_ACTION_CONFIRMATION_REQUIRED', 409)
      const opportunityId = run.opportunityId ?? textParam(payload, 'opportunityId')
      const stage = textParam(payload, 'stage') as any
      if (!opportunityId || !stage) throw new FollowUpAdapterError('update_stage necesita opportunityId y stage')
      const updated = await pipelineService.moveStage(params.orgId, params.userId, params.role, opportunityId, stage)
      output = { status: 'succeeded', opportunityId, stage: updated.stage, message: 'Etapa actualizada' }
      break
    }
    case 'send_email_draft':
      output = { status: 'proposal', subject: textParam(payload, 'subject') ?? params.action.label, body: textParam(payload, 'body') ?? '' }
      break
    default:
      output = { status: 'proposal', kind, message: 'La acción está registrada como propuesta y requiere un handler específico.' }
  }
  await writeAuditLog({ orgId: params.orgId, actorUserId: params.userId, action: `microapp.action.${kind}`, entityType: 'MicroappRun', entityId: run.id, after: output })
  return output
}
