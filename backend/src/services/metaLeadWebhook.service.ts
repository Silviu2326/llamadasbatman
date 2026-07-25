import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { ingestLead } from './leadIngestion.service'
import { fetchWithTimeout, redactProviderError } from '../lib/integrationRuntime'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret || !signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface LeadgenChange {
  field: string
  value: {
    leadgen_id: string
    page_id: string
    ad_id?: string
    form_id?: string
  }
}

interface LeadgenWebhookPayload {
  entry?: Array<{ changes?: LeadgenChange[] }>
}

const FIELD_NAME_MAP: Record<string, 'name' | 'email' | 'phone'> = {
  full_name: 'name',
  nombre: 'name',
  name: 'name',
  email: 'email',
  correo: 'email',
  phone_number: 'phone',
  telefono: 'phone',
  phone: 'phone',
}

async function fetchLeadDetails(leadgenId: string, accessToken: string) {
  const res = await fetchWithTimeout(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}?access_token=${accessToken}`, undefined, 15_000)
  if (!res.ok) throw new Error(`Meta lead fetch failed: ${res.status}`)
  return (await res.json()) as { field_data: Array<{ name: string; values: string[] }>; ad_id?: string }
}

export async function processLeadgenWebhook(payload: LeadgenWebhookPayload): Promise<{ processed: number; ignored: number; failed: number }> {
  const changes = (payload.entry ?? []).flatMap((e) => e.changes ?? []).filter((c) => c.field === 'leadgen')
  let processed = 0
  let ignored = 0
  let failed = 0

  for (const change of changes) {
    const value = change?.value
    const leadgenId = typeof value?.leadgen_id === 'string' ? value.leadgen_id.trim() : ''
    const pageId = typeof value?.page_id === 'string' ? value.page_id.trim() : ''
    const adId = typeof value?.ad_id === 'string' ? value.ad_id.trim() : undefined
    if (!leadgenId || !pageId || leadgenId.length > 256 || pageId.length > 256) {
      failed++
      continue
    }
    try {
      const metaAccount = await prisma.metaAdAccount.findFirst({ where: { metaPageId: pageId, status: 'connected' } })
      if (!metaAccount) {
        console.warn(`[MetaLeadWebhook] no MetaAdAccount for page ${pageId}, skipping lead ${leadgenId}`)
        ignored++
        continue
      }

      const token = await getDecryptedToken(metaAccount.orgId)
      if (!token) {
        failed++
        continue
      }

      const details = await fetchLeadDetails(leadgenId, token)
      const fields: Record<string, string> = {}
      for (const f of details.field_data ?? []) {
        const key = FIELD_NAME_MAP[f.name.toLowerCase()]
        if (key) fields[key] = f.values[0]
      }

      const campaign = adId
        ? await prisma.campaign.findFirst({ where: { orgId: metaAccount.orgId, metaAdId: adId } })
        : null

      await ingestLead(metaAccount.orgId, {
        name: fields.name ?? 'Lead de Meta Ads',
        phone: fields.phone,
        email: fields.email,
        campaignId: campaign?.id,
        source: 'meta_lead_ad',
        externalLeadId: leadgenId,
      })
      processed++
    } catch (err) {
      failed++
      console.error(`[MetaLeadWebhook] error processing lead ${leadgenId}:`, redactProviderError(err))
    }
  }
  return { processed, ignored, failed }
}
