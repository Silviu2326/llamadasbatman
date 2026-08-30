import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/websiteIntake.controller'

/**
 * Onboarding asistido desde la web del cliente. index.ts monta el prefijo
 * /api/intake.
 *
 * Lanzar y leer el análisis exige `organization.read`: es lectura de una web
 * pública y consumo de modelo, no escritura. Cada sección de `apply` vuelve a
 * comprobar su propio permiso dentro del servicio (perfil, usuarios,
 * conocimiento y CRM son cuatro autorizaciones distintas), así que aquí basta
 * con exigir el permiso mínimo que cualquiera de ellas necesita.
 */
export async function websiteIntakeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: [requirePermission('organization.read', { scope: 'org' })] }

  app.post('/website', canRead, ctrl.start as any)
  app.get('/website', canRead, ctrl.list)
  app.get('/website/:jobId', canRead, ctrl.get as any)
  app.post('/website/:jobId/apply', canRead, ctrl.apply as any)
}
