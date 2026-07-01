import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/leads.controller'

export async function leadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', ctrl.create)
  app.post('/import', ctrl.importCsv)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
  app.get('/:id/timeline', ctrl.timeline)
}
