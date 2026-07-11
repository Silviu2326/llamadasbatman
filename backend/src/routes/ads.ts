import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/ads.controller'

export async function adsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post<{ Body: { vertical: string; objetivo: string; presupuestoMensual: number } }>(
    '/wizard',
    ctrl.wizard
  )
  app.get<{ Params: { id: string } }>('/campaigns/:id/status', ctrl.campaignStatus)
  app.get<{ Params: { id: string } }>('/campaigns/:id/insights', ctrl.listInsights)
  app.put<{ Params: { id: string }; Body: { maxCostPerLeadCents: number } }>('/campaigns/:id/max-cpl', ctrl.updateMaxCpl)
}
