import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/playbooks.controller'

export async function playbooksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('playbooks.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canMutate = { preHandler: [requirePermission('playbooks.write', { scope: 'org' }), requireEntitlement('agents')] }

  app.get('/', canRead, ctrl.list)
  app.post('/', canMutate, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.delete('/:id', canMutate, ctrl.remove as any)
}
