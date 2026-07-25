import test from 'node:test'
import assert from 'node:assert/strict'
import {
  configIssue,
  isProductionRuntime,
  redactProviderError,
  stableIdempotencyKey,
  validateBaseUrl,
} from '../../lib/integrationRuntime'
import { getIntegrationReadiness } from '../../services/integrationHealth.service'
import { googleCallbackUrl } from '../../services/organicGoogleIntegration.service'

const PROVIDER_ENV = [
  'META_APP_ID', 'META_APP_SECRET', 'META_TOKEN_ENCRYPTION_KEY', 'META_WEBHOOK_VERIFY_TOKEN',
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_BASE_URL', 'ORGANIC_TOKEN_ENCRYPTION_KEY',
  'METRICOOL_BASE_URL', 'METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID',
  'POSTIZ_BASE_URL', 'POSTIZ_API_KEY',
  'MAUTIC_BASE_URL', 'MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WEBHOOK_BASE_URL', 'TWILIO_FROM_NUMBER', 'TWILIO_WHATSAPP_FROM',
]

function withEnvironment(values: Record<string, string | undefined>, work: () => Promise<void> | void) {
  const previous = new Map(PROVIDER_ENV.concat('NODE_ENV').map(name => [name, process.env[name]]))
  try {
    for (const name of PROVIDER_ENV.concat('NODE_ENV')) {
      delete process.env[name]
    }
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    return work()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('la configuración parcial devuelve faltantes y la completa no genera issue', () => {
  assert.deepEqual(configIssue('metricool', ['A', 'B'], { invalid: [] }), null)
  assert.deepEqual(configIssue('metricool', ['A', 'B'], { invalid: ['BASE_URL'] }), {
    provider: 'metricool', missing: ['A', 'B'], invalid: ['BASE_URL'],
  })
  process.env.CONTRACT_CONFIG_A = 'present'
  try {
    assert.deepEqual(configIssue('metricool', ['CONTRACT_CONFIG_A', 'CONTRACT_CONFIG_B']), {
      provider: 'metricool', missing: ['CONTRACT_CONFIG_B'], invalid: [],
    })
  } finally {
    delete process.env.CONTRACT_CONFIG_A
  }
})

test('OAuth y URLs de proveedores exigen HTTPS en producción', () => {
  withEnvironment({ NODE_ENV: 'production' }, () => {
    assert.equal(isProductionRuntime(), true)
    assert.match(validateBaseUrl('PUBLIC_HOST', 'http://localhost:3000', { httpsInProduction: true }) ?? '', /HTTPS/)
    assert.equal(validateBaseUrl('PUBLIC_HOST', 'https://app.example.test', { httpsInProduction: true }), null)
    process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL = 'http://localhost:3000'
    assert.throws(() => googleCallbackUrl('search_console'), /HTTPS|inseguro/i)
  })
})

test('readiness sin secretos no finge conexiones activas y detecta configuración parcial', async () => {
  await withEnvironment({}, async () => {
    const empty = await getIntegrationReadiness({ probeExternal: false })
    assert.equal(empty.status, 'ok')
    assert.ok(empty.integrations.every(item => item.status === 'not_configured'))

    process.env.METRICOOL_BASE_URL = 'https://metricool.example.test'
    const partial = await getIntegrationReadiness({ probeExternal: false })
    const metricool = partial.integrations.find(item => item.provider === 'metricool')
    assert.equal(partial.status, 'degraded')
    assert.equal(metricool?.status, 'degraded')
    assert.ok(metricool?.missing.includes('METRICOOL_USER_TOKEN'))
  })
})

test('las claves estables son reproducibles y no contienen secretos originales', () => {
  const first = stableIdempotencyKey('contract', 'org-a', 'plan-a')
  assert.equal(first, stableIdempotencyKey('contract', 'org-a', 'plan-a'))
  assert.notEqual(first, stableIdempotencyKey('contract', 'org-a', 'plan-b'))
  assert.equal(first.includes('plan-a'), false)
})

test('los errores de proveedor no filtran query, bearer ni payload JSON', () => {
  const safe = redactProviderError(new Error('https://provider.test/callback?access_token=abc123&client_secret=shh Bearer top-secret {"refresh_token":"refresh-secret","api_key":"api-secret"}'))
  assert.equal(safe.includes('abc123'), false)
  assert.equal(safe.includes('shh'), false)
  assert.equal(safe.includes('top-secret'), false)
  assert.equal(safe.includes('refresh-secret'), false)
  assert.equal(safe.includes('api-secret'), false)
  assert.match(safe, /\[redacted\]/)
})
