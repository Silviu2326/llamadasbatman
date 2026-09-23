import { prisma } from '../lib/prisma'

/** Latest explicit decision wins, including revocation and expiry. */
export async function hasContactConsent(orgId: string, leadId: string, channel: string) {
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel, purpose: { in: ['contact', 'marketing'] } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
  return consent?.status === 'granted' && (!consent.expiresAt || consent.expiresAt.getTime() > Date.now())
}
