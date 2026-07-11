import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/prospects.controller'

export async function prospectsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post('/search', ctrl.search)
  app.post('/import', ctrl.importProspects)
}
