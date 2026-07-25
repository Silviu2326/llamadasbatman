import { FastifyInstance } from 'fastify'
import { createHash } from 'crypto'
import * as ctrl from '../controllers/landing.controller'

function routeSlug(request: { params: unknown }) {
  const params = request.params as { slug?: string }
  return (params.slug ?? '').slice(0, 160)
}

function phoneRateKey(request: { body: unknown; params: unknown }) {
  const body = request.body as ctrl.LandingLeadBody | undefined
  const phone = typeof body?.phone === 'string' ? body.phone.replace(/[^\d]/g, '').slice(0, 20) : 'missing'
  const fingerprint = createHash('sha256').update(phone).digest('hex')
  return `landing-lead-phone:${routeSlug(request)}:${fingerprint}`
}

export async function landingRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>('/:slug', ctrl.getLanding)
  app.post<{ Params: { slug: string }; Body: ctrl.LandingTrackingBody }>('/:slug/view', {
    preHandler: app.rateLimit({
      max: 120,
      timeWindow: '1 minute',
      keyGenerator: request => `landing-view:${request.ip}:${routeSlug(request)}`,
      errorResponseBuilder: () => ({ error: 'Demasiadas solicitudes. Inténtalo de nuevo en un minuto.' }),
    }),
  }, ctrl.recordLandingView)
  app.post<{ Params: { slug: string }; Body: ctrl.LandingLeadBody }>('/:slug/lead', {
    preHandler: [
      app.rateLimit({
        max: 8,
        timeWindow: '1 hour',
        keyGenerator: request => `landing-lead-ip:${request.ip}:${routeSlug(request)}`,
        errorResponseBuilder: () => ({ error: 'Has enviado demasiadas solicitudes. Inténtalo más tarde.' }),
      }),
      app.rateLimit({
        max: 1,
        timeWindow: '24 hours',
        keyGenerator: phoneRateKey,
        errorResponseBuilder: () => ({ error: 'Ya hemos recibido una solicitud para estos datos.' }),
      }),
    ],
  }, ctrl.submitLead)
}
