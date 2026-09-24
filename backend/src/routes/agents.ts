import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/agents.controller'
import { voices } from '../controllers/agentVoices.controller'
import * as voiceUpload from '../controllers/agentVoiceUpload.controller'
import { z } from 'zod'
import { getAgentTeam } from '../services/agentTeam.service'

export async function agentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('agents.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canMutate = { preHandler: [requirePermission('agents.manage', { scope: 'org' }), requireEntitlement('agents')] }
  const canCreate = { preHandler: [requirePermission('agents.manage', { scope: 'org' }), requireEntitlement('agents', { limit: { resource: 'agents' } })] }

  app.get('/', canRead, ctrl.list)
  app.get('/team-overview', { preHandler: [...canRead.preHandler, requirePermission('calls.read', { scope: 'org' }), requirePermission('meetings.read', { scope: 'org' }), requirePermission('pipeline.read', { scope: 'org' })] }, async (request, reply) => {
    const parsed = z.object({ start: z.string().datetime(), end: z.string().datetime(), previousStart: z.string().datetime() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Periodo no válido' })
    const { start, end, previousStart } = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, new Date(value)]))
    if (end <= start || end.getTime() - start.getTime() > 26 * 3600000 || previousStart >= start || start.getTime() - previousStart.getTime() > 26 * 3600000) return reply.code(400).send({ error: 'Periodo no válido' })
    return getAgentTeam((request.user as { orgId: string }).orgId, start, end, previousStart)
  })
  app.post('/', canCreate, ctrl.create as any)
  app.get('/strategies', canRead, ctrl.strategies)
  app.get('/voices', canRead, voices)
  // Números desde los que la pasarela puede marcar de verdad (readiness `outboundNumber`).
  app.get('/outbound-numbers', canRead, ctrl.outboundNumbers)
  app.get('/:id/schedule-options', { preHandler: [...canRead.preHandler, requirePermission('leads.read', { scope: 'org' })] }, ctrl.scheduleOptions as any)
  app.post('/:id/schedule-call', { preHandler: [...canMutate.preHandler, requirePermission('calls.write', { scope: 'org' }), requirePermission('costs.request', { scope: 'org' }), requirePermission('leads.read', { scope: 'org' })] }, ctrl.scheduleCall as any)
  app.get('/:id/voices', canRead, voiceUpload.mine)
  app.get('/:id/voices/:requestId', canRead, voiceUpload.status)
  app.post('/:id/voices', { ...canMutate, bodyLimit: 15 * 1024 * 1024 }, voiceUpload.upload)
  app.get('/:id', canRead, ctrl.get as any)
  app.get('/:id/workspace', canRead, ctrl.workspace as any)
  // El estado solo cambia por estas rutas: PUT /:id ya no acepta lifecycleStatus ni isActive.
  app.post('/:id/publish', canMutate, ctrl.publish as any)
  app.post('/:id/pause', canMutate, ctrl.pause as any)
  app.post('/:id/resume', canMutate, ctrl.resume as any)
  app.put('/:id/campaigns', canMutate, ctrl.campaigns as any)
  app.post('/:id/evaluations/:callId', canMutate, ctrl.evaluate as any)
  // Prueba telefónica de un agente en borrador: el destino solo puede ser un
  // número propio dado de alta aquí (voiceTestCall.service.ts).
  app.get('/:id/test-numbers', canRead, ctrl.testNumbers as any)
  app.post('/:id/test-numbers', canMutate, ctrl.createTestNumber as any)
  app.post('/:id/test-numbers/:numberId/revoke', canMutate, ctrl.revokeTestNumber as any)
  app.post('/:id/test-calls', canMutate, ctrl.testCall as any)
  app.post('/:id/versions/:versionId/restore', canMutate, ctrl.restore as any)
  app.post('/:id/consents/:consentId/revoke', canMutate, ctrl.revokeConsent as any)
  app.post('/:id/consents', canMutate, ctrl.createConsent as any)
  app.post('/:id/clone', canCreate, ctrl.clone as any)
  app.post('/:id/archive', canMutate, ctrl.archive as any)
  app.delete('/:id/permanent', canMutate, ctrl.permanentlyDelete as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.delete('/:id', canMutate, ctrl.deactivate as any)
  app.get('/:id/stats', canRead, ctrl.stats as any)
  app.get('/:id/timeseries', canRead, ctrl.timeseries as any)
  app.get('/:id/strategy-performance', canRead, ctrl.strategyPerformance as any)
}
