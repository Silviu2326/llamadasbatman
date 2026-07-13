import { prisma } from './prisma'

export type EmailSendBlockReason = 'no_consent' | 'unsubscribed' | 'bounced' | 'complaint'

export type EmailSendDecision =
  | { allowed: true }
  | { allowed: false; reason: EmailSendBlockReason }

const BLOCK_REASON_BY_STATUS: Record<string, EmailSendBlockReason> = {
  revoked: 'unsubscribed',
  bounced: 'bounced',
  complaint: 'complaint',
}

/**
 * Barrera única de envío de email (P0-05/EM-02). Debe llamarse antes de
 * cualquier envío manual, de automatización o de campaña — ninguna ruta
 * puede saltársela. Reutiliza `ContactConsent` (channel=email) en vez de
 * crear una tabla de supresión aparte: bounce/complaint/unsubscribe se
 * escriben ahí como estados de cumplimiento, no como engagement.
 */
export async function assertEmailSendAllowed(
  orgId: string,
  leadId: string,
  purpose: string = 'marketing'
): Promise<EmailSendDecision> {
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel: 'email', purpose },
    orderBy: { occurredAt: 'desc' },
  })
  if (!consent || consent.status === 'unknown') return { allowed: false, reason: 'no_consent' }
  if (consent.status === 'granted') return { allowed: true }
  return { allowed: false, reason: BLOCK_REASON_BY_STATUS[consent.status] ?? 'no_consent' }
}

/**
 * Marca un evento de cumplimiento (unsubscribe/bounce/complaint) como
 * estado del contacto para el propósito indicado, de forma transaccional.
 * Una baja global (purpose='contact') gana sobre cualquier categoría.
 */
export async function recordEmailComplianceEvent(
  orgId: string,
  leadId: string,
  status: 'revoked' | 'bounced' | 'complaint',
  source: string,
  purpose: string = 'marketing'
): Promise<void> {
  await prisma.contactConsent.upsert({
    where: { orgId_leadId_channel_purpose: { orgId, leadId, channel: 'email', purpose } },
    create: { orgId, leadId, channel: 'email', purpose, status, source },
    update: { status, source, occurredAt: new Date() },
  })
}
