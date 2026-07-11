import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/metaAccounts.controller'

export async function metaAccountsRoutes(app: FastifyInstance) {
  // oauth/callback es público — lo llama el navegador redirigido por Meta,
  // no lleva el JWT de la app. Todo lo demás sí requiere sesión.
  app.get('/oauth/start-url', { preHandler: authenticate }, ctrl.oauthStartUrl)
  app.get('/oauth/start', { preHandler: authenticate }, ctrl.oauthStart)
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/oauth/callback',
    ctrl.oauthCallback
  )
  app.get('/', { preHandler: authenticate }, ctrl.status)
  app.put<{ Params: { id: string }; Body: { dailyBudgetCapCents: number } }>(
    '/:id/budget-cap',
    { preHandler: authenticate },
    ctrl.budgetCap
  )
  app.put<{ Params: { id: string }; Body: { metaPixelId: string } }>(
    '/:id/pixel-id',
    { preHandler: authenticate },
    ctrl.pixelId
  )
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, ctrl.disconnect)
}
