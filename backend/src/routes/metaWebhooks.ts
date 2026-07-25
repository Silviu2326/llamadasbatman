import { FastifyInstance } from 'fastify'
import { verifyWebhookSignature, processLeadgenWebhook } from '../services/metaLeadWebhook.service'
import { beginWebhookEvent, finishWebhookEvent } from '../observability/webhookLifecycle'

export async function metaWebhooksRoutes(app: FastifyInstance) {
  // Necesitamos el body crudo para validar X-Hub-Signature-256 antes de
  // parsearlo — sobreescribe el parser JSON solo dentro de este plugin
  // (Fastify encapsula addContentTypeParser por contexto de registro).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.get<{
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string }
  }>('/leadgen', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
    if (mode === 'subscribe' && challenge && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.type('text/plain').send(challenge)
    }
    return reply.status(403).send('Forbidden')
  })

  app.post('/leadgen', async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const rawBody = (req as any).rawBody as string | undefined
    if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
      req.log.warn({ event: 'webhook.rejected', provider: 'meta', channel: 'leadgen', correlationId: req.correlationId, errorCode: 'INVALID_SIGNATURE' }, 'Webhook rechazado')
      return reply.status(403).send({ error: 'Invalid signature' })
    }
    const lifecycle = await beginWebhookEvent({
      provider: 'meta',
      channel: 'leadgen',
      eventType: 'leadgen',
      correlationId: req.correlationId,
      rawBody,
    })
    if (lifecycle.deadLetter) return reply.status(503).send({ error: 'Webhook processing exhausted', code: 'WEBHOOK_DEAD_LETTER', eventId: lifecycle.id })
    if (!lifecycle.claimed) return reply.status(200).send({ ok: true, duplicate: true, inFlight: lifecycle.inFlight })
    try {
      const result = await processLeadgenWebhook(req.body as any)
      // A provider fetch/database failure must cause Meta to retry. Invalid
      // signatures are rejected above; successfully ignored tenant events are
      // acknowledged so they do not retry forever.
      if (result.failed > 0) {
        await finishWebhookEvent({ id: lifecycle.id, provider: 'meta', channel: 'leadgen', correlationId: req.correlationId, success: false, error: new Error('Meta lead webhook processing failed') })
        return reply.status(503).send({ error: 'Temporary processing failure', result, correlationId: req.correlationId })
      }
      await finishWebhookEvent({ id: lifecycle.id, provider: 'meta', channel: 'leadgen', correlationId: req.correlationId, success: true })
      return reply.status(200).send('EVENT_RECEIVED')
    } catch (error) {
      await finishWebhookEvent({ id: lifecycle.id, provider: 'meta', channel: 'leadgen', correlationId: req.correlationId, success: false, error })
      return reply.status(503).send({ error: 'Temporary processing failure', code: 'WEBHOOK_PROCESSING_FAILED', correlationId: req.correlationId })
    }
  })
}
