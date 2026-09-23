import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/automations.controller'

export async function automationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: [requirePermission('automations.read', { scope: 'org' }), requireEntitlement('automations')] }
  const canWrite = { preHandler: [requirePermission('automations.write', { scope: 'org' }), requireEntitlement('automations')] }
  const canPublish = { preHandler: [requirePermission('automations.publish', { scope: 'org' }), requireEntitlement('automations')] }
  const canCreate = { preHandler: [requirePermission('automations.write', { scope: 'org' }), requireEntitlement('automations', { limit: { resource: 'automations' } })] }

  app.get('/', canRead, ctrl.list)
  app.get('/health', canRead, ctrl.health)
  app.post('/', canCreate, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canWrite, ctrl.update as any)
  app.get('/:id/runs', canRead, ctrl.listRuns as any)
  app.get('/:id/runs/:runId', canRead, ctrl.getRunDetail as any)
  app.get('/:id/versions', canRead, ctrl.listVersions as any)
  app.post('/:id/publish', canPublish, ctrl.publish as any)
  app.put('/:id/toggle', canPublish, ctrl.toggle as any)
  app.delete('/:id', canWrite, ctrl.remove as any)
}
