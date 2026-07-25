import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCapability,
  assertUsageLimit,
  getEntitlementSnapshot,
  hasCapability,
  normalisePlan,
  planPolicy,
} from '../../access-control'

type Usage = Partial<Record<'users' | 'leads' | 'campaigns' | 'agents' | 'automations', number>>

function fakeDb(plan: string, usage: Usage = {}) {
  const orgFilters: unknown[] = []
  const count = (resource: keyof Usage) => async (args: unknown) => {
    orgFilters.push((args as { where?: unknown }).where)
    return usage[resource] ?? 0
  }

  return {
    orgFilters,
    organization: {
      findUnique: async (args: unknown) => {
        orgFilters.push((args as { where?: unknown }).where)
        return { id: 'org-contract', plan, mauticEnabled: true, postizEnabled: false }
      },
    },
    user: { count: count('users') },
    lead: { count: count('leads') },
    campaign: { count: count('campaigns') },
    agent: { count: count('agents') },
    automation: { count: count('automations') },
  }
}

test('normaliza aliases, espacios y valores desconocidos cerrando por defecto', () => {
  assert.equal(normalisePlan('  PREMIUM '), 'completo')
  assert.equal(normalisePlan('básico'), 'free')
  assert.equal(normalisePlan('agencia'), 'agency')
  assert.equal(normalisePlan(null), 'free')
  assert.equal(normalisePlan('plan-no-registrado'), 'free')
  assert.equal(planPolicy('agency').limits.workspaces, 100)
})

test('la matriz de capacidades mantiene mínimo privilegio por plan', () => {
  assert.equal(hasCapability('free', 'crm'), true)
  assert.equal(hasCapability('free', 'ads'), false)
  assert.equal(hasCapability('pro', 'ads'), true)
  assert.equal(hasCapability('pro', 'email_marketing'), false)
  assert.equal(hasCapability('completo', 'email_marketing'), true)
  assert.equal(hasCapability('agency', 'multiworkspace'), true)
})

test('el snapshot calcula uso por org y rechaza integración o cuota no disponibles', async () => {
  const db = fakeDb('pro', { agents: 5 })
  const snapshot = await getEntitlementSnapshot('org-contract', db as never)

  assert.equal(snapshot.orgId, 'org-contract')
  assert.equal(snapshot.plan, 'pro')
  assert.equal(snapshot.usage.agents, 5)
  assert.equal(snapshot.integrations.postizEnabled, false)
  assert.ok(db.orgFilters.every(value => JSON.stringify(value).includes('org-contract')))

  await assert.rejects(
    () => assertCapability('org-contract', 'social', { snapshot, integration: 'postiz' }),
    (error: { code?: string; statusCode?: number }) => error.code === 'INTEGRATION_DISABLED' && error.statusCode === 403,
  )
  await assert.rejects(
    () => assertUsageLimit('org-contract', 'agents', 1, snapshot),
    (error: { code?: string; statusCode?: number; details?: Record<string, unknown> }) => (
      error.code === 'LIMIT_REACHED' && error.statusCode === 409 && error.details?.limit === 5
    ),
  )
})

test('los incrementos inválidos no pueden saltarse la barrera de cuota', async () => {
  const snapshot = await getEntitlementSnapshot('org-contract', fakeDb('agency') as never)
  await assert.rejects(
    () => assertUsageLimit('org-contract', 'leads', 0, snapshot),
    (error: { code?: string; statusCode?: number }) => error.code === 'LIMIT_REACHED' && error.statusCode === 409,
  )
  await assert.rejects(
    () => assertUsageLimit('org-contract', 'leads', 100_001, snapshot),
    (error: { code?: string; statusCode?: number }) => error.code === 'LIMIT_REACHED' && error.statusCode === 409,
  )
})
