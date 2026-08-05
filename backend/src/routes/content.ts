import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/contentOpportunities.controller'
import * as studio from '../controllers/contentStudio.controller'

/**
 * Radar de oportunidades de contenido (`docs/xarly/pantallas.md` §1).
 *
 * `refresh` analiza conversaciones con un LLM, así que exige el mismo permiso
 * de coste que el generador de `/api/metricool/ai/generate`.
 */
export async function contentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const canRead = { preHandler: [requirePermission('social.read', { scope: 'org' }), requireEntitlement('social')] }
  const canRefresh = {
    preHandler: [
      requirePermission('social.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('social'),
    ],
  }
  const canWrite = { preHandler: [requirePermission('social.write', { scope: 'org' }), requireEntitlement('social')] }

  app.get('/opportunities', canRead, ctrl.list)
  app.post('/opportunities/refresh', canRefresh, ctrl.refresh)
  app.get<{ Params: { id: string } }>('/opportunities/:id/evidence', canRead, ctrl.evidence)
  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/opportunities/:id/dismiss', canWrite, ctrl.dismiss)

  // Estudio y sala de aprobación (pantallas.md §2 y §3).
  app.post<{ Body: { opportunityId?: string; campaignId?: string; channels?: string[]; objective?: string } }>('/pieces/generate', canRefresh, studio.generate)
  app.get<{ Querystring: { opportunityId?: string } }>('/pieces', canRead, studio.pieces)
  app.get('/pieces/queue', canRead, studio.queue)
  app.post<{ Params: { id: string } }>('/pieces/:id/submit', canWrite, studio.submit)
  app.put<{ Params: { id: string }; Body: { body?: unknown } }>('/pieces/:id', canWrite, studio.edit)
  // La imagen se sube o se genera por los endpoints de medios ya existentes;
  // aquí solo se fija en la pieza, así que no cuesta IA y basta social.write.
  app.put<{ Params: { id: string }; Body: { imageUrl?: string | null } }>('/pieces/:id/image', canWrite, studio.setImage)
  app.post<{ Params: { id: string } }>('/pieces/:id/approve', canWrite, studio.approve)
  app.post<{ Params: { id: string }; Body: { reason?: string; comment?: string } }>('/pieces/:id/reject', canWrite, studio.reject)
  app.post<{ Body: { pieceIds?: string[]; platforms?: string[] } }>('/pieces/approve-all', canWrite, studio.approveAll)
  // Historial y comentarios de una pieza (§3): leerlos es leer la sala;
  // comentar es escribir en ella, y por eso pide `social.write`.
  app.get<{ Params: { id: string } }>('/pieces/:id/history', canRead, studio.history)
  app.post<{ Params: { id: string }; Body: { message?: string } }>('/pieces/:id/comment', canWrite, studio.comment)
  app.get('/results', canRead, studio.results)
  app.get('/voice', canRead, studio.voice)
  app.post('/voice/refresh', canWrite, studio.refreshVoice)
  // Libro de marca de los carruseles con plantilla (idea 7).
  app.get('/brand', canRead, studio.brand)
  app.put<{ Body: unknown }>('/brand', canWrite, studio.saveBrand)
  // Enlaces de solo-aprobación para clientes de agencias. Crear y revocar es
  // repartir acceso a la sala: exige `social.write` y el plan Agency, que se
  // comprueba en el servicio.
  app.get('/approval-links', canRead, studio.approvalLinks)
  app.post<{ Body: { label?: string; days?: number } }>('/approval-links', canWrite, studio.createLink)
  app.delete<{ Params: { id: string } }>('/approval-links/:id', canWrite, studio.revokeLink)
}
