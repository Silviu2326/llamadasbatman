import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/prospects.controller'

export async function prospectsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  // La búsqueda consulta proveedores externos y la importación puede
  // enriquecer, auditar o encolar llamadas: ambas son operaciones con coste.
  const canMutate = {
    preHandler: [
      requirePermission('leads.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('prospecting'),
    ],
  }

  app.post('/search', canMutate, ctrl.search as any)
  app.post('/import', canMutate, ctrl.importProspects as any)
}
