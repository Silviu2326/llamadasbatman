import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/meetings.controller'

export async function meetingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('meetings.read', { scope: 'own' }), requireEntitlement('crm')] }
  const canWrite = { preHandler: [requirePermission('meetings.write', { scope: 'own' }), requireEntitlement('crm')] }

  app.get('/', canRead, ctrl.list as any)
  app.post('/', canWrite, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.get('/:id/prep', canRead, ctrl.prep as any)
  app.put('/:id', canWrite, ctrl.update as any)
  app.post('/:id/reschedule', canWrite, ctrl.reschedule as any)
  app.post('/:id/complete', canWrite, ctrl.complete as any)
  app.post('/:id/no-show', canWrite, ctrl.noShow as any)
}
