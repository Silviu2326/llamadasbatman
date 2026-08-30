import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/flows.controller'

/**
 * Constructor de flujos (docs/plataforma-abierta/05-FLUJOS.md). El integrador
 * monta este plugin en /api/flows.
 *
 * Permisos: los Flows viven en el mismo dominio que las automatizaciones
 * (automations.read/write). Lanzar un run puede consumir proveedores de pago,
 * así que exige además `costs.request`, igual que /api/content. Aprobar un
 * paso solo pide lectura aquí: la política real (permiso de aprobación por
 * acción sensible + no autoaprobación) la aplica el servicio contra
 * approvalPolicy, porque depende de qué acción aprueba cada nodo.
 */
export async function flowsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('automations.read', { scope: 'org' }), requireEntitlement('automations')] }
  const canWrite = { preHandler: [requirePermission('automations.write', { scope: 'org' }), requireEntitlement('automations')] }
  const canRun = {
    preHandler: [
      requirePermission('automations.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('automations'),
    ],
  }

  app.get('/', canRead, ctrl.list)
  app.get<{ Querystring: { flowId?: string; limit?: string } }>('/runs', canRead, ctrl.listRuns)
  app.get<{ Params: { id: string } }>('/runs/:id', canRead, ctrl.getRun)
  app.post<{ Params: { id: string }; Body: { nodeKey?: string; approve?: boolean; comment?: string } }>('/runs/:id/approve', canRead, ctrl.approve)
  app.post<{ Params: { id: string } }>('/runs/:id/cancel', canWrite, ctrl.cancel)
  app.get<{ Params: { id: string } }>('/:id', canRead, ctrl.get)
  app.post<{ Body: { slug?: string; name?: string; description?: string; graph?: unknown } }>('/', canWrite, ctrl.create)
  app.post<{ Params: { id: string }; Body: { variables?: Record<string, unknown>; budgetCents?: number; dryRun?: boolean; idempotencyKey?: string } }>('/:id/run', canRun, ctrl.run)
}
