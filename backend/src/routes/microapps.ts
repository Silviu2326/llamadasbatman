import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/microapps.controller'

/**
 * API genérica de microapps (docs/plataforma-abierta/07-MICROAPPS.md §2).
 * index.ts monta el prefijo /api/microapps.
 *
 * `run` exige el mismo permiso de coste que routes/content.ts (todo run puede
 * consumir proveedores) más el entitlement de plan `microapps`; el chequeo de
 * `dataAccess` del manifiesto vive en el controller porque depende de la
 * microapp concreta.
 */
export async function microappsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canEstimate = { preHandler: [requireEntitlement('microapps')] }
  const canRun = {
    preHandler: [
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('microapps'),
    ],
  }
  // El historial son jobs con otro nombre: mismo permiso que el Centro de trabajos.
  const canReadRuns = { preHandler: [requirePermission('jobs.read', { scope: 'org' })] }
  const canInstallAgenticFlow = {
    preHandler: [
      requirePermission('automations.write', { scope: 'org' }),
      requireEntitlement('automations'),
      requireEntitlement('microapps'),
    ],
  }

  app.get('/', ctrl.list as any)
  app.get('/projections', canReadRuns, ctrl.listProjections as any)
  app.get('/surfaces/:surface', canReadRuns, ctrl.listSurface as any)
  app.get('/runs', canReadRuns, ctrl.listRuns as any)
  app.get('/runs/:id', canReadRuns, ctrl.getRun as any)
  app.post('/runs/:runId/actions', canRun, ctrl.applyAction as any)
  app.get('/:id/agentic-flow-template', ctrl.getAgenticFlowTemplate as any)
  app.post('/:id/agentic-flow/install', canInstallAgenticFlow, ctrl.installAgenticFlow as any)
  app.get('/:id', ctrl.get as any)
  app.get('/:id/config', canReadRuns, ctrl.getConfig as any)
  app.put('/:id/config', canRun, ctrl.putConfig as any)
  app.post('/:id/estimate', canEstimate, ctrl.estimate as any)
  app.post('/:id/run', canRun, ctrl.run as any)
}
