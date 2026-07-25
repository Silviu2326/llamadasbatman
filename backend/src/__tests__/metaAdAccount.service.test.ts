import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { completeOAuth } from '../services/metaAdAccount.service'

const originalFetch = globalThis.fetch
const originalUpsert = prisma.metaAdAccount.upsert
const originalAbortSignalTimeout = AbortSignal.timeout
const metaEnvironmentKeys = ['META_APP_ID', 'META_APP_SECRET', 'OAUTH_STATE_SECRET', 'META_TOKEN_ENCRYPTION_KEY'] as const
const originalMetaEnvironment = Object.fromEntries(
  metaEnvironmentKeys.map(key => [key, process.env[key]])
) as Record<(typeof metaEnvironmentKeys)[number], string | undefined>

function configureMetaTestSecrets() {
  process.env.META_APP_ID = 'meta-test-app'
  process.env.META_APP_SECRET = 's'.repeat(40)
  process.env.OAUTH_STATE_SECRET = 'o'.repeat(40)
  process.env.META_TOKEN_ENCRYPTION_KEY = 'k'.repeat(40)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  prisma.metaAdAccount.upsert = originalUpsert
  AbortSignal.timeout = originalAbortSignalTimeout
  for (const key of metaEnvironmentKeys) {
    const value = originalMetaEnvironment[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('Meta OAuth y Graph API reciben una señal AbortSignal con deadline', async () => {
  configureMetaTestSecrets()
  const signals: AbortSignal[] = []
  const calls: string[] = []

  globalThis.fetch = (async (input, init) => {
    calls.push(String(input))
    assert.ok(init?.signal instanceof AbortSignal)
    signals.push(init.signal)

    const url = String(input)
    if (url.includes('/oauth/access_token') && calls.length === 1) return jsonResponse({ access_token: 'short-lived-token' })
    if (url.includes('/oauth/access_token') && calls.length === 2) return jsonResponse({ access_token: 'long-lived-token', expires_in: 5_184_000 })
    if (url.includes('/me/permissions')) {
      return jsonResponse({ data: [
        { permission: 'ads_management', status: 'granted' },
        { permission: 'pages_show_list', status: 'granted' },
        { permission: 'pages_read_engagement', status: 'granted' },
        { permission: 'pages_manage_metadata', status: 'granted' },
        { permission: 'pages_manage_ads', status: 'granted' },
        { permission: 'leads_retrieval', status: 'granted' },
        { permission: 'business_management', status: 'granted' },
      ] })
    }
    if (url.includes('/me/adaccounts')) return jsonResponse({ data: [{ id: 'act_123', name: 'Test account' }] })
    if (url.includes('/me/accounts')) return jsonResponse({ data: [{ id: 'page_123', name: 'Test page' }] })
    if (url.includes('/me?')) return jsonResponse({ id: 'meta-user-123' })
    throw new Error(`Unexpected Meta test request: ${url}`)
  }) as typeof fetch

  prisma.metaAdAccount.upsert = (async ({ create, update }) => ({
    id: 'db-account-1',
    ...create,
    ...update,
  })) as typeof prisma.metaAdAccount.upsert

  await completeOAuth('org-1', 'oauth-code', 'pkce-verifier')

  assert.equal(calls.length, 6)
  assert.equal(signals.length, 6)
  assert.ok(signals.every(signal => signal instanceof AbortSignal))
  assert.ok(calls.every(url => url.startsWith('https://graph.facebook.com/')))
})

test('Meta no expone el cuerpo del proveedor cuando falla una llamada API', async () => {
  configureMetaTestSecrets()
  const secretProviderBody = 'access_token=should-never-appear'

  globalThis.fetch = (async () => jsonResponse({ error: { message: secretProviderBody, code: 190 } }, 400)) as typeof fetch

  await assert.rejects(
    completeOAuth('org-1', 'oauth-code', 'pkce-verifier'),
    error => {
      assert.equal((error as Error).message, 'Meta token exchange falló (400)')
      assert.equal((error as Error).message.includes(secretProviderBody), false)
      return true
    }
  )
})

test('Meta convierte una señal abortada en un error seguro de timeout', async () => {
  configureMetaTestSecrets()
  const controller = new AbortController()
  AbortSignal.timeout = (() => controller.signal) as typeof AbortSignal.timeout

  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.signal, controller.signal)
    controller.abort()
    throw controller.signal.reason
  }) as typeof fetch

  await assert.rejects(
    completeOAuth('org-1', 'oauth-code', 'pkce-verifier'),
    error => {
      assert.equal((error as Error).message, 'Meta token exchange agotó el tiempo de espera')
      assert.equal((error as Error).message.includes('oauth-code'), false)
      return true
    }
  )
})
test('Meta no persiste la cuenta si faltan permisos solicitados', async () => {
  configureMetaTestSecrets()
  let upserted = false
  prisma.metaAdAccount.upsert = (async () => {
    upserted = true
    throw new Error('upsert should not run')
  }) as unknown as typeof prisma.metaAdAccount.upsert

  globalThis.fetch = (async (input, init) => {
    assert.ok(init?.signal instanceof AbortSignal)
    const url = String(input)
    if (url.includes('/oauth/access_token')) {
      return jsonResponse({ access_token: url.includes('fb_exchange_token') ? 'long-lived-token' : 'short-lived-token' })
    }
    if (url.includes('/me?')) return jsonResponse({ id: 'meta-user-123' })
    if (url.includes('/me/permissions')) return jsonResponse({ data: [{ permission: 'ads_management', status: 'granted' }] })
    throw new Error(`Meta must stop after permission validation: ${url}`)
  }) as typeof fetch

  await assert.rejects(completeOAuth('org-1', 'oauth-code', 'pkce-verifier'), /permisos requeridos/i)
  assert.equal(upserted, false)
})
