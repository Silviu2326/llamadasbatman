import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/whiteLabel.controller'

export async function whiteLabelRoutes(app: FastifyInstance) {
  app.get('/public/bootstrap', ctrl.publicBootstrap)
  app.post('/public/message', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, ctrl.publicMessage)
  app.get('/public/brand', ctrl.publicBrand)
  app.get('/public/widget.js', ctrl.widgetScript)
  app.get('/public/widget', ctrl.widget)
  app.get('/public/card', ctrl.widget)

  // El hook privado no debe alcanzar las rutas /public.
  await app.register(async privateApp => {
    privateApp.addHook('preHandler', authenticate)
    const read = { preHandler: [requirePermission('organization.read', { scope: 'org' }), requireEntitlement('multiworkspace')] }
    const manage = { preHandler: [requirePermission('organization.manage', { scope: 'org' }), requireEntitlement('multiworkspace')] }
    privateApp.get('/brand', read, ctrl.ownBrand)
    privateApp.put('/brand', manage, ctrl.saveOwnBrand)
    privateApp.get('/billing', read, ctrl.billingSummary)
    privateApp.get('/clients', read, ctrl.list)
    privateApp.post('/clients', manage, ctrl.create)
    privateApp.get('/clients/:id', read, ctrl.get)
    privateApp.patch('/clients/:id', manage, ctrl.update)
    privateApp.put('/clients/:id/brand', manage, ctrl.brand)
    privateApp.post('/clients/:id/widget-key/rotate', manage, ctrl.rotateKey)
    privateApp.post('/clients/:id/training', manage, ctrl.train)
    privateApp.post('/clients/:id/documents', manage, ctrl.document)
    privateApp.get('/clients/:id/channels/telegram', read, ctrl.telegramStatus)
    privateApp.put('/clients/:id/channels/telegram', manage, ctrl.telegramConnect)
    privateApp.delete('/clients/:id/channels/telegram', manage, ctrl.telegramDisconnect)
  })
}
