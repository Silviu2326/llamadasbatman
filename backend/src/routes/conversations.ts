import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as controller from '../controllers/conversations.controller'

export async function conversationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/', controller.list as any)
  app.get('/templates', controller.templates as any)
  app.get('/:id', controller.get as any)
  app.post('/:id/messages', controller.sendMessage as any)
  app.put('/:id', controller.update as any)
  app.post('/:id/takeover', controller.takeover as any)
  app.post('/:id/suggest', controller.suggest as any)
  app.post('/:conversationId/next-actions/:id/accept', controller.acceptNextAction as any)
  app.post('/:conversationId/next-actions/:id/dismiss', controller.dismissNextAction as any)
}
