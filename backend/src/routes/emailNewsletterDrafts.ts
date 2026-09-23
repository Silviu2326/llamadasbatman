import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as drafts from '../controllers/emailNewsletterDrafts.controller'

export async function emailNewsletterDraftsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const read = { preHandler: [requirePermission('campaigns.read', { scope: 'org' }), requireEntitlement('email_marketing')] }
  const write = { preHandler: [requirePermission('campaigns.write', { scope: 'org' }), requireEntitlement('email_marketing')] }
  app.get('/', read, drafts.list)
  app.post<{ Body: unknown }>('/', write, drafts.create)
  app.put<{ Params: { id: string }; Body: unknown }>('/:id', write, drafts.update)
  app.delete<{ Params: { id: string } }>('/:id', write, drafts.remove)
}


