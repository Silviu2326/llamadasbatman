import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/campaigns.controller'

export async function campaignsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('campaigns.read', { scope: 'org' }), requireEntitlement('growth')] }
  const canMutate = { preHandler: [requirePermission('campaigns.write', { scope: 'org' }), requireEntitlement('growth')] }
  const canPublish = { preHandler: [requirePermission('campaigns.publish', { scope: 'org' }), requireEntitlement('growth')] }
  const canStart = { preHandler: [requirePermission('campaigns.publish', { scope: 'org' }), requireEntitlement('growth'), requireEntitlement('agents')] }
  const canCreate = { preHandler: [requirePermission('campaigns.write', { scope: 'org' }), requireEntitlement('growth', { limit: { resource: 'campaigns' } })] }

  app.get('/', canRead, ctrl.list as any)
  app.post('/', canCreate, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.put('/:id/landing', canMutate, ctrl.updateLanding as any)
  app.post('/:id/start', canStart, ctrl.start as any)
  app.post('/:id/pause', canPublish, ctrl.pause as any)
  app.get('/:id/stats', canRead, ctrl.stats as any)
  app.post('/:id/audit-bulk', canMutate, ctrl.auditBulk as any)
  app.post('/:id/duplicate', canCreate, ctrl.duplicate as any)
  app.get('/:id/activity', canRead, ctrl.activity as any)
  app.post('/:id/share-link', canMutate, ctrl.shareLink as any)
}
