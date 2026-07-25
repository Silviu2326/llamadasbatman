import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/organic.controller'

export async function organicRoutes(app: FastifyInstance) {
  const canRead = { preHandler: [authenticate, requirePermission('organic.read', { scope: 'org' }), requireEntitlement('organic')] }
  const canManage = { preHandler: [authenticate, requirePermission('organic.manage', { scope: 'org' }), requireEntitlement('organic')] }
  const canReadIntegrations = { preHandler: [authenticate, requirePermission('organic.integrations.read', { scope: 'org' }), requireEntitlement('organic')] }
  const canManageIntegrations = { preHandler: [authenticate, requirePermission('organic.integrations.manage', { scope: 'org' }), requireEntitlement('organic')] }

  app.get('/overview', canRead, ctrl.overview)
  app.get('/project', canRead, ctrl.getProject)
  app.get('/integrations', canReadIntegrations, ctrl.integrations)
  app.get<{ Params: { provider: string } }>('/integrations/:provider/status', canReadIntegrations, ctrl.integrationStatus)
  app.get<{ Params: { provider: string } }>('/integrations/:provider/oauth/start-url', canManageIntegrations, ctrl.oauthStartUrl)
  app.get<{ Params: { provider: string } }>('/integrations/:provider/oauth/start', canManageIntegrations, ctrl.oauthStart)
  // Google redirige aquí sin JWT; el state opaco de un solo uso autentica el callback.
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/integrations/:provider/oauth/callback',
    ctrl.oauthCallback,
  )
  app.post<{ Params: { provider: string } }>('/integrations/:provider/discover', canReadIntegrations, ctrl.discover)
  app.put<{ Params: { provider: string }; Body: unknown }>('/integrations/:provider/resource', canManageIntegrations, ctrl.configureResource)
  app.delete<{ Params: { provider: string } }>('/integrations/:provider', canManageIntegrations, ctrl.disconnectIntegration)
  app.post<{ Body: unknown }>('/integrations/search_console/sync', canManageIntegrations, ctrl.syncSearchConsole)
  app.post('/project', canManage, ctrl.createProject as any)
  app.patch('/project', canManage, ctrl.updateProject as any)
  app.post('/assets', canManage, ctrl.createAsset as any)
  app.post('/opportunities/:opportunityId/actions', canManage, ctrl.createAction as any)
}
