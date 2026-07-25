import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/marketingCampaigns.controller'

export async function marketingCampaignsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('campaigns.read', { scope: 'org' }) }
  const canMutate = { preHandler: requirePermission('campaigns.write', { scope: 'org' }) }
  const canPublish = { preHandler: requirePermission('campaigns.publish', { scope: 'org' }) }

  app.get('/', canRead, ctrl.list)
  app.post('/', canMutate, ctrl.create)
  app.get<{ Params: { id: string } }>('/:id', canRead, ctrl.get)
  app.put<{ Params: { id: string } }>('/:id', canMutate, ctrl.update)
  app.post<{ Params: { id: string } }>('/:id/validate', canMutate, ctrl.validate)
  app.post<{ Params: { id: string } }>('/:id/audience-preview', canRead, ctrl.audiencePreview)
  app.post<{ Params: { id: string } }>('/:id/publish', canPublish, ctrl.publish)
  app.post<{ Params: { id: string } }>('/:id/pause', canPublish, ctrl.pause)
  // reconcile puede corregir el estado local, por lo que no es una lectura pura.
  app.get<{ Params: { id: string } }>('/:id/reconcile', canMutate, ctrl.reconcile)
}
