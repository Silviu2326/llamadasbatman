import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/accounts.controller'

export async function accountsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: [requirePermission('accounts.read', { scope: 'org' }), requireEntitlement('crm')] }
  const canMutate = { preHandler: [requirePermission('accounts.write', { scope: 'org' }), requireEntitlement('crm')] }

  // Lectura: cualquier rol autenticado (viewer incluido).
  app.get('/', canRead, ctrl.list as any)
  app.get('/:id', canRead, ctrl.get as any)

  // Mutación: viewer nunca escribe.
  app.post('/', canMutate, ctrl.create as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.post('/leads/:leadId/assign', {
    preHandler: [
      requirePermission('accounts.write', { scope: 'org' }),
      requirePermission('leads.write', { scope: 'org' }),
      requireEntitlement('crm'),
    ],
  }, ctrl.assignLead as any)
}
