import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/revenueIntelligence.controller'

/**
 * Producto transversal de ventas: todas las lecturas y mutaciones se filtran
 * por la organización del JWT. Las decisiones de memoria y de gobierno son
 * deliberadamente administrativas para preservar la aprobación humana.
 */
export async function revenueIntelligenceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canReadNextActions = { preHandler: [requirePermission('leads.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canWriteNextActions = { preHandler: [requirePermission('tasks.write', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canReadExperiments = { preHandler: [requirePermission('experiments.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canWriteExperiments = { preHandler: [requirePermission('experiments.write', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canStartExperiments = { preHandler: [requirePermission('experiments.start', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canReadMemory = { preHandler: [requirePermission('memory.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canProposeMemory = { preHandler: [requirePermission('memory.propose', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canApproveMemory = { preHandler: [requirePermission('memory.approve', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canReadGovernance = { preHandler: [requirePermission('governance.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canWriteGovernance = { preHandler: [requirePermission('governance.write', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canReadBusinessIntelligence = { preHandler: [requirePermission('organization.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canReadInvestigations = { preHandler: [requirePermission('organization.read', { scope: 'org' }), requirePermission('jobs.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')] }
  const canResearch = { preHandler: [requirePermission('organization.read', { scope: 'org' }), requirePermission('costs.request', { scope: 'org' }), requireEntitlement('revenue_intelligence'), requireEntitlement('microapps')] }

  app.get('/business-context', canReadBusinessIntelligence, ctrl.getBusinessContext)
  app.get('/investigations', canReadInvestigations, ctrl.listInvestigations)
  app.post('/investigations', canResearch, ctrl.startInvestigation)

  app.get('/next-actions', canReadNextActions, ctrl.listNextActions)
  app.post('/next-actions/refresh', canWriteNextActions, ctrl.refreshNextActions)
  app.patch<{ Params: { id: string } }>('/next-actions/:id', canWriteNextActions, ctrl.updateNextAction)

  app.get('/experiments', canReadExperiments, ctrl.listExperiments)
  app.post('/experiments', canWriteExperiments, ctrl.createExperiment)
  app.get<{ Params: { id: string } }>('/experiments/:id', canReadExperiments, ctrl.getExperiment)
  app.patch<{ Params: { id: string } }>('/experiments/:id', canWriteExperiments, ctrl.updateExperiment)
  app.post<{ Params: { id: string } }>('/experiments/:id/start', canStartExperiments, ctrl.startExperiment)
  app.post<{ Params: { id: string } }>('/experiments/:id/assign', canWriteExperiments, ctrl.assignVariant)
  app.post<{ Params: { id: string } }>('/experiments/:id/conversions', canWriteExperiments, ctrl.recordConversion)

  app.get('/memory-proposals', canReadMemory, ctrl.listMemoryProposals)
  app.post('/memory-proposals', canProposeMemory, ctrl.createMemoryProposal)
  app.patch<{ Params: { id: string } }>('/memory-proposals/:id/review', canApproveMemory, ctrl.reviewMemoryProposal)

  app.get('/governance/overview', canReadGovernance, ctrl.governanceOverview)
  app.get('/governance/policies', canReadGovernance, ctrl.listGovernancePolicies)
  app.get<{ Params: { key: string } }>('/governance/policies/:key', canReadGovernance, ctrl.getGovernancePolicy)
  app.put<{ Params: { key: string } }>('/governance/policies/:key', canWriteGovernance, ctrl.updateGovernancePolicy)
}
