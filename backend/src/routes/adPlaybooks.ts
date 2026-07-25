import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/adPlaybooks.controller'

// Biblioteca de playbooks por vertical — no tiene orgId (es compartida entre
// todas las orgs), por eso solo admin puede crear/editar. Ver META_ADS_AUTOMATION.md.
export async function adPlaybooksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', { preHandler: requirePermission('playbooks.read') }, ctrl.list)
  app.post<{
    Body: {
      vertical: string
      offer: string
      leadMagnet?: string
      adCopy: string
      landingTemplateId: string
      imagePrompt: string
    }
  }>('/', { preHandler: requirePermission('playbooks.manage_global') }, ctrl.create)
  app.put<{
    Params: { id: string }
    Body: {
      offer?: string
      leadMagnet?: string
      adCopy?: string
      landingTemplateId?: string
      imagePrompt?: string
      isActive?: boolean
    }
  }>('/:id', { preHandler: requirePermission('playbooks.manage_global') }, ctrl.update)
}
