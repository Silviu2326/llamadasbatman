import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/studio.controller'

/**
 * Studio de Cine v0 — preproducción (docs/plataforma-abierta/06-STUDIO-DE-CINE.md).
 * El integrador monta este plugin bajo /api/studio.
 *
 * Permisos:
 * - Lectura: `social.read` (org) — mismo criterio que la biblioteca de activos
 *   (routes/assets.ts): el Studio produce creatividad de marketing y ver esa
 *   creatividad ya está protegido por social.read en content/metricool.
 * - Escritura sin coste (crear producción, aprobar concepto, biblia, sync):
 *   `social.write` (org).
 * - Generación (conceptos, guion, shot list, storyboard): `social.write` +
 *   `costs.request` (org) — patrón de routes/content.ts para todo lo que
 *   consume IA.
 * Sin requireEntitlement a propósito (mismo razonamiento que assets.ts): las
 * producciones cruzan dominios de plan y aún no existe un entitlement propio.
 *
 * Latencia: los pasos síncronos de texto (conceptos/guion/desglose) tardan
 * 20-60 s. El servidor se crea en index.ts sin `connectionTimeout` ni
 * `requestTimeout`, y el valor por defecto de Fastify 4 para ambos es 0 (sin
 * límite), así que ninguna petición se corta por tiempo: no hay nada que
 * configurar aquí. El límite real es el timeout del cliente DeepSeek
 * (DEEPSEEK_TIMEOUT_SECONDS, 90 s por defecto).
 */
export async function studioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canRead = { preHandler: [requirePermission('social.read', { scope: 'org' })] }
  const canWrite = { preHandler: [requirePermission('social.write', { scope: 'org' })] }
  const canGenerate = {
    preHandler: [
      requirePermission('social.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
    ],
  }

  app.post<{ Body: unknown }>('/productions', canWrite, ctrl.create)
  app.get('/productions', canRead, ctrl.list)
  app.get<{ Params: { id: string } }>('/productions/:id', canRead, ctrl.get)
  app.patch<{ Params: { id: string }; Body: unknown }>('/productions/:id', canWrite, ctrl.update)
  app.delete<{ Params: { id: string } }>('/productions/:id', canWrite, ctrl.archive)
  app.get<{ Params: { id: string } }>('/productions/:id/export-metadata', canRead, ctrl.metadataExport)
  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/review-links', canWrite, ctrl.reviewLinkCreate)
  app.get<{ Params: { id: string } }>('/productions/:id/review-links', canRead, ctrl.reviewLinksList)
  app.delete<{ Params: { id: string; linkId: string } }>('/productions/:id/review-links/:linkId', canWrite, ctrl.reviewLinkRevoke)
  app.get<{ Params: { id: string } }>('/productions/:id/review-comments', canRead, ctrl.reviewCommentsList)
  app.patch<{ Params: { id: string; commentId: string }; Body: unknown }>('/productions/:id/review-comments/:commentId', canWrite, ctrl.reviewCommentModerate)

  app.post<{ Params: { id: string } }>('/productions/:id/concepts/generate', canGenerate, ctrl.concepts)
  app.post<{ Params: { id: string; conceptId: string } }>(
    '/productions/:id/concepts/:conceptId/approve',
    canWrite,
    ctrl.approve,
  )
  app.post<{ Params: { id: string } }>('/productions/:id/script/generate', canGenerate, ctrl.script)
  app.post<{ Params: { id: string } }>('/productions/:id/shotlist/generate', canGenerate, ctrl.shotlist)
  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/storyboard/generate', canGenerate, ctrl.storyboard)
  // sync no lanza jobs: consolida resultados ya pagados, basta social.write.
  app.post<{ Params: { id: string } }>('/productions/:id/storyboard/sync', canWrite, ctrl.storyboardSync)
  // estimate usa route() sin ejecutar nada: es lectura.
  app.get<{ Params: { id: string } }>('/productions/:id/estimate', canRead, ctrl.estimate)

  // v1: generación asíncrona, consolidación, mesa de tomas y elección única.
  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/takes/generate', canGenerate, ctrl.takesGenerate)
  app.post<{ Params: { id: string } }>('/productions/:id/takes/sync', canWrite, ctrl.takesSync)
  app.get<{ Params: { id: string } }>('/productions/:id/takes', canRead, ctrl.takesTable)
  app.post<{ Params: { id: string; shotId: string; takeId: string } }>(
    '/productions/:id/shots/:shotId/takes/:takeId/select',
    canWrite,
    ctrl.takeSelect,
  )
  app.post<{ Params: { id: string; takeId: string }; Body: unknown }>(
    '/productions/:id/takes/:takeId/upscale',
    canGenerate,
    ctrl.takeUpscale,
  )

  // v2: montaje local aislado en worker y entregables de preproducción.
  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/post/export', canGenerate, ctrl.postExport)
  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/documents/export', canWrite, ctrl.documentsExport)
  app.post<{ Params: { id: string }; Body: unknown }>(
    '/productions/:id/publish/metricool',
    { preHandler: [requirePermission('social.write', { scope: 'org' }), requireEntitlement('social')] },
    ctrl.metricoolPublish,
  )

  app.post<{ Params: { id: string }; Body: unknown }>('/productions/:id/bible', canWrite, ctrl.bibleCreate)
  app.put<{ Params: { id: string; entryId: string }; Body: unknown }>(
    '/productions/:id/bible/:entryId',
    canWrite,
    ctrl.bibleUpdate,
  )
}
