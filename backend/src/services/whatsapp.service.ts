import { prisma } from '../lib/prisma'
import {
  createTwilioClient,
  getTwilioIntegrationConfig,
  twilioWebhookUrl,
  verifyTwilioSignatureWithAuthToken,
  type TwilioIntegrationConfig,
} from './twilioIntegration.service'

/**
 * Twilio WhatsApp integration. Persistence stays behind the existing dynamic
 * boundary, while all provider credentials are resolved by org before any
 * outbound request or webhook signature check.
 */
const db = prisma as unknown as Record<string, any>
const WINDOW_MS = 24 * 60 * 60 * 1000

export type TwilioParams = Record<string, string>

export interface SendWhatsAppInput {
  orgId: string
  leadId?: string
  conversationId?: string
  to: string
  body?: string
  contentSid?: string
  contentVariables?: Record<string, string>
  metadata?: Record<string, unknown>
}
export interface WhatsAppResult {
  id?: string
  providerMessageId: string
  status?: string
  conversationId?: string
}

function now() { return new Date() }
function asAddress(value: string) { return value.startsWith('whatsapp:') ? value : `whatsapp:${value}` }

async function twilioClient(orgId: string): Promise<{ client: ReturnType<typeof createTwilioClient>; config: TwilioIntegrationConfig }> {
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) throw new Error('TWILIO_ORG_CREDENTIAL_MISSING')
  return { client: createTwilioClient(config), config }
}

function fromAddress(config: TwilioIntegrationConfig) {
  const value = config.whatsappFrom
  if (!value) throw new Error('TWILIO_WHATSAPP_FROM no está configurado')
  return asAddress(value)
}

function publicCallback(config: TwilioIntegrationConfig, path: string, query = '') {
  return twilioWebhookUrl(config.webhookBaseUrl, path, query)
}

/** Resolves the tenant before validating a Twilio callback. */
export async function resolveTwilioWebhookOrgId(params: TwilioParams, kind: 'inbound' | 'status'): Promise<string | undefined> {
  if (kind === 'inbound') {
    const identity = await db.channelIdentity.findFirst({
      where: { provider: 'twilio', channel: 'whatsapp', address: asAddress(params.To || '') },
      select: { orgId: true },
    })
    return identity?.orgId ?? undefined
  }
  const message = await db.message.findFirst({
    where: { provider: 'twilio', providerMessageId: params.MessageSid || '' },
    select: { orgId: true },
  })
  return message?.orgId ?? undefined
}

export async function verifyTwilioSignature(
  url: string,
  params: TwilioParams,
  signature?: string,
  orgId?: string,
): Promise<boolean> {
  const config = await getTwilioIntegrationConfig(orgId)
  return verifyTwilioSignatureWithAuthToken(config?.authToken, url, params, signature)
}

async function findConversation(orgId: string, address: string, leadId?: string) {
  const where: Record<string, unknown> = { orgId, channel: 'whatsapp', address }
  if (leadId) where.leadId = leadId
  return db.conversation.findFirst({ where, orderBy: { updatedAt: 'desc' } })
}

async function ensureConversation(orgId: string, address: string, leadId?: string) {
  const existing = await findConversation(orgId, address, leadId)
  if (existing) return existing
  return db.conversation.create({ data: {
    orgId, ...(leadId ? { leadId } : {}), channel: 'whatsapp', provider: 'twilio', address,
    status: 'open', metadata: {},
  } })
}

async function resolveConversation(orgId: string, address: string, leadId?: string, conversationId?: string) {
  if (conversationId) {
    const existing = await db.conversation.findFirst({ where: { id: conversationId, orgId } })
    if (existing) return existing
  }
  if (leadId) {
    const existing = await db.conversation.findFirst({ where: { orgId, leadId }, orderBy: { updatedAt: 'desc' } })
    if (existing) return existing
  }
  return ensureConversation(orgId, address, leadId)
}

async function recordWebhook(externalEventId: string, metadata: Record<string, unknown>) {
  if (!externalEventId) return false
  const existing = await db.webhookEvent.findFirst({ where: { externalEventId } })
  if (existing) return true
  try {
    await db.webhookEvent.create({ data: { externalEventId, provider: 'twilio', channel: 'whatsapp', metadata } })
    return false
  } catch (error: any) {
    if (error?.code === 'P2002') return true
    throw error
  }
}

export async function handleInbound(params: TwilioParams) {
  const address = asAddress(params.From || '')
  const identity = await db.channelIdentity.findFirst({ where: { provider: 'twilio', channel: 'whatsapp', address: asAddress(params.To || '') } })
  if (!identity?.orgId) {
    await recordWebhook(params.MessageSid || params.SmsMessageSid || '', params)
    return { ignored: true }
  }
  const rawPhone = address.replace(/^whatsapp:/, '')
  const lead = identity.leadId ? null : await db.lead.findFirst({ where: { orgId: identity.orgId, phone: { in: [rawPhone, address] } } })
  const leadId = identity.leadId || lead?.id
  const conversation = await resolveConversation(identity.orgId, address, leadId)
  const receivedAt = now()
  const externalEventId = params.MessageSid || params.SmsMessageSid || ''
  try {
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { externalEventId, orgId: identity.orgId, provider: 'twilio', channel: 'whatsapp', eventType: 'message.received', metadata: params } })
      await tx.message.create({ data: {
        orgId: identity.orgId, ...(leadId ? { leadId } : {}), conversationId: conversation.id,
        channel: 'whatsapp', provider: 'twilio', address, direction: 'inbound', status: 'received',
        providerMessageId: params.MessageSid, body: params.Body || '', metadata: params,
        createdAt: receivedAt, updatedAt: receivedAt,
      } })
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: receivedAt, lastInboundAt: receivedAt, lastMessageAt: receivedAt } })
      if (leadId) {
        await tx.outboxEvent.create({ data: {
          orgId: identity.orgId,
          topic: 'message.received',
          aggregateType: 'Conversation',
          aggregateId: conversation.id,
          payload: { eventId: `message.received:${externalEventId}`, leadId, conversationId: conversation.id, channel: 'whatsapp', providerMessageId: externalEventId },
        } })
      }
    })
    return { duplicate: false }
  } catch (error: any) {
    if (error?.code === 'P2002') return { duplicate: true }
    throw error
  }
}

export async function handleStatus(params: TwilioParams) {
  const providerMessageId = params.MessageSid || ''
  const message = await db.message.findFirst({ where: { providerMessageId } })
  const externalEventId = `status:${providerMessageId}:${params.MessageStatus || ''}:${params.ErrorCode || ''}`
  if (!message) {
    await recordWebhook(externalEventId, params)
    return { ignored: true }
  }
  const status = params.MessageStatus || 'unknown'
  const rank: Record<string, number> = { queued: 1, accepted: 1, sending: 2, sent: 3, delivered: 4, read: 5, undelivered: 6, failed: 6 }
  const nextStatus = (rank[status] ?? 0) >= (rank[message.status] ?? 0) ? status : message.status
  const statusAt = now()
  try {
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { externalEventId, orgId: message.orgId, provider: 'twilio', channel: 'whatsapp', eventType: 'message.status', metadata: params } })
      await tx.message.update({ where: { id: message.id }, data: {
        status: nextStatus,
        metadata: { ...(message.metadata || {}), statusCallback: params },
        updatedAt: statusAt,
        ...(status === 'delivered' ? { deliveredAt: statusAt } : {}),
        ...(status === 'read' ? { readAt: statusAt } : {}),
        ...(['failed', 'undelivered'].includes(status) ? { failedAt: statusAt } : {}),
      } })
      const attemptNo = await tx.deliveryAttempt.count({ where: { messageId: message.id } }) + 1
      await tx.deliveryAttempt.create({ data: { messageId: message.id, provider: 'twilio', attemptNo, status, providerMessageId, idempotencyKey: externalEventId, metadata: params } })
    })
    return { duplicate: false }
  } catch (error: any) {
    if (error?.code === 'P2002') return { duplicate: true }
    throw error
  }
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<WhatsAppResult> {
  const to = asAddress(input.to)
  const conversation = await resolveConversation(input.orgId, to, input.leadId, input.conversationId)
  const lastInboundAt = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0
  const inWindow = lastInboundAt > 0 && Date.now() - lastInboundAt <= WINDOW_MS
  if (!input.contentSid && (!input.body || !inWindow)) {
    throw new Error('Fuera de la ventana de 24 horas se requiere contentSid/template; el texto libre requiere un inbound vigente')
  }
  const { client, config } = await twilioClient(input.orgId)
  const sender = fromAddress(config)
  await db.channelIdentity.upsert({
    where: { orgId_provider_address: { orgId: input.orgId, provider: 'twilio', address: sender } },
    create: { orgId: input.orgId, channel: 'whatsapp', provider: 'twilio', address: sender, isActive: true },
    update: { channel: 'whatsapp', isActive: true },
  })
  const message = await client.messages.create({
    from: sender, to, ...(input.contentSid ? { contentSid: input.contentSid, contentVariables: input.contentVariables ? JSON.stringify(input.contentVariables) : undefined } : { body: input.body }),
    statusCallback: publicCallback(config, '/api/whatsapp/status', new URLSearchParams({ orgId: input.orgId }).toString()),
  })
  const createdAt = now()
  const saved = await db.message.create({ data: {
    orgId: input.orgId, ...(input.leadId ? { leadId: input.leadId } : {}), conversationId: conversation.id,
    channel: 'whatsapp', provider: 'twilio', address: to, direction: 'outbound', status: message.status,
    providerMessageId: message.sid, body: input.body || '', metadata: { ...input.metadata, contentSid: input.contentSid }, createdAt, updatedAt: createdAt,
  } })
  await db.deliveryAttempt.create({ data: { messageId: saved.id, provider: 'twilio', status: message.status, providerMessageId: message.sid, metadata: {} } })
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: createdAt, lastMessageAt: createdAt } })
  return { id: saved.id, providerMessageId: message.sid, status: message.status, conversationId: conversation.id }
}
