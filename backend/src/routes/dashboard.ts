import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/dashboard.controller'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: requirePermission('dashboard.read', { scope: 'org' }) }
  const canManageGoals = { preHandler: requirePermission('action_center.write', { scope: 'org' }) }
  app.get('/stats', canRead, ctrl.statsHandler as any)
  app.get('/analysis', canRead, ctrl.analysisHandler as any)
  app.get('/analysis/records', canRead, ctrl.analysisRecordsHandler)
  app.get('/goals', canRead, ctrl.goalsHandler)
  app.get('/activity', canRead, ctrl.activity as any)
  app.get('/live', canRead, ctrl.liveHandler)
  app.put('/goals', canManageGoals, ctrl.updateGoals as any)
}
