import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as controller from '../controllers/actionCenter.controller'

export async function actionCenterRoutes(app: FastifyInstance) {
  const canRead = { preHandler: [authenticate, requirePermission('action_center.read', { scope: 'org' })] }
  const canWrite = { preHandler: [authenticate, requirePermission('action_center.write', { scope: 'org' })] }

  app.get<{ Querystring: { status?: string; priority?: string; limit?: string } }>('/actions', canRead, controller.list)
  app.patch<{ Params: { id: string }; Body: unknown }>('/actions/:id', canWrite, controller.update)
}
