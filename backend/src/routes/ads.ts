import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/ads.controller'
import * as plan from '../controllers/adsPlan.controller'

export async function adsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('ads.read', { scope: 'org' }), requireEntitlement('ads')] }
  const canMutate = { preHandler: [requirePermission('ads.write', { scope: 'org' }), requireEntitlement('ads')] }
  const canUsePaidProvider = {
    preHandler: [
      requirePermission('ads.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('ads'),
    ],
  }

  // strategy/wizard llaman a proveedores de IA y wizard crea campañas.
  app.post<{ Body: unknown }>('/strategy', canUsePaidProvider, ctrl.strategy)
  app.get('/overview', canRead, ctrl.overview)
  // Recomprobar integridad es una lectura contra la propia base de datos: no
  // gasta cuota de Meta ni modifica campañas, así que basta con ads.read.
  app.get('/data-quality', canRead, ctrl.dataQuality)
  app.post('/data-quality/refresh', canRead, ctrl.refreshDataQuality)

  // Fase 3. Aprobar o rechazar es una decisión de gobierno sobre el gasto, así
  // que exige permiso de escritura aunque todavía no ejecute nada en Meta.
  app.get('/policy', canRead, ctrl.getPolicy)
  app.put<{ Body: unknown }>('/policy', canMutate, ctrl.updatePolicy)
  // Parar la autonomía debe poder hacerlo cualquiera que pueda leer Ads: un
  // freno de emergencia con permisos estrictos no es un freno de emergencia.
  app.post<{ Body: unknown }>('/policy/stop', canRead, ctrl.stopAutonomy)
  app.get('/actions', canRead, ctrl.listActions)
  app.get<{ Querystring: { campaignId?: string; limit?: string } }>('/audit', canRead, ctrl.auditTrail)
  app.get('/actions/pending', canRead, ctrl.listPendingActions)
  // Ejecutar y compensar mueven dinero real en Meta: exigen escritura y el
  // permiso de gasto, igual que publicar o activar una campaña.
  app.post<{ Params: { id: string }; Querystring: { dryRun?: string } }>('/actions/:id/execute', canUsePaidProvider, ctrl.executeAction)
  app.post<{ Params: { id: string } }>('/actions/:id/compensate', canUsePaidProvider, ctrl.compensateAction)
  app.post<{ Params: { id: string }; Body: unknown }>('/decisions/:id/approve', canMutate, ctrl.approveDecision)
  app.post<{ Params: { id: string }; Body: unknown }>('/decisions/:id/reject', canMutate, ctrl.rejectDecision)

  // Fase 5: autonomía por regla. Promover amplía lo que el sistema hace solo,
  // así que exige escritura; degradar no, para que frenar sea siempre fácil.
  app.get('/rules', canRead, ctrl.listRuleAutonomy)
  app.post<{ Params: { ruleKey: string }; Body: unknown }>('/rules/:ruleKey/promote', canMutate, ctrl.promoteRule)
  app.post<{ Params: { ruleKey: string } }>('/rules/:ruleKey/demote', canRead, ctrl.demoteRule)

  // Fase 6: experimentos, bandits y reparto por rendimiento marginal.
  app.get('/experiments', canRead, ctrl.listExperiments)
  app.post<{ Body: unknown }>('/experiments', canMutate, ctrl.createExperiment)
  app.get<{ Params: { id: string } }>('/experiments/:id/allocation', canRead, ctrl.experimentAllocation)
  app.post<{ Params: { id: string } }>('/experiments/:id/start', canMutate, ctrl.startExperiment)
  app.post<{ Params: { id: string } }>('/experiments/:id/conclude', canMutate, ctrl.concludeExperiment)
  app.get('/budget-allocation', canRead, ctrl.budgetAllocation)
  app.get('/draft', canRead, ctrl.getDraft)
  app.put<{ Body: unknown }>('/draft', canMutate, ctrl.saveDraft)

  app.post<{ Body: unknown }>(
    '/wizard',
    { preHandler: [requirePermission('ads.write', { scope: 'org' }), requirePermission('costs.request', { scope: 'org' }), requireEntitlement('ads'), requireEntitlement('ads', { limit: { resource: 'campaigns' } })] },
    ctrl.wizard
  )
  app.get<{ Params: { id: string } }>('/campaigns/:id/status', canRead, ctrl.campaignStatus)
  app.get<{ Params: { id: string } }>('/campaigns/:id/insights', canRead, ctrl.listInsights)
  app.get<{ Params: { id: string } }>('/campaigns/:id/attribution', canRead, ctrl.campaignAttribution)
  app.get<{ Params: { id: string } }>('/campaigns/:id/decisions', canRead, ctrl.campaignDecisions)
  // Sincronizar consume cuota de Meta, de ahí el permiso de gasto.
  app.post('/sync', canUsePaidProvider, ctrl.syncNow)
  app.get<{ Params: { id: string } }>('/campaigns/:id/remote-status', canRead, ctrl.remoteStatus)
  app.post<{ Params: { id: string } }>('/campaigns/:id/publish', canUsePaidProvider, ctrl.publish)
  app.post<{ Params: { id: string } }>('/campaigns/:id/activate', canUsePaidProvider, ctrl.activate)
  app.post<{ Params: { id: string } }>('/campaigns/:id/pause', canMutate, ctrl.pause)
  app.put<{ Params: { id: string }; Body: { maxCostPerLeadCents: number } }>('/campaigns/:id/max-cpl', canMutate, ctrl.updateMaxCpl)

  // ─── Nivel de campaña global: plan, activaciones, audiencias y creatividades.
  // Todo va con las guardas existentes: leer el plan es leer Ads y componer la
  // estrategia es escribir Ads; nada de aquí toca Meta ni gasta dinero, así
  // que ninguna ruta exige costs.request.
  app.get('/global-campaigns', canRead, plan.listGlobalCampaigns)
  app.get<{ Querystring: { campaignId?: string } }>('/plan', canRead, plan.getPlan)
  app.post<{ Body: unknown }>('/activations', canMutate, plan.createActivation)
  app.put<{ Params: { id: string }; Body: unknown }>('/activations/:id', canMutate, plan.updateActivation)
  app.get<{ Querystring: { campaignId?: string; includeArchived?: string } }>('/audiences', canRead, plan.listAudiences)
  app.post<{ Body: unknown }>('/audiences', canMutate, plan.createAudience)
  app.put<{ Params: { id: string }; Body: unknown }>('/audiences/:id', canMutate, plan.updateAudience)
  app.post<{ Params: { id: string } }>('/audiences/:id/archive', canMutate, plan.archiveAudience)
  app.post<{ Body: unknown }>('/briefs', canMutate, plan.createBrief)
  app.put<{ Params: { id: string }; Body: unknown }>('/briefs/:id', canMutate, plan.updateBrief)
  app.post<{ Params: { id: string }; Body: unknown }>('/briefs/:id/status', canMutate, plan.setBriefStatus)
  app.post<{ Body: unknown }>('/creatives', canMutate, plan.createCreative)
  app.put<{ Params: { id: string }; Body: unknown }>('/creatives/:id', canMutate, plan.updateCreative)
  app.post<{ Params: { id: string } }>('/creatives/:id/submit', canMutate, plan.submitCreative)
  app.post<{ Params: { id: string } }>('/creatives/:id/approve', canMutate, plan.approveCreative)
  app.post<{ Params: { id: string }; Body: unknown }>('/creatives/:id/reject', canMutate, plan.rejectCreative)
}
