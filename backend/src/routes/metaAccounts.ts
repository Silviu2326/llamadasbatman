import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/metaAccounts.controller'

export async function metaAccountsRoutes(app: FastifyInstance) {
  // oauth/callback es público — lo llama el navegador redirigido por Meta,
  // no lleva el JWT de la app. Todo lo demás sí requiere sesión.
  const canRead = {
    preHandler: [authenticate, requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')],
  }
  const canMutate = {
    preHandler: [authenticate, requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('integrations')],
  }
  const canSetBudgetCap = {
    preHandler: [authenticate, requirePermission('costs.request', { scope: 'org' }), requireEntitlement('integrations')],
  }

  app.get('/oauth/start-url', canMutate, ctrl.oauthStartUrl)
  app.get('/oauth/start', canMutate, ctrl.oauthStart)
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/oauth/callback',
    ctrl.oauthCallback
  )
  app.get('/', canRead, ctrl.status)
  // Selector de cuenta publicitaria y página tras el OAuth: las opciones se
  // piden a Graph con el token conectado; la selección solo admite ids de esa lista.
  app.get('/options', canRead, ctrl.options)
  app.post<{ Body: unknown }>('/select', canMutate, ctrl.select)
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/:id/budget-cap',
    canSetBudgetCap,
    ctrl.budgetCap
  )
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/:id/pixel-id',
    canMutate,
    ctrl.pixelId
  )
  app.delete<{ Params: { id: string } }>('/:id', canMutate, ctrl.disconnect)
}
