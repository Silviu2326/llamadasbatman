import type { FastifyInstance } from 'fastify'
import { handleResendReceivedWebhook } from '../services/resendInboundEmail.service'

export async function resendEmailWebhooksRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    ;(request as any).rawBody = body
    try { done(null, JSON.parse(body as string)) } catch (error) { done(error as Error, undefined) }
  })

  app.post<{ Params: { orgId: string } }>('/:orgId', {
    config: { rateLimit: { max: 180, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const orgId = request.params.orgId
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(orgId)) return reply.status(404).send({ error: 'Not found' })
    const rawBody = (request as any).rawBody as string | undefined
    if (!rawBody) return reply.status(400).send({ error: 'Invalid JSON body' })
    try {
      const result = await handleResendReceivedWebhook({
        orgId, rawBody, headers: request.headers, body: request.body as any,
        correlationId: request.correlationId,
      })
      if (result.deadLetter) return reply.status(503).send({ error: 'Webhook processing exhausted' })
      return reply.status(200).send({ ok: true, ...result })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'RESEND_SIGNATURE_INVALID' || code === 'RESEND_EVENT_ID_MISSING' || code === 'RESEND_INBOUND_CREDENTIALS_MISSING') {
        request.log.warn({ event: 'webhook.rejected', provider: 'resend', channel: 'email', correlationId: request.correlationId, errorCode: code }, 'Webhook de Resend rechazado')
        return reply.status(code === 'RESEND_SIGNATURE_INVALID' ? 403 : 503).send({ error: code === 'RESEND_SIGNATURE_INVALID' ? 'Invalid signature' : 'Webhook not configured' })
      }
      request.log.error({ event: 'webhook.failed', provider: 'resend', channel: 'email', correlationId: request.correlationId, errorCode: 'PROCESSING_FAILED' }, 'No se pudo procesar el email recibido')
      return reply.status(503).send({ error: 'Temporary processing failure', correlationId: request.correlationId })
    }
  })
}