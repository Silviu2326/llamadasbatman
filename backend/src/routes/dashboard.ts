import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/dashboard.controller'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: requirePermission('dashboard.read', { scope: 'org' }) }
  app.get('/stats', canRead, ctrl.statsHandler)
  app.get('/activity', canRead, ctrl.activity as any)
}
