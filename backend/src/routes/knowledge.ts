import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/knowledge.controller'

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('knowledge.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canMutate = { preHandler: [requirePermission('knowledge.write', { scope: 'org' }), requireEntitlement('agents')] }

  app.get('/', canRead, ctrl.list)
  app.post('/', canMutate, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.delete('/:id', canMutate, ctrl.remove as any)
  app.post('/:id/favorite', canMutate, ctrl.favorite as any)
  app.post('/:id/reaction', canMutate, ctrl.reaction as any)
}
