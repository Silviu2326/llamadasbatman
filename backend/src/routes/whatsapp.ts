import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as controller from '../controllers/whatsapp.controller'

/** Register with the prefixes used by Twilio: /inbound, /status. */
export async function whatsappRoutes(app: FastifyInstance) {
  app.post('/inbound', controller.inbound)
  app.post('/status', controller.status)
  app.post('/send', { preHandler: authenticate }, controller.send)
}
