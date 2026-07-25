import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/ads.controller'

export async function adsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('ads.read', { scope: 'org' }), requireEntitlement('ads')] }
  const canMutate = { preHandler: [requirePermission('ads.write', { scope: 'org' }), requireEntitlement('ads')] }
  const canUsePaidProvider = {
    preHandler: [
      requirePermission('ads.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('ads'),
    ],
  }

  // strategy/wizard llaman a proveedores de IA y wizard crea campañas.
  app.post<{ Body: unknown }>('/strategy', canUsePaidProvider, ctrl.strategy)
  app.get('/overview', canRead, ctrl.overview)
  app.get('/draft', canRead, ctrl.getDraft)
  app.put<{ Body: unknown }>('/draft', canMutate, ctrl.saveDraft)

  app.post<{ Body: { vertical: string; objetivo: string; presupuestoMensual: number; audience?: string; strategy?: Record<string, unknown> } }>(
    '/wizard',
    { preHandler: [requirePermission('ads.write', { scope: 'org' }), requirePermission('costs.request', { scope: 'org' }), requireEntitlement('ads'), requireEntitlement('ads', { limit: { resource: 'campaigns' } })] },
    ctrl.wizard
  )
  app.get<{ Params: { id: string } }>('/campaigns/:id/status', canRead, ctrl.campaignStatus)
  app.get<{ Params: { id: string } }>('/campaigns/:id/insights', canRead, ctrl.listInsights)
  app.get<{ Params: { id: string } }>('/campaigns/:id/remote-status', canRead, ctrl.remoteStatus)
  app.post<{ Params: { id: string } }>('/campaigns/:id/publish', canUsePaidProvider, ctrl.publish)
  app.post<{ Params: { id: string } }>('/campaigns/:id/activate', canUsePaidProvider, ctrl.activate)
  app.post<{ Params: { id: string } }>('/campaigns/:id/pause', canMutate, ctrl.pause)
  app.put<{ Params: { id: string }; Body: { maxCostPerLeadCents: number } }>('/campaigns/:id/max-cpl', canMutate, ctrl.updateMaxCpl)
}
