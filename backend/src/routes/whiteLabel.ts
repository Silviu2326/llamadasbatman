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

  app.addHook('preHandler', authenticate)
  const read = { preHandler: [requirePermission('organization.read', { scope: 'org' }), requireEntitlement('multiworkspace')] }
  const manage = { preHandler: [requirePermission('organization.manage', { scope: 'org' }), requireEntitlement('multiworkspace')] }
  app.get('/brand', read, ctrl.ownBrand)
  app.put('/brand', manage, ctrl.saveOwnBrand)
  app.get('/billing', read, ctrl.billingSummary)
  app.get('/clients', read, ctrl.list)
  app.post('/clients', manage, ctrl.create)
  app.get('/clients/:id', read, ctrl.get)
  app.patch('/clients/:id', manage, ctrl.update)
  app.put('/clients/:id/brand', manage, ctrl.brand)
  app.post('/clients/:id/widget-key/rotate', manage, ctrl.rotateKey)
  app.post('/clients/:id/training', manage, ctrl.train)
  app.post('/clients/:id/documents', manage, ctrl.document)
  app.get('/clients/:id/channels/telegram', read, ctrl.telegramStatus)
  app.put('/clients/:id/channels/telegram', manage, ctrl.telegramConnect)
  app.delete('/clients/:id/channels/telegram', manage, ctrl.telegramDisconnect)
}
