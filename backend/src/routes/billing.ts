import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as billing from '../services/billing.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function billingRoutes(app: FastifyInstance) {
  app.get('/config', { preHandler: authenticate }, async () => ({
    enabled: billing.billingEnabled(),
    plans: billing.availablePlans(),
  }))

  app.post<{ Body: { plan?: string } }>('/checkout', { preHandler: authenticate }, async (request, reply) => {
    const { orgId, email, role } = request.user as JWTUser
    if (!['owner', 'admin'].includes(role)) {
      return reply.status(403).send({ error: 'Solo owner o admin pueden cambiar el plan' })
    }
    if (!billing.billingEnabled()) {
      return reply.status(501).send({ error: 'billing_not_configured' })
    }
    const plan = String(request.body?.plan ?? '').toLowerCase()
    try {
      const url = await billing.createCheckoutSession(orgId, email, plan)
      return reply.send({ url })
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'No se pudo iniciar el pago' })
    }
  })

  app.post('/portal', { preHandler: authenticate }, async (request, reply) => {
    const { orgId, email, role } = request.user as JWTUser
    if (!['owner', 'admin'].includes(role)) {
      return reply.status(403).send({ error: 'Solo owner o admin pueden gestionar la suscripción' })
    }
    if (!billing.billingEnabled()) {
      return reply.status(501).send({ error: 'billing_not_configured' })
    }
    try {
      const url = await billing.createPortalSession(orgId, email)
      return reply.send({ url })
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'No se pudo abrir el portal' })
    }
  })
}

// Registrado aparte y sin authenticate: Stripe firma cada evento y la firma se
// verifica sobre el cuerpo crudo (mismo patrón que metaWebhooks).
export async function billingWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body
    try {
      done(null, JSON.parse(body as string))
    } catch {
      done(null, {})
    }
  })

  app.post('/', async (request, reply) => {
    const rawBody = (request as any).rawBody as string | undefined
    const signature = request.headers['stripe-signature'] as string | undefined
    if (!rawBody || !billing.verifyStripeSignature(rawBody, signature)) {
      return reply.status(401).send({ error: 'invalid_signature' })
    }
    await billing.handleWebhookEvent(request.body as any)
    return reply.send({ received: true })
  })
}
