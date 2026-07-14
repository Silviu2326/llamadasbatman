import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/pipeline.controller'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.listByStage)
  app.post('/', { preHandler: authorize(['admin', 'agent']) }, ctrl.create as any)
  // static routes before /:id to avoid param capture
  app.get('/insights',   ctrl.insights)
  app.get('/prediction', ctrl.prediction)
  app.get('/actions',    ctrl.actions)
  // OP-103: vista de lista (alternativa al kanban de GET /).
  app.get('/list', ctrl.list as any)
  // OP-107: forecast agregado por moneda.
  app.get('/forecast', ctrl.forecast as any)
  // OP-109: catálogo de productos (compartido entre oportunidades).
  app.get('/products',  ctrl.listProducts)
  app.post('/products', { preHandler: authorize(['admin', 'agent']) }, ctrl.createProduct as any)
  app.get('/:id', ctrl.get)
  app.put('/:id', { preHandler: authorize(['admin', 'agent']) }, ctrl.update as any)
  app.post('/:id/move-stage', { preHandler: authorize(['admin', 'agent']) }, ctrl.moveStage as any)
  // OP-104: ganar/perder quedan al alcance de admin y agent (como el resto
  // de mutaciones de pipeline); reabrir revierte un cierre ya dado por
  // definitivo, así que se restringe a admin.
  app.post('/:id/mark-won',  { preHandler: authorize(['admin', 'agent']) }, ctrl.markWon as any)
  app.post('/:id/mark-lost', { preHandler: authorize(['admin', 'agent']) }, ctrl.markLost as any)
  app.post('/:id/reopen',    { preHandler: authorize(['admin']) }, ctrl.reopen as any)
  app.get('/:id/history', ctrl.history as any)
  // OP-107: fijar manualmente la categoría de forecast de una oportunidad.
  app.put('/:id/forecast-category', { preHandler: authorize(['admin', 'agent']) }, ctrl.updateForecastCategory as any)
  // OP-108: contactos / roles de compra de la oportunidad.
  app.get('/:id/contacts',    ctrl.listContacts as any)
  app.post('/:id/contacts',   { preHandler: authorize(['admin', 'agent']) }, ctrl.addContact as any)
  app.delete('/:id/contacts/:leadId', { preHandler: authorize(['admin', 'agent']) }, ctrl.removeContact as any)
  // OP-109: líneas de producto de la oportunidad.
  app.get('/:id/line-items',  ctrl.listLineItems as any)
  app.post('/:id/line-items', { preHandler: authorize(['admin', 'agent']) }, ctrl.addLineItem as any)
  app.delete('/:id/line-items/:lineItemId', { preHandler: authorize(['admin', 'agent']) }, ctrl.removeLineItem as any)
}
