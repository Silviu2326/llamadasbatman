import { FastifyInstance } from 'fastify'
import * as ctrl from '../controllers/landing.controller'

export async function landingRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>('/:slug', ctrl.getLanding)
  app.post<{ Params: { slug: string }; Body: { name?: string; phone?: string; email?: string } }>('/:slug/lead', ctrl.submitLead)
}
