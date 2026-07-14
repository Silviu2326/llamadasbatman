import { FastifyReply, FastifyRequest } from 'fastify'
import { handleInbound, handleStatus, sendWhatsApp, verifyTwilioSignature, TwilioParams } from '../services/whatsapp.service'

function params(request: FastifyRequest) { return (request.body || {}) as TwilioParams }
function callbackUrl(request: FastifyRequest, path: string) {
  if (process.env.TWILIO_WEBHOOK_BASE_URL) return `${process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}${path}`
  const proto = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0]
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '')
  return `${proto}://${host}${path}`
}
function valid(request: FastifyRequest, path: string, body: TwilioParams) {
  return verifyTwilioSignature(callbackUrl(request, path), body, request.headers['x-twilio-signature'] as string | undefined)
}

export async function inbound(request: FastifyRequest, reply: FastifyReply) {
  const body = params(request)
  if (!valid(request, '/api/whatsapp/inbound', body)) return reply.code(403).send({ error: 'Invalid Twilio signature' })
  // Twilio retries on slow responses. Persist asynchronously and acknowledge
  // immediately; idempotency in the service makes retries safe.
  void handleInbound(body).catch(error => request.log.error(error, 'WhatsApp inbound persistence failed'))
  return reply.type('text/xml').send('<Response></Response>')
}

export async function status(request: FastifyRequest, reply: FastifyReply) {
  const body = params(request)
  if (!valid(request, '/api/whatsapp/status', body)) return reply.code(403).send({ error: 'Invalid Twilio signature' })
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
