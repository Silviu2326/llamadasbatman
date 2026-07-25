import { FastifyInstance } from 'fastify'
import { requireAnyPermission, requireEntitlement, requirePermission } from '../access-control'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/accessControl.controller'

export async function accessControlRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/catalog', { preHandler: requirePermission('access_control.read') }, ctrl.getCatalog)
  app.get('/workspaces', {
    preHandler: [
      requirePermission('organization.read', { scope: 'org' }),
      requireEntitlement('multiworkspace'),
    ],
  }, ctrl.listWorkspaces)
  app.get('/members', { preHandler: [requirePermission('access_control.read'), requireEntitlement('team_management')] }, ctrl.listMembers)
  app.get('/requests', {
    preHandler: requireAnyPermission(
      { permission: 'access_control.read' },
      { permission: 'access_request.create' },
      { permission: 'access_request.approve.role_elevation' },
      { permission: 'access_request.approve.paid_experiment' },
      { permission: 'access_request.approve.playbook_change' },
    ),
  }, ctrl.listRequests)
  app.post('/requests', { preHandler: requirePermission('access_request.create') }, ctrl.createRequest)
  const decisionGuard = {
    preHandler: requireAnyPermission(
      { permission: 'access_request.approve.role_elevation' },
      { permission: 'access_request.approve.paid_experiment' },
      { permission: 'access_request.approve.playbook_change' },
    ),
  }
  app.post<{ Params: { id: string } }>('/requests/:id/approve', decisionGuard, ctrl.approveRequest)
  app.post<{ Params: { id: string } }>('/requests/:id/reject', decisionGuard, ctrl.rejectRequest)

  const assignmentGuard = { preHandler: [requirePermission('access_control.manage'), requireEntitlement('team_management')] }
  app.patch<{ Params: { userId: string } }>('/members/:userId/role', assignmentGuard, ctrl.assignMemberRole)
  app.put<{ Params: { userId: string } }>('/members/:userId/role', assignmentGuard, ctrl.assignMemberRole)
}
