import test from 'node:test'
import assert from 'node:assert/strict'
import { CallsRobinApiError, CallsRobinClient } from '../src/callsrobin-client.js'
import { loadConfig } from '../src/config.js'

const config = loadConfig({
  CALLSROBIN_API_URL: 'http://localhost:3000/',
  CALLSROBIN_API_KEY: 'vk_test_readonly',
  CALLSROBIN_TIMEOUT_MS: '100',
  CALLSROBIN_MAX_RESPONSE_BYTES: '1000',
})

test('envía la clave API y serializa filtros GET', async () => {
  let requestedUrl = ''
  let requestedKey = ''
  const client = new CallsRobinClient(config, async (input, init) => {
    requestedUrl = String(input)
    requestedKey = new Headers(init?.headers).get('x-api-key') ?? ''
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  })

  const result = await client.get('/api/leads', { status: 'new', limit: 25, search: undefined })
  assert.deepEqual(result, { data: [] })
  assert.equal(requestedKey, 'vk_test_readonly')
  assert.match(requestedUrl, /\/api\/leads\?status=new&limit=25$/)
})

test('mapea errores HTTP de la API', async () => {
  const client = new CallsRobinClient(config, async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }))
  await assert.rejects(
    client.get('/api/leads'),
    (error: unknown) => error instanceof CallsRobinApiError && error.status === 403 && error.message === 'Forbidden',
  )
})

test('rechaza respuestas que superan el límite defensivo', async () => {
  const client = new CallsRobinClient(config, async () => new Response(JSON.stringify({ payload: 'x'.repeat(1200) }), { status: 200 }))
  await assert.rejects(
    client.get('/api/leads'),
    (error: unknown) => error instanceof CallsRobinApiError && error.code === 'CALLSROBIN_RESPONSE_TOO_LARGE',
  )
})

test('valida la configuración mínima', () => {
  assert.throws(() => loadConfig({ CALLSROBIN_API_URL: 'http://localhost:3000', CALLSROBIN_API_KEY: 'bad' }), /vk_/)
})

test('requiere una segunda clave cuando se activa la escritura', () => {
  assert.throws(() => loadConfig({
    CALLSROBIN_API_URL: 'http://localhost:3000',
    CALLSROBIN_API_KEY: 'vk_readonly',
    CALLSROBIN_WRITE_ENABLED: 'true',
  }), /CALLSROBIN_WRITE_API_KEY/)
})

test('el cliente de escritura usa POST y la clave de escritura', async () => {
  const writeConfig = loadConfig({
    CALLSROBIN_API_URL: 'http://localhost:3000',
    CALLSROBIN_API_KEY: 'vk_readonly',
    CALLSROBIN_WRITE_ENABLED: 'true',
    CALLSROBIN_WRITE_API_KEY: 'vk_writeonly',
  })
  let method = ''
  let key = ''
  let body = ''
  const client = new CallsRobinClient(writeConfig, async (_input, init) => {
    method = init?.method ?? ''
    key = new Headers(init?.headers).get('x-api-key') ?? ''
    body = String(init?.body ?? '')
    return new Response(JSON.stringify({ id: 'lead-1' }), { status: 201 })
  }, writeConfig.writeApiKey)

  const result = await client.post('/api/leads', { name: 'Lead de prueba' })
  assert.deepEqual(result, { id: 'lead-1' })
  assert.equal(method, 'POST')
  assert.equal(key, 'vk_writeonly')
  assert.equal(body, JSON.stringify({ name: 'Lead de prueba' }))
})
