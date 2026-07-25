import { FastifyReply, FastifyRequest } from 'fastify'
import {
  handleInbound,
  handleStatus,
  resolveTwilioWebhookOrgId,
  sendWhatsApp,
  verifyTwilioSignature,
  TwilioParams,
} from '../services/whatsapp.service'
import { getTwilioIntegrationConfig, twilioWebhookUrl } from '../services/twilioIntegration.service'

function params(request: FastifyRequest) { return (request.body || {}) as TwilioParams }
function callbackUrl(request: FastifyRequest, path: string, baseUrl?: string) {
  if (baseUrl) {
    const query = new URL(request.url, 'http://request.invalid').searchParams.toString()
    return twilioWebhookUrl(baseUrl, path, query)
  }
  if (process.env.TWILIO_WEBHOOK_BASE_URL) {
    const query = new URL(request.url, 'http://request.invalid').searchParams.toString()
    return twilioWebhookUrl(process.env.TWILIO_WEBHOOK_BASE_URL, path, query)
  }
  if (process.env.NODE_ENV === 'production') return ''
  const proto = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0]
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '')
  return host ? `${proto}://${host}${path}` : ''
}
async function valid(request: FastifyRequest, path: string, body: TwilioParams, kind: 'inbound' | 'status') {
  const orgId = await resolveTwilioWebhookOrgId(body, kind)
  const config = await getTwilioIntegrationConfig(orgId)
  const signatureUrl = callbackUrl(request, path, config?.webhookBaseUrl)
  return verifyTwilioSignature(signatureUrl, body, request.headers['x-twilio-signature'] as string | undefined, orgId)
}

export async function inbound(request: FastifyRequest, reply: FastifyReply) {
  const body = params(request)
  if (!(await valid(request, '/api/whatsapp/inbound', body, 'inbound'))) return reply.code(403).send({ error: 'Invalid Twilio signature' })
  // Twilio retries on slow responses. Persist asynchronously and acknowledge
  // immediately; idempotency in the service makes retries safe.
  void handleInbound(body).catch(error => request.log.error(error, 'WhatsApp inbound persistence failed'))
  return reply.type('text/xml').send('<Response></Response>')
}

export async function status(request: FastifyRequest, reply: FastifyReply) {
  const body = params(request)
  if (!(await valid(request, '/api/whatsapp/status', body, 'status'))) return reply.code(403).send({ error: 'Invalid Twilio signature' })
  void handleStatus(body).catch(error => request.log.error(error, 'WhatsApp status persistence failed'))
  return reply.type('text/xml').send('<Response></Response>')
}

export async function send(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { orgId: string }
  const body = request.body as any
  if (!body?.to || (!body.body && !body.contentSid)) return reply.code(400).send({ error: 'to y body o contentSid son obligatorios' })
  try { return reply.code(201).send(await sendWhatsApp({ ...body, orgId: user.orgId })) }
  catch (error: any) { return reply.code(400).send({ error: error?.message || 'No se pudo enviar WhatsApp' }) }
}
