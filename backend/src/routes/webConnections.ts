import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { parseRequest } from '../lib/validation'
import { discoverWebsiteConnection, isWebsiteConnectionMode, listWebsiteConnections, updateWebsiteConnection } from '../services/websiteConnections.service'

const discoverSchema = z.object({ website: z.string().trim().min(4).max(2_048) }).strict()
const updateSchema = z.object({ mode: z.string().optional(), status: z.enum(['setup_required', 'verification_pending', 'connected', 'degraded', 'disconnected']).optional() }).strict().refine(value => Boolean(value.mode || value.status), 'Falta un cambio')

export async function webConnectionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const read = { preHandler: requirePermission('integrations.read', { scope: 'org' }) }
  const manage = { preHandler: requirePermission('integrations.manage', { scope: 'org' }) }

  app.get('/', read, async request => listWebsiteConnections(request.user.orgId))

  app.post('/discover', manage, async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const body = parseRequest(reply, discoverSchema, request.body ?? {})
    if (!body) return
    try {
      return reply.status(201).send(await discoverWebsiteConnection({ orgId: request.user.orgId, website: body.website }))
    } catch (error) {
      const code = error instanceof Error ? error.message : 'WEB_CONNECTION_DISCOVERY_FAILED'
      const status = code === 'WEB_CONNECTION_URL_REQUIRED' ? 400 : code === 'WEB_CONNECTION_SITE_UNREACHABLE' ? 422 : 400
      return reply.status(status).send({ error: status === 422 ? 'La web no responde o no devuelve HTML público.' : 'No se pudo analizar esa web.', code })
    }
  })

  app.patch('/:id', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const body = parseRequest(reply, updateSchema, request.body ?? {})
    if (!body) return
    if (body.mode && !isWebsiteConnectionMode(body.mode)) return reply.status(400).send({ error: 'Modo de conexión no válido', code: 'WEB_CONNECTION_MODE_INVALID' })
    const updated = await updateWebsiteConnection({ orgId: request.user.orgId, id: request.params.id, mode: body.mode as any, status: body.status })
    if (!updated) return reply.status(404).send({ error: 'Conexión web no encontrada', code: 'WEB_CONNECTION_NOT_FOUND' })
    return reply.send(updated)
  })
}
