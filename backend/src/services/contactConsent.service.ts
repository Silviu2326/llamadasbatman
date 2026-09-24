import { prisma } from '../lib/prisma'

/** Latest explicit decision wins, including revocation and expiry. */
export async function hasContactConsent(orgId: string, leadId: string, channel: string) {
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel, purpose: { in: ['contact', 'marketing'] } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
  return consent?.status === 'granted' && (!consent.expiresAt || consent.expiresAt.getTime() > Date.now())
}

/**
 * Revoca el consentimiento de un canal para todos los propósitos que
 * `hasContactConsent` tiene en cuenta (`contact` y `marketing`). Se escribe
 * fila por propósito (upsert) para que la última decisión explícita sea la
 * revocación, aunque antes solo existiera uno de los dos propósitos.
 */
export async function revokeContactConsent(
  orgId: string,
  leadId: string,
  channel: string,
  proof: { source: string; evidence?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const now = new Date()
  for (const purpose of ['contact', 'marketing']) {
    await prisma.contactConsent.upsert({
      where: { orgId_leadId_channel_purpose: { orgId, leadId, channel, purpose } },
      create: {
        orgId, leadId, channel, purpose, status: 'revoked',
        source: proof.source,
        evidence: proof.evidence?.slice(0, 2000),
        metadata: (proof.metadata ?? {}) as any,
        occurredAt: now,
      },
      update: {
        status: 'revoked',
        source: proof.source,
        evidence: proof.evidence?.slice(0, 2000),
        metadata: (proof.metadata ?? {}) as any,
        occurredAt: now,
        expiresAt: null,
      },
    })
  }
}
