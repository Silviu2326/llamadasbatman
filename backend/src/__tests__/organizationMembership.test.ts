process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeIdentityFromMemberships } from '../services/auth.service'
import { canAssignOrganizationRole } from '../routes/organizations'

test('login selecciona membership default no primaria y usa su rol efectivo', () => {
  const user = { id: 'u1', orgId: 'legacy-org', role: 'owner', email: 'u@example.test', name: 'User' }
  const identity = activeIdentityFromMemberships(user, [
    { orgId: 'legacy-org', role: 'owner', status: 'active', isDefault: false, createdAt: new Date('2026-01-01') },
    { orgId: 'other-org', role: 'analyst', status: 'active', isDefault: true, createdAt: new Date('2026-02-01') },
  ])
  assert.equal(identity.orgId, 'other-org')
  assert.equal(identity.role, 'analyst')
})

test('una organización preferida exige membership activa', () => {
  const user = { id: 'u1', orgId: 'legacy-org', role: 'owner', email: 'u@example.test', name: 'User' }
  const identity = activeIdentityFromMemberships(user, [
    { orgId: 'suspended-org', role: 'admin', status: 'suspended', isDefault: true, createdAt: new Date() },
    { orgId: 'active-org', role: 'viewer', status: 'active', isDefault: false, createdAt: new Date() },
  ], 'suspended-org')
  assert.equal(identity.orgId, 'active-org')
  assert.equal(identity.role, 'viewer')
})

test('un admin no puede elevar membresías a roles privilegiados', () => {
  assert.equal(canAssignOrganizationRole('admin', 'viewer'), true)
  assert.equal(canAssignOrganizationRole('admin', 'owner'), false)
  assert.equal(canAssignOrganizationRole('admin', 'finance_controller'), false)
  assert.equal(canAssignOrganizationRole('owner', 'finance_controller'), true)
})
