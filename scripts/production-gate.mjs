#!/usr/bin/env node

/**
 * Reproducible, configuration-only production gate.
 *
 * It intentionally does not import backend code. This keeps the gate usable
 * before a deploy and prevents a local fallback from being mistaken for a
 * production check. It never prints environment values or provider secrets.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { isIP } from 'node:net'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ENV_FILE = resolve(REPO_ROOT, 'backend', '.env')
const MIGRATION_CONFIRMATION = 'APPLY_PRODUCTION_MIGRATIONS'

const ALL_PROVIDERS = [
  'meta_ads',
  'google_search_console',
  'metricool',
  'mautic_email',
  'twilio',
]

const PROVIDERS = {
  meta_ads: {
    label: 'Meta Ads',
    required: ['META_APP_ID', 'META_APP_SECRET', 'META_TOKEN_ENCRYPTION_KEY', 'META_WEBHOOK_VERIFY_TOKEN'],
    activation: ['META_APP_ID', 'META_APP_SECRET', 'META_TOKEN_ENCRYPTION_KEY', 'META_WEBHOOK_VERIFY_TOKEN'],
    secrets: [['META_APP_SECRET', 16], ['META_TOKEN_ENCRYPTION_KEY', 32], ['META_WEBHOOK_VERIFY_TOKEN', 16]],
    urls: [{ name: 'META_OAUTH_REDIRECT_URI', public: true, callbackPath: '/api/meta/accounts/oauth/callback' }],
    callbackFallback: ['META_OAUTH_REDIRECT_URI', 'PUBLIC_HOST', 'PUBLIC_BASE_URL'],
  },
  google_search_console: {
    label: 'Google / Search Console',
    required: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_BASE_URL', 'ORGANIC_TOKEN_ENCRYPTION_KEY'],
    activation: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_BASE_URL', 'ORGANIC_TOKEN_ENCRYPTION_KEY'],
    secrets: [['GOOGLE_OAUTH_CLIENT_SECRET', 16], ['ORGANIC_TOKEN_ENCRYPTION_KEY', 32]],
    urls: [{ name: 'GOOGLE_OAUTH_REDIRECT_BASE_URL', public: true }],
  },
  metricool: {
    label: 'Metricool',
    required: ['METRICOOL_BASE_URL', 'METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID'],
    activation: ['METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID'],
    secrets: [['METRICOOL_USER_TOKEN', 16]],
    urls: [{ name: 'METRICOOL_BASE_URL', public: true }],
  },
  mautic_email: {
    label: 'Mautic / email',
    required: ['MAUTIC_BASE_URL', 'MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET'],
    activation: ['MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET'],
    secrets: [['MAUTIC_CLIENT_SECRET', 16], ['MAUTIC_WEBHOOK_SECRET', 16]],
    urls: [{ name: 'MAUTIC_BASE_URL', public: false }],
  },
  twilio: {
    label: 'Twilio',
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WEBHOOK_BASE_URL'],
    activation: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WEBHOOK_BASE_URL', 'TWILIO_FROM_NUMBER', 'TWILIO_WHATSAPP_FROM'],
    secrets: [['TWILIO_AUTH_TOKEN', 16]],
    urls: [{ name: 'TWILIO_WEBHOOK_BASE_URL', public: true }],
    requiredAny: [['TWILIO_FROM_NUMBER', 'TWILIO_WHATSAPP_FROM']],
  },
}

const URL_ALIASES = [
  ['PUBLIC_BASE_URL', true, true],
  ['APP_URL', true, true],
  ['FRONTEND_URL', true, true],
  ['PUBLIC_HOST', true, true],
  ['META_OAUTH_REDIRECT_URI', true, true],
  ['GOOGLE_OAUTH_REDIRECT_BASE_URL', true, true],
  ['TWILIO_WEBHOOK_BASE_URL', true, true],
  ['METRICOOL_BASE_URL', false, false],
  ['MAUTIC_BASE_URL', false, false],
]

const SECURITY_SECRETS = [
  ['JWT_SECRET', 32],
  ['OAUTH_STATE_SECRET', 32],
  ['META_TOKEN_ENCRYPTION_KEY', 32],
  ['ORGANIC_TOKEN_ENCRYPTION_KEY', 32],
  ['INTEGRATION_CREDENTIALS_ENCRYPTION_KEY', 32],
  ['OBSERVABILITY_TOKEN', 32],
  ['OBSERVABILITY_MUTATION_TOKEN', 32],
  ['WORKER_HEARTBEAT_KEY', 16],
]

const PLACEHOLDER_VALUES = new Set([
  'changeme',
  'changeme_secret',
  'change_me',
  'change_me_secret',
  'change_me_refresh',
  'change_me_voice_secret',
  'generate_a_random_secret_of_at_least_32_characters_before_starting',
  'generate_a_different_random_secret_of_at_least_32_characters',
  'secret',
  'password',
  'user:password',
])

function usage() {
  console.log(`Uso:
  node scripts/production-gate.mjs [opciones]

Opciones:
  --env-file <ruta>                         Fichero .env (por defecto backend/.env)
  --allow-private                          Permite localhost/RFC1918 explícitamente
  --json                                   Emite un resultado JSON sin valores de entorno
  --migrate --confirm-migrations <token>   Ejecuta migrate deploy solo con el token exacto:
                                           ${MIGRATION_CONFIRMATION}
  --help                                   Muestra esta ayuda

El gate es de configuración y no hace llamadas externas. NODE_ENV=production es obligatorio.
`)
}

function parseArgs(argv) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    allowPrivate: false,
    json: false,
    migrate: false,
    confirmation: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (arg === '--allow-private') {
      options.allowPrivate = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--migrate') {
      options.migrate = true
      continue
    }
    if (arg === '--env-file') {
      options.envFile = resolve(process.cwd(), argv[++index] ?? '')
      continue
    }
    if (arg.startsWith('--env-file=')) {
      options.envFile = resolve(process.cwd(), arg.slice('--env-file='.length))
      continue
    }
    if (arg === '--confirm-migrations') {
      options.confirmation = argv[++index] ?? ''
      continue
    }
    if (arg.startsWith('--confirm-migrations=')) {
      options.confirmation = arg.slice('--confirm-migrations='.length)
      continue
    }
    throw new Error(`Opción desconocida: ${arg}`)
  }

  return options
}

function parseEnvFile(filename) {
  if (!existsSync(filename)) return { values: {}, exists: false }
  const values = {}
  const lines = readFileSync(filename, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
      if (match[2].startsWith('"')) value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    values[match[1]] = value
  }
  return { values, exists: true }
}

function value(env, name) {
  const raw = env[name]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function isPlaceholder(raw) {
  if (!raw) return true
  const normalized = raw.trim().toLowerCase()
  return PLACEHOLDER_VALUES.has(normalized)
    || normalized.startsWith('generate_')
    || normalized.startsWith('replace_')
    || normalized.startsWith('your_')
    || normalized.startsWith('example_')
    || normalized.startsWith('dummy_')
    || normalized.includes('user:password')
}

function privateIpv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

function privateIpv6(address) {
  const normalized = address.toLowerCase().split('%')[0]
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
}

function isPrivateHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local') || normalized.endsWith('.internal')) return true
  if (normalized === 'host.docker.internal' || normalized === 'docker.internal') return true
  const family = isIP(normalized)
  return family === 4 ? privateIpv4(normalized) : family === 6 ? privateIpv6(normalized) : false
}

function safeHost(raw) {
  try { return new URL(raw).hostname.replace(/^\[|\]$/g, '') } catch { return undefined }
}

function parseUrl(raw, protocols) {
  try {
    const parsed = new URL(raw)
    if (!protocols.includes(parsed.protocol) || !parsed.hostname) return null
    return parsed
  } catch {
    return null
  }
}

function createReport() {
  return { pass: [], warn: [], fail: [] }
}

function add(report, status, check, detail) {
  report[status].push({ check, detail })
}

function checkSecret(report, env, name, minimumLength, required = true) {
  const raw = value(env, name)
  if (!raw) {
    if (required) add(report, 'fail', name, 'ausente')
    return undefined
  }
  if (raw.length < minimumLength) {
    add(report, 'fail', name, `debe tener al menos ${minimumLength} caracteres`)
    return raw
  }
  if (isPlaceholder(raw)) {
    add(report, 'fail', name, 'usa un valor de ejemplo')
    return raw
  }
  add(report, 'pass', name, 'presente y con longitud válida')
  return raw
}

function checkDatabaseUrl(report, env) {
  const raw = value(env, 'DATABASE_URL')
  if (!raw) return add(report, 'fail', 'DATABASE_URL', 'ausente')
  const parsed = parseUrl(raw, ['postgres:', 'postgresql:'])
  if (!parsed || !parsed.hostname || isPlaceholder(raw)) return add(report, 'fail', 'DATABASE_URL', 'formato PostgreSQL inválido o valor de ejemplo')
  if (isPrivateHost(parsed.hostname) && !env.allowPrivate) return add(report, 'fail', 'DATABASE_URL', 'apunta a localhost o una red privada; usa --allow-private solo en entornos controlados')
  add(report, 'pass', 'DATABASE_URL', `PostgreSQL válido${isPrivateHost(parsed.hostname) ? ' (privado permitido explícitamente)' : ''}`)
}

function checkRedisUrl(report, env) {
  const raw = value(env, 'REDIS_URL')
  if (!raw) return add(report, 'fail', 'REDIS_URL', 'ausente')
  const parsed = parseUrl(raw, ['redis:', 'rediss:'])
  if (!parsed || !parsed.hostname || isPlaceholder(raw)) return add(report, 'fail', 'REDIS_URL', 'formato Redis inválido o valor de ejemplo')
  if (isPrivateHost(parsed.hostname) && !env.allowPrivate) return add(report, 'fail', 'REDIS_URL', 'apunta a localhost o una red privada; usa --allow-private solo en entornos controlados')
  add(report, 'pass', 'REDIS_URL', `Redis válido${isPrivateHost(parsed.hostname) ? ' (privado permitido explícitamente)' : ''}`)
}

function checkHttpUrl(report, env, name, options = {}) {
  const raw = value(env, name)
  if (!raw) {
    if (options.required) add(report, 'fail', name, 'ausente')
    return false
  }
  const parsed = parseUrl(raw, ['http:', 'https:'])
  if (!parsed || parsed.username || parsed.password || parsed.search || parsed.hash) {
    add(report, 'fail', name, 'URL HTTP(S) inválida, con credenciales, query o hash')
    return false
  }
  if (options.callbackPath && parsed.pathname !== options.callbackPath) {
    add(report, 'fail', name, `debe terminar exactamente en ${options.callbackPath}`)
    return false
  }
  if (options.httpsInProduction && env.production && parsed.protocol !== 'https:') {
    add(report, 'fail', name, 'debe usar HTTPS en producción')
    return false
  }
  if (isPrivateHost(parsed.hostname) && !env.allowPrivate) {
    add(report, 'fail', name, 'apunta a localhost o una red privada; usa --allow-private solo en entornos controlados')
    return false
  }
  add(report, 'pass', name, `URL válida${isPrivateHost(parsed.hostname) ? ' (privada permitida explícitamente)' : ''}`)
  return true
}

function checkProvider(report, env, providerId, definition, requiredProviders) {
  const isRequired = requiredProviders.has(providerId)
  const active = definition.activation.some((name) => Boolean(value(env, name)))
  const configurationSignals = [
    ...definition.required,
    ...definition.urls.map((url) => url.name),
    ...(definition.requiredAny ?? []).flat(),
  ]
  const configured = configurationSignals.some((name) => Boolean(value(env, name)))
  const missing = definition.required.filter((name) => !value(env, name))

  if (isRequired) {
    for (const name of missing) add(report, 'fail', `${providerId}.${name}`, 'obligatoria y ausente')
  } else if (configured && missing.length) {
    for (const name of missing) add(report, 'fail', `${providerId}.${name}`, 'configuración parcial de integración opcional')
  } else if (!configured) {
    add(report, 'warn', providerId, 'no configurada; no es obligatoria en este entorno')
  }

  for (const [name, minimumLength] of definition.secrets) {
    if (isRequired || active || value(env, name)) checkSecret(report, env, name, minimumLength, isRequired || active)
  }

  for (const url of definition.urls) {
    if (isRequired || value(env, url.name)) checkHttpUrl(report, env, url.name, {
      required: isRequired,
      httpsInProduction: url.public,
      callbackPath: url.callbackPath,
    })
  }

  for (const alternatives of definition.requiredAny ?? []) {
    if (isRequired && !alternatives.some((name) => value(env, name))) {
      add(report, 'fail', `${providerId}.${alternatives.join('|')}`, 'debe configurarse al menos una opción')
    }
  }

  if (isRequired && definition.callbackFallback && !definition.callbackFallback.some((name) => value(env, name))) {
    add(report, 'fail', `${providerId}.oauth_callback`, 'configura un callback explícito o PUBLIC_HOST/PUBLIC_BASE_URL')
  }

  if (isRequired && missing.length === 0 && (!definition.requiredAny || definition.requiredAny.every((alternatives) => alternatives.some((name) => value(env, name)))) ) {
    add(report, 'pass', providerId, 'configuración completa')
  }
}

function checkCors(report, env) {
  const raw = value(env, 'CORS_ORIGINS')
  if (!raw) return add(report, 'warn', 'CORS_ORIGINS', 'ausente; el backend usará APP_URL si está configurado')
  for (const [index, origin] of raw.split(',').map((item) => item.trim()).filter(Boolean).entries()) {
    const name = `CORS_ORIGINS[${index}]`
    const parsed = parseUrl(origin, ['http:', 'https:'])
    if (!parsed || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      add(report, 'fail', name, 'origen inválido')
      continue
    }
    if (env.production && parsed.protocol !== 'https:' && !isPrivateHost(parsed.hostname)) add(report, 'fail', name, 'debe usar HTTPS en producción')
    if (isPrivateHost(parsed.hostname) && !env.allowPrivate) add(report, 'fail', name, 'apunta a red privada sin --allow-private')
    else add(report, 'pass', name, 'origen válido')
  }
}

function checkOperationalSecurity(report, env) {
  const values = new Map()
  for (const [name, minimumLength] of [
    ['INTEGRATION_CREDENTIALS_ENCRYPTION_KEY', 32],
    ['OBSERVABILITY_TOKEN', 32],
    ['OBSERVABILITY_MUTATION_TOKEN', 32],
    ['WORKER_HEARTBEAT_KEY', 16],
  ]) {
    const secret = checkSecret(report, env, name, minimumLength, true)
    if (secret) values.set(name, secret)
  }
  const seen = new Map()
  for (const [name, secret] of values) {
    const previous = seen.get(secret)
    if (previous) add(report, 'fail', name, `no puede reutilizar el secreto de ${previous}`)
    else seen.set(secret, name)
  }
  if (value(env, 'BACKGROUND_WORKERS_ENABLED')?.toLowerCase() === 'false') {
    add(report, 'fail', 'BACKGROUND_WORKERS_ENABLED', 'debe estar activo en producción; las colas no se pueden dejar desatendidas')
  } else add(report, 'pass', 'BACKGROUND_WORKERS_ENABLED', 'workers habilitados')
  if (value(env, 'ORCHESTRATION_WORKER_ENABLED')?.toLowerCase() === 'false') {
    add(report, 'fail', 'ORCHESTRATION_WORKER_ENABLED', 'debe estar activo en producción; el orquestador no puede quedar en modo propuesta')
  } else add(report, 'pass', 'ORCHESTRATION_WORKER_ENABLED', 'worker del orquestador habilitado')
}

function checkMigrationInventory(report) {
  const migrationsDir = resolve(REPO_ROOT, 'backend', 'prisma', 'migrations')
  if (!existsSync(migrationsDir)) return add(report, 'fail', 'PRISMA_MIGRATIONS', 'no existe backend/prisma/migrations')
  const entries = readdirSync(migrationsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const seenPrefixes = new Set()
  for (const name of entries) {
    const prefix = name.split('_')[0]
    if (seenPrefixes.has(prefix)) add(report, 'fail', `PRISMA_MIGRATIONS.${name}`, 'timestamp de migración duplicado')
    seenPrefixes.add(prefix)
    const migrationFile = resolve(migrationsDir, name, 'migration.sql')
    if (!existsSync(migrationFile)) add(report, 'fail', `PRISMA_MIGRATIONS.${name}`, 'falta migration.sql')
    else if (!readFileSync(migrationFile, 'utf8').trim()) add(report, 'fail', `PRISMA_MIGRATIONS.${name}`, 'migration.sql está vacío')
  }
  if (!entries.length) add(report, 'fail', 'PRISMA_MIGRATIONS', 'no hay migraciones versionadas')
  else add(report, 'pass', 'PRISMA_MIGRATIONS', `${entries.length} migraciones versionadas con migration.sql`) 
}

function collectReport(runtimeEnv, options) {
  const report = createReport()
  const mergedEnv = { ...runtimeEnv, allowPrivate: options.allowPrivate, production: runtimeEnv.NODE_ENV?.trim().toLowerCase() === 'production' }

  if (mergedEnv.production) add(report, 'pass', 'NODE_ENV', 'production')
  else add(report, 'fail', 'NODE_ENV', 'debe ser exactamente production para abrir este gate')

  checkDatabaseUrl(report, mergedEnv)
  checkRedisUrl(report, mergedEnv)
  checkHttpUrl(report, mergedEnv, 'PUBLIC_BASE_URL', { required: true, httpsInProduction: true })

  for (const [name, publicUrl, httpsInProduction] of URL_ALIASES) {
    if (name === 'PUBLIC_BASE_URL' || !value(mergedEnv, name)) continue
    checkHttpUrl(report, mergedEnv, name, { public: publicUrl, httpsInProduction })
  }
  checkCors(report, mergedEnv)
  checkOperationalSecurity(report, mergedEnv)
  checkMigrationInventory(report)

  const secretValues = new Map()
  for (const [name, minimumLength] of SECURITY_SECRETS) {
    const secret = checkSecret(report, mergedEnv, name, minimumLength, true)
    if (secret) secretValues.set(name, secret)
  }
  const seenSecrets = new Map()
  for (const [name, secret] of secretValues) {
    const previous = seenSecrets.get(secret)
    if (previous) add(report, 'fail', name, `no puede reutilizar el secreto de ${previous}`)
    else seenSecrets.set(secret, name)
  }

  const rawRequired = value(mergedEnv, 'REQUIRED_INTEGRATIONS')
  const requiredList = rawRequired
    ? rawRequired.split(',').map((item) => item.trim()).filter(Boolean)
    : (mergedEnv.production ? [...ALL_PROVIDERS] : [])
  const unknownProviders = requiredList.filter((provider) => !ALL_PROVIDERS.includes(provider))
  for (const provider of unknownProviders) add(report, 'fail', 'REQUIRED_INTEGRATIONS', `proveedor desconocido: ${provider}`)
  const requiredProviders = new Set(requiredList.filter((provider) => ALL_PROVIDERS.includes(provider)))
  if (requiredProviders.size) add(report, 'pass', 'REQUIRED_INTEGRATIONS', `${requiredProviders.size} proveedor(es) obligatorio(s)`)
  else add(report, 'warn', 'REQUIRED_INTEGRATIONS', 'ningún proveedor obligatorio en este entorno')
  for (const providerId of ALL_PROVIDERS) checkProvider(report, mergedEnv, providerId, PROVIDERS[providerId], requiredProviders)

  return { report, requiredProviders: [...requiredProviders], production: mergedEnv.production }
}

function redacted(text, env) {
  let result = String(text)
  for (const name of [...SECURITY_SECRETS.map(([key]) => key), ...Object.values(PROVIDERS).flatMap((provider) => provider.secrets.map(([key]) => key)), 'DATABASE_URL', 'REDIS_URL']) {
    const raw = value(env, name)
    if (raw && raw.length >= 4) result = result.split(raw).join('[REDACTED]')
  }
  return result.replace(/((?:postgres(?:ql)?|rediss?|https?):\/\/)[^\s@]+@/gi, '$1[REDACTED]@')
}

function render(result, options, envFile, env) {
  const { report, requiredProviders } = result
  const ok = report.fail.length === 0
  const output = {
    ok,
    production: result.production,
    envFile,
    allowPrivate: options.allowPrivate,
    requiredProviders,
    migrations: options.migrate ? 'requested' : 'not_run',
    checks: report,
  }
  if (options.json) {
    console.log(JSON.stringify(output, null, 2))
    return ok
  }

  console.log(`Production gate: ${ok ? 'PASS' : 'FAIL'}${result.production ? '' : ' (no es producción)'}`)
  console.log(`Fichero: ${envFile}`)
  console.log(`Redes privadas: ${options.allowPrivate ? 'permitidas explícitamente' : 'bloqueadas'}`)
  for (const status of ['fail', 'warn', 'pass']) {
    for (const item of report[status]) {
      const marker = status === 'fail' ? 'FAIL' : status === 'warn' ? 'WARN' : 'PASS'
      console.log(`[${marker}] ${item.check}: ${redacted(item.detail, env)}`)
    }
  }
  if (!options.migrate) console.log(`[INFO] Migraciones omitidas. Para ejecutarlas: --migrate --confirm-migrations ${MIGRATION_CONFIRMATION}`)
  return ok
}

function runMigrations(options, env) {
  if (!options.migrate) return 0
  if (options.confirmation !== MIGRATION_CONFIRMATION) {
    console.error(`[FAIL] Migraciones bloqueadas: --migrate requiere --confirm-migrations ${MIGRATION_CONFIRMATION}`)
    return 1
  }
  console.log('[INFO] Confirmación explícita recibida. Ejecutando prisma validate antes de migrate deploy...')
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const childEnv = Object.fromEntries(Object.entries(env).filter(([, raw]) => typeof raw === 'string'))
  const validate = spawnSync(command, ['prisma', 'validate'], { cwd: resolve(REPO_ROOT, 'backend'), env: childEnv, encoding: 'utf8' })
  if (validate.stdout) process.stdout.write(redacted(validate.stdout, env))
  if (validate.stderr) process.stderr.write(redacted(validate.stderr, env))
  if (validate.status !== 0) return validate.status ?? 1
  const migrate = spawnSync(command, ['prisma', 'migrate', 'deploy'], { cwd: resolve(REPO_ROOT, 'backend'), env: childEnv, encoding: 'utf8' })
  if (migrate.stdout) process.stdout.write(redacted(migrate.stdout, env))
  if (migrate.stderr) process.stderr.write(redacted(migrate.stderr, env))
  return migrate.status ?? 1
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`[FAIL] ${error instanceof Error ? error.message : 'argumentos inválidos'}`)
    usage()
    process.exitCode = 2
    return
  }

  const envFile = resolve(options.envFile)
  const loaded = parseEnvFile(envFile)
  const env = { ...loaded.values, ...process.env }
  if (!loaded.exists && !options.json) console.warn(`[WARN] No existe ${envFile}; se usan solo variables del proceso.`)
  const result = collectReport(env, options)
  const ok = render(result, options, envFile, env)
  if (!ok) {
    process.exitCode = 1
    return
  }
  const migrationStatus = runMigrations(options, env)
  if (migrationStatus !== 0) process.exitCode = migrationStatus
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()

export {
  ALL_PROVIDERS,
  PROVIDERS,
  SECURITY_SECRETS,
  MIGRATION_CONFIRMATION,
  parseArgs,
  parseEnvFile,
  collectReport,
  checkMigrationInventory,
  isPlaceholder,
  isPrivateHost,
}
