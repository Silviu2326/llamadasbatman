import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/mautic.controller'

export async function mauticRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/', ctrl.overview)
}
