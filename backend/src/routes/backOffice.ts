import { FastifyInstance } from 'fastify'
import { requirePlatformAdmin } from '../access-control'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/backOffice.controller'

/**
 * Back office de plataforma. Es el único conjunto de rutas que cruza tenants,
 * así que los dos hooks se aplican a nivel de plugin: ninguna ruta puede
 * añadirse aquí y quedarse sin `requirePlatformAdmin` por olvido en su
 * definición individual.
 */
export async function backOfficeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePlatformAdmin)

  app.get('/overview', ctrl.overview)
  app.get('/permissions', ctrl.permissions)

  app.get('/organizations', ctrl.organizations)
  app.post('/organizations', ctrl.createOrganization)
  app.get<{ Params: { id: string } }>('/organizations/:id', ctrl.organization)
  app.patch<{ Params: { id: string } }>('/organizations/:id', ctrl.updateOrganization)
  app.post<{ Params: { id: string } }>('/organizations/:id/wallet', ctrl.adjustWallet)

  app.get('/users', ctrl.users)
  app.get<{ Params: { id: string } }>('/users/:id', ctrl.user)
  app.patch<{ Params: { id: string } }>('/users/:id', ctrl.updateUser)
  app.post<{ Params: { id: string } }>('/users/:id/password-reset', ctrl.resetPassword)
  app.post<{ Params: { id: string } }>('/users/:id/revoke-sessions', ctrl.revokeUserSessions)

  app.post('/memberships', ctrl.addMembership)
  app.patch('/memberships/role', ctrl.setMembershipRole)
  app.patch('/memberships/status', ctrl.setMembershipStatus)
  app.post('/memberships/remove', ctrl.removeMembership)

  app.get('/sessions', ctrl.sessions)
  app.post<{ Params: { id: string } }>('/sessions/:id/revoke', ctrl.revokeSession)
  app.get('/api-keys', ctrl.apiKeys)
  app.post<{ Params: { id: string } }>('/api-keys/:id/revoke', ctrl.revokeApiKey)

  app.get('/audit', ctrl.audit)

  app.post('/impersonate', ctrl.impersonate)
  app.post<{ Params: { id: string } }>('/impersonate/:id/stop', ctrl.stopImpersonation)
}
