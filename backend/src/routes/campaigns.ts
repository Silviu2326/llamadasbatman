import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/campaigns.controller'

export async function campaignsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', ctrl.create)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
  app.post('/:id/start', ctrl.start)
  app.post('/:id/pause', ctrl.pause)
  app.get('/:id/stats', ctrl.stats)
  app.post('/:id/audit-bulk', ctrl.auditBulk)
}
