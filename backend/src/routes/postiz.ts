import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/postiz.controller'

export async function postizRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canReadIntegration = { preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')] }
  const canManageIntegration = { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('integrations')] }
  const canReadSocial = { preHandler: [requirePermission('social.read', { scope: 'org' }), requireEntitlement('social')] }
  const canWriteSocial = { preHandler: [requirePermission('social.write', { scope: 'org' }), requireEntitlement('social')] }
  const canGenerate = {
    preHandler: [
      requirePermission('social.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('social'),
    ],
  }

  app.get('/', canReadIntegration, ctrl.status)
  app.post('/connect', canManageIntegration, ctrl.connect as any)
  app.get('/analytics', canReadSocial, ctrl.analytics)
  app.post('/posts', canWriteSocial, ctrl.createPost as any)
  app.post('/ai/generate', canGenerate, ctrl.generatePlan as any)
}
