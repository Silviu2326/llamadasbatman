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
  app.post('/:id/move-stage', { preHandler: authorize(['admin', 'agent']) }, ctrl.moveStage as any)
  // OP-104: ganar/perder quedan al alcance de admin y agent (como el resto
  // de mutaciones de pipeline); reabrir revierte un cierre ya dado por
  // definitivo, así que se restringe a admin.
  app.post('/:id/mark-won',  { preHandler: authorize(['admin', 'agent']) }, ctrl.markWon as any)
  app.post('/:id/mark-lost', { preHandler: authorize(['admin', 'agent']) }, ctrl.markLost as any)
  app.post('/:id/reopen',    { preHandler: authorize(['admin']) }, ctrl.reopen as any)
  app.get('/:id/history', ctrl.history as any)
}
