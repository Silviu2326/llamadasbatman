import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/mautic.controller'

export async function mauticRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canReadCampaigns = { preHandler: [requirePermission('campaigns.read', { scope: 'org' }), requireEntitlement('email_marketing')] }
  const canWriteCampaigns = { preHandler: [requirePermission('campaigns.write', { scope: 'org' }), requireEntitlement('email_marketing')] }
  const canPublishCampaigns = { preHandler: [requirePermission('campaigns.publish', { scope: 'org' }), requireEntitlement('email_marketing')] }
  const canReadIntegration = { preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('email_marketing')] }
  const canManageIntegration = { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('email_marketing')] }
  app.get('/', canReadCampaigns, ctrl.overview)
  app.get('/campaigns', canReadCampaigns, ctrl.listCampaigns)
  app.post<{ Body: { name: string; description?: string } }>(
    '/campaigns', canWriteCampaigns, ctrl.createCampaign
  )
  app.get('/templates', canReadIntegration, ctrl.listTemplates)
  app.get('/templates/unclaimed', canManageIntegration, ctrl.listUnclaimedTemplates)
  app.post<{ Params: { id: string }; Body: { name: string } }>(
    '/templates/:id/claim', canManageIntegration, ctrl.claimTemplate
  )
  app.post<{ Params: { id: string }; Body: { emailId: string; testContactId: string } }>(
    '/campaigns/:id/send-test', {
      preHandler: [
        requirePermission('campaigns.publish', { scope: 'org' }),
        requirePermission('costs.request', { scope: 'org' }),
        requireEntitlement('email_marketing'),
      ],
    }, ctrl.sendTestEmail
  )
  app.post<{ Params: { id: string }; Body: { publishUp?: string; publishDown?: string } }>(
    '/campaigns/:id/schedule', canPublishCampaigns, ctrl.scheduleCampaign
  )
  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/pause', canPublishCampaigns, ctrl.pauseCampaign
  )
  app.get('/campaigns/:id/stats', canReadCampaigns, ctrl.getCampaignStats as any)
}
