import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { enqueueWebsiteAudit, websiteSeoOverview, auditJobView } from '../services/websiteSeo.service'

export async function websiteSeoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get<{ Params: { id: string } }>('/:id/seo', { preHandler: requirePermission('integrations.read', { scope: 'org' }) }, async (request, reply) => {
    const data = await websiteSeoOverview(request.user.orgId, request.params.id)
    return data ? reply.send(data) : reply.status(404).send({ error: 'Web no encontrada.' })
  })
  app.post<{ Params: { id: string } }>('/:id/seo/audit', { preHandler: requirePermission('integrations.manage', { scope: 'org' }) }, async (request, reply) => {
    const job = await enqueueWebsiteAudit(request.user.orgId, request.params.id, 'manual', request.user.userId)
    return job ? reply.status(202).send({ job: auditJobView(job) }) : reply.status(404).send({ error: 'Web no encontrada.' })
  })
}
