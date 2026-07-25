import assert from 'node:assert/strict'
import test from 'node:test'
import { AccessControlError, assertCanDecide, getCatalog } from '../services/accessControl.service'

test('el catalogo expone capacidades de solicitud y aprobacion por tipo', () => {
  const admin = getCatalog('admin')
  const owner = getCatalog('owner')
  const finance = getCatalog('finance_controller')

  assert.equal(admin.requestTypes.find(item => item.id === 'role_elevation')?.canRequest, true)
  assert.equal(admin.requestTypes.find(item => item.id === 'role_elevation')?.canApprove, false)
  assert.equal(owner.requestTypes.find(item => item.id === 'role_elevation')?.canApprove, true)
  assert.equal(finance.requestTypes.find(item => item.id === 'paid_experiment')?.canApprove, true)
  assert.equal(finance.requestTypes.find(item => item.id === 'paid_experiment')?.canRequest, false)
})

test('la politica dinamica impide autoaprobacion incluso al owner', () => {
  assert.throws(
    () => assertCanDecide(
      { userId: 'owner-1', orgId: 'org-1', role: 'owner' },
      { type: 'paid_experiment', requesterUserId: 'owner-1', payload: { budgetCents: 5_000 } },
    ),
    (error: unknown) => error instanceof AccessControlError && error.code === 'SELF_APPROVAL_FORBIDDEN',
  )
})

test('solo los roles aprobadores del tipo pueden decidir', () => {
  assert.throws(
    () => assertCanDecide(
      { userId: 'admin-2', orgId: 'org-1', role: 'admin' },
      { type: 'role_elevation', requesterUserId: 'admin-1', payload: { requestedRole: 'sales_manager' } },
    ),
    (error: unknown) => error instanceof AccessControlError && error.code === 'FORBIDDEN',
  )

  assert.doesNotThrow(() => assertCanDecide(
    { userId: 'owner-1', orgId: 'org-1', role: 'owner' },
    { type: 'role_elevation', requesterUserId: 'admin-1', payload: { requestedRole: 'sales_manager' } },
  ))
  assert.doesNotThrow(() => assertCanDecide(
    { userId: 'finance-1', orgId: 'org-1', role: 'finance_controller' },
    { type: 'paid_experiment', requesterUserId: 'growth-1', payload: { authorUserId: 'growth-1', budgetCents: 10_000 } },
  ))
})

test('el autor de un cambio de playbook no puede aprobarlo', () => {
  assert.throws(
    () => assertCanDecide(
      { userId: 'manager-1', orgId: 'org-1', role: 'sales_manager' },
      { type: 'playbook_change', requesterUserId: 'ops-1', payload: { authorUserId: 'manager-1' } },
    ),
    (error: unknown) => error instanceof AccessControlError && error.code === 'AUTHOR_APPROVAL_FORBIDDEN',
  )
})
