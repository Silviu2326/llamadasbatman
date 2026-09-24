import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { zadarmaGatewayUrl } from '../voice/telephony/zadarma/client'
import { buildZadarmaControl } from '../voice/telephony/zadarma/gateway'
import { SipCallRegistry } from '../voice/telephony/zadarma/registry'
import { loadZadarmaGatewayConfig } from '../voice/telephony/zadarma/config'

test('remote gateway accepts TLS with a path and rejects cleartext or embedded secrets', () => {
  assert.equal(zadarmaGatewayUrl('https://crm.example.com/vendrava/'), 'https://crm.example.com/vendrava')
  assert.equal(zadarmaGatewayUrl('http://127.0.0.1:9093'), 'http://127.0.0.1:9093')
  for (const url of ['http://crm.example.com', 'https://user:pass@crm.example.com', 'https://crm.example.com/?token=x', 'ftp://crm.example.com', 'https://crm.example.com/#x']) {
    assert.throws(() => zadarmaGatewayUrl(url))
  }
})

test('remote recordings require gateway authentication and use the scoped loader', async () => {
  const config = loadZadarmaGatewayConfig({ ZADARMA_GATEWAY_ENABLED: 'true', ZADARMA_ORG_ID: 'owner',
    ZADARMA_GATEWAY_TOKEN: 'test-token-'.repeat(5), ZADARMA_CALLER_ID: '+34919931802',
    ZADARMA_AMI_USER: 'test', ZADARMA_AMI_SECRET: 'test-secret' })
  const uuid = randomUUID()
  let loads = 0
  const app = buildZadarmaControl(config, new SipCallRegistry(), {
    prepare: async () => { throw new Error('must not dial') },
    prepareTest: async () => { throw new Error('must not dial') },
    originate: async () => {},
    recording: async id => {
      loads++
      if (id !== uuid) throw new Error('not owned')
      return { filename: `${id}.wav`, size: 64, stream: () => Readable.from([Buffer.alloc(64)]) as any }
    },
  })
  try {
    assert.equal((await app.inject(`/recordings/${uuid}`)).statusCode, 401)
    assert.equal(loads, 0)
    const headers = { authorization: `Bearer ${config.token}` }
    assert.equal((await app.inject({ url: `/recordings/${randomUUID()}`, headers })).statusCode, 409)
    const ok = await app.inject({ url: `/recordings/${uuid}`, headers })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.rawPayload.length, 64)
    assert.match(String(ok.headers['cache-control']), /no-store/)
  } finally { await app.close() }
})

function gatewayConfig() {
  return loadZadarmaGatewayConfig({ ZADARMA_GATEWAY_ENABLED: 'true', ZADARMA_ORG_ID: 'owner',
    ZADARMA_GATEWAY_TOKEN: 'test-token-'.repeat(5), ZADARMA_CALLER_ID: '+34919931802',
    ZADARMA_AMI_USER: 'test', ZADARMA_AMI_SECRET: 'test-secret' })
}

const callBody = (requestId: string) => ({ requestId, orgId: 'owner', leadId: 'lead-1', campaignId: 'camp-1', agentId: 'agent-1' })

test('gateway reports capacity as 429 with a typed code and forgets the request so the same requestId can retry', async () => {
  const config = gatewayConfig()
  const registry = new SipCallRegistry(1)
  registry.reserve('owner:other-lead', async () => { throw new Error('unused') })
  let prepared = 0
  const app = buildZadarmaControl(config, registry, {
    prepare: async () => { prepared++; return { phone: '+34600000000', start: async () => { throw new Error('unused') } } as any },
    prepareTest: async () => { throw new Error('unused') },
    originate: async () => {},
  })
  const headers = { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }
  try {
    const requestId = randomUUID()
    const busy = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(requestId) })
    assert.equal(busy.statusCode, 429)
    const body = busy.json()
    assert.equal(body.code, 'ZADARMA_CAPACITY_REACHED')
    assert.equal(body.error, 'ZADARMA_CAPACITY_REACHED')
    assert.equal(body.retryable, true)
    assert.equal(body.dialed, false)
    assert.ok(body.retryAfterMs >= 20_000 && body.retryAfterMs <= 30_000)
    assert.equal(prepared, 0, 'capacity is checked before loading the agent')
    // Line freed: the very same requestId must now dial instead of replaying the rejection.
    registry.release([...(registry as any).entries.keys()][0])
    const ok = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(requestId) })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().status, 'iniciada')
    assert.equal(prepared, 1)
  } finally { await app.close() }
})

test('gateway returns the real preparation block code and typed originate failures with cause', async () => {
  const config = gatewayConfig()
  const { OriginateError } = await import('../voice/telephony/zadarma/ami')
  let originateError: Error = new OriginateError('ORIGINATE_REJECTED', 'busy', true, 'Originate failed')
  let prepareError: Error | null = new Error('ZADARMA_TEST_CALL_BLOCKED_CONSENT_MISSING')
  const app = buildZadarmaControl(config, new SipCallRegistry(1), {
    prepare: async () => { if (prepareError) throw prepareError; return { phone: '+34600000000', start: async () => { throw new Error('unused') } } as any },
    prepareTest: async () => { throw new Error('unused') },
    originate: async () => { throw originateError },
  })
  const headers = { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }
  try {
    const blocked = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(randomUUID()) })
    assert.equal(blocked.statusCode, 422)
    assert.equal(blocked.json().code, 'ZADARMA_TEST_CALL_BLOCKED_CONSENT_MISSING')
    assert.equal(blocked.json().retryable, false)

    prepareError = null
    const busy = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(randomUUID()) })
    assert.equal(busy.statusCode, 409)
    assert.deepEqual({ code: busy.json().code, cause: busy.json().cause, dialed: busy.json().dialed, retryable: busy.json().retryable },
      { code: 'ORIGINATE_REJECTED', cause: 'busy', dialed: true, retryable: false })

    originateError = new OriginateError('ORIGINATE_TIMEOUT', 'unknown', true, 'AMI_TIMEOUT')
    const requestId = randomUUID()
    const timeout = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(requestId) })
    assert.equal(timeout.statusCode, 409)
    assert.equal(timeout.json().code, 'ORIGINATE_TIMEOUT')
    // Ambiguous result: a replay of the same requestId gets the same answer, never a second dial.
    originateError = new Error('should not dial again')
    const replay = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(requestId) })
    assert.equal(replay.json().code, 'ORIGINATE_TIMEOUT')

    originateError = new OriginateError('AMI_UNAVAILABLE', 'unknown', false, 'AMI_CONNECTION_FAILED')
    const down = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(randomUUID()) })
    assert.equal(down.statusCode, 503)
    assert.equal(down.json().retryable, true)

    const unknown = await app.inject({ method: 'POST', url: '/calls', headers, payload: callBody(randomUUID()) })
    assert.equal(unknown.statusCode, 503)
  } finally { await app.close() }
})

test('originate cause is inferred from the ring timeout when Asterisk gives no reason', async () => {
  const { inferOriginateCause, ORIGINATE_RING_TIMEOUT_MS } = await import('../voice/telephony/zadarma/ami')
  assert.equal(inferOriginateCause(ORIGINATE_RING_TIMEOUT_MS + 200), 'no_answer')
  assert.equal(inferOriginateCause(1_500), 'rejected')
  assert.equal(inferOriginateCause(1_500, '5'), 'busy')
  assert.equal(inferOriginateCause(60_000, '1'), 'no_answer')
})
