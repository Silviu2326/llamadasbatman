import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/pipeline.controller'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.listByStage)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create as any)
  // static routes before /:id to avoid param capture
  app.get('/insights',   ctrl.insights)
  app.get('/prediction', ctrl.prediction)
  app.get('/actions',    ctrl.actions)
  app.get('/:id', ctrl.get)
  app.put('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.update as any)
}
