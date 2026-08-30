import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/consentGrants.controller'

/**
 * Consentimientos de identidad (08-SEGURIDAD-Y-DERECHOS §2). Se montará en
 * /api/consent-grants.
 *
 * Permisos: `governance.read`/`governance.write` — el catálogo ya trata el
 * consentimiento como gobierno (el rol `compliance` se describe como
 * "Consentimiento, auditoría y revisión de cambios regulados" y es quien tiene
 * governance.*), y el centro de preferencias de email usa exactamente el mismo
 * par para gestionar consentimiento de contacto (routes/emailMetrics.ts).
 */
export async function consentGrantsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('governance.read', { scope: 'org' }) }
  const canWrite = { preHandler: requirePermission('governance.write', { scope: 'org' }) }

  app.get('/', canRead, ctrl.list as any)
  app.post('/', canWrite, ctrl.create as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.post('/:id/revoke', canWrite, ctrl.revoke as any)
}
