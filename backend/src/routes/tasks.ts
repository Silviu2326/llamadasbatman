import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/tasks.controller'

export async function tasksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('tasks.read', { scope: 'own' }), requireEntitlement('crm')] }
  const canWrite = { preHandler: [requirePermission('tasks.write', { scope: 'own' }), requireEntitlement('crm')] }

  app.get('/', canRead, ctrl.list as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.post('/', canWrite, ctrl.create as any)
  app.put('/:id', canWrite, ctrl.update as any)
  app.post('/:id/complete', canWrite, ctrl.complete as any)
  app.post('/:id/cancel', canWrite, ctrl.cancel as any)
}
