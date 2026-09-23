import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requirePermission, requireEntitlement } from '../access-control'
import { radarKnowledgeSchema } from '../services/radarKnowledge.schema'
import { getRadarKnowledge, saveRadarKnowledge, importRadarFile, importRadarWebsite, analyzeRadarKnowledge, removeRadarSource } from '../services/radarKnowledge.service'

export async function radarKnowledgeRoutes(app: FastifyInstance) {
  const read = [requirePermission('organization.read', { scope: 'org' }), requireEntitlement('revenue_intelligence')]
  const write = [...read, requirePermission('assets.manage', { scope: 'org' })]
  const perform = (schema: z.ZodTypeAny, action: (orgId: string, userId: string, body: any) => Promise<unknown>) => async (request: any, reply: any) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Datos inválidos.' })
    try { return await action(request.user.orgId, request.user.userId, parsed.data) }
    catch (error) { return reply.status((error as any).statusCode || 400).send({ error: (error as Error).message || 'No se pudo procesar la información.' }) }
  }
  app.get('/radar-knowledge', { preHandler: read }, async request => getRadarKnowledge((request.user as any).orgId))
  app.put('/radar-knowledge', { preHandler: write }, perform(radarKnowledgeSchema, (orgId, _user, body) => saveRadarKnowledge(orgId, body)))
  app.post('/radar-knowledge/file', { preHandler: write, bodyLimit: 15 * 1024 * 1024, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, perform(z.object({ name: z.string().trim().min(1).max(200), data: z.string().min(4).max(14 * 1024 * 1024) }).strict(), (orgId, userId, body) => importRadarFile(orgId, userId, body.name, body.data)))
  app.post('/radar-knowledge/website', { preHandler: write, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, perform(z.object({ website: z.string().trim().min(4).max(500) }).strict(), (orgId, _user, body) => importRadarWebsite(orgId, body.website)))
  app.post('/radar-knowledge/analyze', { preHandler: read }, perform(radarKnowledgeSchema, (orgId, _user, body) => analyzeRadarKnowledge(orgId, body)))
  app.delete<{ Params: { id: string } }>('/radar-knowledge/sources/:id', { preHandler: write }, async (request, reply) => {
    try { return await removeRadarSource((request.user as any).orgId, request.params.id) } catch (error) { return reply.status((error as any).statusCode || 400).send({ error: (error as Error).message }) }
  })
}
