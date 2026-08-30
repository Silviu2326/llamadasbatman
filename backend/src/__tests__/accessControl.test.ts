import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import {
  APP_ROLES,
  LEGACY_ROLES,
  PERMISSIONS,
  ROLE_CATALOG,
  ROLE_GRANTS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  grantedScope,
  hasPermission,
  isKnownRole,
  permissionsForRole,
  requirePermission,
  type KnownRole,
  type Permission,
} from '../access-control'

const approvalPermissions: Permission[] = [
  'costs.approve',
  'playbooks.approve',
  'memory.approve',
  'access_request.approve.role_elevation',
  'access_request.approve.paid_experiment',
  'access_request.approve.playbook_change',
]

test('el catálogo contiene exactamente los diez roles de producto y dos roles legacy', () => {
  assert.deepEqual(APP_ROLES, [
    'owner', 'admin', 'revenue_ops', 'sales_manager', 'sales_rep',
    'marketing_growth', 'analyst', 'compliance', 'finance_controller', 'guest',
  ])
  assert.deepEqual(LEGACY_ROLES, ['agent', 'viewer'])
  assert.deepEqual(Object.keys(ROLE_CATALOG).sort(), [...ROLE_KEYS].sort())
  assert.equal(new Set(ROLE_KEYS).size, ROLE_KEYS.length)
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length)
})

test('cada grant es conocido, único y coincide con ROLE_PERMISSIONS', () => {
  for (const role of ROLE_KEYS) {
    const grants = ROLE_GRANTS[role]
    assert.equal(new Set(grants.map(({ permission }) => permission)).size, grants.length, `${role} no debe duplicar grants`)
    for (const grant of grants) {
      assert.ok(PERMISSIONS.includes(grant.permission), `${role}: permiso desconocido ${grant.permission}`)
      assert.ok(['own', 'team', 'org'].includes(grant.scope), `${role}: alcance inválido`)
    }
    assert.deepEqual(ROLE_PERMISSIONS[role], grants.map(({ permission }) => permission))
    assert.deepEqual(permissionsForRole(role), ROLE_PERMISSIONS[role])
  }
  assert.deepEqual(ROLE_PERMISSIONS.owner, PERMISSIONS)
  for (const permission of PERMISSIONS) assert.equal(hasPermission('owner', permission, 'org'), true)
})

test('deniega por defecto roles, permisos y alcances desconocidos o no concedidos', () => {
  assert.equal(isKnownRole('root'), false)
  assert.equal(hasPermission('root', 'dashboard.read'), false)
  assert.equal(hasPermission('owner', 'system.destroy'), false)
  assert.equal(hasPermission(undefined, 'dashboard.read'), false)
  assert.equal(hasPermission('guest', undefined), false)
  assert.deepEqual(permissionsForRole('unknown'), [])

  assert.equal(hasPermission('sales_rep', 'leads.read', 'own'), true)
  assert.equal(hasPermission('sales_rep', 'leads.read', 'team'), false)
  assert.equal(hasPermission('sales_rep', 'leads.read', 'org'), false)
  assert.equal(hasPermission('sales_manager', 'leads.read', 'own'), true)
  assert.equal(hasPermission('sales_manager', 'leads.read', 'team'), true)
  assert.equal(hasPermission('sales_manager', 'leads.read', 'org'), false)
  assert.equal(hasPermission('revenue_ops', 'leads.read', 'org'), true)
})

test('mínimo privilegio: invitado, analista y comercial no reciben capacidades administrativas', () => {
  assert.deepEqual(ROLE_PERMISSIONS.guest, ['dashboard.read'])

  const forbiddenForAnalyst: Permission[] = [
    'leads.read', 'conversations.read', 'campaigns.write', 'experiments.write',
    'data.export_sensitive', 'users.read', 'audit.read',
  ]
  for (const permission of forbiddenForAnalyst) assert.equal(hasPermission('analyst', permission), false)

  const forbiddenForRep: Permission[] = [
    'leads.export', 'campaigns.write', 'ads.write', 'playbooks.write',
    'automations.write', 'users.read', 'audit.read', 'data.export_sensitive',
  ]
  for (const permission of forbiddenForRep) assert.equal(hasPermission('sales_rep', permission), false)
})

test('separación estática: quien solicita gasto no lo aprueba', () => {
  for (const role of ROLE_KEYS.filter((candidate) => candidate !== 'owner')) {
    assert.equal(
      hasPermission(role, 'costs.request') && hasPermission(role, 'costs.approve'),
      false,
      `${role} no puede solicitar y aprobar gasto`,
    )
  }
  assert.equal(hasPermission('marketing_growth', 'costs.request'), true)
  assert.equal(hasPermission('revenue_ops', 'costs.request'), true)
  assert.equal(hasPermission('finance_controller', 'costs.approve'), true)
})

test('separación estática: quien cambia playbooks no aprueba el cambio', () => {
  for (const role of ROLE_KEYS.filter((candidate) => candidate !== 'owner')) {
    assert.equal(
      hasPermission(role, 'playbooks.write') && hasPermission(role, 'playbooks.approve'),
      false,
      `${role} no puede editar y aprobar playbooks`,
    )
    assert.equal(
      hasPermission(role, 'memory.propose') && hasPermission(role, 'memory.approve'),
      false,
      `${role} no puede proponer y aprobar memoria operativa`,
    )
  }
  assert.equal(hasPermission('sales_manager', 'playbooks.approve'), true)
  assert.equal(hasPermission('sales_manager', 'access_request.approve.playbook_change'), true)
  assert.equal(hasPermission('compliance', 'access_request.approve.playbook_change'), false)
  assert.equal(hasPermission('compliance', 'memory.approve'), false)
})

test('separación por tipo: cada solicitud tiene creadores y aprobadores distintos', () => {
  const expectedCreators: Record<string, KnownRole[]> = {
    'access_request.create.role_elevation': ['owner', 'admin'],
    'access_request.create.paid_experiment': ['owner', 'revenue_ops', 'sales_manager', 'marketing_growth', 'agent'],
    'access_request.create.playbook_change': ['owner', 'revenue_ops', 'sales_rep', 'marketing_growth', 'agent'],
  }
  const expectedApprovers: Record<string, KnownRole[]> = {
    'access_request.approve.role_elevation': ['owner'],
    'access_request.approve.paid_experiment': ['owner', 'finance_controller'],
    'access_request.approve.playbook_change': ['owner', 'sales_manager'],
  }

  for (const [permission, expected] of Object.entries({ ...expectedCreators, ...expectedApprovers })) {
    const actual = ROLE_KEYS.filter((role) => hasPermission(role, permission))
    assert.deepEqual(actual, expected, permission)
  }

  // Owner es el aprobador de emergencia. La API persistente debe impedir que
  // apruebe su propia solicitud; el resto de parejas se separa estáticamente.
  for (const role of ROLE_KEYS.filter((candidate) => candidate !== 'owner')) {
    assert.equal(
      hasPermission(role, 'access_request.create.role_elevation') && hasPermission(role, 'access_request.approve.role_elevation'),
      false,
    )
    assert.equal(
      hasPermission(role, 'access_request.create.paid_experiment') && hasPermission(role, 'access_request.approve.paid_experiment'),
      false,
    )
    assert.equal(
      hasPermission(role, 'access_request.create.playbook_change') && hasPermission(role, 'access_request.approve.playbook_change'),
      false,
    )
  }
  assert.equal(hasPermission('admin', 'access_request.create'), true)
  assert.equal(hasPermission('admin', 'access_request.approve.role_elevation'), false)
  assert.equal(hasPermission('sales_rep', 'access_request.create.paid_experiment'), false)
  assert.equal(hasPermission('owner', 'access_request.create'), true)
  assert.equal(hasPermission('owner', 'access_request.approve.role_elevation'), true)
})

test('compatibilidad legacy no hereda aprobaciones sensibles', () => {
  assert.equal(hasPermission('agent', 'leads.write'), true)
  assert.equal(hasPermission('viewer', 'leads.read'), true)
  assert.equal(hasPermission('viewer', 'leads.write'), false)
  for (const role of LEGACY_ROLES) {
    for (const permission of approvalPermissions) assert.equal(hasPermission(role, permission), false)
  }
})

test('los alcances registrados reflejan cartera propia, equipo y organización', () => {
  assert.equal(grantedScope('sales_rep', 'leads.read'), 'own')
  assert.equal(grantedScope('sales_manager', 'leads.read'), 'team')
  assert.equal(grantedScope('revenue_ops', 'leads.read'), 'org')
  assert.equal(grantedScope('guest', 'leads.read'), null)
  assert.equal(grantedScope('unknown', 'leads.read'), null)
})

async function buildPermissionApp(permission: Permission) {
  const app = Fastify()
  await app.register(jwt, { secret: 'rbac-permission-tests-secret-at-least-32-chars' })
  app.get(
    '/orgs/:orgId/resource',
    {
      preHandler: [
        // Esta suite aísla requirePermission: verifica la firma/claims JWT
        // sin exigir una Session/OrganizationMembership real. El middleware
        // authenticate y su lookup tenant-safe se prueban por separado.
        async (request: FastifyRequest) => { await request.jwtVerify() },
        requirePermission(permission, {
          scope: 'org',
          resourceOrgId: (request: FastifyRequest) => (request.params as { orgId: string }).orgId,
        }),
      ],
    },
    async (request) => ({ orgId: (request.user as { orgId: string }).orgId }),
  )
  await app.ready()
  return app
}

function sign(app: Awaited<ReturnType<typeof buildPermissionApp>>, role: string, orgId = 'org-a') {
  return app.jwt.sign({
    userId: `${role}-user`, orgId, role, email: `${role}@example.test`,
    tokenType: 'access', sessionId: `${role}-session`,
  })
}

test('requirePermission usa rol y orgId del JWT y rechaza otro tenant', async () => {
  const app = await buildPermissionApp('governance.read')
  try {
    const compliance = sign(app, 'compliance')
    const allowed = await app.inject({
      method: 'GET', url: '/orgs/org-a/resource',
      headers: { authorization: `Bearer ${compliance}` },
    })
    assert.equal(allowed.statusCode, 200)
    assert.deepEqual(allowed.json(), { orgId: 'org-a' })

    const crossTenant = await app.inject({
      method: 'GET', url: '/orgs/org-b/resource',
      headers: { authorization: `Bearer ${compliance}` },
    })
    assert.equal(crossTenant.statusCode, 403)
    assert.deepEqual(crossTenant.json(), { error: 'Forbidden' })
  } finally {
    await app.close()
  }
})

test('requirePermission ignora roles aportados por body y deniega rol o permiso desconocido', async () => {
  const app = await buildPermissionApp('governance.read')
  try {
    const guest = sign(app, 'guest')
    const forgedBody = await app.inject({
      method: 'GET', url: '/orgs/org-a/resource',
      headers: { authorization: `Bearer ${guest}` },
      payload: { role: 'owner', orgId: 'org-a' },
    })
    assert.equal(forgedBody.statusCode, 403)

    const unknownRole = sign(app, 'root')
    const rejectedRole = await app.inject({
      method: 'GET', url: '/orgs/org-a/resource',
      headers: { authorization: `Bearer ${unknownRole}` },
    })
    assert.equal(rejectedRole.statusCode, 403)
  } finally {
    await app.close()
  }

  const invalidPermissionApp = await buildPermissionApp('nonexistent.permission' as Permission)
  try {
    const owner = sign(invalidPermissionApp, 'owner')
    const rejectedPermission = await invalidPermissionApp.inject({
      method: 'GET', url: '/orgs/org-a/resource',
      headers: { authorization: `Bearer ${owner}` },
    })
    assert.equal(rejectedPermission.statusCode, 403)
  } finally {
    await invalidPermissionApp.close()
  }
})
