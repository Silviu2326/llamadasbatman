import { prisma } from '../lib/prisma'
import {
  createTwilioClient,
  getTwilioIntegrationConfig,
  twilioWebhookUrl,
  verifyTwilioSignatureWithAuthToken,
  type TwilioIntegrationConfig,
} from './twilioIntegration.service'
import { consumeWhiteLabelMessage, generateWhiteLabelReply } from './whiteLabel.service'
import { detectVoiceConsentReply, detectTransferRequest, grantVoiceConsent, normalizeE164 } from '../voice/compliance'
import { hasContactConsent } from './contactConsent.service'
import { canAutomaticallyReply, whatsappOptOut, whatsappWindowOpen } from './whatsappPolicy'

/**
 * Twilio WhatsApp integration. Persistence stays behind the existing dynamic
 * boundary, while all provider credentials are resolved by org before any
 * outbound request or webhook signature check.
 */
const db = prisma as unknown as Record<string, any>
export const whatsappRuntime = {
  config: getTwilioIntegrationConfig,
  client: createTwilioClient,
  reply: generateWhiteLabelReply,
  presign: async (key: string) => (await import('../lib/storage')).getPresignedAssetUrl(key, 3600),
}

export type TwilioParams = Record<string, string>

export interface SendWhatsAppInput {
  orgId: string
  leadId?: string
  conversationId?: string
  to: string
  body?: string
  contentSid?: string
  contentVariables?: Record<string, string>
  audioAssetId?: string
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}
export interface WhatsAppResult {
  id?: string
  providerMessageId: string
  status?: string
  conversationId?: string
}

function now() { return new Date() }
function asAddress(value: string) {
  const phone = normalizeE164(value.replace(/^whatsapp:/, ''))
  if (!phone) throw new Error('WHATSAPP_INVALID_PHONE')
  return `whatsapp:${phone}`
}

async function twilioClient(orgId: string): Promise<{ client: ReturnType<typeof createTwilioClient>; config: TwilioIntegrationConfig }> {
  const config = await whatsappRuntime.config(orgId)
  if (!config) throw new Error('TWILIO_ORG_CREDENTIAL_MISSING')
  return { client: whatsappRuntime.client(config), config }
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
    if (!existing || (leadId ? existing.leadId !== leadId : existing.address !== address)) throw new Error('WHATSAPP_CONVERSATION_MISMATCH')
    return existing
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
  if (!externalEventId) throw new Error('WHATSAPP_MESSAGE_ID_REQUIRED')
  const optedOut = whatsappOptOut(params.Body || '')
  // Media is preserved for the seller. Until transcription/vision is wired,
  // do not leave an audio-only reply silently waiting for an AI answer.
  const handoff = detectTransferRequest(params.Body || '') || Number(params.NumMedia || 0) > 0
  try {
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { externalEventId, orgId: identity.orgId, provider: 'twilio', channel: 'whatsapp', eventType: 'message.received', metadata: params } })
      await tx.message.create({ data: {
        orgId: identity.orgId, ...(leadId ? { leadId } : {}), conversationId: conversation.id,
        channel: 'whatsapp', provider: 'twilio', address, direction: 'inbound', status: 'received',
        providerMessageId: externalEventId, body: params.Body || '', metadata: params,
        contentType: Number(params.NumMedia) > 0 ? (params.MediaContentType0?.startsWith('audio/') ? 'audio' : 'media') : 'text',
        createdAt: receivedAt, updatedAt: receivedAt,
      } })
      await tx.conversation.update({ where: { id: conversation.id }, data: {
        updatedAt: receivedAt, lastInboundAt: receivedAt, lastMessageAt: receivedAt,
        ...((optedOut || handoff) ? { status: optedOut ? 'closed' : 'needs_human', metadata: { ...(conversation.metadata || {}), aiPaused: true } } : {}),
      } })
      if (!optedOut && !handoff && params.Body?.trim() && Number(params.NumMedia || 0) === 0) {
        await tx.outboxEvent.create({ data: {
          orgId: identity.orgId, topic: 'whatsapp.reply.requested', aggregateType: 'Conversation', aggregateId: conversation.id,
          payload: { conversationId: conversation.id, messageId: externalEventId },
        } })
      }
      if (leadId) {
        // Stop the scheduled prospecting sequence in the same transaction as
        // the reply: it must not keep contacting a person already answering.
        await tx.salesSequenceEnrollment.updateMany({ where: { orgId: identity.orgId, leadId, status: { in: ['active', 'paused'] } }, data: { status: 'stopped', stopReason: optedOut ? 'unsubscribe' : 'reply', nextRunAt: null, stoppedAt: receivedAt } })
        await tx.salesSequenceStepRun.updateMany({ where: { orgId: identity.orgId, leadId, status: { in: ['pending', 'processing'] } }, data: { status: 'blocked', lastErrorCode: optedOut ? 'STOPPED_UNSUBSCRIBE' : 'STOPPED_REPLY', leaseExpiresAt: null, workerId: null } })
        if (optedOut) {
          await tx.contactConsent.updateMany({ where: { orgId: identity.orgId, leadId, channel: { in: ['whatsapp', 'voice'] } }, data: { status: 'revoked', occurredAt: receivedAt, source: 'whatsapp_reply', evidence: params.Body } })
          await tx.optOut.upsert({ where: { orgId_phone: { orgId: identity.orgId, phone: rawPhone } }, create: { orgId: identity.orgId, phone: rawPhone, reason: 'whatsapp_reply' }, update: { reason: 'whatsapp_reply' } })
        }
        await tx.outboxEvent.create({ data: {
          orgId: identity.orgId,
          topic: 'message.received',
          aggregateType: 'Conversation',
          aggregateId: conversation.id,
          payload: { eventId: `message.received:${externalEventId}`, leadId, conversationId: conversation.id, channel: 'whatsapp', providerMessageId: externalEventId },
        } })
      }
    })

    // "Yes, call me" en una respuesta entrante es consentimiento por escrito
    // para la llamada del agente. Se registra con el texto literal y el
    // identificador del mensaje: la prueba se captura ahora o no existe nunca.
    // Fuera de la transacción a propósito — un fallo aquí no debe tirar el
    // mensaje recibido, que es el dato que no se puede recuperar.
    const previousOffer = leadId && params.Body ? await db.message.findFirst({
      where: { orgId: identity.orgId, conversationId: conversation.id, channel: 'whatsapp', direction: 'outbound', createdAt: { lt: receivedAt, gte: new Date(receivedAt.getTime() - 24 * 60 * 60 * 1000) }, status: { in: ['sent', 'delivered', 'read'] } },
      orderBy: { createdAt: 'desc' }, select: { id: true, body: true, metadata: true },
    }) : null
    // A generic affirmative only belongs to a consent request explicitly
    // marked by the sending workflow, never to an arbitrary AI sales message.
    const offeredAiCall = previousOffer?.metadata?.voiceConsentRequest === true && /\b(ia|ai|artificial)\b/i.test(previousOffer?.body || '') && /llamad|llam[ae]|call/i.test(previousOffer?.body || '')
    if (!optedOut && !handoff && leadId && params.Body && detectVoiceConsentReply(params.Body, offeredAiCall)) {
      await grantVoiceConsent(identity.orgId, leadId, {
        source: 'whatsapp_reply',
        evidence: params.Body,
        metadata: { providerMessageId: externalEventId, from: address, receivedAt: receivedAt.toISOString(), ...(offeredAiCall ? { requestMessageId: previousOffer.id, requestText: previousOffer.body } : {}) },
      }).catch(error => console.warn('[WhatsApp] no se pudo registrar el consentimiento de voz:', (error as Error).message))
    }

  } catch (error: any) {
    if (error?.code === 'P2002') return { duplicate: true }
    throw error
  }

  return { duplicate: false, replied: false }
}

/** Durable worker effect; the webhook only persists before acknowledging. */
export async function processWhatsAppReply(orgId: string, conversationId: string, messageId: string) {
  const latest = await db.conversation.findFirst({ where: { id: conversationId, orgId } })
  if (!latest || !canAutomaticallyReply(latest) || !whatsappWindowOpen(latest.lastInboundAt)) return { replied: false }
  const inbound = await db.message.findFirst({ where: { orgId, conversationId, providerMessageId: messageId, direction: 'inbound', channel: 'whatsapp' } })
  if (!inbound?.body || inbound.contentType === 'audio') return { replied: false }
  const newerMessage = await db.message.findFirst({ where: { orgId, conversationId, channel: 'whatsapp', createdAt: { gt: inbound.createdAt } } })
  if (newerMessage) return { replied: false }
  const ownAgent = latest.metadata?.aiReplyEnabled === true
  const reply = ownAgent
    ? await (await import('./conversationAi.service')).suggestConversationReply(orgId, conversationId, 'cercano y consultivo', true)
    : await whatsappRuntime.reply(orgId, inbound.body)
  if (reply === null) return { duplicate: false, replied: false }
  if (Object.prototype.hasOwnProperty.call(reply, 'error')) return { duplicate: false, replied: false }
  const replyText = (reply as { text: string }).text
  try {
    await sendWhatsAppInternal({ orgId, leadId: latest.leadId, conversationId, to: inbound.address, body: replyText, idempotencyKey: `reply:${messageId}`, metadata: { source: 'white-label-auto-reply' } }, ownAgent)
  } catch (error) {
    console.warn('[WhatsApp] no se pudo enviar la respuesta automática white-label:', (error as Error).message)
    throw error
  }
  return { duplicate: false, replied: true }
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

async function sendWhatsAppInternal(input: SendWhatsAppInput, countQuota = true): Promise<WhatsAppResult> {
  const to = asAddress(input.to)
  const phone = to.replace(/^whatsapp:/, '')
  const lead = input.leadId
    ? await db.lead.findFirst({ where: { orgId: input.orgId, id: input.leadId } })
    : await db.lead.findFirst({ where: { orgId: input.orgId, phone: { in: [phone, to] } } })
  if (input.leadId && (!lead || normalizeE164(lead.phone || '') !== phone)) throw new Error('WHATSAPP_LEAD_MISMATCH')
  input = { ...input, leadId: lead?.id }
  if (await db.optOut.findUnique({ where: { orgId_phone: { orgId: input.orgId, phone } } })) throw new Error('WHATSAPP_OPTED_OUT')
  const conversation = await resolveConversation(input.orgId, to, input.leadId, input.conversationId)
  const inWindow = whatsappWindowOpen(conversation.lastInboundAt)
  if (!input.contentSid && ((!input.body && !input.audioAssetId) || !inWindow)) {
    throw new Error('Fuera de la ventana de 24 horas se requiere contentSid/template; el texto libre requiere un inbound vigente')
  }
  if (input.contentSid && (!lead || !await hasContactConsent(input.orgId, lead.id, 'whatsapp'))) throw new Error('WHATSAPP_CONSENT_REQUIRED')
  if (input.audioAssetId && (input.body || input.contentSid)) throw new Error('Envía el audio como un mensaje separado, dentro de una conversación abierta.')
  let mediaUrl: string | null = null
  if (input.audioAssetId) {
    const asset = await db.asset.findFirst({ where: { id: input.audioAssetId, orgId: input.orgId, kind: 'audio', status: { not: 'archived' } } })
    if (!asset || !['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'].includes(asset.mimeType) || BigInt(asset.bytes) > 16n * 1024n * 1024n || (asset.expiresAt && asset.expiresAt <= new Date())) throw new Error('WHATSAPP_AUDIO_INVALID')
    mediaUrl = await whatsappRuntime.presign(asset.storageKey)
    if (!mediaUrl || new URL(mediaUrl).protocol !== 'https:') throw new Error('El audio necesita almacenamiento S3/R2 accesible por HTTPS.')
  }
  if (input.metadata?.source === 'white-label-auto-reply') {
    const latest = await db.conversation.findFirst({ where: { id: conversation.id, orgId: input.orgId } })
    if (!latest || !canAutomaticallyReply(latest)) throw new Error('WHATSAPP_HUMAN_TAKEOVER')
  }
  const externalEventId = input.idempotencyKey ? `whatsapp:${input.idempotencyKey}` : undefined
  if (externalEventId) {
    const existing = await db.message.findUnique({ where: { orgId_externalEventId: { orgId: input.orgId, externalEventId } } })
    if (existing) {
      if (existing.address !== to || existing.conversationId !== conversation.id) throw new Error('WHATSAPP_IDEMPOTENCY_CONFLICT')
      if (!existing.providerMessageId || ['failed', 'undelivered'].includes(existing.status)) throw new Error('WHATSAPP_DELIVERY_REQUIRES_REVIEW')
      return { id: existing.id, providerMessageId: existing.providerMessageId, status: existing.status, conversationId: existing.conversationId }
    }
  }
  const { client, config } = await twilioClient(input.orgId)
  const sender = fromAddress(config)
  if (countQuota && !await consumeWhiteLabelMessage(input.orgId)) throw new Error('WHITELABEL_MESSAGE_LIMIT_REACHED')
  await db.channelIdentity.upsert({
    where: { orgId_provider_address: { orgId: input.orgId, provider: 'twilio', address: sender } },
    create: { orgId: input.orgId, channel: 'whatsapp', provider: 'twilio', address: sender, isActive: true },
    update: { channel: 'whatsapp', isActive: true },
  })
  const saved = await db.message.create({ data: {
    orgId: input.orgId, leadId: input.leadId, conversationId: conversation.id, externalEventId,
    channel: 'whatsapp', provider: 'twilio', address: to, direction: 'outbound', status: 'queued',
    contentType: input.audioAssetId ? 'audio' : input.contentSid ? 'template' : 'text', body: input.body || '',
    metadata: { ...input.metadata, contentSid: input.contentSid, audioAssetId: input.audioAssetId },
  } })
  let message
  try { message = await client.messages.create({
    from: sender, to, ...(input.contentSid ? { contentSid: input.contentSid, contentVariables: input.contentVariables ? JSON.stringify(input.contentVariables) : undefined } : mediaUrl ? { mediaUrl: [mediaUrl] } : { body: input.body }),
    statusCallback: publicCallback(config, '/api/whatsapp/status', new URLSearchParams({ orgId: input.orgId }).toString()),
  }) } catch (error) {
    await db.message.update({ where: { id: saved.id }, data: { status: 'delivery_unknown', metadata: { ...saved.metadata, reviewRequired: true } } })
    throw error
  }
  const createdAt = now()
  await db.message.update({ where: { id: saved.id }, data: { status: message.status, providerMessageId: message.sid, updatedAt: createdAt } })
  await db.deliveryAttempt.create({ data: { messageId: saved.id, provider: 'twilio', status: message.status, providerMessageId: message.sid, metadata: {} } })
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: createdAt, lastMessageAt: createdAt } })
  return { id: saved.id, providerMessageId: message.sid, status: message.status, conversationId: conversation.id }
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<WhatsAppResult> {
  return sendWhatsAppInternal(input, true)
}
