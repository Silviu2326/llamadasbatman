import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/agents.controller'

export async function agentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', ctrl.create)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
  app.delete('/:id', ctrl.deactivate)
  app.get('/:id/stats', ctrl.stats)
}
