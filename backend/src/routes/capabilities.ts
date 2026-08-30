import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/capabilities.controller'

/**
 * API de capabilities de proveedor (docs/plataforma-abierta/03 y 04).
 * index.ts monta el prefijo /api/capabilities.
 *
 * `run` y el upscale de conveniencia consumen proveedores: mismo guard de
 * coste que routes/content.ts más el entitlement `integrations`. `estimate`
 * no crea job ni gasta, pero enruta con credenciales de la org, así que
 * comparte el entitlement.
 */
export async function capabilitiesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canEstimate = { preHandler: [requireEntitlement('integrations')] }
  const canRun = {
    preHandler: [
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('integrations'),
    ],
  }

  app.get('/', ctrl.list as any)
  app.post('/run', canRun, ctrl.run as any)
  app.post('/estimate', canEstimate, ctrl.estimate as any)
  // Conveniencia: mejorar un activo de la biblioteca vía image.upscale.
  app.post('/assets/:id/upscale', canRun, ctrl.upscaleAsset as any)
}
