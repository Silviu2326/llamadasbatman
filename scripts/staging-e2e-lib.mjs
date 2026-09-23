import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export const STAGING_CONFIRMATION = 'I_UNDERSTAND_STAGING_MUTATIONS'
export const PROVIDER_CONFIRMATION = 'I_UNDERSTAND_STAGING_PROVIDER_MUTATIONS'
export const PROVIDER_PROBE_CONFIRMATION = 'I_UNDERSTAND_STAGING_PROVIDER_PROBES'
export const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,79}$/i
export const NAMESPACE_PATTERN = /^(?:staging|stage|e2e|test|qa|sandbox|preview)[-_][a-z0-9][a-z0-9_-]{2,79}$/i
export const PROVIDER_IDS = ['meta_ads', 'google_search_console', 'metricool', 'twilio']
export const NON_PRODUCTION_HOST_MARKERS = [
  'staging',
  'stage',
  'preprod',
  'preview',
  'sandbox',
  'qa',
  'e2e',
  'test',
  'dev',
]
export const PRODUCTION_HOST_MARKERS = [
  'production',
  'prod',
  'live',
]

export class StagingHarnessError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'StagingHarnessError'
    this.code = code
    this.details = details
  }
}

export function parseArgs(argv) {
  const args = {
    run: false,
    confirm: false,
    providerMutations: false,
    providerProbes: false,
    preflight: false,
    cleanup: null,
    rollback: null,
    stateFile: null,
    fixtureFile: null,
    flow: 'all',
    keepFixtures: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--run') args.run = true
    else if (token === '--confirm-staging-mutations') args.confirm = true
    else if (token === '--with-provider-mutations') args.providerMutations = true
    else if (token === '--probe-providers') args.providerProbes = true
    else if (token === '--preflight') args.preflight = true
    else if (token === '--keep-fixtures') args.keepFixtures = true
    else if (token === '--help' || token === '-h') args.help = true
    else if (token === '--cleanup') args.cleanup = argv[++index]
    else if (token === '--rollback') args.rollback = argv[++index]
    else if (token === '--state') args.stateFile = argv[++index]
    else if (token === '--fixture') args.fixtureFile = argv[++index]
    else if (token === '--flow') args.flow = argv[++index]
    else throw new StagingHarnessError('CLI_UNKNOWN_OPTION', `Opción no reconocida: ${token}`)
  }

  const validFlows = new Set(['all', 'ads', 'organic', 'prospect', 'knowledge'])
  const flows = String(args.flow || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
  if (!flows.length || flows.some(flow => !validFlows.has(flow))) {
    throw new StagingHarnessError('CLI_INVALID_FLOW', 'Usa --flow all|ads|organic|prospect|knowledge o una lista separada por comas.')
  }
  args.flows = flows.includes('all') ? ['ads', 'organic', 'prospect', 'knowledge'] : [...new Set(flows)]

  if (args.providerMutations && !args.run) {
    throw new StagingHarnessError('PROVIDER_REQUIRES_RUN', '--with-provider-mutations requiere --run.')
  }
  if (args.keepFixtures && !args.run) {
    throw new StagingHarnessError('KEEP_REQUIRES_RUN', '--keep-fixtures requiere --run.')
  }
  if (args.providerProbes && !args.preflight && !args.run) {
    throw new StagingHarnessError('PROVIDER_PROBE_REQUIRES_PREFLIGHT', '--probe-providers requiere --preflight o --run.')
  }
  if (args.cleanup && (args.run || args.keepFixtures || args.rollback)) {
    throw new StagingHarnessError('CLEANUP_MODE_EXCLUSIVE', '--cleanup no se puede combinar con --run, --rollback ni --keep-fixtures.')
  }
  if (args.rollback && (args.run || args.keepFixtures || args.cleanup)) {
    throw new StagingHarnessError('ROLLBACK_MODE_EXCLUSIVE', '--rollback no se puede combinar con --run, --cleanup ni --keep-fixtures.')
  }

  return args
}

/** El modo por defecto no hace red ni mutaciones; --preflight solo habilita lecturas. */
export function isDryRun(args) {
  return !args.run && !args.preflight && !args.cleanup && !args.rollback
}

export function createRunId(namespace, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14).toLowerCase()
  const suffix = randomUUID().slice(0, 8)
  return `${namespace}-${stamp}-${suffix}`.slice(0, 80)
}

export function isPlaceholderSecret(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return true
  return [
    'change_me',
    'changeme',
    'replace_me',
    'replace-me',
    'your_token_here',
    'your-token-here',
    '<token>',
    '<secret>',
    'demo-token',
    'test-token',
  ].includes(normalized)
}

export function canonicalDatabaseTarget(raw) {
  let parsed
  try {
    parsed = new URL(String(raw))
  } catch {
    throw new StagingHarnessError('DATABASE_URL_INVALID', 'STAGING_E2E_DATABASE_URL no es una URL válida.')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new StagingHarnessError('DATABASE_URL_PROTOCOL', 'STAGING_E2E_DATABASE_URL debe usar postgres:// o postgresql://.')
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new StagingHarnessError('DATABASE_URL_INCOMPLETE', 'STAGING_E2E_DATABASE_URL debe incluir host y nombre de base de datos.')
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1))
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    databaseName,
    comparable: `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}/${databaseName}`,
  }
}

export function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function hasProductionMarker(value) {
  const normalized = String(value ?? '').toLowerCase()
  return PRODUCTION_HOST_MARKERS.some(marker => {
    const pattern = new RegExp(`(^|[.\\-_])${marker}([.\\-_]|$)`)
    return pattern.test(normalized)
  })
}

export function hasNonProductionMarker(hostname) {
  const normalized = hostname.toLowerCase()
  return NON_PRODUCTION_HOST_MARKERS.some(marker => {
    const pattern = new RegExp(`(^|[.\\-_])${marker}([.\\-_]|$)`)
    return pattern.test(normalized)
  })
}

export function assertSafeStagingConfig(env, args) {
  const required = [
    ['STAGING_E2E_BASE_URL', env.STAGING_E2E_BASE_URL],
    ['STAGING_E2E_TOKEN', env.STAGING_E2E_TOKEN],
    ['STAGING_E2E_DATABASE_URL', env.STAGING_E2E_DATABASE_URL],
    ['STAGING_E2E_FIXTURE_NAMESPACE', env.STAGING_E2E_FIXTURE_NAMESPACE],
    ['STAGING_E2E_WORKSPACE_ID', env.STAGING_E2E_WORKSPACE_ID],
  ]
  const missing = required.filter(([, value]) => !String(value ?? '').trim()).map(([name]) => name)
  if (missing.length) {
    throw new StagingHarnessError('CONFIG_MISSING', `Faltan variables obligatorias: ${missing.join(', ')}.`)
  }

  const namespace = String(env.STAGING_E2E_FIXTURE_NAMESPACE).trim()
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new StagingHarnessError('FIXTURE_NAMESPACE_INVALID', 'STAGING_E2E_FIXTURE_NAMESPACE debe comenzar por staging-, e2e-, test-, qa-, sandbox- o preview-.')
  }
  if (isPlaceholderSecret(env.STAGING_E2E_TOKEN)) {
    throw new StagingHarnessError('TOKEN_PLACEHOLDER', 'STAGING_E2E_TOKEN parece un placeholder.')
  }
  if (String(env.STAGING_E2E_DATABASE_ISOLATED).trim() !== 'YES') {
    throw new StagingHarnessError('DATABASE_ISOLATION_NOT_ATTESTED', 'Exige STAGING_E2E_DATABASE_ISOLATED=YES para habilitar mutaciones.')
  }
  const mutationRequested = Boolean(args.run || args.cleanup || args.rollback)
  if (mutationRequested && String(env.STAGING_E2E_CONFIRM).trim() !== STAGING_CONFIRMATION) {
    throw new StagingHarnessError('CONFIRMATION_MISSING', `Exige STAGING_E2E_CONFIRM=${STAGING_CONFIRMATION}.`)
  }
  if (mutationRequested && !args.confirm) {
    throw new StagingHarnessError('CLI_CONFIRMATION_MISSING', 'Exige --confirm-staging-mutations para habilitar mutaciones.')
  }
  if (args.providerProbes && String(env.STAGING_E2E_PROVIDER_PROBE_CONFIRM).trim() !== PROVIDER_PROBE_CONFIRMATION) {
    throw new StagingHarnessError('PROVIDER_PROBE_CONFIRMATION_MISSING', `Exige STAGING_E2E_PROVIDER_PROBE_CONFIRM=${PROVIDER_PROBE_CONFIRMATION} para hacer probes externos de solo lectura.`)
  }
  if (args.providerMutations && String(env.STAGING_E2E_PROVIDER_CONFIRM).trim() !== PROVIDER_CONFIRMATION) {
    throw new StagingHarnessError('PROVIDER_CONFIRMATION_MISSING', `Exige STAGING_E2E_PROVIDER_CONFIRM=${PROVIDER_CONFIRMATION} para tocar proveedores.`)
  }
  if (args.providerMutations && String(env.STAGING_E2E_PROVIDER_MODE).trim() !== 'staging-test-account') {
    throw new StagingHarnessError('PROVIDER_MODE_INVALID', 'Los proveedores solo se pueden tocar con STAGING_E2E_PROVIDER_MODE=staging-test-account.')
  }

  let baseUrl
  try {
    baseUrl = new URL(String(env.STAGING_E2E_BASE_URL).trim())
  } catch {
    throw new StagingHarnessError('BASE_URL_INVALID', 'STAGING_E2E_BASE_URL debe ser una URL HTTP(S) válida.')
  }
  if (!['https:', 'http:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new StagingHarnessError('BASE_URL_UNSAFE', 'STAGING_E2E_BASE_URL no puede contener credenciales, query ni hash.')
  }
  const host = baseUrl.hostname.toLowerCase()
  const productionHostnames = String(env.STAGING_E2E_PRODUCTION_HOSTNAMES || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
  if (productionHostnames.includes(host) || hasProductionMarker(host)) {
    throw new StagingHarnessError('PRODUCTION_HOST_BLOCKED', 'La URL objetivo parece productiva; ejecución bloqueada.')
  }
  if (isLoopbackHost(host)) {
    if (String(env.STAGING_E2E_ALLOW_LOCAL).trim() !== 'YES') {
      throw new StagingHarnessError('LOCAL_HOST_NOT_ATTESTED', 'Para una API local exige STAGING_E2E_ALLOW_LOCAL=YES.')
    }
  } else if (!hasNonProductionMarker(host) && String(env.STAGING_E2E_HOST_ATTESTATION).trim() !== 'NON_PRODUCTION') {
    throw new StagingHarnessError('NON_PRODUCTION_HOST_NOT_PROVEN', 'El hostname no contiene un marcador de staging y no tiene atestación explícita NON_PRODUCTION.')
  }

  const database = canonicalDatabaseTarget(env.STAGING_E2E_DATABASE_URL)
  const databaseName = database.databaseName.toLowerCase()
  if (hasProductionMarker(database.hostname) || hasProductionMarker(databaseName)) {
    throw new StagingHarnessError('PRODUCTION_DATABASE_BLOCKED', 'La base objetivo parece productiva; ejecución bloqueada.')
  }
  if (!/(?:staging|stage|e2e|test|qa|sandbox|preview|dev)/i.test(databaseName) && String(env.STAGING_E2E_DATABASE_NAME || '').trim() !== database.databaseName) {
    throw new StagingHarnessError('DATABASE_NAME_NOT_PROVEN', 'El nombre de la base debe contener un marcador no productivo o coincidir con STAGING_E2E_DATABASE_NAME.')
  }
  if (env.DATABASE_URL) {
    const productionDatabase = canonicalDatabaseTarget(env.DATABASE_URL)
    if (productionDatabase.comparable === database.comparable) {
      throw new StagingHarnessError('DATABASE_EQUALS_RUNTIME_DATABASE', 'La base E2E coincide con DATABASE_URL; ejecución bloqueada.')
    }
  }
  const targetHash = shortHash(database.comparable)
  if (mutationRequested && String(env.STAGING_E2E_DATABASE_TARGET_HASH || '').trim() !== targetHash) {
    throw new StagingHarnessError('DATABASE_TARGET_HASH_MISSING', 'Para mutaciones exige STAGING_E2E_DATABASE_TARGET_HASH igual al hash de la URL de staging (sin imprimir la URL).')
  }
  if (['NODE_ENV', 'APP_ENV', 'RUNTIME_ENV'].some(key => ['production', 'prod', 'live'].includes(String(env[key] || '').toLowerCase()))) {
    throw new StagingHarnessError('PRODUCTION_RUNTIME_BLOCKED', 'El proceso está marcado como producción; ejecución bloqueada.')
  }

  if (args.run && args.flows.includes('knowledge') && isPlaceholderSecret(env.STAGING_E2E_VOICE_SERVICE_SECRET)) {
    throw new StagingHarnessError('VOICE_SECRET_MISSING', 'Knowledge requiere STAGING_E2E_VOICE_SERVICE_SECRET real de staging.')
  }

  const publicBase = env.STAGING_E2E_PUBLIC_BASE_URL ? String(env.STAGING_E2E_PUBLIC_BASE_URL).trim() : baseUrl.toString()
  let publicUrl
  try {
    publicUrl = new URL(publicBase)
  } catch {
    throw new StagingHarnessError('PUBLIC_BASE_URL_INVALID', 'STAGING_E2E_PUBLIC_BASE_URL no es válida.')
  }
  if (!['https:', 'http:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || hasProductionMarker(publicUrl.hostname)) {
    throw new StagingHarnessError('PUBLIC_BASE_URL_UNSAFE', 'La URL pública de E2E parece productiva o contiene credenciales/query.')
  }
  if (isLoopbackHost(publicUrl.hostname)) {
    if (String(env.STAGING_E2E_ALLOW_LOCAL).trim() !== 'YES') {
      throw new StagingHarnessError('PUBLIC_LOCAL_HOST_NOT_ATTESTED', 'Para una URL pública local exige STAGING_E2E_ALLOW_LOCAL=YES.')
    }
  } else if (!hasNonProductionMarker(publicUrl.hostname) && String(env.STAGING_E2E_HOST_ATTESTATION).trim() !== 'NON_PRODUCTION') {
    throw new StagingHarnessError('PUBLIC_NON_PRODUCTION_HOST_NOT_PROVEN', 'La URL pública no demuestra ser no productiva.')
  }

  const requiredProviders = String(env.STAGING_E2E_REQUIRED_PROVIDERS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  const unknownProviders = requiredProviders.filter(provider => !PROVIDER_IDS.includes(provider))
  if (unknownProviders.length) {
    throw new StagingHarnessError('PROVIDER_ID_INVALID', `Proveedores desconocidos en STAGING_E2E_REQUIRED_PROVIDERS: ${unknownProviders.join(', ')}.`)
  }

  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    publicBaseUrl: publicUrl.toString().replace(/\/$/, ''),
    workspaceId: String(env.STAGING_E2E_WORKSPACE_ID).trim(),
    fixtureNamespace: namespace,
    database,
    databaseTargetHash: targetHash,
    fixtureIsolationAttested: true,
    host: host,
    providerMutations: Boolean(args.providerMutations),
    providerProbes: Boolean(args.providerProbes),
    requiredProviders,
    observabilityToken: isPlaceholderSecret(env.STAGING_E2E_OBSERVABILITY_TOKEN) ? null : String(env.STAGING_E2E_OBSERVABILITY_TOKEN).trim(),
    voiceServiceSecret: args.run && args.flows.includes('knowledge') ? String(env.STAGING_E2E_VOICE_SERVICE_SECRET).trim() : null,
  }
}

export function readJsonFile(filePath) {
  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new StagingHarnessError('FIXTURE_READ_FAILED', `No se pudo leer el fixture: ${path.basename(filePath)}.`, { cause: error?.code })
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new StagingHarnessError('FIXTURE_JSON_INVALID', `El fixture no contiene JSON válido: ${path.basename(filePath)}.`)
  }
}

export function validateProspectFixture(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StagingHarnessError('FIXTURE_SHAPE_INVALID', 'El fixture de Prospect Finder debe ser un objeto.')
  }
  const required = ['name', 'placeId']
  const missing = required.filter(key => typeof value[key] !== 'string' || !value[key].trim())
  if (missing.length) throw new StagingHarnessError('FIXTURE_FIELDS_MISSING', `Faltan campos del prospecto: ${missing.join(', ')}.`)
  if (value.phone !== undefined && typeof value.phone !== 'string') throw new StagingHarnessError('FIXTURE_PHONE_INVALID', 'El teléfono del fixture debe ser texto.')
  if (value.website !== undefined && typeof value.website !== 'string') throw new StagingHarnessError('FIXTURE_WEBSITE_INVALID', 'El website del fixture debe ser texto.')
  return value
}

export function makeFixtureProspect(value, runId) {
  const fixture = validateProspectFixture(value)
  return {
    ...fixture,
    name: `${String(fixture.name).trim()} [${runId}]`.slice(0, 160),
    placeId: `${String(fixture.placeId).trim()}-${runId}`.slice(0, 190),
  }
}

export function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

export function redactText(value, secrets = []) {
  let text = String(value ?? '')
  for (const secret of secrets) {
    if (secret) text = text.split(String(secret)).join('[REDACTED]')
  }
  text = text.replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
  text = text.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[REDACTED]')
  text = text.replace(/([?&](?:token|code|state|secret|access_token|refresh_token)=)[^&\s]+/gi, '$1[REDACTED]')
  return text.slice(0, 500)
}

export function makeArtifactPaths(rootDir, runId) {
  const artifactDir = path.resolve(rootDir, '.artifacts', 'staging-e2e')
  return {
    artifactDir,
    stateFile: path.join(artifactDir, `${runId}.state.json`),
    reportFile: path.join(artifactDir, `${runId}.report.json`),
    markdownFile: path.join(artifactDir, `${runId}.report.md`),
  }
}

export function ensureArtifactDir(paths) {
  fs.mkdirSync(paths.artifactDir, { recursive: true })
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function readState(filePath) {
  const state = readJsonFile(filePath)
  if (!state || typeof state !== 'object' || !RUN_ID_PATTERN.test(String(state.runId || '')) || !Array.isArray(state.resources)) {
    throw new StagingHarnessError('STATE_INVALID', 'El estado del arnés no tiene el formato esperado.')
  }
  if (state.resources.some(resource => !resource || typeof resource !== 'object' || typeof resource.id !== 'string' || typeof resource.kind !== 'string')) {
    throw new StagingHarnessError('STATE_RESOURCES_INVALID', 'El estado contiene recursos sin tipo o identificador válido.')
  }
  return state
}

export function normalizePathForEvidence(value) {
  try {
    return new URL(value, 'https://e2e.invalid').pathname
  } catch {
    return String(value).split('?')[0].slice(0, 240)
  }
}

export function extractEntityId(value) {
  if (!value || typeof value !== 'object') return null
  const candidates = ['id', 'campaignId', 'leadId', 'meetingId', 'opportunityId', 'agentId', 'callId', 'taskId', 'programId', 'projectId', 'knowledgeBaseId']
  for (const key of candidates) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key]
  }
  return null
}

export function extractArray(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['data', 'items', 'programs', 'enrollments', 'results', 'rows']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

export function containsAll(value, needles) {
  const serialized = JSON.stringify(value ?? null)
  return needles.every(needle => serialized.includes(String(needle)))
}
