import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/developer.controller'

/**
 * Portal de API pública. No estrena una superficie REST paralela: la API que se
 * revende es la misma que usa la interfaz, y una clave sólo es otra forma de
 * autenticarse en ella. Aquí viven la gestión de claves, las suscripciones a
 * eventos y el catálogo de topics.
 */
export async function developerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // whoami y el catálogo son legibles por cualquier sesión autenticada: son la
  // comprobación de credenciales que hace Zapier al conectar la cuenta.
  app.get('/whoami', ctrl.whoami)
  app.get('/topics', ctrl.topics)

  const read = { preHandler: requirePermission('integrations.read', { scope: 'org' }) }
  const manage = { preHandler: requirePermission('integrations.manage', { scope: 'org' }) }

  app.get('/keys', read, ctrl.listKeys)
  app.post('/keys', manage, ctrl.createKey)
  app.delete('/keys/:id', manage, ctrl.revokeKey)

  app.get('/webhooks', read, ctrl.listWebhooks)
  app.post('/webhooks', manage, ctrl.createWebhook)
  app.delete('/webhooks/:id', manage, ctrl.deleteWebhook)
}
