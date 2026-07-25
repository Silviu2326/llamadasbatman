import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as controller from '../controllers/whatsapp.controller'

/** Register with the prefixes used by Twilio: /inbound, /status. */
export async function whatsappRoutes(app: FastifyInstance) {
  app.post('/inbound', controller.inbound)
  app.post('/status', controller.status)
  app.post('/send', {
    preHandler: [
      authenticate,
      requirePermission('conversations.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
    ],
  }, controller.send)
}
