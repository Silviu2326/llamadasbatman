import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/agents.controller'

export async function agentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('agents.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canMutate = { preHandler: [requirePermission('agents.manage', { scope: 'org' }), requireEntitlement('agents')] }
  const canCreate = { preHandler: [requirePermission('agents.manage', { scope: 'org' }), requireEntitlement('agents', { limit: { resource: 'agents' } })] }

  app.get('/', canRead, ctrl.list)
  app.post('/', canCreate, ctrl.create as any)
  app.get('/strategies', canRead, ctrl.strategies)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.delete('/:id', canMutate, ctrl.deactivate as any)
  app.get('/:id/stats', canRead, ctrl.stats as any)
  app.get('/:id/timeseries', canRead, ctrl.timeseries as any)
  app.get('/:id/strategy-performance', canRead, ctrl.strategyPerformance as any)
}
