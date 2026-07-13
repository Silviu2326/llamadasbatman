import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import * as ctrl from '../controllers/leads.controller'

export async function leadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  const canMutate = { preHandler: authorize(['admin', 'agent']) }

  // Lectura: cualquier rol autenticado (viewer incluido).
  app.get('/', ctrl.list as any)
  app.get('/owners', ctrl.listOwners as any)
  // LE-102: export CSV del conjunto filtrado completo.
  app.get('/export', ctrl.exportCsv as any)
  // LE-103: estado/lista de ImportJob para el polling del frontend.
  app.get('/imports', ctrl.listImportJobs as any)
  app.get('/imports/:id', ctrl.getImportJob as any)
  app.get('/:id', ctrl.get as any)
  app.get('/:id/timeline', ctrl.timeline as any)
  app.get('/:id/activities', ctrl.activities as any)
  app.get('/:id/consent', ctrl.getConsent as any)
  app.get('/:id/audit', ctrl.getAudit as any)
  app.get('/:id/audit-history', ctrl.auditHistory as any)
  app.get('/:id/notes', ctrl.listNotes as any)
  app.get('/:id/files', ctrl.listFiles as any)

  // Mutación: viewer nunca escribe (P0-03/VE-04).
  app.post('/', canMutate, ctrl.create as any)
  app.post('/import', canMutate, ctrl.importCsv as any)
  app.put('/:id', canMutate, ctrl.update as any)
  app.put('/:id/owner', canMutate, ctrl.updateOwner as any)
  app.post('/:id/call-now', canMutate, ctrl.callNow as any)
  app.post('/:id/audit', canMutate, ctrl.audit as any)
  app.post('/:id/notes', canMutate, ctrl.createNote as any)
  app.post('/:id/files', canMutate, ctrl.uploadFile as any)
  app.post('/:id/send-email', canMutate, ctrl.sendEmail as any)
}
