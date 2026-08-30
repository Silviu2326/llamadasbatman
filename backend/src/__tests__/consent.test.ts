// Tests offline de la lógica pura de validez de un ConsentGrant
// (docs/plataforma-abierta/08-SEGURIDAD-Y-DERECHOS.md §2). `evaluateConsent`
// no toca la base de datos, pero el módulo importa el cliente de Prisma:
// misma DATABASE_URL de mentira que providerRouter.test.ts, antes de importar.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectConsentGrantIds, evaluateConsent, type EvaluableGrant } from '../services/consent.service'

const NOW = new Date('2026-08-18T12:00:00Z')

function grant(over: Partial<EvaluableGrant> = {}): EvaluableGrant {
  return {
    status: 'active',
    revokedAt: null,
    expiresAt: null,
    scope: { channels: [], regions: [], purposes: [], exclusions: [] },
    ...over,
  }
}

test('un grant inexistente no es válido', () => {
  const result = evaluateConsent(null, { now: NOW })
  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /no existe/)
})

test('un grant revocado no es válido aunque el status no se haya actualizado', () => {
  // revokedAt puesto pero status desincronizado: la marca temporal manda.
  const result = evaluateConsent(grant({ status: 'active', revokedAt: new Date('2026-08-01T00:00:00Z') }), { now: NOW })
  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /revocado/)
})

test('status revoked también invalida sin revokedAt', () => {
  const result = evaluateConsent(grant({ status: 'revoked' }), { now: NOW })
  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /revocado/)
})

test('un grant caducado no es válido y pide marcarse expired si sigue active', () => {
  const result = evaluateConsent(grant({ expiresAt: new Date('2026-08-17T00:00:00Z') }), { now: NOW })
  assert.equal(result.valid, false)
  assert.match(result.reason ?? '', /caducado/)
  assert.equal(result.expiredNow, true)
})

test('un grant ya marcado expired no vuelve a pedir la marca', () => {
  const result = evaluateConsent(grant({ status: 'expired', expiresAt: new Date('2026-08-17T00:00:00Z') }), { now: NOW })
  assert.equal(result.valid, false)
  assert.notEqual(result.expiredNow, true)
})

test('la caducidad futura no invalida', () => {
  const result = evaluateConsent(grant({ expiresAt: new Date('2027-01-01T00:00:00Z') }), { now: NOW })
  assert.equal(result.valid, true)
})

test('listas vacías = sin restricción de canal ni propósito', () => {
  const result = evaluateConsent(grant(), { purpose: 'ads', channel: 'instagram', now: NOW })
  assert.equal(result.valid, true)
})

test('el propósito pedido tiene que estar en scope.purposes si la lista tiene contenido', () => {
  const g = grant({ scope: { channels: [], regions: [], purposes: ['organic_social'], exclusions: [] } })
  assert.equal(evaluateConsent(g, { purpose: 'organic_social', now: NOW }).valid, true)
  const denied = evaluateConsent(g, { purpose: 'ads', now: NOW })
  assert.equal(denied.valid, false)
  assert.match(denied.reason ?? '', /propósito/)
})

test('el canal pedido tiene que estar en scope.channels si la lista tiene contenido', () => {
  const g = grant({ scope: { channels: ['instagram', 'facebook'], regions: [], purposes: [], exclusions: [] } })
  assert.equal(evaluateConsent(g, { channel: 'instagram', now: NOW }).valid, true)
  const denied = evaluateConsent(g, { channel: 'tiktok', now: NOW })
  assert.equal(denied.valid, false)
  assert.match(denied.reason ?? '', /canal/)
})

test('la comparación de alcance no distingue mayúsculas', () => {
  const g = grant({ scope: { channels: ['Instagram'], regions: [], purposes: [], exclusions: [] } })
  assert.equal(evaluateConsent(g, { channel: 'instagram', now: NOW }).valid, true)
})

test('las exclusiones ganan aunque el resto del alcance permita el uso', () => {
  const g = grant({ scope: { channels: [], regions: [], purposes: [], exclusions: ['tiktok'] } })
  const denied = evaluateConsent(g, { channel: 'tiktok', now: NOW })
  assert.equal(denied.valid, false)
  assert.match(denied.reason ?? '', /excluido/)
})

test('sin propósito ni canal pedidos, un grant activo con alcance restringido es válido', () => {
  const g = grant({ scope: { channels: ['instagram'], regions: [], purposes: ['ads'], exclusions: [] } })
  assert.equal(evaluateConsent(g, { now: NOW }).valid, true)
})

test('un scope malformado (no objeto / listas no array) se trata como sin restricción', () => {
  assert.equal(evaluateConsent(grant({ scope: null }), { channel: 'instagram', now: NOW }).valid, true)
  assert.equal(evaluateConsent(grant({ scope: { channels: 'instagram' } }), { channel: 'tiktok', now: NOW }).valid, true)
})

test('la genealogía N:M reúne todos los consentimientos sin colgarse con ciclos', async () => {
  const graph = new Map([
    ['final', { consentGrantId: null, parentAssetIds: ['imagen', 'voz'] }],
    ['imagen', { consentGrantId: 'grant-face', parentAssetIds: ['final'] }],
    ['voz', { consentGrantId: 'grant-voice', parentAssetIds: [] }],
  ])
  const grants = await collectConsentGrantIds('final', async id => graph.get(id) ?? null)
  assert.deepEqual(new Set(grants), new Set(['grant-face', 'grant-voice']))
})

test('la genealogía respeta el límite de profundidad', async () => {
  const grants = await collectConsentGrantIds('a', async id => ({
    consentGrantId: id === 'd' ? 'demasiado-lejos' : null,
    parentAssetIds: id === 'a' ? ['b'] : id === 'b' ? ['c'] : id === 'c' ? ['d'] : [],
  }), 3)
  assert.deepEqual(grants, [])
})
