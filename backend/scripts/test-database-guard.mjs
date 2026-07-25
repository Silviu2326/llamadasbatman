import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NON_PRODUCTION_MARKER = /(?:^|[._-])(dev|development|test|testing|staging|stage|qa|e2e|sandbox|preview)(?:[._-]|$)/i
const PRODUCTION_MARKER = /(?:^|[._-])(prod|production|live)(?:[._-]|$)/i

function parseTarget(value, variableName) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${variableName} debe ser una URL PostgreSQL válida.`)
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${variableName} debe usar el protocolo PostgreSQL.`)
  }
  if (!url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error(`${variableName} debe identificar una base de datos concreta.`)
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, '')).split('/')[0]
  if (!databaseName) throw new Error(`${variableName} debe identificar una base de datos concreta.`)

  // Sólo se conserva la identidad lógica del destino; credenciales, opciones
  // de conexión y schema no deben permitir que dos URLs oculten la misma base.
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = `/${databaseName}`

  return {
    canonical: url.toString().replace(/\/$/, '').toLowerCase(),
    hostname: url.hostname.toLowerCase(),
    databaseName: databaseName.toLowerCase(),
  }
}

function hasMarker(target, pattern) {
  return pattern.test(`${target.hostname}.${target.databaseName}`)
}

export function validateTestDatabaseEnvironment(env = process.env) {
  const testUrl = env.TEST_DATABASE_URL?.trim()
  const appUrl = env.DATABASE_URL?.trim()

  if (!testUrl) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada.')
  if (!appUrl) throw new Error('DATABASE_URL es necesaria para comprobar el aislamiento de la suite.')

  const testTarget = parseTarget(testUrl, 'TEST_DATABASE_URL')
  const appTarget = parseTarget(appUrl, 'DATABASE_URL')

  if (hasMarker(appTarget, PRODUCTION_MARKER)) {
    throw new Error('DATABASE_URL parece productiva; la suite no puede ejecutarse contra producción.')
  }
  const explicitlyIsolated = env.TEST_DATABASE_ISOLATED === 'YES'
  if (!hasMarker(testTarget, NON_PRODUCTION_MARKER) && !explicitlyIsolated) {
    throw new Error('TEST_DATABASE_URL debe incluir un marcador no productivo o TEST_DATABASE_ISOLATED=YES.')
  }
  if (hasMarker(testTarget, PRODUCTION_MARKER)) {
    throw new Error('TEST_DATABASE_URL parece productiva; la suite no puede ejecutarse contra producción.')
  }
  if (testTarget.canonical === appTarget.canonical) {
    throw new Error('TEST_DATABASE_URL no puede ser exactamente la misma base que DATABASE_URL.')
  }

  return { testTarget, appTarget }
}

function isMain() {
  const invoked = process.argv[1]
  return invoked && path.resolve(invoked) === fileURLToPath(import.meta.url)
}

if (isMain()) {
  try {
    validateTestDatabaseEnvironment()
    console.log('Base de pruebas aislada validada.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Configuración de base de pruebas inválida.')
    process.exitCode = 1
  }
}
