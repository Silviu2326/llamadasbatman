import twilio from 'twilio'

let _client: twilio.Twilio | null = null

function getClient(): twilio.Twilio | null {
  if (_client) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  _client = twilio(sid, token)
  return _client
}

export function buildStreamTwiml(params: Record<string, string> = {}): string {
  const host = process.env.PUBLIC_HOST ?? 'localhost:3000'
  const paramTags = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `\n      <Parameter name="${k}" value="${v}" />`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media">${paramTags}
    </Stream>
  </Connect>
</Response>`
}

function selectCallerId(toNumber: string): string {
  const strategy = process.env.CALLER_ID_STRATEGY ?? 'static'
  const from = process.env.TWILIO_FROM_NUMBER ?? ''
  if (strategy !== 'dynamic') return from

  try {
    const mx = JSON.parse(process.env.TWILIO_MX_NUMBERS ?? '{}')
    if (toNumber.startsWith('+52') && toNumber.length >= 5) {
      const lada2 = toNumber.slice(3, 5)
      const lada3 = toNumber.slice(3, 6)
      return mx[lada2] ?? mx[lada3] ?? from
    }
  } catch {}
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
  const client = getClient()
  if (!client) return { status: 'offline', to: params.toNumber }

  const from = selectCallerId(params.toNumber)
  const host = process.env.PUBLIC_HOST ?? 'localhost:3000'
  const qs = new URLSearchParams({
    phone: params.toNumber,
    orgId: params.orgId,
    campaignId: params.campaignId,
    agentId: params.agentId,
    leadId: params.leadId,
    businessType: params.businessType ?? 'generico',
    businessName: params.businessName ?? '',
  }).toString()

  const call = await client.calls.create({
    to: params.toNumber,
    from,
    url: `https://${host}/voice?${qs}`,
    machineDetection: 'DetectMessageEnd',
    asyncAmd: 'true',
    record: true,
  })
  return { status: 'iniciada', sid: call.sid, to: params.toNumber }
}

export async function transferCall(callSid: string, toNumber: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${toNumber}</Dial></Response>`
  await client.calls(callSid).update({ twiml })
}
