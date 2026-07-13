import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'
import { enqueueAutomationEvent } from '../jobs/automationRunner'
import { sendEmailToLead } from './mauticSync.service'
import { sendWhatsApp } from './whatsapp.service'
import * as tasksService from './tasks.service'

export type ChannelConsentInput = Partial<Record<'whatsapp' | 'voice' | 'email', boolean>> & {
  source?: string
  evidence?: string
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function crmAddress(channel: string, value: string) {
  if (channel === 'whatsapp' || channel === 'voice') return value.replace(/^whatsapp:/, '').replace(/[\s()-]/g, '')
  return value.trim().toLowerCase()
}

export async function listConversations(orgId: string, filters: {
  channel?: string
  status?: string
  search?: string
  assignedUserId?: string
  limit?: number
  offset?: number
} = {}) {
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50))
  const offset = Math.max(0, filters.offset ?? 0)
  const where: Prisma.ConversationWhereInput = { orgId }
  if (filters.channel && filters.channel !== 'all') where.messages = { some: { channel: filters.channel } }
  if (filters.status && filters.status !== 'all') where.status = filters.status
  if (filters.assignedUserId === 'unassigned') where.assignedUserId = null
  else if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId
  if (filters.search) {
    const search = filters.search.slice(0, 200)
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { lead: { name: { contains: search, mode: 'insensitive' } } },
      { lead: { company: { contains: search, mode: 'insensitive' } } },
      { lead: { email: { contains: search, mode: 'insensitive' } } },
      { lead: { phone: { contains: search, mode: 'insensitive' } } },
      { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      skip: offset,
      take: limit,
      include: {
        lead: { select: { id: true, name: true, company: true, email: true, phone: true, status: true, source: true } },
        assignedUser: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        nextBestActions: { where: { status: 'proposed' }, orderBy: { score: 'desc' }, take: 1 },
      },
    }),
    prisma.conversation.count({ where }),
  ])

  return {
    items: rows.map(row => ({
      ...row,
      lastMessage: row.messages[0] ?? null,
      messages: undefined,
      nextBestAction: row.nextBestActions[0] ?? null,
      nextBestActions: undefined,
    })),
    total,
  }
}

export async function getConversation(orgId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { deliveryAttempts: { orderBy: { createdAt: 'asc' } }, authorUser: { select: { id: true, name: true } } },
      },
      nextBestActions: { where: { status: 'proposed' }, orderBy: { score: 'desc' }, take: 3 },
      lead: {
        include: {
          campaign: { select: { id: true, name: true, objective: true, landingSlug: true } },
          acquisitionEvents: { orderBy: { createdAt: 'desc' }, take: 5 },
          opportunities: { orderBy: { createdAt: 'desc' }, take: 1 },
          audits: { orderBy: { createdAt: 'desc' }, take: 1 },
          contactConsents: true,
        },
      },
    },
  })
  if (!conversation) return null
  const acquisition = conversation.lead?.acquisitionEvents?.[0] ?? null
  return {
    ...conversation,
    acquisitionContext: acquisition ? {
      source: acquisition.source,
      medium: acquisition.medium,
      content: acquisition.content,
      campaign: conversation.lead?.campaign ?? null,
      metadata: acquisition.metadata,
      capturedAt: acquisition.createdAt,
    } : { campaign: conversation.lead?.campaign ?? null },
  }
}

export async function ensureConversationForLead(orgId: string, leadId: string, consent?: ChannelConsentInput) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  if (!lead) throw new Error('Lead not found')
  const address = `lead:${lead.id}`
  const source = consent?.source ?? lead.source ?? 'crm'
  const evidence = consent?.evidence

  return prisma.$transaction(async tx => {
    const existingConversation = await tx.conversation.findUnique({
      where: { orgId_channel_address: { orgId, channel: 'mixed', address } },
      select: { id: true },
    })
    const conversation = await tx.conversation.upsert({
      where: { orgId_channel_address: { orgId, channel: 'mixed', address } },
      create: { orgId, leadId, channel: 'mixed', address, status: 'open', subject: lead.company || lead.name, lastMessageAt: lead.createdAt },
      update: { leadId, subject: lead.company || lead.name },
    })

    const identityInputs = [
      lead.phone ? { channel: 'whatsapp', provider: 'crm', address: crmAddress('whatsapp', lead.phone) } : null,
      lead.phone ? { channel: 'voice', provider: 'crm', address: crmAddress('voice', lead.phone) } : null,
      lead.email ? { channel: 'email', provider: 'mautic', address: crmAddress('email', lead.email) } : null,
    ].filter((item): item is { channel: string; provider: string; address: string } => item !== null)

    for (const input of identityInputs) {
      const identity = await tx.channelIdentity.upsert({
        where: { orgId_provider_address: { orgId, provider: input.provider, address: input.address } },
        create: { orgId, leadId, ...input },
        update: { leadId, channel: input.channel, isActive: true },
      })
      const allowed = consent?.[input.channel as 'whatsapp' | 'voice' | 'email']
      if (allowed !== undefined) {
        await tx.contactConsent.upsert({
          where: { orgId_leadId_channel_purpose: { orgId, leadId, channel: input.channel, purpose: 'contact' } },
          create: { orgId, leadId, channelIdentityId: identity.id, channel: input.channel, purpose: 'contact', status: allowed ? 'granted' : 'revoked', source, evidence },
          update: { channelIdentityId: identity.id, status: allowed ? 'granted' : 'revoked', source, evidence, occurredAt: new Date() },
        })
      }
    }

    if (!existingConversation) {
      await tx.outboxEvent.create({
        data: { orgId, topic: 'lead.created', aggregateType: 'Lead', aggregateId: lead.id, payload: { eventId: `lead.created:${lead.id}`, leadId: lead.id, conversationId: conversation.id, campaignId: lead.campaignId, source: lead.source } as Prisma.InputJsonObject },
      })
    }

    const proposedType = lead.phone ? 'reply' : lead.email ? 'email' : 'create_task'
    const proposedChannel = lead.phone ? 'whatsapp' : lead.email ? 'email' : null
    const existingAction = await tx.nextBestAction.findFirst({ where: { orgId, conversationId: conversation.id, status: 'proposed' } })
    if (!existingAction) {
      await tx.nextBestAction.create({
        data: { orgId, conversationId: conversation.id, leadId, type: proposedType, channel: proposedChannel, score: 0.75, reason: 'Nuevo lead de Captación pendiente de primera respuesta.' },
      })
    }
    return conversation
  })
}

async function consentGranted(orgId: string, leadId: string, channel: string) {
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel, purpose: 'contact' },
    orderBy: { occurredAt: 'desc' },
  })
  return consent?.status === 'granted'
}

export async function orchestrateNewLead(orgId: string, leadId: string, consent?: ChannelConsentInput) {
  const conversation = await ensureConversationForLead(orgId, leadId, consent)
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  if (!lead) return { conversation, queued: [] as string[] }
  const eventId = `lead.created:${lead.id}`
  await enqueueAutomationEvent(orgId, 'lead.created', { eventId, leadId, conversationId: conversation.id, campaignId: lead.campaignId }, eventId)

  const queued: string[] = []
  const whatsappContentSid = process.env.TWILIO_WHATSAPP_WELCOME_CONTENT_SID
  if (lead.phone && whatsappContentSid && await consentGranted(orgId, lead.id, 'whatsapp')) {
    await sendWhatsApp({ orgId, leadId: lead.id, conversationId: conversation.id, to: lead.phone, contentSid: whatsappContentSid, contentVariables: { 1: lead.name } }).then(() => queued.push('whatsapp')).catch(() => {})
  }
  if (lead.phone && await consentGranted(orgId, lead.id, 'voice')) {
    if (await enqueueLeadCall(orgId, lead.id)) queued.push('voice')
  }
  const welcomeEmailId = process.env.MAUTIC_WELCOME_EMAIL_ID
  if (lead.email && welcomeEmailId && await consentGranted(orgId, lead.id, 'email')) {
    if (await sendEmailToLead(lead.id, welcomeEmailId, orgId).catch(() => false)) {
      await prisma.message.create({ data: { orgId, conversationId: conversation.id, leadId: lead.id, channel: 'email', provider: 'mautic', address: lead.email, direction: 'outbound', contentType: 'template', body: 'Email automático de bienvenida', status: 'sent', sentAt: new Date(), metadata: { mauticEmailId: welcomeEmailId } } })
      queued.push('email')
    }
  }
  return { conversation, queued }
}

export async function sendConversationMessage(orgId: string, userId: string, conversationId: string, input: {
  channel: string
  body?: string
  templateId?: string
}) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, orgId }, include: { lead: true } })
  if (!conversation) return null
  const channel = input.channel
  const body = clean(input.body, 10_000)
  let template = null
  if (input.templateId) template = await prisma.messageTemplate.findFirst({ where: { id: input.templateId, orgId, channel, isActive: true } })

  if (channel === 'whatsapp') {
    const to = conversation.lead?.phone
    if (!to) throw new Error('El lead no tiene teléfono')
    if (!await consentGranted(orgId, conversation.lead!.id, 'whatsapp')) throw new Error('WhatsApp no tiene consentimiento válido')
    return sendWhatsApp({ orgId, leadId: conversation.lead!.id, conversationId, to, body, contentSid: template?.externalTemplateId ?? undefined, metadata: { authorUserId: userId, templateId: template?.id } })
  }

  if (channel === 'email') {
    if (!conversation.lead?.email) throw new Error('El lead no tiene email')
    if (!template?.externalTemplateId) throw new Error('Selecciona una plantilla de email aprobada')
    if (!await consentGranted(orgId, conversation.lead.id, 'email')) throw new Error('Email no tiene consentimiento válido')
    const sent = await sendEmailToLead(conversation.lead.id, template.externalTemplateId, orgId)
    if (!sent) throw new Error('Mautic no confirmó el envío')
    return prisma.message.create({ data: { orgId, conversationId, leadId: conversation.lead.id, authorUserId: userId, templateId: template.id, channel, provider: 'mautic', address: conversation.lead.email, direction: 'outbound', contentType: 'template', body: body ?? template.body, status: 'sent', sentAt: new Date(), metadata: { mauticEmailId: template.externalTemplateId } } })
  }

  if (channel === 'voice') {
    if (!conversation.lead?.phone) throw new Error('El lead no tiene teléfono')
    if (!await consentGranted(orgId, conversation.lead.id, 'voice')) throw new Error('Voz no tiene consentimiento válido')
    const queued = await enqueueLeadCall(orgId, conversation.lead.id)
    return prisma.message.create({ data: { orgId, conversationId, leadId: conversation.lead.id, authorUserId: userId, channel, provider: 'twilio', address: conversation.lead.phone, direction: 'outbound', contentType: 'call', body: body ?? 'Llamada solicitada', status: queued ? 'queued' : 'failed', ...(queued ? {} : { failedAt: new Date() }) } })
  }

  if (channel === 'internal') {
    if (!body) throw new Error('La nota no puede estar vacía')
    return prisma.message.create({ data: { orgId, conversationId, leadId: conversation.leadId, authorUserId: userId, channel, provider: 'crm', direction: 'internal', contentType: 'note', body, status: 'recorded' } })
  }
  throw new Error('Canal no soportado')
}

export async function updateConversation(orgId: string, id: string, data: { status?: string; assignedUserId?: string | null; priority?: string }) {
  const update: Prisma.ConversationUncheckedUpdateManyInput = {}
  if (data.status) {
    update.status = data.status
    update.closedAt = data.status === 'closed' ? new Date() : null
  }
  if (data.assignedUserId !== undefined) update.assignedUserId = data.assignedUserId
  if (data.priority) update.priority = data.priority
  const result = await prisma.conversation.updateMany({ where: { id, orgId }, data: update })
  return result.count ? prisma.conversation.findUnique({ where: { id } }) : null
}

export async function takeoverConversation(orgId: string, id: string, userId: string) {
  const updated = await updateConversation(orgId, id, { assignedUserId: userId, status: 'assigned' })
  if (!updated) return null
  await prisma.message.create({ data: { orgId, conversationId: id, leadId: updated.leadId, authorUserId: userId, channel: 'internal', provider: 'crm', direction: 'internal', contentType: 'status_change', body: 'Un asesor tomó el control de la conversación.', status: 'recorded' } })
  return updated
}

export async function listTemplates(orgId: string, channel?: string) {
  return prisma.messageTemplate.findMany({ where: { orgId, isActive: true, ...(channel ? { channel } : {}) }, orderBy: { name: 'asc' } })
}

/** Error de dominio para 404: la NextBestAction no existe o no pertenece a la org/conversación. */
export class NextBestActionNotFoundError extends Error {
  constructor() {
    super('NextBestAction not found')
    this.name = 'NextBestActionNotFoundError'
  }
}

/** Error de dominio para 409: la NextBestAction ya fue aceptada/descartada. */
export class NextBestActionStateError extends Error {
  constructor(public status: string) {
    super(`NextBestAction ya está en estado "${status}"`)
    this.name = 'NextBestActionStateError'
  }
}

/**
 * FND-04: aceptar una NextBestAction crea un Task real (fuente de verdad de
 * "qué hay que hacer") en lugar de solo marcar la recomendación como
 * aceptada, para que quede en la agenda del owner con dueAt/reminder.
 */
export async function acceptNextBestAction(orgId: string, actorUserId: string | null | undefined, conversationId: string, id: string) {
  const action = await prisma.nextBestAction.findFirst({ where: { id, orgId, conversationId } })
  if (!action) throw new NextBestActionNotFoundError()
  if (action.status !== 'proposed') throw new NextBestActionStateError(action.status)

  const task = await tasksService.createTask(orgId, actorUserId, {
    type: 'next_best_action',
    title: action.reason.slice(0, 200),
    description: action.reason,
    ownerId: actorUserId ?? undefined,
    leadId: action.leadId ?? undefined,
    conversationId: action.conversationId,
    source: 'next_best_action',
    sourceId: action.id,
  })

  const updated = await prisma.nextBestAction.update({
    where: { id: action.id },
    data: {
      status: 'accepted',
      acceptedById: actorUserId ?? undefined,
      acceptedAt: new Date(),
      convertedTaskId: task.id,
    },
  })

  return { nextBestAction: updated, task }
}

export async function dismissNextBestAction(orgId: string, id: string, conversationId: string) {
  const action = await prisma.nextBestAction.findFirst({ where: { id, orgId, conversationId } })
  if (!action) throw new NextBestActionNotFoundError()
  if (action.status !== 'proposed') throw new NextBestActionStateError(action.status)

  return prisma.nextBestAction.update({ where: { id: action.id }, data: { status: 'dismissed' } })
}
