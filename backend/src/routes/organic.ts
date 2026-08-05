import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/organic.controller'

export async function organicRoutes(app: FastifyInstance) {
  const canRead = { preHandler: [authenticate, requirePermission('organic.read', { scope: 'org' }), requireEntitlement('organic')] }
  const canManage = { preHandler: [authenticate, requirePermission('organic.manage', { scope: 'org' }), requireEntitlement('organic')] }
  const canReadIntegrations = { preHandler: [authenticate, requirePermission('organic.integrations.read', { scope: 'org' }), requireEntitlement('organic')] }
  const canManageIntegrations = { preHandler: [authenticate, requirePermission('organic.integrations.manage', { scope: 'org' }), requireEntitlement('organic')] }

  app.get<{ Querystring: { period?: string; projectId?: string } }>('/overview', canRead, ctrl.overview)

  // Onboarding adaptativo. Investigar lee una web externa y crear el proyecto
  // cambia la configuración: ambas exigen permiso de escritura.
  app.get('/onboarding', canRead, ctrl.getOnboarding)
  app.put<{ Body: unknown }>('/onboarding', canManage, ctrl.saveOnboarding)
  app.post<{ Body: { website?: string } }>('/onboarding/investigate', canManage, ctrl.investigateBusiness)
  app.post<{ Body: unknown }>('/onboarding/complete', canManage, ctrl.completeOnboarding)

  // Cola priorizada y despacho. Despachar y descartar cambian el estado de la
  // recomendación, así que exigen permiso de gestión.
  // Conectores verticales. Dar de alta uno guarda credenciales del cliente, de
  // ahi el permiso de gestion; la ingesta la llama el sistema del cliente.
  app.get('/connectors', canRead, ctrl.listConnectors)
  app.post<{ Body: unknown }>('/connectors', canManage, ctrl.createConnector)
  app.post<{ Params: { id: string }; Body: unknown }>('/connectors/:id/events', canManage, ctrl.ingestConnectorEvents)

  // Sala de autonomía (§9). Leer el estado es de lectura; cambiar el nivel,
  // aprobar una acción o promocionar un tipo son actos de gobierno.
  app.get('/autonomy', canRead, ctrl.getAutonomy)
  app.put<{ Body: unknown }>('/autonomy', canManage, ctrl.updateAutonomy)
  app.post('/autonomy/run', canManage, ctrl.runAutonomyPass)
  app.post<{ Params: { id: string } }>('/autonomy/decisions/:id/approve', canManage, ctrl.approveAutonomyDecision)
  app.post<{ Params: { id: string }; Body: unknown }>('/autonomy/decisions/:id/reject', canManage, ctrl.rejectAutonomyDecision)
  app.post<{ Params: { kind: string } }>('/autonomy/kinds/:kind/promote', canManage, ctrl.promoteAutonomyKind)
  app.post<{ Params: { kind: string }; Body: unknown }>('/autonomy/kinds/:kind/demote', canManage, ctrl.demoteAutonomyKind)

  app.get('/recommendations', canRead, ctrl.listRecommendations)
  app.post('/recommendations/refresh', canManage, ctrl.runDiagnostics)
  app.post<{ Params: { id: string } }>('/recommendations/:id/dispatch', canManage, ctrl.dispatchRecommendation)
  app.post<{ Params: { id: string }; Body: unknown }>('/recommendations/:id/dismiss', canManage, ctrl.dismissRecommendation)
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
  app.post<{ Body: unknown }>('/integrations/ga4/sync', canManageIntegrations, ctrl.syncGa4)
  app.post<{ Body: unknown }>('/integrations/google_business_profile/sync', canManageIntegrations, ctrl.syncBusinessProfile)
  app.post('/project', canManage, ctrl.createProject as any)
  app.patch('/project', canManage, ctrl.updateProject as any)
  app.post('/assets', canManage, ctrl.createAsset as any)
  app.post('/opportunities/:opportunityId/actions', canManage, ctrl.createAction as any)
}
