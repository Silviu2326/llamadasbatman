import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/growthPrograms.controller'

export async function growthProgramsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('growth.read', { scope: 'org' }), requireEntitlement('growth')] }
  const canMutate = { preHandler: [requirePermission('growth.write', { scope: 'org' }), requireEntitlement('growth')] }

  // Las rutas estáticas deben registrarse antes de /:id.
  app.get('/overview', canRead, ctrl.overview as any)
  app.get('/', canRead, ctrl.list as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.post('/', canMutate, ctrl.create as any)
  app.patch('/:id', canMutate, ctrl.update as any)
  // PUT facilita el consumo desde clientes que ya modelan ediciones completas.
  app.put('/:id', canMutate, ctrl.update as any)
  app.post('/:id/archive', canMutate, ctrl.archive as any)
  app.get('/:id/enrollments', canRead, ctrl.enrollments as any)
  app.post('/:id/enroll', canMutate, ctrl.enroll as any)
  app.post('/:id/pause', canMutate, ctrl.pause as any)
  app.post('/:id/resume', canMutate, ctrl.resume as any)
  app.post('/:id/stop', canMutate, ctrl.stop as any)
}
