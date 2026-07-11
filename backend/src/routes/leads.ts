import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/leads.controller'

export async function leadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.list)
  app.post('/', ctrl.create)
  app.post('/import', ctrl.importCsv)
  app.get('/:id', ctrl.get)
  app.put('/:id', ctrl.update)
  app.post('/:id/call-now', ctrl.callNow)
  app.get('/:id/timeline', ctrl.timeline)
  app.post('/:id/audit', ctrl.audit)
  app.get('/:id/audit', ctrl.getAudit)
  app.get('/:id/audit-history', ctrl.auditHistory)
  app.get('/:id/notes', ctrl.listNotes)
  app.post('/:id/notes', ctrl.createNote)
  app.get('/:id/files', ctrl.listFiles)
  app.post('/:id/files', ctrl.uploadFile)
  app.post('/:id/send-email', ctrl.sendEmail)
}
