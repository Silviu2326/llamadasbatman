import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/landings.controller'

/**
 * Panel de landings. No confundir con `routes/landing.ts`, que es la landing
 * pública y no lleva autenticación.
 */
export async function landingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('campaigns.read', { scope: 'org' }), requireEntitlement('growth')] }
  const canWrite = { preHandler: [requirePermission('campaigns.write', { scope: 'org' }), requireEntitlement('growth')] }

  // Activar una variante o cerrar un experimento reescribe lo que ven los
  // clientes: son decisiones de experimentación, no de edición de campaña.
  const canExperiment = { preHandler: [requirePermission('experiments.start', { scope: 'org' }), requireEntitlement('growth')] }

  app.get('/overview', canRead, ctrl.overview)
  app.get<{ Querystring: { landingKey?: string } }>('/variants', canRead, ctrl.listVariants)
  app.post<{ Body: { landingKey?: string; diagnosisType?: string } }>('/variants', canWrite, ctrl.generateVariant)
  app.post<{ Params: { variantId: string } }>('/variants/:variantId/request-approval', canWrite, ctrl.requestApproval)
  app.post<{ Params: { variantId: string }; Body: { reason?: string } }>('/variants/:variantId/discard', canWrite, ctrl.discardVariant)
  app.post<{ Params: { variantId: string }; Body: { durationDays?: number; primaryMetric?: string } }>('/variants/:variantId/start', canExperiment, ctrl.startExperiment)
  app.get<{ Params: { experimentId: string } }>('/experiments/:experimentId', canRead, ctrl.experimentResults)
  app.post<{ Params: { experimentId: string } }>('/experiments/:experimentId/conclude', canExperiment, ctrl.concludeExperiment)
  // Conceder autonomía o apagar el modo sombra deja que el sistema modifique
  // landings sin intervención humana: es gobierno, no edición de campaña.
  const canGovern = { preHandler: [requirePermission('governance.write', { scope: 'org' }), requireEntitlement('growth')] }

  app.get<{ Querystring: { landingKey?: string } }>('/autonomy', canRead, ctrl.autonomyState)
  app.put<{ Body: Record<string, unknown> }>('/autonomy', canGovern, ctrl.updateAutonomy)
  app.post('/autonomy/run', canGovern, ctrl.runAutonomy)
  app.get<{ Params: { landingKey: string } }>('/report/:landingKey', canRead, ctrl.report)
  app.get('/social-proof/candidates', canRead, ctrl.socialProofCandidates)
  app.post<{ Body: { leadId?: string; quote?: string; attribution?: string } }>('/social-proof/request', canWrite, ctrl.requestSocialProof)
  app.post('/refresh', canWrite, ctrl.refresh)
  // Va al final: `/:landingKey` capturaría «variants» y «experiments» si se
  // registrase antes que ellas.
  app.get<{ Params: { landingKey: string } }>('/:landingKey', canRead, ctrl.detail)
}
