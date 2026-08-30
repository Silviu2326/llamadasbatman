// Tests de contrato del router (docs/plataforma-abierta/04-ROUTER.md §7).
// Offline: la política de org captura el fallo de BD y devuelve política
// vacía, así que basta una DATABASE_URL de mentira fijada antes de importar.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { registerCapabilityContract, registerProvider } from '../providers/registry'
import { reportProviderFailure, resetBreakerForTests, route, RoutingError } from '../providers/router'
import type { CapabilityBinding, ProviderDescriptor } from '../providers/types'

const CAP = 'test.echo'

function binding(over: Partial<CapabilityBinding> & { cents: number }): CapabilityBinding {
  return {
    capability: CAP,
    qualityTier: over.qualityTier ?? 'standard',
    limits: {},
    estimateCost: async () => ({ cents: over.cents, confidence: 'exact' }),
    execute: async () => ({ output: { ok: true } }),
    ...over,
  }
}

function provider(id: string, envKey: string | null, b: CapabilityBinding): ProviderDescriptor {
  // La resolución de credencial usa el mapa de envs globales por proveedor;
  // los ids de prueba no están ahí, así que se simula credencial global
  // apuntando el binding a un provider ya conocido no vale: en su lugar, los
  // tests usan ids reales del mapa (deepseek/brave) que sí resuelven por env.
  return {
    id,
    displayName: id,
    capabilities: [b],
    auth: { modes: ['managed'] },
    commercialUseAllowed: true,
    tosReviewedAt: '2026-08-18',
    docsUrl: 'https://example.test',
  }
}

// Los ids 'deepseek' y 'brave' están en GLOBAL_ENV_BY_PROVIDER (credentials.ts)
// y resuelven en modo gestionado si su env existe: se fija aquí.
process.env.DEEPSEEK_API_KEY = 'test-key'
process.env.BRAVE_SEARCH_API_KEY = 'test-key'

registerCapabilityContract({ capability: CAP, input: z.object({ q: z.string() }), output: z.any() })
registerProvider(provider('deepseek', 'DEEPSEEK_API_KEY', binding({ cents: 10, qualityTier: 'premium' })))
registerProvider(provider('brave', 'BRAVE_SEARCH_API_KEY', binding({ cents: 2, qualityTier: 'draft' })))
registerProvider(provider('proveedor-sin-credencial', null, binding({ cents: 1 })))

test('la preferencia explícita de proveedor gana si es viable', async () => {
  resetBreakerForTests()
  const { decision } = await route({
    orgId: 'org-test',
    capability: CAP,
    input: { q: 'hola' },
    preferences: { providerId: 'deepseek' },
  })
  assert.equal(decision.providerId, 'deepseek')
  assert.equal(decision.estimateCents, 10)
})

test('preferir un proveedor excluido lanza PREFERRED_PROVIDER_UNAVAILABLE', async () => {
  resetBreakerForTests()
  await assert.rejects(
    route({
      orgId: 'org-test',
      capability: CAP,
      input: { q: 'hola' },
      preferences: { providerId: 'proveedor-sin-credencial' },
    }),
    (err: unknown) => err instanceof RoutingError && err.code === 'PREFERRED_PROVIDER_UNAVAILABLE',
  )
})

test('maxCostCents excluye al caro y la exclusión queda explicada', async () => {
  resetBreakerForTests()
  const { decision } = await route({
    orgId: 'org-test',
    capability: CAP,
    input: { q: 'hola' },
    preferences: { maxCostCents: 5 },
  })
  assert.equal(decision.providerId, 'brave')
  const excluded = decision.exclusions.find((e) => e.providerId === 'deepseek')
  assert.ok(excluded && /tope de coste/.test(excluded.reason))
})

test('tier draft elige al barato; premium al de calidad', async () => {
  resetBreakerForTests()
  const draft = await route({ orgId: 'org-test', capability: CAP, input: { q: 'x' }, preferences: { tier: 'draft' } })
  assert.equal(draft.decision.providerId, 'brave')
  const premium = await route({ orgId: 'org-test', capability: CAP, input: { q: 'x' }, preferences: { tier: 'premium' } })
  assert.equal(premium.decision.providerId, 'deepseek')
})

test('el breaker abierto excluye al proveedor con motivo', async () => {
  resetBreakerForTests()
  for (let i = 0; i < 4; i++) reportProviderFailure('brave', CAP)
  const { decision } = await route({ orgId: 'org-test', capability: CAP, input: { q: 'x' }, preferences: { tier: 'draft' } })
  assert.equal(decision.providerId, 'deepseek')
  const excluded = decision.exclusions.find((e) => e.providerId === 'brave')
  assert.ok(excluded && /degradado/.test(excluded.reason))
  resetBreakerForTests()
})

test('el proveedor sin credencial queda excluido con motivo accionable', async () => {
  resetBreakerForTests()
  const { decision } = await route({ orgId: 'org-test', capability: CAP, input: { q: 'x' } })
  const excluded = decision.exclusions.find((e) => e.providerId === 'proveedor-sin-credencial')
  assert.ok(excluded && /credencial/i.test(excluded.reason))
})

test('entrada inválida contra el contrato lanza CAPABILITY_INPUT_INVALID', async () => {
  await assert.rejects(
    route({ orgId: 'org-test', capability: CAP, input: { nope: 1 } }),
    (err: unknown) => err instanceof RoutingError && err.code === 'CAPABILITY_INPUT_INVALID',
  )
})
