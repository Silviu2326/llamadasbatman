import { FastifyInstance } from 'fastify'
import { verifyWebhookSignature, processLeadgenWebhook } from '../services/metaLeadWebhook.service'

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
    const rawBody = (req as any).rawBody as string
    if (!verifyWebhookSignature(rawBody, signature)) {
      return reply.status(403).send({ error: 'Invalid signature' })
    }
    await processLeadgenWebhook(req.body as any)
    return reply.status(200).send('EVENT_RECEIVED')
  })
}
