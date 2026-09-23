// Llamada de prueba de un agente en borrador. Lo que se protege aquí es que la
// ruta no se convierta en un atajo para marcar: destino de la lista blanca,
// consentimiento de voz obligatorio y tope diario. Sin base de datos: se
// sustituyen los métodos de Prisma usados por cada caso.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/voice_test_call'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import assert from 'node:assert/strict'
import test from 'node:test'

const READY_AGENT = {
  id: 'agent-1', voiceId: 'voice-1', systemPrompt: 'Hola, soy Carlos.', phoneNumber: '+34919931802',
  callDirection: 'both', lifecycleStatus: 'draft', isActive: true,
}
const ACTIVE_CONSENT = [{ id: 'consent-1', status: 'active', revokedAt: null, expiresAt: null, scope: {} }]
const TEST_NUMBER = {
  id: 'number-1', phone: '+34683529629', label: 'Móvil propio', revokedAt: null, leadId: 'lead-test',
  lead: { id: 'lead-test', name: 'Prueba interna', phone: '+34683529629', company: null },
}
const ALLOWED = async () => ({ allowed: true, reason: '' })

// Los delegados de Prisma no son métodos propios, así que se sustituyen por
// asignación y se restauran al terminar (igual que callWorker.offline.test.ts).
function stub(t: any, target: any, key: string, impl: unknown) {
  const original = target[key]
  target[key] = impl
  t.after(() => { target[key] = original })
}

async function gateWith(t: any, over: {
  agent?: unknown
  consents?: unknown[]
  testNumber?: unknown
  callsToday?: number
  compliance?: () => Promise<{ allowed: boolean; reason: string }>
} = {}) {
  const { prisma } = await import('../lib/prisma')
  const { assertVoiceTestCallAllowed } = await import('../services/voiceTestCall.service')
  stub(t, prisma.agent, 'findFirst', async () => 'agent' in over ? over.agent : READY_AGENT)
  stub(t, prisma.consentGrant, 'findMany', async () => over.consents ?? ACTIVE_CONSENT)
  stub(t, prisma.voiceTestNumber, 'findFirst', async () => 'testNumber' in over ? over.testNumber : TEST_NUMBER)
  stub(t, prisma.call, 'count', async () => over.callsToday ?? 0)
  return assertVoiceTestCallAllowed('org-1', 'agent-1', 'lead-test', { checkCompliance: (over.compliance ?? ALLOWED) as any })
}

test('la prueba exige consentimiento de voz vigente: una licencia de catálogo no basta', async t => {
  assert.deepEqual(await gateWith(t, { consents: [] }), { allowed: false, reason: 'consent_missing' })
  const revoked = [{ ...ACTIVE_CONSENT[0], status: 'revoked' }]
  assert.deepEqual(await gateWith(t, { consents: revoked }), { allowed: false, reason: 'consent_missing' })
  const expired = [{ ...ACTIVE_CONSENT[0], expiresAt: new Date(Date.now() - 1000) }]
  assert.deepEqual(await gateWith(t, { consents: expired }), { allowed: false, reason: 'consent_missing' })
})

test('el agente debe cumplir todo lo demás que exige publicar, salvo la propia prueba', async t => {
  assert.equal((await gateWith(t, { agent: null })).allowed, false)
  for (const [field, reason] of [['voiceId', 'voice_missing'], ['systemPrompt', 'instructions_missing'], ['phoneNumber', 'phone_missing']] as const) {
    assert.deepEqual(await gateWith(t, { agent: { ...READY_AGENT, [field]: null } }), { allowed: false, reason })
  }
  assert.deepEqual(await gateWith(t, { agent: { ...READY_AGENT, callDirection: 'inbound' } }), { allowed: false, reason: 'direction_inbound' })
  for (const lifecycleStatus of ['archived', 'paused']) {
    assert.deepEqual(await gateWith(t, { agent: { ...READY_AGENT, lifecycleStatus } }), { allowed: false, reason: 'agent_not_testable' })
  }
  assert.deepEqual(await gateWith(t, { agent: { ...READY_AGENT, isActive: false } }), { allowed: false, reason: 'agent_not_testable' })
})

test('el destino sale de la lista blanca y su teléfono se lee en base de datos', async t => {
  assert.deepEqual(await gateWith(t, { testNumber: null }), { allowed: false, reason: 'number_not_found' })
  assert.deepEqual(await gateWith(t, { testNumber: { ...TEST_NUMBER, revokedAt: new Date() } }), { allowed: false, reason: 'number_revoked' })
  // Teléfono del contacto cambiado por detrás: no se marca al que no fue autorizado.
  const moved = { ...TEST_NUMBER, lead: { ...TEST_NUMBER.lead, phone: '+34600111222' } }
  assert.deepEqual(await gateWith(t, { testNumber: moved }), { allowed: false, reason: 'number_without_phone' })

  const allowed = await gateWith(t)
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.allowed && allowed.phone, '+34683529629')
})

test('tope diario y cumplimiento cortan la prueba', async t => {
  const { MAX_TEST_CALLS_PER_DAY } = await import('../services/voiceTestCall.service')
  assert.deepEqual(await gateWith(t, { callsToday: MAX_TEST_CALLS_PER_DAY }), { allowed: false, reason: 'daily_limit' })
  const blocked = await gateWith(t, { compliance: async () => ({ allowed: false, reason: 'outside_hours' }) })
  assert.deepEqual(blocked, { allowed: false, reason: 'compliance', detail: 'outside_hours' })
})

test('un teléfono que ya es de un contacto del CRM no puede darse de alta como número de prueba', async t => {
  const { prisma } = await import('../lib/prisma')
  const { registerVoiceTestNumber } = await import('../services/voiceTestCall.service')
  let writes = 0
  stub(t, prisma.optOut, 'findUnique', async () => null)
  stub(t, prisma.voiceTestNumber, 'findFirst', async () => null)
  stub(t, prisma.lead, 'findFirst', async () => ({ id: 'lead-real' }))
  stub(t, prisma, '$transaction', async () => { writes++; assert.fail('no debe escribir nada') })

  const attestation = 'Es mi propio móvil y autorizo recibir llamadas de prueba grabadas.'
  assert.deepEqual(await registerVoiceTestNumber('org-1', 'user-1', { phone: '+34683529629', label: 'Mío', attestation }), { status: 'phone_belongs_to_lead' })
  assert.equal(writes, 0)

  // Sin declaración escrita tampoco se da de alta, ni con un teléfono ilegible.
  assert.deepEqual(await registerVoiceTestNumber('org-1', 'user-1', { phone: '+34683529629', label: 'Mío', attestation: 'mío' }), { status: 'invalid_attestation' })
  assert.deepEqual(await registerVoiceTestNumber('org-1', 'user-1', { phone: 'no-es-un-telefono', label: 'Mío', attestation }), { status: 'invalid_phone' })
})

test('la pasarela separa los dos caminos: campaña con campaña, prueba con mode test', async () => {
  const { randomUUID } = await import('node:crypto')
  const { loadZadarmaGatewayConfig } = await import('../voice/telephony/zadarma/config')
  const { buildZadarmaControl } = await import('../voice/telephony/zadarma/gateway')
  const { SipCallRegistry } = await import('../voice/telephony/zadarma/registry')
  const config = loadZadarmaGatewayConfig({
    ZADARMA_GATEWAY_ENABLED: 'true', ZADARMA_ORG_ID: 'org-test', ZADARMA_GATEWAY_TOKEN: 't'.repeat(40),
    ZADARMA_CALLER_ID: '+34910000000', ZADARMA_AMI_USER: 'test', ZADARMA_AMI_SECRET: 'test-only',
  })
  const taken: string[] = []
  const prepared = (kind: string) => async () => {
    taken.push(kind)
    return { phone: '+34683529629', start: async () => ({ session: {} as any, callbacks: {}, finish: async () => {} }) }
  }
  const control = buildZadarmaControl(config, new SipCallRegistry(4), {
    prepare: prepared('campaign') as any, prepareTest: prepared('test') as any, originate: async () => {},
  })
  const send = (payload: unknown) => control.inject({ method: 'POST', url: '/calls', payload: payload as any, headers: { authorization: `Bearer ${config.token}` } })
  const identity = { orgId: 'org-test', agentId: 'agent-1' }
  try {
    assert.equal((await send({ ...identity, leadId: 'lead-campaign', requestId: randomUUID(), campaignId: 'campaign-1' })).statusCode, 200)
    assert.equal((await send({ ...identity, leadId: 'lead-test', requestId: randomUUID(), mode: 'test' })).statusCode, 200)
    assert.deepEqual(taken, ['campaign', 'test'])
    // Ni una prueba con campaña ni una llamada de campaña sin campaña.
    assert.equal((await send({ ...identity, leadId: 'lead-x', requestId: randomUUID(), mode: 'test', campaignId: 'campaign-1' })).statusCode, 400)
    assert.equal((await send({ ...identity, leadId: 'lead-x', requestId: randomUUID() })).statusCode, 400)
    assert.deepEqual(taken, ['campaign', 'test'])
  } finally { await control.close() }
})

test('sin pasarela propia la prueba no cae de vuelta a la telefonía de campañas', async t => {
  const { startOutboundCall } = await import('../voice/telephony/outbound')
  const previous = process.env.ZADARMA_GATEWAY_ENABLED
  process.env.ZADARMA_GATEWAY_ENABLED = 'false'
  t.after(() => { process.env.ZADARMA_GATEWAY_ENABLED = previous })
  await assert.rejects(
    () => startOutboundCall({ mode: 'test', orgId: 'org-1', agentId: 'agent-1', leadId: 'lead-test', toNumber: '+34683529629' }),
    /TEST_CALL_REQUIRES_ZADARMA_GATEWAY/,
  )
})
