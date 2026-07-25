import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROVIDER_CONFIRMATION,
  STAGING_CONFIRMATION,
  StagingHarnessError,
  assertSafeStagingConfig,
  canonicalDatabaseTarget,
  containsAll,
  makeFixtureProspect,
  parseArgs,
  redactText,
  isDryRun,
  shortHash,
  validateProspectFixture,
} from './staging-e2e-lib.mjs'

function safeEnv(overrides = {}) {
  return {
    STAGING_E2E_BASE_URL: 'https://api-staging.example.test',
    STAGING_E2E_TOKEN: 'eyJ.staging.real.token',
    STAGING_E2E_DATABASE_URL: 'postgresql://e2e_user:e2e_secret@db-staging.example.test:5432/vendrava_staging_e2e',
    STAGING_E2E_DATABASE_ISOLATED: 'YES',
    STAGING_E2E_DATABASE_TARGET_HASH: shortHash('db-staging.example.test:5432/vendrava_staging_e2e'),
    STAGING_E2E_FIXTURE_NAMESPACE: 'staging-contracts',
    STAGING_E2E_WORKSPACE_ID: 'org_staging_e2e',
    STAGING_E2E_CONFIRM: STAGING_CONFIRMATION,
    NODE_ENV: 'staging',
    ...overrides,
  }
}

test('bloquea ejecución sin confirmación CLI aunque el entorno sea staging', () => {
  assert.throws(() => assertSafeStagingConfig(safeEnv(), { run: true, confirm: false, providerMutations: false, flows: ['ads'] }), error => error instanceof StagingHarnessError && error.code === 'CLI_CONFIRMATION_MISSING')
})

test('bloquea hostname y base de datos productivos', () => {
  assert.throws(() => assertSafeStagingConfig(safeEnv({ STAGING_E2E_BASE_URL: 'https://api-prod.example.test' }), { run: false, confirm: false, providerMutations: false, flows: ['ads'] }), /productiva/i)
  assert.throws(() => assertSafeStagingConfig(safeEnv({ STAGING_E2E_DATABASE_URL: 'postgresql://u:p@db.example.test:5432/vendrava_prod' }), { run: false, confirm: false, providerMutations: false, flows: ['ads'] }), /productiva/i)
})

test('requiere confirmación separada para proveedores', () => {
  assert.throws(() => assertSafeStagingConfig(safeEnv(), { run: true, confirm: true, providerMutations: true, flows: ['ads'] }), error => error instanceof StagingHarnessError && error.code === 'PROVIDER_CONFIRMATION_MISSING')
  const config = assertSafeStagingConfig(safeEnv({ STAGING_E2E_PROVIDER_CONFIRM: PROVIDER_CONFIRMATION, STAGING_E2E_PROVIDER_MODE: 'staging-test-account' }), { run: true, confirm: true, providerMutations: true, flows: ['ads'] })
  assert.equal(config.providerMutations, true)
})

test('no acepta la misma base que DATABASE_URL', () => {
  assert.throws(() => assertSafeStagingConfig(safeEnv({ DATABASE_URL: safeEnv().STAGING_E2E_DATABASE_URL }), { run: false, confirm: false, providerMutations: false, flows: ['ads'] }), error => error instanceof StagingHarnessError && error.code === 'DATABASE_EQUALS_RUNTIME_DATABASE')
})

test('valida fixtures y añade una clave única de run', () => {
  const fixture = validateProspectFixture({ name: 'Fixture Clinic', placeId: 'fixture-place' })
  const prepared = makeFixtureProspect(fixture, 'staging-contracts-abc')
  assert.match(prepared.name, /staging-contracts-abc/)
  assert.match(prepared.placeId, /staging-contracts-abc/)
})

test('parsea argumentos y no permite proveedor sin --run', () => {
  assert.throws(() => parseArgs(['--with-provider-mutations']), error => error instanceof StagingHarnessError && error.code === 'PROVIDER_REQUIRES_RUN')
  const args = parseArgs(['--run', '--confirm-staging-mutations', '--flow', 'ads,knowledge'])
  assert.deepEqual(args.flows, ['ads', 'knowledge'])
})

test('permite preflight sin confirmación de mutaciones y exige confirmación para probes externos', () => {
  const args = parseArgs(['--preflight'])
  assert.doesNotThrow(() => assertSafeStagingConfig(safeEnv({ STAGING_E2E_CONFIRM: '' }), args))
  assert.throws(() => parseArgs(['--probe-providers']), error => error instanceof StagingHarnessError && error.code === 'PROVIDER_PROBE_REQUIRES_PREFLIGHT')
  const probeArgs = parseArgs(['--preflight', '--probe-providers'])
  assert.throws(() => assertSafeStagingConfig(safeEnv(), probeArgs), error => error instanceof StagingHarnessError && error.code === 'PROVIDER_PROBE_CONFIRMATION_MISSING')
})

test('mantiene dry-run por defecto y solo cambia de modo con una bandera explícita', () => {
  assert.equal(isDryRun(parseArgs([])), true)
  assert.equal(isDryRun(parseArgs(['--preflight'])), false)
  assert.equal(isDryRun(parseArgs(['--run', '--confirm-staging-mutations'])), false)
})

test('exige hash de destino para mutaciones y no acepta proveedor desconocido', () => {
  assert.throws(() => assertSafeStagingConfig(safeEnv({ STAGING_E2E_DATABASE_TARGET_HASH: '' }), { run: true, confirm: true, providerMutations: false, flows: ['ads'] }), error => error instanceof StagingHarnessError && error.code === 'DATABASE_TARGET_HASH_MISSING')
  assert.throws(() => assertSafeStagingConfig(safeEnv({ STAGING_E2E_REQUIRED_PROVIDERS: 'unknown' }), { run: false, confirm: false, providerMutations: false, flows: ['ads'] }), error => error instanceof StagingHarnessError && error.code === 'PROVIDER_ID_INVALID')
})

test('redacta secretos y no confunde evidencia de IDs', () => {
  const secret = 'super-secret-token'
  assert.equal(redactText(`Bearer ${secret} ${secret}`, [secret]), 'Bearer [REDACTED] [REDACTED]')
  assert.equal(containsAll({ campaignId: 'cmp-1', leadId: 'lead-1' }, ['cmp-1', 'lead-1']), true)
  assert.deepEqual(canonicalDatabaseTarget('postgresql://u:p@db-staging.test:5432/name_staging'), {
    protocol: 'postgresql:',
    hostname: 'db-staging.test',
    port: '5432',
    databaseName: 'name_staging',
    comparable: 'db-staging.test:5432/name_staging',
  })
})
