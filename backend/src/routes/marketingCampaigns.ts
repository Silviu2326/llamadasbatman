import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/marketingCampaigns.controller'

export async function marketingCampaignsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create)
  app.get<{ Params: { id: string } }>('/:id', ctrl.get)
  app.put<{ Params: { id: string } }>('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.update)
  app.post<{ Params: { id: string } }>('/:id/validate', { preHandler: authorize(['admin', 'agent']) }, ctrl.validate)
  app.post<{ Params: { id: string } }>('/:id/audience-preview', ctrl.audiencePreview)
  app.post<{ Params: { id: string } }>('/:id/publish', { preHandler: authorize(['admin', 'agent']) }, ctrl.publish)
  app.post<{ Params: { id: string } }>('/:id/pause', { preHandler: authorize(['admin', 'agent']) }, ctrl.pause)
  app.get<{ Params: { id: string } }>('/:id/reconcile', ctrl.reconcile)
}
