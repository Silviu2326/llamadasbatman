import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/funnels.controller'

export async function funnelsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/overview', ctrl.overview)
  app.post('/', ctrl.create)
}
