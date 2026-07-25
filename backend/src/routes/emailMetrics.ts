import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/emailMetrics.controller'

/** EM-108: solo lectura de métricas — cualquier rol autenticado. */
export async function emailMetricsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('campaigns.read', { scope: 'org' }) }

  app.get('/campaigns/:campaignId/metrics', canRead, ctrl.campaignMetrics as any)
  app.get('/overview', canRead, ctrl.overview as any)
}
