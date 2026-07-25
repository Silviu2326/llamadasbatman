import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/funnels.controller'

export async function funnelsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('funnels.read', { scope: 'org' }), requireEntitlement('growth')] }
  const canMutate = { preHandler: [requirePermission('funnels.write', { scope: 'org' }), requireEntitlement('growth', { limit: { resource: 'campaigns' } })] }

  app.get('/overview', canRead, ctrl.overview)
  app.post('/', canMutate, ctrl.create as any)
}
