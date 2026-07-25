import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as controller from '../controllers/integrationCredentials.controller'

export async function integrationCredentialsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')] }
  const canManage = { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('integrations')] }
  app.get('/', canRead, controller.list)
  app.put<{ Params: { provider: string } }>('/:provider', canManage, controller.put as any)
  app.delete<{ Params: { provider: string; slot?: string } }>('/:provider/:slot', canManage, controller.remove as any)
}
