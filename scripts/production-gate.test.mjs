import test from 'node:test'
import assert from 'node:assert/strict'
import { collectReport } from './production-gate.mjs'

function safeConfig(overrides = {}) {
  return {
    NODE_ENV: 'staging',
    DATABASE_URL: 'postgresql://db.staging.example.com:5432/vozia_staging',
    REDIS_URL: 'rediss://redis.staging.example.com:6380/0',
    PUBLIC_BASE_URL: 'https://app.staging.example.com',
    CORS_ORIGINS: 'https://app.staging.example.com',
    JWT_SECRET: 'jwt-secret-value-abcdefghijklmnopqrstuvwxyz-123456',
    OAUTH_STATE_SECRET: 'oauth-state-value-abcdefghijklmnopqrstuvwxyz-123456',
    META_TOKEN_ENCRYPTION_KEY: 'meta-encryption-value-abcdefghijklmnopqrstuvwxyz-123456',
    ORGANIC_TOKEN_ENCRYPTION_KEY: 'organic-encryption-value-abcdefghijklmnopqrstuvwxyz-123456',
    INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: 'integration-encryption-value-abcdefghijklmnopqrstuvwxyz-123456',
    OBSERVABILITY_TOKEN: 'observability-read-value-abcdefghijklmnopqrstuvwxyz-123456',
    OBSERVABILITY_MUTATION_TOKEN: 'observability-write-value-abcdefghijklmnopqrstuvwxyz-123456',
    WORKER_HEARTBEAT_KEY: 'worker-heartbeat-staging-key',
    REQUIRED_INTEGRATIONS: '',
    BACKGROUND_WORKERS_ENABLED: 'true',
    ORCHESTRATION_WORKER_ENABLED: 'true',
    ...overrides,
  }
}

function failures(result) {
  return result.report.fail.map(item => item.check)
}

test('rechaza una integración opcional parcialmente configurada', () => {
  const result = collectReport(safeConfig({ MAUTIC_BASE_URL: 'https://mautic.staging.example.com' }), { allowPrivate: false })
  assert.ok(failures(result).some(check => check === 'mautic_email.MAUTIC_CLIENT_ID'))
})

test('considera callback o requisito alternativo aislado como configuración parcial', () => {
  const callbackOnly = collectReport(safeConfig({ META_OAUTH_REDIRECT_URI: 'https://api.staging.example.com/api/meta/accounts/oauth/callback' }), { allowPrivate: false })
  assert.ok(failures(callbackOnly).some(check => check === 'meta_ads.META_APP_ID'))

  const senderOnly = collectReport(safeConfig({ TWILIO_FROM_NUMBER: '+34123456789' }), { allowPrivate: false })
  assert.ok(failures(senderOnly).some(check => check === 'twilio.TWILIO_ACCOUNT_SID'))
})

test('rechaza una integración parcial aunque esté marcada como obligatoria', () => {
  const result = collectReport(safeConfig({
    REQUIRED_INTEGRATIONS: 'twilio',
    TWILIO_WEBHOOK_BASE_URL: 'https://api.staging.example.com',
  }), { allowPrivate: false })
  assert.ok(failures(result).some(check => check === 'twilio.TWILIO_ACCOUNT_SID'))
  assert.ok(failures(result).some(check => check === 'twilio.TWILIO_AUTH_TOKEN'))
})

test('no marca como conectado un proveedor sin variables', () => {
  const result = collectReport(safeConfig(), { allowPrivate: false })
  assert.equal(result.report.fail.some(item => item.check === 'mautic_email'), false)
  assert.ok(result.report.warn.some(item => item.check === 'mautic_email'))
})
