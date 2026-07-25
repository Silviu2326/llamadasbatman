import test from 'node:test'
import assert from 'node:assert/strict'
import {
  googleCallbackUrl,
  isOrganicGoogleProvider,
  requireOrganicGoogleProvider,
} from '../services/organicGoogleIntegration.service'
import { decryptOrganicToken, encryptOrganicToken } from '../lib/organicTokenCrypto'

process.env.ORGANIC_TOKEN_ENCRYPTION_KEY = 'organic-phase-two-test-secret-should-be-replaced'
process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL = 'http://localhost:3000'

test('Organic Google acepta sólo proveedores soportados', () => {
  assert.equal(isOrganicGoogleProvider('search_console'), true)
  assert.equal(isOrganicGoogleProvider('ga4'), true)
  assert.equal(isOrganicGoogleProvider('google_business_profile'), true)
  assert.equal(isOrganicGoogleProvider('unknown'), false)
  assert.equal(requireOrganicGoogleProvider('ga4'), 'ga4')
  assert.throws(() => requireOrganicGoogleProvider('unknown'), /Proveedor Organic/)
})

test('Organic Google cifra y descifra tokens sin exponer el valor', () => {
  const plain = 'refresh-token-value'
  const encrypted = encryptOrganicToken(plain)
  assert.notEqual(encrypted, plain)
  assert.equal(decryptOrganicToken(encrypted), plain)
})

test('los callbacks Google se construyen por proveedor', () => {
  assert.equal(
    googleCallbackUrl('search_console'),
    'http://localhost:3000/api/organic/integrations/search_console/oauth/callback',
  )
})
