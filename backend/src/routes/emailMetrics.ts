import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/emailMetrics.controller'
import * as audienceCtrl from '../controllers/emailAudience.controller'

/** EM-108: solo lectura de métricas — cualquier rol autenticado. */
export async function emailMetricsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('campaigns.read', { scope: 'org' }) }

  app.get('/campaigns/:campaignId/metrics', canRead, ctrl.campaignMetrics as any)
  app.get('/campaigns/:campaignId/variants', canRead, ctrl.campaignVariants as any)
  app.get('/campaigns/:campaignId/revenue', canRead, ctrl.campaignRevenue as any)
  app.get('/overview', canRead, ctrl.overview as any)

  // EM-111: audiencia y seguimiento. La lista de suscriptores expone datos
  // personales del lead, así que se lee con `leads.read` además de
  // `campaigns.read`; darla de alta o de baja es cumplimiento y exige
  // `governance.write`, el mismo permiso que el centro de preferencias.
  const canReadAudience = {
    preHandler: [
      requirePermission('campaigns.read', { scope: 'org' }),
      requirePermission('leads.read', { scope: 'org' }),
    ],
  }
  const canManageConsent = { preHandler: requirePermission('governance.write', { scope: 'org' }) }

  app.get('/subscribers', canReadAudience, audienceCtrl.listSubscribers as any)
  app.get('/subscribers/summary', canReadAudience, audienceCtrl.subscriberSummary as any)
  app.put('/subscribers/:leadId', canManageConsent, audienceCtrl.updateSubscription as any)
  app.get('/deliveries', canReadAudience, audienceCtrl.listDeliveries as any)
}
