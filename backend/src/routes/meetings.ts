import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/meetings.controller'

export async function meetingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', ctrl.create)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
}
