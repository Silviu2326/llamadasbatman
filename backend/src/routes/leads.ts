import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import * as ctrl from '../controllers/leads.controller'

export async function leadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Las operaciones que ya pasan un actor al servicio pueden usar el alcance
  // mínimo; los detalles auxiliares sin ownership explícito siguen en org.
  const canReadOwned = { preHandler: [requirePermission('leads.read', { scope: 'own' }), requireEntitlement('crm')] }
  const canReadOrg = { preHandler: [requirePermission('leads.read', { scope: 'org' }), requireEntitlement('crm')] }
  const canMutateOwned = { preHandler: [requirePermission('leads.write', { scope: 'own' }), requireEntitlement('crm')] }
  const canMutateOrg = { preHandler: [requirePermission('leads.write', { scope: 'org' }), requireEntitlement('crm')] }
  const canExportOwned = { preHandler: [requirePermission('leads.export', { scope: 'own' }), requireEntitlement('crm')] }
  const canAudit = {
    preHandler: [
      requirePermission('leads.read', { scope: 'org' }),
      requirePermission('audit.read', { scope: 'org' }),
      requireEntitlement('crm'),
    ],
  }

  // Lectura: cualquier rol autenticado (viewer incluido).
  app.get('/', canReadOwned, ctrl.list as any)
  app.get('/owners', canReadOrg, ctrl.listOwners as any)
  // LE-102: export CSV del conjunto filtrado completo.
  app.get('/export', canExportOwned, ctrl.exportCsv as any)
  // LE-103: estado/lista de ImportJob para el polling del frontend.
  app.get('/imports', canReadOrg, ctrl.listImportJobs as any)
  app.get('/imports/:id', canReadOrg, ctrl.getImportJob as any)
  app.get('/:id', canReadOwned, ctrl.get as any)
  app.get('/:id/timeline', canReadOrg, ctrl.timeline as any)
  app.get('/:id/activities', canReadOrg, ctrl.activities as any)
  app.get('/:id/consent', canReadOrg, ctrl.getConsent as any)
  app.get('/:id/audit', canAudit, ctrl.getAudit as any)
  app.get('/:id/audit-history', canAudit, ctrl.auditHistory as any)
  app.get('/:id/notes', canReadOrg, ctrl.listNotes as any)
  app.get('/:id/files', canReadOrg, ctrl.listFiles as any)
  // EM-109: historial de EmailDelivery/EmailEvent del lead.
  app.get('/:id/email-history', canReadOrg, ctrl.getEmailHistory as any)
  // EM-110: centro de preferencias por categoría (ContactConsent, channel=email).
  app.get('/:id/preferences', canReadOrg, ctrl.getPreferences as any)

  // Mutación: viewer nunca escribe (P0-03/VE-04).
  app.post('/', { preHandler: [requirePermission('leads.write', { scope: 'own' }), requireEntitlement('crm', { limit: { resource: 'leads' } })] }, ctrl.create as any)
  app.post('/import', canMutateOrg, ctrl.importCsv as any)
  app.put('/:id', canMutateOwned, ctrl.update as any)
  app.put('/:id/owner', canMutateOwned, ctrl.updateOwner as any)
  app.post('/:id/call-now', {
    preHandler: [
      requirePermission('leads.contact', { scope: 'own' }),
      requirePermission('calls.write', { scope: 'own' }),
      requirePermission('costs.request', { scope: 'own' }),
      requireEntitlement('crm'),
      requireEntitlement('agents'),
    ],
  }, ctrl.callNow as any)
  app.post('/:id/audit', {
    preHandler: [
      requirePermission('leads.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('crm'),
    ],
  }, ctrl.audit as any)
  // Email frío escrito desde la auditoría. Redactar cuesta una llamada al
  // modelo (costs.request) pero no sale nada; enviar sí escribe a una persona
  // y exige además el permiso de contacto.
  app.post('/:id/outbound-email/draft', {
    preHandler: [
      requirePermission('leads.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('crm'),
    ],
  }, ctrl.draftOutboundEmail as any)
  app.post('/:id/outbound-email/send', {
    preHandler: [
      requirePermission('leads.contact', { scope: 'org' }),
      requirePermission('conversations.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('crm'),
    ],
  }, ctrl.sendOutboundEmail as any)
  // Consentimiento de voz manual (grant/revoke con fuente y evidencia).
  app.post('/:id/consent', canMutateOrg, ctrl.setConsent as any)
  app.post('/:id/notes', canMutateOrg, ctrl.createNote as any)
  app.post('/:id/files', canMutateOrg, ctrl.uploadFile as any)
  app.post('/:id/send-email', {
    preHandler: [
      requirePermission('leads.contact', { scope: 'org' }),
      requirePermission('conversations.write', { scope: 'org' }),
      requirePermission('costs.request', { scope: 'org' }),
      requireEntitlement('crm'),
      requireEntitlement('email_marketing'),
    ],
  }, ctrl.sendEmail as any)
  app.put('/:id/preferences', {
    preHandler: [requirePermission('governance.write', { scope: 'org' }), requireEntitlement('crm')],
  }, ctrl.updatePreferences as any)
}
