import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/emailMetrics.controller'

/** EM-108: solo lectura de métricas — cualquier rol autenticado. */
export async function emailMetricsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/campaigns/:campaignId/metrics', ctrl.campaignMetrics as any)
  app.get('/overview', ctrl.overview as any)
}
