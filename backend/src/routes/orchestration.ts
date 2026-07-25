import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as controller from '../controllers/orchestration.controller'

export async function orchestrationRoutes(app: FastifyInstance) {
  const canRead = { preHandler: [authenticate, requirePermission('dashboard.read', { scope: 'org' })] }
  const canApprove = { preHandler: [authenticate, requirePermission('costs.approve', { scope: 'org' })] }

  app.get('/actions/catalog', canRead, controller.catalog)
  app.post<{ Body: unknown }>('/plan', canRead, controller.createPlan)
  app.get<{ Params: unknown }>('/plans/:id', canRead, controller.getPlan)
  app.get('/health', canRead, controller.health)

  // Aprobación y ejecución están separadas: el mismo actor no puede aprobar
  // su propio plan y el runtime vuelve a verificar la aprobación en DB.
  app.post<{ Params: unknown; Body: unknown }>('/plans/:id/approve', canApprove, controller.approvePlan)
  app.post<{ Params: unknown; Body: unknown }>('/plans/:id/reject', canApprove, controller.rejectPlan)
  app.post<{ Params: unknown }>('/plans/:id/execute', canApprove, controller.executePlan)
  app.post<{ Params: unknown }>('/plans/:id/rollback', canApprove, controller.rollbackPlan)
}
