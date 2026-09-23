import { prisma } from '../lib/prisma'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { unsubscribeUrl } from './outboundEmail.service'
import { getNewsletterDraftForCampaign } from './emailNewsletterDrafts.service'
import { sendTransactionalEmailDetailed } from './transactionalEmail.service'

export interface NativeEmailContent {
  emailDraftId: string
  subject: string
  html: string
  content: Record<string, unknown>
}

export async function resolveNativeEmailDraft(orgId: string, emailDraftId: string): Promise<NativeEmailContent | null> {
  const draft = await getNewsletterDraftForCampaign(orgId, emailDraftId)
  if (!draft) return null
  return { emailDraftId: draft.id, subject: draft.subject, html: draft.html, content: draft.content as Record<string, unknown> }
}

export async function createNativeEmailDeliverySnapshot(input: {
  orgId: string
  leadId: string
  toAddress: string
  idempotencyScope: string
  subject: string
  html: string
  purpose?: string
  emailDraftId?: string
  campaignId?: string
  variantKey?: string | null
}) {
  const consent = await assertEmailSendAllowed(input.orgId, input.leadId, input.purpose ?? 'marketing')
  if (!consent.allowed) throw new Error(`EMAIL_${consent.reason.toUpperCase()}`)
  const optOutUrl = unsubscribeUrl(input.leadId)
  if (!optOutUrl) throw new Error('UNSUBSCRIBE_URL_MISSING')
  const html = input.html.replaceAll('{{UNSUBSCRIBE_URL}}', escapeAttribute(optOutUrl))
  if (html.includes('{{UNSUBSCRIBE_URL}}')) throw new Error('UNSUBSCRIBE_URL_UNRESOLVED')
  const idempotencyKey = `${input.idempotencyScope}:${input.leadId}`
  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey },
    create: {
      orgId: input.orgId, leadId: input.leadId, toAddress: input.toAddress, idempotencyKey,
      emailDraftId: input.emailDraftId, subjectSnapshot: input.subject, htmlSnapshot: html,
      campaignId: input.campaignId, variantKey: input.variantKey ?? null,
    },
    update: {},
  })
  if (delivery.status === 'failed' && delivery.failureCode === 'PROVIDER_REJECTED') {
    await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: 'failed', failureCode: 'PROVIDER_REJECTED' }, data: { status: 'queued', availableAt: new Date(), failedAt: null, failureCode: null, failureDetail: null } })
    return prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
  }
  return delivery
}

export async function createNativeEmailDelivery(input: {
  orgId: string
  leadId: string
  emailDraftId: string
  toAddress: string
  idempotencyScope: string
  purpose?: string
  campaignId?: string
  variantKey?: string | null
  content?: NativeEmailContent
}) {
  const content = input.content ?? await resolveNativeEmailDraft(input.orgId, input.emailDraftId)
  if (!content || content.emailDraftId !== input.emailDraftId) throw new Error('EMAIL_DRAFT_NOT_FOUND')
  return createNativeEmailDeliverySnapshot({ ...input, subject: content.subject, html: content.html })
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

/** Sends a previously claimed delivery, with Resend idempotency and frozen content. */
export async function sendNativeMarketingDelivery(deliveryId: string, workerId: string, purpose = 'marketing'): Promise<'accepted' | 'blocked' | 'uncertain' | 'retry'> {
  const delivery = await prisma.emailDelivery.findFirst({
    where: { id: deliveryId, status: 'processing', workerId },
    include: { lead: { select: { email: true } }, campaign: true },
  })
  if (!delivery) return 'retry'
  if (delivery.campaign && delivery.campaign.status !== 'running') {
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: 'queued', workerId: null, lockedAt: null, leaseExpiresAt: null } })
    return 'retry'
  }
  const consent = await assertEmailSendAllowed(delivery.orgId, delivery.leadId, purpose)
  if (!consent.allowed) {
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: 'unsubscribed', failureCode: `EMAIL_${consent.reason.toUpperCase()}`, failedAt: new Date(), workerId: null, lockedAt: null, leaseExpiresAt: null } })
    return 'blocked'
  }
  const email = delivery.toAddress
  if (!email || !delivery.subjectSnapshot || !delivery.htmlSnapshot) {
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: 'failed', failureCode: 'CONTENT_MISSING', failureDetail: 'Falta el contenido local congelado de la entrega.', failedAt: new Date(), workerId: null, lockedAt: null, leaseExpiresAt: null } })
    return 'blocked'
  }
  const campaignSnapshot = delivery.campaign?.contentSnapshot && typeof delivery.campaign.contentSnapshot === 'object' && !Array.isArray(delivery.campaign.contentSnapshot) ? delivery.campaign.contentSnapshot as Record<string, unknown> : {}
  const result = await sendTransactionalEmailDetailed({
    to: email, subject: delivery.subjectSnapshot, html: delivery.htmlSnapshot, idempotencyKey: delivery.idempotencyKey,
    from: typeof campaignSnapshot.sender === 'string' ? campaignSnapshot.sender : undefined,
    replyTo: typeof campaignSnapshot.replyTo === 'string' ? campaignSnapshot.replyTo : undefined,
    usage: { orgId: delivery.orgId, capability: 'email.marketing' },
  })
  if (result.status === 'accepted') {
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: 'accepted', providerMessageId: result.id, acceptedAt: new Date(), workerId: null, lockedAt: null, leaseExpiresAt: null, failureCode: null, failureDetail: null } })
    return 'accepted'
  }
  if (result.status === 'uncertain') {
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: 'uncertain', failureCode: 'PROVIDER_OUTCOME_UNKNOWN', failureDetail: 'Resend no permitió confirmar si aceptó el mensaje; no se reenvía automáticamente.', failedAt: new Date(), workerId: null, lockedAt: null, leaseExpiresAt: null } })
    return 'uncertain'
  }
  await prisma.emailDelivery.updateMany({ where: { id: deliveryId, workerId, status: 'processing' }, data: { status: delivery.campaignId ? 'queued' : 'failed', availableAt: new Date(Date.now() + 30_000), failedAt: delivery.campaignId ? null : new Date(), failureCode: 'PROVIDER_REJECTED', failureDetail: 'Resend rechazó el envío.', workerId: null, lockedAt: null, leaseExpiresAt: null } })
  return 'retry'
}


