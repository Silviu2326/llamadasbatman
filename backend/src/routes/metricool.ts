import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/metricool.controller'

/** Metricool is the provider used for organic social posts. */
export async function metricoolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/', { preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')] }, ctrl.status)
  app.post('/connect', { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('integrations')] }, ctrl.connect as any)
  app.get('/analytics', { preHandler: [requirePermission('social.read', { scope: 'org' }), requireEntitlement('social')] }, ctrl.analytics)
  app.post('/posts', { preHandler: [requirePermission('social.write', { scope: 'org' }), requireEntitlement('social')] }, ctrl.createPost as any)
  app.post('/ai/generate', {
    preHandler: [
      requirePermission('social.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('social'),
    ],
  }, ctrl.generatePlan as any)
  app.post('/media', {
    // 8 MB de imagen en base64 + envoltorio JSON.
    bodyLimit: 12 * 1024 * 1024,
    preHandler: [requirePermission('social.write', { scope: 'org' }), requireEntitlement('social')],
  }, ctrl.uploadImage as any)
  app.post('/ai/image', {
    preHandler: [
      requirePermission('social.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('social'),
    ],
  }, ctrl.generateImage as any)
}
