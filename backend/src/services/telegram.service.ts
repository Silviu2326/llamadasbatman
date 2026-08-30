import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { getOrganizationCredential, markOrganizationCredentialUsed, revokeOrganizationCredential, upsertOrganizationCredential } from './organizationCredentials.service'
import { generateWhiteLabelReply } from './whiteLabel.service'

type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat?: { id?: number | string; type?: string }
    from?: { first_name?: string; last_name?: string; username?: string }
  }
}

function tokenFor(orgId: string, raw: unknown): string | null {
  const token = typeof raw === 'string' ? raw.trim() : ''
  return token && /^[0-9]{6,12}:[A-Za-z0-9_-]{20,}$/.test(token) ? token : null
}

function webhookSecret(orgId: string, botToken: string): string {
  const secret = process.env.JWT_SECRET?.trim() || 'vendrava-telegram-webhook'
  return createHmac('sha256', secret).update(`${orgId}:${botToken}`).digest('hex').slice(0, 48)
}

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function telegramConfig(orgId: string) {
  const stored = await getOrganizationCredential(orgId, 'telegram')
  const botToken = tokenFor(orgId, stored?.secrets.botToken)
  return botToken ? { botToken, recordId: stored?.record.id } : null
}

async function telegramApi(botToken: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await response.json().catch(() => null) as { ok?: boolean; description?: string; result?: unknown } | null
  if (!response.ok || !data?.ok) throw new Error(`TELEGRAM_API_ERROR:${data?.description ?? response.status}`)
  return data.result
}

function webhookUrl(baseUrl: string, orgId: string): string {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('TELEGRAM_WEBHOOK_REQUIRES_HTTPS')
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/api/telegram/webhook/${encodeURIComponent(orgId)}`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export async function connectTelegram(orgId: string, botTokenInput: string, baseUrlInput?: string) {
  const botToken = tokenFor(orgId, botTokenInput)
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN_INVALID')
  const bot = await telegramApi(botToken, 'getMe', {}) as { id?: number; username?: string; first_name?: string } | undefined
  const metadata = { botId: bot?.id ?? null, username: bot?.username ?? null, name: bot?.first_name ?? null }
  let configuredWebhook = false
  if (baseUrlInput?.trim()) {
    const url = webhookUrl(baseUrlInput.trim(), orgId)
    await telegramApi(botToken, 'setWebhook', { url, secret_token: webhookSecret(orgId, botToken), allowed_updates: ['message'] })
    configuredWebhook = true
  }
  await upsertOrganizationCredential(orgId, { provider: 'telegram', secrets: { botToken }, metadata: { ...metadata, webhookConfigured: configuredWebhook } })
  return { connected: true, configuredWebhook, ...metadata }
}

export async function disconnectTelegram(orgId: string) {
  const config = await telegramConfig(orgId)
  if (config) await telegramApi(config.botToken, 'deleteWebhook', { drop_pending_updates: false }).catch(() => undefined)
  return { revoked: await revokeOrganizationCredential(orgId, 'telegram') }
}

export async function telegramStatus(orgId: string) {
  const stored = await getOrganizationCredential(orgId, 'telegram')
  if (!stored) return { connected: false, configuredWebhook: false }
  return { connected: stored.record.status === 'connected', configuredWebhook: Boolean((stored.record.metadata as { webhookConfigured?: boolean } | null)?.webhookConfigured), metadata: stored.record.metadata }
}

async function ensureConversation(orgId: string, address: string) {
  const existing = await prisma.conversation.findUnique({ where: { orgId_channel_address: { orgId, channel: 'telegram', address } } })
  if (existing) return existing
  return prisma.conversation.create({ data: { orgId, channel: 'telegram', provider: 'telegram', address, status: 'open', metadata: {} } })
}

export async function verifyWebhook(orgId: string, suppliedSecret: string | undefined) {
  const config = await telegramConfig(orgId)
  if (!config || !suppliedSecret) return false
  return secureEqual(webhookSecret(orgId, config.botToken), suppliedSecret)
}

export async function handleUpdate(orgId: string, update: TelegramUpdate) {
  const config = await telegramConfig(orgId)
  const message = update.message
  const text = message?.text?.trim().slice(0, 2_000)
  const chatId = message?.chat?.id
  if (!config || !text || chatId === undefined || chatId === null) return { ignored: true }
  const address = `telegram:${String(chatId)}`
  const conversation = await ensureConversation(orgId, address)
  const externalEventId = `telegram:${String(update.update_id ?? `${chatId}:${message?.message_id ?? Date.now()}`)}`
  try {
    await prisma.$transaction(async tx => {
      await tx.channelIdentity.upsert({
        where: { orgId_provider_address: { orgId, provider: 'telegram', address } },
        create: { orgId, channel: 'telegram', provider: 'telegram', address, displayName: message?.from?.username || message?.from?.first_name || address, isActive: true },
        update: { isActive: true, displayName: message?.from?.username || message?.from?.first_name || address },
      })
      await tx.webhookEvent.create({ data: { externalEventId, orgId, provider: 'telegram', channel: 'telegram', eventType: 'message.received', metadata: update as any } })
      await tx.message.create({ data: { orgId, conversationId: conversation.id, channel: 'telegram', provider: 'telegram', address, direction: 'inbound', status: 'received', contentType: 'text', body: text, externalEventId, metadata: update as any } })
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: new Date(), lastMessageAt: new Date(), updatedAt: new Date() } })
    })
  } catch (error: any) {
    if (error?.code === 'P2002') return { duplicate: true }
    throw error
  }

  const reply = await generateWhiteLabelReply(orgId, text)
  if (!reply || 'error' in reply) return { duplicate: false, replied: false }
  const sent = await telegramApi(config.botToken, 'sendMessage', { chat_id: chatId, text: reply.text })
  await markOrganizationCredentialUsed(orgId, 'telegram').catch(() => undefined)
  await prisma.message.create({ data: { orgId, conversationId: conversation.id, channel: 'telegram', provider: 'telegram', address, direction: 'outbound', status: 'sent', contentType: 'text', body: reply.text, externalEventId: `${externalEventId}:reply`, metadata: sent as any, sentAt: new Date() } })
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), updatedAt: new Date() } })
  return { duplicate: false, replied: true }
}

export { webhookSecret }
