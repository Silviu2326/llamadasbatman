import { normalizeE164 } from '../compliance'
import { createMediaStreamToken } from './streamAuth'
import {
  createTwilioClient,
  getTwilioIntegrationConfig,
  twilioWebhookUrl,
} from '../../services/twilioIntegration.service'

/**
 * Compatibility helper for callers without tenant context. Org-bound paths
 * must pass the resolved per-organization base URL instead of relying on this
 * environment fallback.
 */
export function publicWebhookUrl(path: string, query = '', baseUrl?: string): string {
  const configured = baseUrl?.trim() || process.env.TWILIO_WEBHOOK_BASE_URL?.trim() || process.env.PUBLIC_HOST?.trim()
  if (!configured) throw new Error('TWILIO_WEBHOOK_BASE_URL o PUBLIC_HOST debe configurarse en producción')
  const value = /^https?:\/\//i.test(configured)
    ? configured
    : `${configured.startsWith('localhost') ? 'http' : 'https'}://${configured}`
  return twilioWebhookUrl(value, path, query)
}
export async function buildStreamTwiml(params: Record<string, string> = {}): Promise<string> {
  const config = await getTwilioIntegrationConfig(params.orgId)
  if (!config) throw new Error('TWILIO_ORG_CREDENTIAL_MISSING')
  const streamUrl = config.webhookBaseUrl.replace(/^http/i, 'ws')

  // Media Stream upgrades do not carry Twilio's regular webhook signature.
  // Bind the stream to the validated call context with a short-lived signed
  // capability. The signing secret follows the same tenant credential as the
  // Twilio webhook, with an optional independent per-org secret.
  const streamToken = createMediaStreamToken({
    callSid: params.callSid ?? '',
    orgId: params.orgId ?? '',
    agentId: params.agentId ?? '',
    campaignId: params.campaignId ?? '',
    leadId: params.leadId ?? '',
    phone: params.phone ?? '',
    businessType: params.businessType ?? '',
    businessName: params.businessName ?? '',
    // El webhook de entrante ya mandaba `direction`, pero se perdía aquí: el
    // motor trataba una llamada recibida como si la hubiéramos hecho nosotros.
    direction: params.direction === 'inbound' ? 'inbound' : 'outbound',
  }, config.voiceStreamSecret ?? config.authToken)

  const paramTags = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `\n      <Parameter name="${escapeXml(key)}" value="${escapeXml(value)}" />`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}/media?token=${encodeURIComponent(streamToken)}">${paramTags}
    </Stream>
  </Connect>
</Response>`
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] ?? character))
}

function selectCallerId(toNumber: string, config: { fromNumber?: string; mxNumbers: Record<string, string> }): string {
  const strategy = process.env.CALLER_ID_STRATEGY ?? 'static'
  const from = config.fromNumber ?? ''
  if (strategy !== 'dynamic') return from

  const mx = config.mxNumbers
  if (toNumber.startsWith('+52') && toNumber.length >= 5) {
    const lada2 = toNumber.slice(3, 5)
    const lada3 = toNumber.slice(3, 6)
    return mx[lada2] ?? mx[lada3] ?? from
  }
  return from
}

export async function startOutboundCall(params: {
  toNumber: string
  businessType?: string
  businessName?: string
  orgId: string
  campaignId: string
  agentId: string
  leadId: string
}): Promise<{ status: string; sid?: string; to: string }> {
  const toNumber = normalizeE164(params.toNumber)
  if (!toNumber) return { status: 'invalid_phone', to: params.toNumber }

  const config = await getTwilioIntegrationConfig(params.orgId)
  if (!config) return { status: 'offline', to: params.toNumber }
  const client = createTwilioClient(config)
  const from = selectCallerId(toNumber, config)
  if (!from) return { status: 'offline', to: params.toNumber }

  const qs = new URLSearchParams({
    phone: toNumber,
    orgId: params.orgId,
    campaignId: params.campaignId,
    agentId: params.agentId,
    leadId: params.leadId,
    businessType: params.businessType ?? 'generico',
    businessName: params.businessName ?? '',
  }).toString()

  const call = await client.calls.create({
    to: toNumber,
    from,
    url: twilioWebhookUrl(config.webhookBaseUrl, '/api/voice/webhook/voice', qs),
    machineDetection: 'DetectMessageEnd',
    asyncAmd: 'true',
    asyncAmdStatusCallback: twilioWebhookUrl(config.webhookBaseUrl, '/api/voice/webhook/amd', qs),
    asyncAmdStatusCallbackMethod: 'POST',
    // 'always' records from call start; 'consent' defers recording until the
    // prospect grants it in-call (startCallRecording); 'off' never records.
    record: recordingPolicy() === 'always',
    recordingStatusCallback: twilioWebhookUrl(config.webhookBaseUrl, '/api/voice/webhook/recording', qs),
    recordingStatusCallbackEvent: ['completed'],
    statusCallback: twilioWebhookUrl(config.webhookBaseUrl, '/api/voice/webhook/status', qs),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  })
  return { status: 'iniciada', sid: call.sid, to: toNumber }
}

export type RecordingPolicy = 'always' | 'consent' | 'off'

export function recordingPolicy(): RecordingPolicy {
  const value = process.env.CALL_RECORDING_POLICY?.trim().toLowerCase()
  return value === 'consent' || value === 'off' ? value : 'always'
}

/**
 * Starts recording an in-progress call. Used with policy 'consent': the
 * recording only exists after the prospect grants it, so the recording
 * webhook never sees non-consented audio.
 */
export async function startCallRecording(params: {
  callSid: string
  orgId: string
  campaignId: string
  agentId: string
  leadId: string
}): Promise<boolean> {
  const config = await getTwilioIntegrationConfig(params.orgId)
  if (!config) return false
  const client = createTwilioClient(config)
  const qs = new URLSearchParams({
    orgId: params.orgId,
    campaignId: params.campaignId,
    agentId: params.agentId,
    leadId: params.leadId,
  }).toString()
  await client.calls(params.callSid).recordings.create({
    recordingStatusCallback: twilioWebhookUrl(config.webhookBaseUrl, '/api/voice/webhook/recording', qs),
    recordingStatusCallbackEvent: ['completed'],
  })
  return true
}

export async function transferCall(callSid: string, toNumber: string, orgId: string): Promise<void> {
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) return
  const client = createTwilioClient(config)
  const normalized = normalizeE164(toNumber)
  if (!normalized) return
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${escapeXml(normalized)}</Dial></Response>`
  await client.calls(callSid).update({ twiml })
}

export async function endCall(callSid: string, orgId: string): Promise<void> {
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) return
  const client = createTwilioClient(config)
  await client.calls(callSid).update({ status: 'completed' })
}
