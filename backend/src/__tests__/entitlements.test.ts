import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCapability,
  assertUsageLimit,
  getEntitlementSnapshot,
  hasCapability,
  normalisePlan,
  planPolicy,
} from '../access-control'
import {
  applyWorkspaceContext,
  getWorkspaceGrantsForUser,
  type WorkspaceGrant,
} from '../services/workspaceAccess.service'
import { prisma } from '../lib/prisma'
import { cleanupOrgs } from './testHelpers'

test('normaliza planes y mantiene las capacidades cerradas por defecto', () => {
  assert.equal(normalisePlan('premium'), 'completo')
  assert.equal(normalisePlan('agencia'), 'agency')
  assert.equal(normalisePlan('un-plan-inventado'), 'free')
  assert.equal(hasCapability('free', 'crm'), true)
  assert.equal(hasCapability('free', 'ads'), false)
  assert.equal(hasCapability('pro', 'ads'), true)
  assert.equal(hasCapability('completo', 'email_marketing'), true)
  assert.equal(hasCapability('agency', 'multiworkspace'), true)
  assert.equal(planPolicy(undefined).limits.workspaces, 1)
})

function fakeDb(orgPlan: string, usage: Partial<Record<'users' | 'leads' | 'campaigns' | 'agents' | 'automations', number>> = {}) {
  return {
    organization: { findUnique: async () => ({ id: 'org-a', plan: orgPlan, mauticEnabled: true, metricoolEnabled: true }) },
    user: { count: async () => usage.users ?? 0 },
    lead: { count: async () => usage.leads ?? 0 },
    campaign: { count: async () => usage.campaigns ?? 0 },
    agent: { count: async () => usage.agents ?? 0 },
    automation: { count: async () => usage.automations ?? 0 },
  }
}

test('el entitlement consulta plan y uso de la organización, nunca el cliente', async () => {
  const snapshot = await getEntitlementSnapshot('org-a', fakeDb('free', { agents: 1 }) as never)
  assert.equal(snapshot.plan, 'free')
  assert.equal(snapshot.usage.agents, 1)
  await assert.rejects(
    () => assertCapability('org-a', 'ads', { snapshot }),
    (error: { code?: string; statusCode?: number; details?: Record<string, unknown> }) => {
      assert.equal(error.code, 'PLAN_CAPABILITY_REQUIRED')
      assert.equal(error.statusCode, 403)
      assert.equal(error.details?.upgradeRequired, true)
      return true
    },
  )
  await assert.rejects(
    () => assertUsageLimit('org-a', 'agents', 1, snapshot),
    (error: { code?: string; statusCode?: number; details?: Record<string, unknown> }) => {
      assert.equal(error.code, 'LIMIT_REACHED')
      assert.equal(error.statusCode, 409)
      assert.equal(error.details?.limit, 1)
      return true
    },
  )
})

test('el workspace primario sigue funcionando sin claims y el secundario exige concesión', async () => {
  type WorkspaceRequestMock = {
    headers: Record<string, string | string[] | undefined>
    user: Record<string, unknown>
    workspaceId?: string
  }
  // `applyWorkspaceContext` consulta prisma de verdad (no admite inyección), así
  // que la organización primaria tiene que existir: sin ella el guard corta con
  // 404 WORKSPACE_NOT_FOUND antes de llegar a la comprobación de concesión, que
  // es justo lo que este test debe verificar. Plan `agency` para superar el gate
  // de `multiworkspace` y llegar de verdad al chequeo del grant.
  await prisma.organization.create({ data: { id: 'org-a', name: 'test-org-a-workspace', plan: 'agency' } })
  try {
  const primaryRequest: WorkspaceRequestMock = { headers: {}, user: { userId: 'u-1', orgId: 'org-a', role: 'owner' } }
  await applyWorkspaceContext(primaryRequest)
  assert.equal(primaryRequest.workspaceId, 'org-a')

  const secondaryRequest: WorkspaceRequestMock = { headers: { 'x-workspace-id': 'org-b' }, user: { userId: 'u-1', orgId: 'org-a', role: 'owner' } }
  await assert.rejects(() => applyWorkspaceContext(secondaryRequest), (error: { code?: string; statusCode?: number }) => {
    assert.equal(error.code, 'WORKSPACE_ACCESS_DENIED')
    assert.equal(error.statusCode, 403)
    return true
  })
  } finally {
    await cleanupOrgs(['org-a'])
  }
})

test('los grants de agencia solo se emiten para el usuario configurado', () => {
  const previous = process.env.AGENCY_WORKSPACE_GRANTS_JSON
  process.env.AGENCY_WORKSPACE_GRANTS_JSON = JSON.stringify([
    { agencyOrgId: 'org-a', email: 'agency@example.test', workspaceId: 'org-b', role: 'sales_manager', scope: 'org' },
  ])
  try {
    const grants = getWorkspaceGrantsForUser({ userId: 'u-1', email: 'agency@example.test', orgId: 'org-a', role: 'owner' })
    assert.deepEqual(grants.map((grant: WorkspaceGrant) => grant.workspaceId), ['org-a', 'org-b'])
    const other = getWorkspaceGrantsForUser({ userId: 'u-2', email: 'other@example.test', orgId: 'org-a', role: 'owner' })
    assert.deepEqual(other.map((grant: WorkspaceGrant) => grant.workspaceId), ['org-a'])
  } finally {
    if (previous === undefined) delete process.env.AGENCY_WORKSPACE_GRANTS_JSON
    else process.env.AGENCY_WORKSPACE_GRANTS_JSON = previous
  }
})
