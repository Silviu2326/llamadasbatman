import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/auth.controller'

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>('/login', {
    preHandler: app.rateLimit({
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: request => `auth-login:${request.ip}`,
      errorResponseBuilder: () => ({ error: 'Demasiados intentos. Espera antes de volver a intentarlo.' }),
    }),
  }, ctrl.login)
  app.post('/refresh', ctrl.refresh)
  app.post('/logout', { preHandler: authenticate }, ctrl.logout)
}
