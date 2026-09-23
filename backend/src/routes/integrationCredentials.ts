import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as controller from '../controllers/integrationCredentials.controller'

export async function integrationCredentialsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('integrations.read', { scope: 'org' }), requireEntitlement('integrations')] }
  const canManage = { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requireEntitlement('integrations')] }
  app.get('/', canRead, controller.list)
  // Catálogo del Centro de conexiones: registro + legacy con estado y consumo.
  app.get('/catalog', canRead, controller.catalog)
  app.get('/resend/inbound-webhook', canRead, controller.resendInboundWebhook)
  app.put<{ Params: { provider: string } }>('/:provider', canManage, controller.put as any)
  // Prueba de conexión (03-PROVEEDORES §4.3): ejecuta testConnection del
  // descriptor con la credencial descifrada y actualiza status/lastError.
  app.post<{ Params: { provider: string } }>('/:provider/test', canManage, controller.testProvider as any)
  app.delete<{ Params: { provider: string; slot?: string } }>('/:provider/:slot', canManage, controller.remove as any)
}
