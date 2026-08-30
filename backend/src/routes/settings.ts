import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/settings.controller'

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/me', ctrl.getMe)
  app.put('/me', ctrl.updateMe)
  app.put('/password', ctrl.changePassword)
  app.delete('/me', ctrl.deleteAccount as any)
  app.get('/organization', {
    preHandler: requirePermission('organization.read', { scope: 'org' }),
  }, ctrl.getOrganization)
  app.put('/organization', {
    preHandler: requirePermission('organization.manage', { scope: 'org' }),
  }, ctrl.updateOrganization as any)
  app.get('/business-profile', {
    preHandler: [requirePermission('organization.read', { scope: 'org' }), requireEntitlement('agents')],
  }, ctrl.getBusinessProfile)
  app.put('/business-profile', {
    preHandler: [requirePermission('organization.manage', { scope: 'org' }), requireEntitlement('agents')],
  }, ctrl.updateBusinessProfile as any)
  app.get('/integrations', {
    preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')],
  }, ctrl.getIntegrations)
}
