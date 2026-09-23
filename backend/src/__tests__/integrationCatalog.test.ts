import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIntegrationCatalog,
  mergeCredentialProviders,
  normalizeCredentialFields,
} from '../lib/integrationCatalog'
import { automationsAffectedByProvider } from '../services/integrationDependencies.service'
import { byokProviderIds, registerProvider } from '../providers/registry'
import type { ProviderDescriptor } from '../providers/types'

/**
 * Catálogo del Centro de conexiones y unión BYOK (03-PROVEEDORES §4 y §6).
 *
 * Pruebas 100% offline: ni Prisma ni red. El registro de proveedores es un
 * Map en memoria y cada archivo de test corre en su propio proceso, así que
 * registrar descriptores falsos aquí no contamina al resto de la suite.
 */

// La lista legacy real vive en organizationCredentials.service (que importa
// Prisma); aquí se replica el literal porque lo que se prueba es la mecánica
// de unión, no el contenido de la lista.
const LEGACY = ['metricool', 'twilio', 'telegram', 'google'] as const

function fakeDescriptor(overrides: Partial<ProviderDescriptor> & { id: string }): ProviderDescriptor {
  return {
    displayName: overrides.id,
    capabilities: [],
    auth: { modes: ['byok'] },
    commercialUseAllowed: true,
    tosReviewedAt: '2026-08-01',
    docsUrl: 'https://example.com/docs',
    ...overrides,
  }
}

const byokFake = fakeDescriptor({
  id: 'test-fake-byok',
  displayName: 'Fake BYOK',
  capabilities: [
    {
      capability: 'image.generate',
      qualityTier: 'standard',
      limits: { rpm: 10 },
      estimateCost: async () => ({ cents: 1, confidence: 'estimate' }),
      execute: async () => ({ output: null }),
    },
  ],
  auth: {
    modes: ['byok', 'managed'],
    byokFields: [
      { key: 'apiKey', label: 'API key', kind: 'secret', required: true, help: 'Panel del proveedor' },
      { key: 'baseUrl', label: 'Base URL', kind: 'url', required: false },
    ],
    testConnection: async () => ({ ok: true }),
  },
})

const managedOnlyFake = fakeDescriptor({
  id: 'test-fake-managed',
  displayName: 'Fake gestionado',
  auth: { modes: ['managed'] },
})

registerProvider(byokFake)
registerProvider(managedOnlyFake)

test('la unión admite legacy + BYOK del registro y excluye a los gestionados puros', () => {
  const union = mergeCredentialProviders(LEGACY, byokProviderIds())
  for (const legacyId of LEGACY) assert.ok(union.includes(legacyId), `falta ${legacyId}`)
  assert.ok(union.includes('test-fake-byok'))
  assert.ok(!union.includes('test-fake-managed'))
})

test('la unión no duplica un proveedor legacy que gana descriptor', () => {
  assert.deepEqual(mergeCredentialProviders(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
})

test('normalizeCredentialFields cubre string simple, JSON de campos y basura', () => {
  assert.deepEqual(normalizeCredentialFields('sk-plain-secret'), { apiKey: 'sk-plain-secret' })
  assert.deepEqual(normalizeCredentialFields('"sk-json-string"'), { apiKey: 'sk-json-string' })
  assert.deepEqual(normalizeCredentialFields('{"apiKey":"k","region":"eu"}'), { apiKey: 'k', region: 'eu' })
  assert.deepEqual(
    normalizeCredentialFields({ apiKey: 'k', port: 443, nested: { no: true }, empty: null }),
    { apiKey: 'k', port: '443' },
  )
  assert.equal(normalizeCredentialFields('   '), null)
  assert.equal(normalizeCredentialFields(['a']), null)
  assert.equal(normalizeCredentialFields({}), null)
  assert.equal(normalizeCredentialFields(undefined), null)
})

test('el catálogo combina registro y legacy con estado de conexión y consumo', () => {
  const now = new Date()
  const entries = buildIntegrationCatalog({
    descriptors: [byokFake, managedOnlyFake],
    legacyProviders: LEGACY,
    credentials: [
      {
        provider: 'test-fake-byok',
        slot: 'default',
        status: 'connected',
        lastUsedAt: now,
        lastError: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      },
      {
        provider: 'test-fake-byok',
        slot: 'backup',
        status: 'error',
        lastUsedAt: null,
        lastError: 'boom',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      },
      {
        provider: 'twilio',
        slot: 'ventas',
        status: 'error',
        lastUsedAt: null,
        lastError: 'auth failed',
        accessTokenExpiresAt: now,
        refreshTokenExpiresAt: null,
      },
    ],
    usageByProvider: { 'test-fake-byok': { quantity: 12, costCents: 340 } },
  })

  // Registro primero (ordenado por id) y luego los legacy sin descriptor.
  assert.deepEqual(
    entries.map(entry => entry.id),
    ['test-fake-byok', 'test-fake-managed', 'google', 'metricool', 'telegram', 'twilio'],
  )

  const fake = entries.find(entry => entry.id === 'test-fake-byok')!
  assert.equal(fake.legacy, false)
  assert.equal(fake.displayName, 'Fake BYOK')
  assert.deepEqual(fake.modes, ['byok', 'managed'])
  assert.deepEqual(fake.capabilities, [{ capability: 'image.generate', qualityTier: 'standard' }])
  assert.deepEqual(fake.byokFields, [
    { key: 'apiKey', label: 'API key', kind: 'secret', required: true, help: 'Panel del proveedor' },
    { key: 'baseUrl', label: 'Base URL', kind: 'url', required: false },
  ])
  assert.equal(fake.docsUrl, 'https://example.com/docs')
  assert.equal(fake.commercialUseAllowed, true)
  // El estado agregado es el del slot "default"; los demás siguen listados.
  assert.equal(fake.connection.status, 'connected')
  assert.equal(fake.connection.slots.length, 2)
  assert.equal(fake.connection.slots.find(slot => slot.slot === 'backup')?.lastError, 'boom')
  assert.deepEqual(fake.usage, { quantity: 12, costCents: 340 })
  // Nunca viajan valores de secretos en el catálogo.
  assert.ok(!JSON.stringify(fake).includes('sk-'))

  const managed = entries.find(entry => entry.id === 'test-fake-managed')!
  assert.deepEqual(managed.modes, ['managed'])
  assert.equal(managed.connection.status, 'not_connected')
  assert.deepEqual(managed.usage, { quantity: 0, costCents: 0 })

  const twilio = entries.find(entry => entry.id === 'twilio')!
  assert.equal(twilio.legacy, true)
  assert.equal(twilio.displayName, 'Twilio')
  assert.deepEqual(twilio.modes, ['byok'])
  // Sin slot "default", manda el primero disponible.
  assert.equal(twilio.connection.status, 'error')
  assert.equal(twilio.connection.slots[0]?.accessTokenExpiresAt, now)

  const telegram = entries.find(entry => entry.id === 'telegram')!
  assert.equal(telegram.connection.status, 'not_connected')
  assert.deepEqual(telegram.connection.slots, [])
})

test('un legacy con descriptor propio no se duplica en el catálogo', () => {
  const twilioDescriptor = fakeDescriptor({ id: 'twilio', displayName: 'Twilio (registro)' })
  const entries = buildIntegrationCatalog({
    descriptors: [twilioDescriptor],
    legacyProviders: LEGACY,
    credentials: [],
    usageByProvider: {},
  })
  const twilioEntries = entries.filter(entry => entry.id === 'twilio')
  assert.equal(twilioEntries.length, 1)
  assert.equal(twilioEntries[0].legacy, false)
  assert.equal(twilioEntries[0].displayName, 'Twilio (registro)')
})

test('el impacto de desconexión identifica automatizaciones por acciones reales', () => {
  const automations = [
    { id: 'a1', name: 'Email', actions: [{ type: 'send_email_template' }, { type: 'log' }] },
    { id: 'a2', name: 'Voz', actions: [{ type: 'queue_voice_call' }, { type: 'send_whatsapp_template' }] },
    { id: 'a3', name: 'Local', actions: [{ type: 'update_lead_status' }] },
  ]
  assert.deepEqual(automationsAffectedByProvider('resend', automations), [
    { automationId: 'a1', name: 'Email', actions: ['send_email_template'] },
  ])
  assert.deepEqual(automationsAffectedByProvider('twilio', automations), [
    { automationId: 'a2', name: 'Voz', actions: ['queue_voice_call', 'send_whatsapp_template'] },
  ])
  assert.deepEqual(automationsAffectedByProvider('magnific', automations), [])
})
