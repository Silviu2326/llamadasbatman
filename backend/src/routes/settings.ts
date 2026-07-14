import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/settings.controller'

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/me', ctrl.getMe)
  app.put('/me', ctrl.updateMe)
  app.put('/password', ctrl.changePassword)
  app.get('/organization', ctrl.getOrganization)
  app.put('/organization', ctrl.updateOrganization)
  app.get('/integrations', ctrl.getIntegrations)
}
