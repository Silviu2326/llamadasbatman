process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WordPressConnectorError, resolveRestBase, wordPressRequest } from '../services/wordpressConnector.service'
import { capabilitiesFor, connectorOf } from '../services/websiteConnections.service'

// IP pública literal: evita DNS en los tests y pasa la barrera anti-SSRF.
const SITE = 'http://93.184.216.34'
const AUTH = { restBase: `${SITE}/wp-json/`, username: 'editor', applicationPassword: 'abcd efgh ijkl mnop' }

function withFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {})) as typeof fetch
  return run().finally(() => { globalThis.fetch = original })
}

test('la petición a WordPress manda Basic auth sin los espacios de la contraseña de aplicación', async () => {
  const seen: { url?: string; headers?: Record<string, string>; method?: string } = {}
  await withFetch((url, init) => {
    seen.url = url
    seen.headers = init.headers as Record<string, string>
    seen.method = init.method ?? 'GET'
    return new Response(JSON.stringify({ id: 7 }), { status: 200, headers: { 'content-type': 'application/json' } })
  }, async () => {
    const result = await wordPressRequest<{ id: number }>(AUTH, AUTH.restBase, 'wp/v2/users/me?context=edit')
    assert.equal(result.status, 200)
    assert.equal(result.data?.id, 7)
  })
  assert.equal(seen.url, `${SITE}/wp-json/wp/v2/users/me?context=edit`)
  assert.equal(seen.method, 'GET')
  assert.equal(seen.headers?.Authorization, `Basic ${Buffer.from('editor:abcdefghijklmnop').toString('base64')}`)
})

test('sin enlaces permanentes la ruta viaja en ?rest_route=', async () => {
  let seen = ''
  await withFetch(url => {
    seen = url
    return new Response('[]', { status: 200 })
  }, async () => {
    await wordPressRequest(AUTH, `${SITE}/?rest_route=/`, 'wp/v2/pages?per_page=5&context=edit')
  })
  const parsed = new URL(seen)
  assert.equal(parsed.searchParams.get('rest_route'), '/wp/v2/pages')
  assert.equal(parsed.searchParams.get('per_page'), '5')
  assert.equal(parsed.searchParams.get('context'), 'edit')
})

test('una redirección nunca se sigue con credenciales', async () => {
  await withFetch(() => new Response(null, { status: 301, headers: { location: 'http://10.0.0.5/wp-json/' } }), async () => {
    await assert.rejects(
      () => wordPressRequest(AUTH, AUTH.restBase, 'wp/v2/users/me'),
      (error: unknown) => error instanceof WordPressConnectorError && error.code === 'WORDPRESS_REDIRECT_BLOCKED',
    )
  })
})

test('las redes privadas se bloquean antes de hacer la petición', async () => {
  let calls = 0
  const previous = process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS
  delete process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS
  try {
    await withFetch(() => { calls += 1; return new Response('{}', { status: 200 }) }, async () => {
      for (const base of ['http://127.0.0.1/wp-json/', 'http://169.254.169.254/wp-json/', 'http://localhost/wp-json/', 'http://user:pw@93.184.216.34/wp-json/']) {
        await assert.rejects(
          () => wordPressRequest(null, base, 'wp/v2/pages'),
          (error: unknown) => error instanceof WordPressConnectorError && error.code.startsWith('WORDPRESS_URL'),
        )
      }
    })
  } finally {
    if (previous !== undefined) process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS = previous
  }
  assert.equal(calls, 0)
})

test('resolveRestBase prueba /wp-json/ y cae a ?rest_route=/ si no existe', async () => {
  const urls: string[] = []
  await withFetch(url => {
    urls.push(url)
    if (url.endsWith('/wp-json/')) return new Response('<html>404</html>', { status: 404 })
    return new Response(JSON.stringify({ namespaces: ['wp/v2'] }), { status: 200 })
  }, async () => {
    const base = await resolveRestBase(`${SITE}/`)
    assert.equal(base, `${SITE}/?rest_route=/`)
  })
  // URLSearchParams codifica la barra (%2F); WordPress la acepta igual.
  assert.deepEqual(urls.map(url => decodeURIComponent(url)), [`${SITE}/wp-json/`, `${SITE}/?rest_route=/`])
})

test('resolveRestBase falla claro cuando ninguna raíz responde JSON de WordPress', async () => {
  await withFetch(() => new Response('<html>no api</html>', { status: 200 }), async () => {
    await assert.rejects(
      () => resolveRestBase(`${SITE}/`),
      (error: unknown) => error instanceof WordPressConnectorError && error.code === 'WORDPRESS_REST_UNAVAILABLE' && error.status === 422,
    )
  })
})

test('las capacidades profundas solo se activan con conector real, no con el modo elegido', () => {
  const byMode = capabilitiesFor('wordpress', 'plugin', null)
  assert.equal(byMode.find(item => item.id === 'content')?.available, false)
  assert.equal(byMode.find(item => item.id === 'seo')?.available, false)
  assert.equal(byMode.find(item => item.id === 'capture')?.available, true)

  const apiOnly = capabilitiesFor('wordpress', 'api', { kind: 'wordpress', canEdit: true, plugin: false })
  assert.equal(apiOnly.find(item => item.id === 'content')?.available, true)
  assert.equal(apiOnly.find(item => item.id === 'publish')?.available, true)
  assert.equal(apiOnly.find(item => item.id === 'seo')?.available, false)

  const withPlugin = capabilitiesFor('wordpress', 'plugin', { kind: 'wordpress', canEdit: true, plugin: true, seoPlugin: 'yoast', scriptInstalled: true })
  assert.equal(withPlugin.find(item => item.id === 'seo')?.available, true)
  assert.match(withPlugin.find(item => item.id === 'seo')?.via ?? '', /yoast/)
  assert.equal(withPlugin.find(item => item.id === 'capture')?.via, 'plugin Vendrava Connect')
})

test('connectorOf ignora detecciones sin conector o con forma inesperada', () => {
  assert.equal(connectorOf(null), null)
  assert.equal(connectorOf({ detection: { httpStatus: 200 } }), null)
  assert.equal(connectorOf({ detection: { connector: { kind: 'shopify', canEdit: true } } }), null)
  const raw = connectorOf({ detection: { connector: { kind: 'wordpress', canEdit: true, plugin: 'yes', username: 'ana', pluginVersion: 3 } } })
  const parsed = raw?.kind === 'wordpress' ? raw : null
  assert.deepEqual({ canEdit: parsed?.canEdit, plugin: parsed?.plugin, username: parsed?.username, pluginVersion: parsed?.pluginVersion }, { canEdit: true, plugin: false, username: 'ana', pluginVersion: null })
})
