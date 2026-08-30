import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/jobs.controller'

/** Centro de trabajos (02-FUNDAMENTOS §1). index.ts monta el prefijo /api/jobs. */
export async function jobsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: [requirePermission('jobs.read', { scope: 'org' })] }
  const canManage = { preHandler: [requirePermission('jobs.manage', { scope: 'org' })] }

  app.get('/', canRead, ctrl.list as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.post('/:id/cancel', canManage, ctrl.cancel as any)
  app.post('/:id/retry', canManage, ctrl.retry as any)
}
