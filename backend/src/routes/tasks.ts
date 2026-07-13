import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/tasks.controller'

export async function tasksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.get('/:id', ctrl.get)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create as any)
  app.put('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.update as any)
  app.post('/:id/complete', { preHandler: authorize(['admin', 'agent']) }, ctrl.complete as any)
  app.post('/:id/cancel', { preHandler: authorize(['admin', 'agent']) }, ctrl.cancel as any)
}
