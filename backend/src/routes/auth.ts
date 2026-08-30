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
  // Alta self-service. Rate limit más estrecho que el login: crear
  // organizaciones es más caro que fallar una contraseña.
  app.post('/register', {
    preHandler: app.rateLimit({
      max: 5,
      timeWindow: '1 hour',
      keyGenerator: request => `auth-register:${request.ip}`,
      errorResponseBuilder: () => ({ error: 'Demasiadas altas desde esta conexión. Inténtalo más tarde.' }),
    }),
  }, ctrl.register)
  app.post('/refresh', ctrl.refresh)
  app.post('/logout', { preHandler: authenticate }, ctrl.logout)
  app.get('/organizations', { preHandler: authenticate }, ctrl.organizations)
  app.post('/select-organization', { preHandler: authenticate }, ctrl.selectOrganization)

  // Reseteo de contraseña. Mismo rate limit que el login: son la misma
  // superficie de fuerza bruta y de enumeración de cuentas.
  const resetRateLimit = {
    preHandler: app.rateLimit({
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: request => `auth-reset:${request.ip}`,
      errorResponseBuilder: () => ({ error: 'Demasiados intentos. Espera antes de volver a intentarlo.' }),
    }),
  }
  app.post<{ Body: { email?: string } }>('/forgot-password', resetRateLimit, ctrl.forgotPassword)
  app.post<{ Body: { token?: string; password?: string } }>('/reset-password', resetRateLimit, ctrl.resetPasswordHandler)
}
