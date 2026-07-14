import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/accounts.controller'

export async function accountsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canMutate = { preHandler: authorize(['admin', 'agent']) }

  // Lectura: cualquier rol autenticado (viewer incluido).
  app.get('/', ctrl.list as any)
  app.get('/:id', ctrl.get as any)

  // Mutación: viewer nunca escribe.
  app.post('/', canMutate, ctrl.create as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.post('/leads/:leadId/assign', canMutate, ctrl.assignLead as any)
}
