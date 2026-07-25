import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { fetchWithTimeout, stableIdempotencyKey } from '../lib/integrationRuntime'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

interface ConversionUserData {
  email?: string
  phone?: string
  externalId?: string
}

interface ConversionCustomData {
  currency?: string
  value?: number
  campaignId?: string
}

async function getPixelAndToken(orgId: string): Promise<{ pixelId: string; token: string } | null> {
  const account = await prisma.metaAdAccount.findFirst({
    where: { orgId, status: 'connected' },
    select: { metaPixelId: true },
  })
  if (!account?.metaPixelId) return null
  const token = await getDecryptedToken(orgId)
  if (!token) return null
  return { pixelId: account.metaPixelId, token }
}

async function sendEvent(
  orgId: string,
  eventName: string,
  userData: ConversionUserData,
  customData?: ConversionCustomData,
  eventId?: string,
) {
  const creds = await getPixelAndToken(orgId)
  if (!creds) return

  const payloadUserData: Record<string, string | string[]> = {}
  if (userData.email) payloadUserData.em = sha256(userData.email)
  if (userData.phone) payloadUserData.ph = sha256(userData.phone)
  if (userData.externalId) payloadUserData.external_id = sha256(userData.externalId)

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    // A deterministic event id lets Meta deduplicate retries from the outbox
    // or a provider timeout. Do not use Date.now() for a business event.
    event_id: eventId || stableIdempotencyKey('meta-capi', orgId, eventName, userData.externalId || userData.email || userData.phone || 'anonymous'),
    action_source: 'website',
    user_data: payloadUserData,
  }
  if (customData) {
    event.custom_data = {
      ...(customData.currency ? { currency: customData.currency } : {}),
      ...(customData.value != null ? { value: customData.value } : {}),
      ...(customData.campaignId ? { campaign_id: customData.campaignId } : {}),
    }
  }

  const body = new URLSearchParams({ data: JSON.stringify([event]) })
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${creds.pixelId}/events?access_token=${creds.token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
      15_000,
    )
    if (!res.ok) {
      console.warn(`[MetaConversions] ${eventName} failed:`, await res.text())
    }
  } catch (err) {
    console.warn(`[MetaConversions] ${eventName} error:`, (err as Error).message)
  }
}

export async function sendLeadEvent(
  orgId: string,
  lead: { id: string; email?: string | null; phone?: string | null; campaignId?: string | null }
) {
  return sendEvent(orgId, 'Lead', {
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    externalId: lead.id,
  }, lead.campaignId ? { campaignId: lead.campaignId } : undefined, `lead:${lead.id}:Lead`)
}

export async function sendScheduleEvent(orgId: string, meeting: { leadId: string }) {
  const lead = await prisma.lead.findFirst({
    where: { id: meeting.leadId, orgId },
    select: { id: true, email: true, phone: true, campaignId: true },
  })
  if (!lead?.campaignId) return
  return sendEvent(orgId, 'Schedule', {
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    externalId: lead.id,
  }, { campaignId: lead.campaignId }, `lead:${lead.id}:Schedule`)
}
