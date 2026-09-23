/**
 * Email delivery through Resend. Marketing deliveries are sent one recipient at a time
 * with a stable provider idempotency key; system notifications keep the boolean API.
 */
import { recordUsage } from '../lib/usage'
import { getOrganizationCredential, markOrganizationCredentialUsed } from './organizationCredentials.service'

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function isTransactionalEmailConfigured(orgId?: string): Promise<boolean> {
  if (orgId) {
    const saved = await getOrganizationCredential(orgId, 'resend').catch(() => null)
    if (saved) return saved.record.status === 'connected' && Boolean(saved.secrets.apiKey && saved.secrets.fromEmail)
  }
  return isEmailConfigured()
}

const RATE_VERSION = '2026-08'
function costCentsPerEmail(): number {
  const raw = Number(process.env.RESEND_COST_CENTS_PER_EMAIL)
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.09
}

export type DetailedEmailSendResult = { status: 'accepted'; id: string } | { status: 'rejected' } | { status: 'uncertain' }

export async function sendTransactionalEmailDetailed(input: {
  to: string
  subject: string
  html: string
  idempotencyKey?: string
  replyTo?: string
  from?: string
  usage?: { orgId: string; capability?: string }
}): Promise<DetailedEmailSendResult> {
  let config: { apiKey: string; from: string; replyTo?: string } | null = null
  if (input.usage?.orgId) {
    const saved = await getOrganizationCredential(input.usage.orgId, 'resend').catch(() => null)
    if (saved) {
      const apiKey = typeof saved.secrets.apiKey === 'string' ? saved.secrets.apiKey.trim() : ''
      const fromEmail = typeof saved.secrets.fromEmail === 'string' ? saved.secrets.fromEmail.trim() : ''
      const fromName = typeof saved.secrets.fromName === 'string' ? saved.secrets.fromName.trim().replace(/[\r\n<>]/g, '') : ''
      const replyTo = typeof saved.secrets.replyTo === 'string' ? saved.secrets.replyTo.trim() : ''
      if (saved.record.status !== 'connected' || !apiKey || !fromEmail) return { status: 'rejected' }
      config = { apiKey, from: fromName ? `${fromName} <${fromEmail}>` : fromEmail, ...(replyTo ? { replyTo } : {}) }
      await markOrganizationCredentialUsed(input.usage.orgId, 'resend').catch(() => {})
    }
  }
  if (!config && isEmailConfigured()) config = { apiKey: process.env.RESEND_API_KEY!, from: process.env.EMAIL_FROM! }
  if (!config) return { status: 'rejected' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.from?.trim() || config.from,
        ...(input.replyTo || config.replyTo ? { reply_to: input.replyTo || config.replyTo } : {}),
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`[TransactionalEmail] Resend respondió ${res.status}`)
      return { status: 'rejected' }
    }
    const responseBody = await res.json().catch(() => null) as { id?: unknown } | null
    const providerRequestId = typeof responseBody?.id === 'string' ? responseBody.id : res.headers.get('x-request-id')
    if (!providerRequestId) return { status: 'uncertain' }
    if (input.usage?.orgId) {
      void recordUsage({
        orgId: input.usage.orgId,
        provider: 'resend',
        capability: input.usage.capability ?? 'email.transactional',
        quantity: 1,
        unit: 'requests',
        costCents: costCentsPerEmail(),
        billingMode: 'managed',
        rateVersion: RATE_VERSION,
        idempotencyKey: `resend:${providerRequestId}`,
      })
    }
    return { status: 'accepted', id: providerRequestId }
  } catch (error) {
    console.warn('[TransactionalEmail] fallo de envío:', (error as Error).message)
    // Network errors can happen after Resend accepted the request. The caller
    // must park this delivery for reconciliation instead of risking a duplicate.
    return { status: 'uncertain' }
  }
}

export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  html: string
  usage?: { orgId: string; capability?: string }
}): Promise<boolean> {
  return (await sendTransactionalEmailDetailed(input)).status === 'accepted'
}




