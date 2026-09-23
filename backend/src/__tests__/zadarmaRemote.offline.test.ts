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
