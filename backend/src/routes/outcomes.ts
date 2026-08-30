import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { getOutcomeSummary } from '../services/outcomes.service'
import { getOpenPlatformMetrics } from '../services/openPlatformMetrics.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const summaryQuerySchema = z
  .object({
    weeks: z.coerce.number().int().min(1).max(52).optional(),
  })
  .strict()

const platformMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
}).strict()

/**
 * Resultados de negocio (09-MODELO-COMERCIAL-Y-METRICAS §5). Se montará en
 * /api/outcomes. Es una vista del dashboard, de ahí `dashboard.read`.
 */
export async function outcomesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: requirePermission('dashboard.read', { scope: 'org' }) }
  const canReadCosts = { preHandler: requirePermission('costs.read', { scope: 'org' }) }

  // Incluye margen y coste: no hereda dashboard.read, que también puede estar
  // disponible para invitados. Solo roles con acceso financiero lo reciben.
  app.get('/open-platform', canReadCosts, (async (
    request: FastifyRequest<{ Querystring: { days?: string } }>,
    reply: FastifyReply,
  ) => {
    const { orgId } = request.user as JWTUser
    const query = parseRequest(reply, platformMetricsQuerySchema, request.query)
    if (!query) return
    return reply.send(await getOpenPlatformMetrics({ orgId, days: query.days }))
  }) as any)

  app.get('/', canRead, (async (
    request: FastifyRequest<{ Querystring: { weeks?: string } }>,
    reply: FastifyReply
  ) => {
    const { orgId } = request.user as JWTUser
    const query = parseRequest(reply, summaryQuerySchema, request.query)
    if (!query) return
    const summary = await getOutcomeSummary({ orgId, weeks: query.weeks })
    return reply.send(summary)
  }) as any)
}
