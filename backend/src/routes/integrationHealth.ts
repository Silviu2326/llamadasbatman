import { FastifyInstance } from 'fastify'
import * as controller from '../controllers/integrationHealth.controller'

/** Public, secret-free operational endpoints. They never report tenant OAuth as connected. */
export async function integrationHealthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { probe?: string } }>('/integrations', controller.integrations)
  // `/health/ready` is owned by observabilityRoutes. Keep this endpoint
  // specific to external integrations to avoid duplicate Fastify routes.
  app.get('/integrations/ready', controller.ready)
}
