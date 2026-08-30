import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  credentialCiphertextNeedsReencryption,
  KEYRING_CIPHERTEXT_PREFIX,
  decryptOrganizationCredential,
  decryptSecretWithKeyring,
  encryptOrganizationCredential,
  encryptSecretWithKeyring,
  isEncryptionKeyringConfigured,
} from '../lib/organizationCredentialsCrypto'
import { decryptToken, encryptToken } from '../lib/tokenCrypto'
import { decryptOrganicToken, encryptOrganicToken } from '../lib/organicTokenCrypto'

/**
 * Unificación de cifrado con rotación (docs/plataforma-abierta/02-FUNDAMENTOS §4).
 *
 * Estas pruebas son 100% offline (solo node:crypto, sin Prisma ni red): las
 * claves de entorno se fijan aquí mismo porque todas las libs las leen de
 * forma perezosa en cada operación. Lo que protegen no es cosmético: si la
 * detección de prefijos o la compatibilidad v1 se rompe, los tokens Meta,
 * Google y las credenciales de integración ya guardados dejan de descifrarse.
 */

const LEGACY_KEY = 'clave-legacy-integraciones-0123456789abcdef'
const META_KEY = 'clave-legacy-meta-token-0123456789abcdef'
const ORGANIC_KEY = 'clave-legacy-organic-token-0123456789abcdef'
const KEY_A = 'secreto-rotacion-a-0123456789abcdef-xyz'
const KEY_B = 'secreto-rotacion-b-0123456789abcdef-xyz'

const MANAGED_ENV = [
  'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY',
  'INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS',
  'META_TOKEN_ENCRYPTION_KEY',
  'ORGANIC_TOKEN_ENCRYPTION_KEY',
] as const

// Cada test fija exactamente el entorno que necesita y restaura el previo:
// así ningún caso hereda el keyring (o su ausencia) de un caso anterior.
function withEnv<T>(env: Partial<Record<(typeof MANAGED_ENV)[number], string>>, fn: () => T): T {
  const previous = new Map(MANAGED_ENV.map(name => [name, process.env[name]] as const))
  for (const name of MANAGED_ENV) {
    const value = env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    return fn()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('sin keyring se cifra en v1 y el roundtrip funciona (compatibilidad total)', () => {
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY }, () => {
    assert.equal(isEncryptionKeyringConfigured(), false)
    const payload = encryptOrganizationCredential({ apiKey: 'secreto', nested: { ok: true } })
    assert.ok(payload.startsWith('v1.'), `esperaba formato v1: ${payload}`)
    assert.equal(payload.split('.').length, 4)
    assert.deepEqual(decryptOrganizationCredential(payload), { apiKey: 'secreto', nested: { ok: true } })
  })
})

test('con keyring se cifra en v2 con la PRIMERA clave y el roundtrip funciona', () => {
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}` }, () => {
    assert.equal(isEncryptionKeyringConfigured(), true)
    const payload = encryptOrganizationCredential({ token: 'abc' })
    const parts = payload.split('.')
    assert.equal(parts[0], 'v2')
    assert.equal(parts[1], 'k2', 'debe cifrar la primera clave del keyring')
    assert.equal(parts.length, 5)
    assert.deepEqual(decryptOrganizationCredential(payload), { token: 'abc' })
  })
})

test('rotación: un payload v1 antiguo se sigue descifrando con el keyring activo', () => {
  // Simula el despliegue real: primero solo existe la clave única (v1)...
  const legacyPayload = withEnv(
    { INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY },
    () => encryptOrganizationCredential({ provider: 'mautic' }),
  )
  // ...y después se activa el keyring manteniendo la clave vieja presente.
  withEnv(
    {
      INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY,
      INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}`,
    },
    () => {
      assert.deepEqual(decryptOrganizationCredential(legacyPayload), { provider: 'mautic' })
    },
  )
})

test('rotación: todas las claves del keyring descifran, no solo la primera', () => {
  const payload = withEnv(
    { INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}` },
    () => encryptSecretWithKeyring('token-google'),
  )
  // Se rota: k2 pasa a cifrar, k1 queda detrás solo para descifrar.
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}` }, () => {
    assert.equal(decryptSecretWithKeyring(payload), 'token-google')
  })
})

test('recifrado perezoso detecta legacy y claves v2 que ya no son la primaria', () => {
  const v1 = withEnv(
    { INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY },
    () => encryptOrganizationCredential({ token: 'legacy' }),
  )
  const oldV2 = withEnv(
    { INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}` },
    () => encryptOrganizationCredential({ token: 'old-v2' }),
  )
  withEnv({
    INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY,
    INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}`,
  }, () => {
    assert.equal(credentialCiphertextNeedsReencryption(v1), true)
    assert.equal(credentialCiphertextNeedsReencryption(oldV2), true)
    const current = encryptOrganizationCredential({ token: 'current' })
    assert.equal(credentialCiphertextNeedsReencryption(current), false)
  })
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY }, () => {
    assert.equal(credentialCiphertextNeedsReencryption(v1), false)
  })
})

test('un keyId desconocido falla en claro, sin descifrados silenciosos', () => {
  const payload = withEnv(
    { INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}` },
    () => encryptSecretWithKeyring('token'),
  )
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k2:${KEY_B}` }, () => {
    assert.throws(() => decryptSecretWithKeyring(payload), /CREDENCIAL_CIFRADA_CLAVE_DESCONOCIDA/)
  })
})

test('encryptSecretWithKeyring exige keyring: sin él nunca emite un v1 ambiguo', () => {
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: LEGACY_KEY }, () => {
    assert.throws(() => encryptSecretWithKeyring('token'), /INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS/)
  })
})

test('tokenCrypto: sin keyring conserva su formato legacy y su clave propia', () => {
  withEnv({ META_TOKEN_ENCRYPTION_KEY: META_KEY }, () => {
    const payload = encryptToken('EAAG-meta-token')
    assert.ok(!payload.startsWith(KEYRING_CIPHERTEXT_PREFIX), `no debe usar v2 sin keyring: ${payload}`)
    assert.equal(payload.split('.').length, 3, 'formato legacy = iv.tag.ct')
    assert.equal(decryptToken(payload), 'EAAG-meta-token')
  })
})

test('tokenCrypto: con keyring cifra en v2 y sigue descifrando lo legacy', () => {
  const legacyPayload = withEnv({ META_TOKEN_ENCRYPTION_KEY: META_KEY }, () => encryptToken('token-antiguo'))
  withEnv(
    {
      META_TOKEN_ENCRYPTION_KEY: META_KEY,
      INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}`,
    },
    () => {
      const modern = encryptToken('token-nuevo')
      assert.ok(modern.startsWith(KEYRING_CIPHERTEXT_PREFIX), `debe delegar en el canónico: ${modern}`)
      assert.equal(decryptToken(modern), 'token-nuevo')
      // Migración perezosa: lo cifrado antes del keyring sigue siendo legible.
      assert.equal(decryptToken(legacyPayload), 'token-antiguo')
    },
  )
})

test('organicTokenCrypto: sin keyring conserva su formato legacy y su clave propia', () => {
  withEnv({ ORGANIC_TOKEN_ENCRYPTION_KEY: ORGANIC_KEY }, () => {
    const payload = encryptOrganicToken('ya29-google-token')
    assert.ok(!payload.startsWith(KEYRING_CIPHERTEXT_PREFIX), `no debe usar v2 sin keyring: ${payload}`)
    assert.equal(payload.split('.').length, 3, 'formato legacy = iv.tag.ct')
    assert.equal(decryptOrganicToken(payload), 'ya29-google-token')
  })
})

test('organicTokenCrypto: con keyring cifra en v2 y sigue descifrando lo legacy', () => {
  const legacyPayload = withEnv({ ORGANIC_TOKEN_ENCRYPTION_KEY: ORGANIC_KEY }, () => encryptOrganicToken('refresh-antiguo'))
  withEnv(
    {
      ORGANIC_TOKEN_ENCRYPTION_KEY: ORGANIC_KEY,
      INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}`,
    },
    () => {
      const modern = encryptOrganicToken('refresh-nuevo')
      assert.ok(modern.startsWith(KEYRING_CIPHERTEXT_PREFIX), `debe delegar en el canónico: ${modern}`)
      assert.equal(decryptOrganicToken(modern), 'refresh-nuevo')
      assert.equal(decryptOrganicToken(legacyPayload), 'refresh-antiguo')
    },
  )
})

test('el keyring valida keyIds y longitud mínima de secretos', () => {
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `mal.id:${KEY_A}` }, () => {
    assert.throws(() => isEncryptionKeyringConfigured(), /keyId inválido/)
  })
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: 'k1:corta' }, () => {
    assert.throws(() => isEncryptionKeyringConfigured(), /al menos 32/)
  })
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A},k1:${KEY_B}` }, () => {
    assert.throws(() => isEncryptionKeyringConfigured(), /duplicado/)
  })
})

test('un payload manipulado no descifra (GCM autentica)', () => {
  withEnv({ INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS: `k1:${KEY_A}` }, () => {
    const payload = encryptSecretWithKeyring('secreto-íntegro')
    const parts = payload.split('.')
    // Se corrompe el ciphertext manteniendo formato válido.
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith('AA') ? 'BB' : 'AA')
    assert.throws(() => decryptSecretWithKeyring(parts.join('.')))
  })
})
