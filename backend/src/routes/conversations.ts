import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as controller from '../controllers/conversations.controller'

export async function conversationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('conversations.read', { scope: 'org' }) }
  const canMutate = { preHandler: requirePermission('conversations.write', { scope: 'org' }) }
  const canUsePaidMessaging = {
    preHandler: [
      requirePermission('conversations.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
    ],
  }
  app.get('/', canRead, controller.list as any)
  app.get('/templates', canRead, controller.templates as any)
  app.get('/:id', canRead, controller.get as any)
  app.post('/:id/messages', canUsePaidMessaging, controller.sendMessage as any)
  app.put('/:id', canMutate, controller.update as any)
  app.post('/:id/takeover', canMutate, controller.takeover as any)
  app.post('/:id/suggest', canUsePaidMessaging, controller.suggest as any)
  app.post('/:conversationId/next-actions/:id/accept', {
    preHandler: [
      requirePermission('conversations.write', { scope: 'org' }),
      requirePermission('tasks.write', { scope: 'org' }),
    ],
  }, controller.acceptNextAction as any)
  app.post('/:conversationId/next-actions/:id/dismiss', canMutate, controller.dismissNextAction as any)
}
