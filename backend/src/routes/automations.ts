import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/automations.controller'

export async function automationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.get('/health', { preHandler: authorize(['admin']) }, ctrl.health)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create as any)
  app.get('/:id', ctrl.get)
  app.get('/:id/runs', ctrl.listRuns as any)
  app.get('/:id/runs/:runId', ctrl.getRunDetail)
  app.put('/:id/toggle', { preHandler: authorize(['admin', 'agent']) }, ctrl.toggle as any)
  app.delete('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.remove as any)
}
