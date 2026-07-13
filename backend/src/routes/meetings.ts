import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/meetings.controller'

export async function meetingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create as any)
  app.get('/:id', ctrl.get)
  app.put('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.update as any)
  app.post('/:id/reschedule', { preHandler: authorize(['admin', 'agent']) }, ctrl.reschedule as any)
}
