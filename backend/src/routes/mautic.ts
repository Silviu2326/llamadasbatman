import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/mautic.controller'

export async function mauticRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/', ctrl.overview)
  app.get('/campaigns', ctrl.listCampaigns)
  app.post<{ Body: { name: string; description?: string } }>(
    '/campaigns', { preHandler: authorize(['admin', 'agent']) }, ctrl.createCampaign
  )
  app.get('/templates', ctrl.listTemplates)
  app.post<{ Params: { id: string }; Body: { emailId: string; testContactId: string } }>(
    '/campaigns/:id/send-test', { preHandler: authorize(['admin', 'agent']) }, ctrl.sendTestEmail
  )
  app.post<{ Params: { id: string }; Body: { publishUp?: string; publishDown?: string } }>(
    '/campaigns/:id/schedule', { preHandler: authorize(['admin', 'agent']) }, ctrl.scheduleCampaign
  )
  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/pause', { preHandler: authorize(['admin', 'agent']) }, ctrl.pauseCampaign
  )
  app.get('/campaigns/:id/stats', ctrl.getCampaignStats)
}
