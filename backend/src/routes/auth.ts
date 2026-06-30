import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/auth.controller'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', ctrl.login)
  app.post('/refresh', ctrl.refresh)
  app.post('/logout', { preHandler: authenticate }, ctrl.logout)
}
