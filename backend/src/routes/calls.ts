import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authenticateVoiceService } from '../middlewares/authenticateVoiceService'
import * as ctrl from '../controllers/calls.controller'

export async function callsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, ctrl.list)
  app.get('/live', { preHandler: authenticate }, ctrl.live)
  app.get('/:id', { preHandler: authenticate }, ctrl.get)
  app.post('/ingest', { preHandler: authenticateVoiceService }, ctrl.ingest)
}
