import { FastifyInstance } from 'fastify'
import * as ctrl from '../controllers/campaigns.controller'

// Ruta pública (sin authenticate) para ver el estado de una campaña vía el
// enlace generado en POST /api/campaigns/:id/share-link.
export async function campaignShareRoutes(app: FastifyInstance) {
  app.get('/:token', ctrl.publicByToken)
}
