import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/dashboard.controller'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/stats', ctrl.statsHandler)
  app.get('/activity', ctrl.activity)
}
