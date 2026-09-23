import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/funnels.controller'

export async function funnelsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('funnels.read', { scope: 'org' }), requireEntitlement('growth')] }
  const canMutate = { preHandler: [requirePermission('funnels.write', { scope: 'org' }), requireEntitlement('growth', { limit: { resource: 'campaigns' } })] }

  // Cambiar estado no crea campañas: mismo permiso y plan, sin el límite de recurso.
  const canChangeStatus = { preHandler: [requirePermission('funnels.write', { scope: 'org' }), requireEntitlement('growth')] }

  app.get('/overview', canRead, ctrl.overview)
  app.post('/', canMutate, ctrl.create as any)
  // Solo cambia Campaign.status; nunca encola llamadas (eso es /api/campaigns/:id/start).
  app.patch('/:id/status', canChangeStatus, ctrl.updateStatus as any)
}
