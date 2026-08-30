import { FastifyInstance } from 'fastify'
import * as ctrl from '../controllers/telegram.controller'

export async function telegramRoutes(app: FastifyInstance) {
  app.post('/webhook/:orgId', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, ctrl.webhook)
}
