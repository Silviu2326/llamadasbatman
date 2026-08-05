import { FastifyInstance } from 'fastify'
import * as ctrl from '../controllers/contentPublicApproval.controller'

/**
 * Enlace público de solo-aprobación (`roadmap.md` fase 3). Sin `authenticate` a
 * propósito: la autorización es el token de la URL, y lo que se puede hacer con
 * él está enumerado aquí entero.
 *
 * No hay rutas de generación, edición ni publicación: aprobar, rechazar con
 * motivo y comentar. Todo lo demás sigue exigiendo usuario del CRM.
 */
export async function contentApprovalPublicRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/:token/queue', ctrl.queue)
  app.get<{ Params: { token: string; id: string } }>('/:token/pieces/:id/history', ctrl.history)
  app.post<{ Params: { token: string; id: string }; Body: { message?: string } }>('/:token/pieces/:id/comment', ctrl.comment)
  app.post<{ Params: { token: string; id: string } }>('/:token/pieces/:id/approve', ctrl.approve)
  app.post<{ Params: { token: string; id: string }; Body: { reason?: string; comment?: string } }>('/:token/pieces/:id/reject', ctrl.reject)
}
