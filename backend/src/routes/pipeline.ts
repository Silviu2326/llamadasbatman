import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/pipeline.controller'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.listByStage)
  app.post('/', ctrl.create)
  // static routes before /:id to avoid param capture
  app.get('/insights',   ctrl.insights)
  app.get('/prediction', ctrl.prediction)
  app.get('/actions',    ctrl.actions)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
}
