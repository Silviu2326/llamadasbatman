import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/pipeline.controller'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canReadOwned = { preHandler: [requirePermission('pipeline.read', { scope: 'own' }), requireEntitlement('crm')] }
  const canReadOrg = { preHandler: [requirePermission('pipeline.read', { scope: 'org' }), requireEntitlement('crm')] }
  const canWriteOwned = { preHandler: [requirePermission('pipeline.write', { scope: 'own' }), requireEntitlement('crm')] }
  const canWriteOrg = { preHandler: [requirePermission('pipeline.write', { scope: 'org' }), requireEntitlement('crm')] }
  const canReopenOwned = { preHandler: [requirePermission('pipeline.reopen', { scope: 'own' }), requireEntitlement('crm')] }

  app.get('/', canReadOwned, ctrl.listByStage)
  app.post('/', canWriteOwned, ctrl.create as any)
  // static routes before /:id to avoid param capture
  app.get('/insights', canReadOrg, ctrl.insights)
  app.get('/prediction', canReadOrg, ctrl.prediction)
  app.get('/actions', canReadOrg, ctrl.actions)
  // OP-103: vista de lista (alternativa al kanban de GET /).
  app.get('/list', canReadOwned, ctrl.list as any)
  // OP-107: forecast agregado por moneda.
  app.get('/forecast', canReadOwned, ctrl.forecast as any)
  // OP-109: catálogo de productos (compartido entre oportunidades).
  app.get('/products', canReadOrg, ctrl.listProducts)
  app.post('/products', canWriteOrg, ctrl.createProduct as any)
  app.get('/:id', canReadOwned, ctrl.get as any)
  app.put('/:id', canWriteOwned, ctrl.update as any)
  app.post('/:id/move-stage', canWriteOwned, ctrl.moveStage as any)
  // OP-104: ganar/perder quedan al alcance de admin y agent (como el resto
  // de mutaciones de pipeline); reabrir revierte un cierre ya dado por
  // definitivo, así que se restringe a admin.
  app.post('/:id/mark-won', canWriteOwned, ctrl.markWon as any)
  app.post('/:id/mark-lost', canWriteOwned, ctrl.markLost as any)
  app.post('/:id/reopen', canReopenOwned, ctrl.reopen as any)
  app.get('/:id/history', canReadOwned, ctrl.history as any)
  // OP-107: fijar manualmente la categoría de forecast de una oportunidad.
  app.put('/:id/forecast-category', canWriteOwned, ctrl.updateForecastCategory as any)
  // OP-108: contactos / roles de compra de la oportunidad.
  app.get('/:id/contacts', canReadOrg, ctrl.listContacts as any)
  app.post('/:id/contacts', canWriteOrg, ctrl.addContact as any)
  app.delete('/:id/contacts/:leadId', canWriteOrg, ctrl.removeContact as any)
  // OP-109: líneas de producto de la oportunidad.
  app.get('/:id/line-items', canReadOrg, ctrl.listLineItems as any)
  app.post('/:id/line-items', canWriteOrg, ctrl.addLineItem as any)
  app.delete('/:id/line-items/:lineItemId', canWriteOrg, ctrl.removeLineItem as any)
}
