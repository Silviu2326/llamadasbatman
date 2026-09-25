import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/knowledge.controller'

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('knowledge.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canMutate = { preHandler: [requirePermission('knowledge.write', { scope: 'org' }), requireEntitlement('agents')] }
  // Vínculo documento↔agente y vista previa del prompt: viven aquí porque
  // `routes/agents.ts` pertenece a otro tramo, pero exigen permisos de agente.
  const canReadAgent = { preHandler: [requirePermission('knowledge.read', { scope: 'org' }), requirePermission('agents.read', { scope: 'org' }), requireEntitlement('agents')] }
  const canManageAgent = { preHandler: [requirePermission('knowledge.read', { scope: 'org' }), requirePermission('agents.manage', { scope: 'org' }), requireEntitlement('agents')] }

  app.get('/', canRead, ctrl.list)
  app.post('/', canMutate, ctrl.create)
  // Subida con extracción de texto en servidor (PDF/DOCX/TXT/MD/CSV/JSON ≤ 10 MB, base64).
  app.post('/upload', canMutate, ctrl.upload)
  app.get('/agent-links', canReadAgent, ctrl.agentLinks)
  app.put('/agent-links', canManageAgent, ctrl.setAgentLinks)
  app.get('/prompt-preview', canReadAgent, ctrl.promptPreview)
  app.get('/:id', canRead, ctrl.get as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.delete('/:id', canMutate, ctrl.remove as any)
  app.post('/:id/favorite', canMutate, ctrl.favorite as any)
  app.post('/:id/reaction', canMutate, ctrl.reaction as any)
}
