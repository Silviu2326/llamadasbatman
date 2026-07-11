import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/adPlaybooks.controller'

// Biblioteca de playbooks por vertical — no tiene orgId (es compartida entre
// todas las orgs), por eso solo admin puede crear/editar. Ver META_ADS_AUTOMATION.md.
export async function adPlaybooksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post<{
    Body: {
      vertical: string
      offer: string
      leadMagnet?: string
      adCopy: string
      landingTemplateId: string
      imagePrompt: string
    }
  }>('/', { preHandler: authorize(['admin']) }, ctrl.create)
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
  }>('/:id', { preHandler: authorize(['admin']) }, ctrl.update)
}
