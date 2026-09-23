import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { getOrganizationCredential } from './organizationCredentials.service'
import { beginWebhookEvent, finishWebhookEvent } from '../observability/webhookLifecycle'
import { stopSalesSequenceForLead } from './salesSequence.service'
import { recordEmailComplianceEvent } from '../lib/emailCompliance'

type Headers = Record<string, string | string[] | undefined>
type ReceivedEmail = {
  id?: string
  email_id?: string
  from?: string
  to?: string[]
  subject?: string
  text?: string | null
  html?: string | null
  message_id?: string
  headers?: Record<string, string | string[] | undefined>
  attachments?: Array<{ id?: string; filename?: string; content_type?: string; size?: number }>
  [key: string]: unknown
}
type ResendEvent = { type?: string; created_at?: string; data?: ReceivedEmail }

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}
function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right)
}
export function verifyResendWebhookSignature(
  secret: string,
  rawBody: string,
  headers: Headers,
  nowMs = Date.now(),
  maxSkewSeconds = 300,
): boolean {
  const id = header(headers, 'svix-id')
  const timestamp = header(headers, 'svix-timestamp')
  const signature = header(headers, 'svix-signature')
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > maxSkewSeconds) return false
  let key: Buffer
  try {
    key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8')
  } catch {
    return false
  }
  if (!key.length) return false
  const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.' + rawBody).digest()
  return signature.split(/\s+/).some(candidate => {
    const [version, value] = candidate.includes(',') ? candidate.split(',', 2) : ['v1', candidate]
    if (version !== 'v1' || !value) return false
    try { return safeEqual(Buffer.from(value, 'base64'), expected) } catch { return false }
  })
}

function addressFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  const address = (bracketed?.[1] ?? value).trim().toLowerCase()
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ? address : null
}
function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function retrieveReceivedEmail(emailId: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<ReceivedEmail> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(emailId)) throw new Error('RESEND_EMAIL_ID_INVALID')
  const response = await fetcher('https://api.resend.com/emails/receiving/' + encodeURIComponent(emailId), {
    headers: { Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error('RESEND_RECEIVING_LOOKUP_FAILED_' + response.status)
  const payload = await response.json() as Record<string, unknown>
  const received = objectRecord(payload.data ?? payload) as ReceivedEmail
  if (!received || typeof received !== 'object') throw new Error('RESEND_RECEIVING_PAYLOAD_INVALID')
  return received
}

async function resolveLead(orgId: string, senderAddress: string) {
  return prisma.lead.findFirst({
    where: { orgId, email: { equals: senderAddress, mode: 'insensitive' } },
    select: { id: true, email: true },
  })
}

async function ensureConversation(orgId: string, lead: { id: string; email: string | null } | null, sender: string, subject: string, threadId: string) {
  if (lead) {
    const address = 'lead:' + lead.id
    return prisma.conversation.upsert({
      where: { orgId_channel_address: { orgId, channel: 'mixed', address } },
      create: { orgId, leadId: lead.id, channel: 'mixed', address, status: 'open', subject, metadata: { emailThreadId: threadId } },
      update: { leadId: lead.id, subject },
      select: { id: true, leadId: true, metadata: true },
    })
  }
  const address = sender.toLowerCase()
  const existing = await prisma.conversation.findUnique({
    where: { orgId_channel_address: { orgId, channel: 'email', address } },
    select: { id: true, leadId: true, metadata: true },
  })
  if (existing) return existing
  try {
    return await prisma.conversation.create({
      data: { orgId, channel: 'email', provider: 'resend', address, subject, status: 'open', metadata: { emailThreadId: threadId } },
      select: { id: true, leadId: true, metadata: true },
    })
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
    const raced = await prisma.conversation.findUnique({
      where: { orgId_channel_address: { orgId, channel: 'email', address } },
      select: { id: true, leadId: true, metadata: true },
    })
    if (!raced) throw error
    return raced
  }
}

async function persistReceivedEmail(orgId: string, eventId: string, email: ReceivedEmail) {
  const senderAddress = addressFrom(email.from)
  const subject = typeof email.subject === 'string' && email.subject.trim() ? email.subject.trim() : '(Sin asunto)'
  const text = typeof email.text === 'string' && email.text.length ? email.text : null
  const html = typeof email.html === 'string' && email.html.length ? email.html : null
  if (!senderAddress || (!text && !html)) throw new Error('RESEND_RECEIVING_CONTENT_INCOMPLETE')
  const emailId = String(email.id ?? email.email_id ?? '')
  if (!emailId) throw new Error('RESEND_RECEIVING_EMAIL_ID_MISSING')

  const byMessage = await prisma.message.findUnique({
    where: { provider_providerMessageId: { provider: 'resend', providerMessageId: emailId } },
    select: { id: true, conversationId: true },
  })
  if (byMessage) return { duplicate: true, conversationId: byMessage.conversationId, leadId: null as string | null }
  const externalEventId = 'resend:email.received:' + eventId
  const byEvent = await prisma.message.findUnique({
    where: { orgId_externalEventId: { orgId, externalEventId } },
    select: { id: true, conversationId: true },
  })
  if (byEvent) return { duplicate: true, conversationId: byEvent.conversationId, leadId: null as string | null }

  const lead = await resolveLead(orgId, senderAddress)
  const headers = objectRecord(email.headers)
  const parentIdValue = headers['in-reply-to'] ?? headers['In-Reply-To']
  const parentId = Array.isArray(parentIdValue) ? parentIdValue[0] : parentIdValue
  const parent = typeof parentId === 'string' ? await prisma.message.findFirst({
    where: { orgId, channel: 'email', direction: 'outbound', metadata: { path: ['messageId'], equals: parentId } },
    select: { id: true },
  }) : null
  const threadId = typeof parentId === 'string' ? parentId : (email.message_id ?? emailId)
  const conversation = await ensureConversation(orgId, lead, senderAddress, subject, threadId)
  const receivedAt = new Date()
  const metadata = {
    resendEmailId: emailId,
    ...(email.message_id ? { messageId: email.message_id } : {}),
    ...(threadId ? { emailThreadId: threadId } : {}),
    recipients: Array.isArray(email.to) ? email.to : [],
    attachments: Array.isArray(email.attachments) ? email.attachments.map(item => ({
      id: item.id, filename: item.filename, contentType: item.content_type, size: item.size,
    })) : [],
  }
  try {
    const message = await prisma.message.create({
      data: {
        orgId, conversationId: conversation.id, leadId: lead?.id ?? conversation.leadId ?? null,
        replyToId: parent?.id, channel: 'email', provider: 'resend', address: senderAddress,
        direction: 'inbound', contentType: text ? 'text' : 'html', body: text ?? html,
        status: 'received', providerMessageId: emailId, externalEventId, metadata,
      },
      select: { id: true, conversationId: true },
    })
    const priorMetadata = objectRecord(conversation.metadata)
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(lead?.id ? { leadId: lead.id } : {}),
        provider: 'resend', subject, status: 'open', lastInboundAt: receivedAt,
        lastMessageAt: receivedAt, updatedAt: receivedAt,
        metadata: { ...priorMetadata, emailThreadId: threadId },
      },
    })
    return { duplicate: false, messageId: message.id, conversationId: message.conversationId, leadId: lead?.id ?? null }
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const existing = await prisma.message.findUnique({
        where: { orgId_externalEventId: { orgId, externalEventId } },
        select: { id: true, conversationId: true },
      })
      if (existing) return { duplicate: true, conversationId: existing.conversationId, leadId: lead?.id ?? null }
    }
    throw error
  }
}

type ResendTrackEvent = { type?: string; created_at?: string; data?: Record<string, any> }
type TrackedEmailType = 'sent' | 'delivered' | 'open' | 'click' | 'hard_bounce' | 'unsubscribe' | 'complaint' | 'failed' | 'delivery_delayed' | 'suppressed'

export function normalizeResendTrackedEvent(event: ResendTrackEvent): { type: TrackedEmailType; data: Record<string, any> } | null {
  const data = objectRecord(event.data)
  switch (event.type) {
    case 'email.sent': return { type: 'sent', data }
    case 'email.delivered': return { type: 'delivered', data }
    case 'email.opened': return { type: 'open', data }
    case 'email.clicked': return { type: 'click', data }
    case 'email.bounced': return { type: 'hard_bounce', data }
    case 'email.complained': return { type: 'complaint', data }
    case 'email.failed': return { type: 'failed', data }
    case 'email.delivery_delayed': return { type: 'delivery_delayed', data }
    case 'email.suppressed': return { type: 'suppressed', data }
    case 'contact.updated':
      return data.unsubscribed === true ? { type: 'unsubscribe', data } : null
    case 'suppression.added': {
      const origin = typeof data.origin === 'string' ? data.origin.toLowerCase() : ''
      return { type: origin.includes('complaint') ? 'complaint' : origin.includes('bounce') ? 'hard_bounce' : 'unsubscribe', data }
    }
    default: return null
  }
}

export async function persistResendTrackingEvent(orgId: string, eventId: string, event: ResendTrackEvent) {
  const normalized = normalizeResendTrackedEvent(event)
  if (!normalized) return { ignored: true }
  const { type, data } = normalized
  const rawEmailId = data.email_id ?? data.emailId
  const emailId = typeof rawEmailId === 'string' && rawEmailId.trim() ? rawEmailId.trim() : null
  const toValue = Array.isArray(data.to) ? data.to[0] : data.email
  const recipient = addressFrom(toValue)
  const delivery = emailId ? await prisma.emailDelivery.findFirst({
    where: { orgId, providerMessageId: emailId, ...(recipient ? { toAddress: { equals: recipient, mode: 'insensitive' as const } } : {}) },
    select: { id: true, leadId: true, toAddress: true, status: true },
  }) : null
  const url = typeof data.click?.link === 'string' ? data.click.link : undefined
  const detailValue = data.bounce?.message ?? data.failed?.reason ?? data.suppressed?.reason
  const detail = typeof detailValue === 'string' ? detailValue.slice(0, 1000) : undefined
  const occurred = typeof data.created_at === 'string' ? new Date(data.created_at) : typeof event.created_at === 'string' ? new Date(event.created_at) : new Date()
  const occurredAt = Number.isNaN(occurred.getTime()) ? new Date() : occurred
  let duplicate = false
  try {
    await prisma.emailEvent.create({
      data: { orgId, deliveryId: delivery?.id ?? null, provider: 'resend', externalEventId: eventId, type, url, occurredAt,
        metadata: { ...(emailId ? { providerMessageId: emailId } : {}), ...(recipient ? { recipient } : {}), ...(detail ? { detail } : {}), ...(data.click ? { click: data.click } : {}) } },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') duplicate = true
    else throw error
  }
  if (delivery) {
    const now = occurredAt
    if (type === 'sent') await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ['queued', 'processing'] } }, data: { status: 'accepted', acceptedAt: now } })
    else if (type === 'delivered') await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ['queued', 'processing', 'accepted'] } }, data: { status: 'delivered', deliveredAt: now } })
    else if (type === 'hard_bounce') await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } }, data: { status: 'bounced', failedAt: now, failureCode: 'HARD_BOUNCE', failureDetail: detail } })
    else if (type === 'unsubscribe') await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } }, data: { status: 'unsubscribed', failedAt: now, failureCode: 'UNSUBSCRIBED' } })
    else if (type === 'complaint' || type === 'failed' || type === 'suppressed') await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ['queued', 'processing', 'accepted', 'delivered'] } }, data: { status: 'failed', failedAt: now, failureCode: type.toUpperCase(), failureDetail: detail } })
  }
  const email = recipient ?? addressFrom(data.email)
  if (email && ['hard_bounce', 'unsubscribe', 'complaint'].includes(type)) {
    const lead = await prisma.lead.findFirst({ where: { orgId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (lead) {
      const status = type === 'hard_bounce' ? 'bounced' : type === 'complaint' ? 'complaint' : 'revoked'
      const reason = type === 'hard_bounce' ? 'bounce' : type === 'complaint' ? 'complaint' : 'unsubscribe'
      await recordEmailComplianceEvent(orgId, lead.id, status, 'resend_webhook', 'contact')
      await stopSalesSequenceForLead(orgId, lead.id, reason)
    }
  }
  return { duplicate, eventType: type, deliveryId: delivery?.id ?? null }
}

export async function handleResendReceivedWebhook(input: {
  orgId: string
  rawBody: string
  headers: Headers
  body: ResendEvent
  correlationId?: string
  resolveCredential?: (orgId: string, provider: string) => Promise<any>
  fetcher?: typeof fetch
}) {
  const id = header(input.headers, 'svix-id')
  if (!id) throw new Error('RESEND_EVENT_ID_MISSING')
  const credential = await (input.resolveCredential ?? getOrganizationCredential)(input.orgId, 'resend')
  const secret = credential?.secrets.webhookSigningSecret
  if (typeof secret !== 'string') throw new Error('RESEND_INBOUND_CREDENTIALS_MISSING')
  if (!verifyResendWebhookSignature(secret, input.rawBody, input.headers)) throw new Error('RESEND_SIGNATURE_INVALID')

  const lifecycle = await beginWebhookEvent({
    provider: 'resend', channel: 'email', eventType: input.body.type ?? 'unknown',
    orgId: input.orgId, correlationId: input.correlationId, externalEventId: id,
    rawBody: input.rawBody, signatureValid: true, signatureVersion: 'svix-hmac-sha256-v1',
  })
  if (lifecycle.deadLetter) return { deadLetter: true, duplicate: false }
  if (!lifecycle.claimed) return { deadLetter: false, duplicate: true, inFlight: lifecycle.inFlight }
  try {
    if (input.body.type === 'email.received') {
      const apiKey = credential?.secrets.apiKey
      if (typeof apiKey !== 'string') throw new Error('RESEND_INBOUND_CREDENTIALS_MISSING')
      const emailId = input.body.data?.email_id ?? input.body.data?.id
      if (typeof emailId !== 'string') throw new Error('RESEND_EMAIL_ID_MISSING')
      const received = await retrieveReceivedEmail(emailId, apiKey, input.fetcher ?? fetch)
      const result = await persistReceivedEmail(input.orgId, id, { ...received, id: received.id ?? emailId })
      if (!result.duplicate && result.leadId) await stopSalesSequenceForLead(input.orgId, result.leadId, 'reply').catch(() => undefined)
      await finishWebhookEvent({ id: lifecycle.id, provider: 'resend', channel: 'email', correlationId: input.correlationId, success: true })
      return { deadLetter: false, ...result }
    }
    const result = await persistResendTrackingEvent(input.orgId, id, input.body)
    await finishWebhookEvent({ id: lifecycle.id, provider: 'resend', channel: 'email', correlationId: input.correlationId, success: true })
    return { deadLetter: false, ...result }
  } catch (error) {
    await finishWebhookEvent({ id: lifecycle.id, provider: 'resend', channel: 'email', correlationId: input.correlationId, success: false, error })
    throw error
  }
}
export function resendInboundWebhookEndpoint(orgId: string): string | null {
  const base = process.env.RESEND_WEBHOOK_BASE_URL?.trim() || process.env.PUBLIC_HOST?.trim()
  if (!base) return null
  try {
    const url = new URL(base)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/webhooks/email/resend/' + encodeURIComponent(orgId)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}