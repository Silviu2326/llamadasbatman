#!/usr/bin/env node

/**
 * Checks de operación sin mutaciones.
 *
 * No arranca la aplicación, no abre conexiones de red, no ejecuta Prisma
 * migrate y no importa servicios de negocio. Solo valida sintaxis JavaScript,
 * Prisma schema, inventario de migraciones y contrato documental operativo.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OPERATIONAL_FILES = [
  'scripts/critical-flows-smoke.mjs',
  'scripts/ops-checks.mjs',
  'scripts/production-gate.mjs',
  'scripts/production-gate.test.mjs',
  'scripts/prisma-readiness-audit.mjs',
  'scripts/staging-e2e-lib.mjs',
  'scripts/staging-e2e.mjs',
  'scripts/staging-e2e.test.mjs',
  'scripts/ops-checks.test.mjs',
]
const REQUIRED_DOCS = [
  'docs/PRODUCCION_RUNBOOK.md',
  'docs/PRODUCTION_READINESS_MATRIX.md',
  'docs/STAGING_E2E_HARNESS.md',
]
const REQUIRED_ENV_KEYS = [
  'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY',
  'OBSERVABILITY_TOKEN',
  'OBSERVABILITY_MUTATION_TOKEN',
  'WORKER_HEARTBEAT_KEY',
  'STAGING_E2E_DATABASE_TARGET_HASH',
]

export function parseArgs(argv) {
  const options = { json: false, skipPrisma: false, skipMigrationAudit: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--skip-prisma') options.skipPrisma = true
    else if (arg === '--skip-migration-audit') options.skipMigrationAudit = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Opción desconocida: ${arg}`)
  }
  return options
}

function result() {
  return { pass: [], warn: [], fail: [] }
}

function add(report, status, check, detail) {
  report[status].push({ check, detail })
}

function run(command, args, cwd = ROOT) {
  const child = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return { status: child.status ?? 1, stdout: String(child.stdout ?? ''), stderr: String(child.stderr ?? ''), error: child.error?.code }
}

export function checkSyntax(report, files = OPERATIONAL_FILES) {
  for (const file of files) {
    const absolute = resolve(ROOT, file)
    if (!existsSync(absolute)) {
      add(report, 'fail', `syntax.${file}`, 'archivo operativo ausente')
      continue
    }
    const check = run(process.platform === 'win32' ? 'node.exe' : 'node', ['--check', absolute])
    if (check.status === 0) add(report, 'pass', `syntax.${file}`, 'node --check correcto')
    else add(report, 'fail', `syntax.${file}`, 'node --check falló')
  }
}

export function checkMigrationInventory(report) {
  const migrationsRoot = resolve(ROOT, 'backend', 'prisma', 'migrations')
  if (!existsSync(migrationsRoot)) return add(report, 'fail', 'prisma.migrations', 'directorio de migraciones ausente')
  const entries = readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const timestamps = new Set()
  for (const name of entries) {
    const match = /^(\d+)_/.exec(name)
    if (!match) add(report, 'fail', `prisma.migration.${name}`, 'nombre sin timestamp Prisma válido')
    else if (timestamps.has(match[1])) add(report, 'fail', `prisma.migration.${name}`, `timestamp duplicado: ${match[1]}`)
    else timestamps.add(match[1])
    const sql = resolve(migrationsRoot, name, 'migration.sql')
    if (!existsSync(sql) || !readFileSync(sql, 'utf8').trim()) add(report, 'fail', `prisma.migration.${name}`, 'migration.sql ausente o vacío')
  }
  if (!entries.length) add(report, 'fail', 'prisma.migrations', 'no hay migraciones versionadas')
  else if (!report.fail.some(item => item.check.startsWith('prisma.migration.'))) add(report, 'pass', 'prisma.migrations', `${entries.length} migraciones versionadas válidas`)
}

export function checkOperationalEnvContract(report) {
  const file = resolve(ROOT, 'backend', '.env.example')
  if (!existsSync(file)) return add(report, 'fail', 'env.example', 'backend/.env.example ausente')
  const text = readFileSync(file, 'utf8')
  for (const key of REQUIRED_ENV_KEYS) {
    if (new RegExp(`^${key}=`, 'm').test(text)) add(report, 'pass', `env.${key}`, 'declarada en .env.example')
    else add(report, 'fail', `env.${key}`, 'falta en backend/.env.example')
  }
}

export function checkDocumentation(report) {
  for (const file of REQUIRED_DOCS) {
    const absolute = resolve(ROOT, file)
    if (!existsSync(absolute) || !readFileSync(absolute, 'utf8').trim()) add(report, 'fail', `docs.${file}`, 'runbook ausente o vacío')
    else add(report, 'pass', `docs.${file}`, 'runbook presente')
  }
}

export function checkPrismaValidate(report) {
  const backendRoot = resolve(ROOT, 'backend')
  const prismaCli = resolve(backendRoot, 'node_modules', 'prisma', 'build', 'index.js')
  if (!existsSync(prismaCli)) return add(report, 'fail', 'prisma.validate', 'CLI local de Prisma ausente; instala dependencias antes de ejecutar el check')
  const check = run(process.execPath, [prismaCli, 'validate'], backendRoot)
  if (check.status === 0) add(report, 'pass', 'prisma.validate', 'schema Prisma válido; no se contactó la base')
  else add(report, 'fail', 'prisma.validate', 'prisma validate falló')
}

export function runChecks(options = {}) {
  const report = result()
  checkSyntax(report)
  if (!options.skipMigrationAudit) checkMigrationInventory(report)
  checkOperationalEnvContract(report)
  checkDocumentation(report)
  if (!options.skipPrisma) checkPrismaValidate(report)
  return { ok: report.fail.length === 0, report, mutating: false, network: false }
}

function usage() {
  console.log(`Uso: node scripts/ops-checks.mjs [--json] [--skip-prisma] [--skip-migration-audit]\n\nNo arranca servicios, no abre red y no ejecuta migraciones.`)
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) { usage(); return 0 }
  const output = runChecks(options)
  if (options.json) console.log(JSON.stringify(output, null, 2))
  else {
    console.log(`Operational checks: ${output.ok ? 'PASS' : 'FAIL'}`)
    for (const status of ['fail', 'warn', 'pass']) for (const item of output.report[status]) console.log(`[${status.toUpperCase()}] ${item.check}: ${item.detail}`)
  }
  return output.ok ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main()

export { OPERATIONAL_FILES, REQUIRED_DOCS, REQUIRED_ENV_KEYS }
