#!/usr/bin/env node

/**
 * Auditoría estática y no mutante del historial Prisma y de la suite de tests.
 *
 * Este script no carga .env, no crea un PrismaClient, no abre red y no ejecuta
 * migraciones. Comprueba únicamente el contenido del repositorio para que una
 * revisión de migraciones no pueda tocar por accidente una base real.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const prismaRoot = path.join(repoRoot, 'backend', 'prisma')
const migrationsRoot = path.join(prismaRoot, 'migrations')
const schemaPath = path.join(prismaRoot, 'schema.prisma')
const packagePath = path.join(repoRoot, 'backend', 'package.json')
const guardPath = path.join(repoRoot, 'backend', 'scripts', 'test-database-guard.mjs')
const runnerPath = path.join(repoRoot, 'backend', 'scripts', 'run-tests.mjs')
const helperPath = path.join(repoRoot, 'backend', 'src', '__tests__', 'testHelpers.ts')

const issues = []
const warnings = []
const evidence = []

function add(list, code, message, detail = '') {
  list.push({ code, message, ...(detail ? { detail } : {}) })
}

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
}

function exists(file) {
  return fs.existsSync(file)
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

function parseMigrationName(name) {
  const match = /^(\d+)_([a-z0-9][a-z0-9_]*)$/.exec(name)
  return match ? { timestamp: match[1], slug: match[2] } : null
}

function parseSchema(schema) {
  const models = new Map()
  const enums = new Map()
  const modelRe = /\bmodel\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)^\}/gm
  const enumRe = /\benum\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)^\}/gm

  for (const match of schema.matchAll(modelRe)) {
    const name = match[1]
    const fields = new Map()
    for (const rawLine of match[2].split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue
      const field = /^(\w+)\s+([A-Za-z_]\w*(?:\[\])?\??)(?:\s|$)/.exec(line)
      if (!field) continue
      const [, fieldName, type] = field
      const map = /@map\("([^"]+)"\)/.exec(line)
      fields.set(fieldName, { column: map?.[1] ?? fieldName, type })
    }
    models.set(name, fields)
  }

  for (const match of schema.matchAll(enumRe)) {
    const values = new Set()
    for (const rawLine of match[2].split(/\r?\n/)) {
      const line = rawLine.trim().replace(/\s+\/\/.*$/, '')
      if (/^[A-Za-z_]\w*$/.test(line)) values.add(line)
    }
    enums.set(match[1], values)
  }

  return { models, enums }
}

function parseSql(sql) {
  const tables = new Map()
  const createdEnums = new Map()
  const enumValues = new Map()
  const alteredColumns = new Map()
  const renamedColumns = new Map()
  const fks = []
  const tableRe = /CREATE\s+TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/gim
  const enumRe = /CREATE\s+TYPE\s+"([^"]+)"\s+AS\s+ENUM\s*\(([^)]*)\)/gim
  const alterEnumRe = /ALTER\s+TYPE\s+"([^"]+)"\s+ADD\s+VALUE(?:\s+IF\s+NOT\s+EXISTS)?\s+'([^']+)'/gim
  const alterColumnRe = /ALTER\s+TABLE\s+"([^"]+)"\s+([\s\S]*?)(?=;)/gim
  const fkRe = /ALTER\s+TABLE\s+"([^"]+)"[\s\S]*?REFERENCES\s+"([^"]+)"/gim

  for (const match of sql.matchAll(tableRe)) {
    const columns = new Set()
    for (const column of match[2].matchAll(/^\s+"([^"]+)"\s+/gm)) columns.add(column[1])
    tables.set(match[1], columns)
  }

  for (const match of sql.matchAll(enumRe)) {
    const values = new Set([...match[2].matchAll(/'([^']+)'/g)].map((x) => x[1]))
    createdEnums.set(match[1], values)
    enumValues.set(match[1], values)
  }

  for (const match of sql.matchAll(alterEnumRe)) {
    if (!enumValues.has(match[1])) enumValues.set(match[1], new Set())
    enumValues.get(match[1]).add(match[2])
  }

  for (const match of sql.matchAll(alterColumnRe)) {
    const table = match[1]
    if (!alteredColumns.has(table)) alteredColumns.set(table, new Set())
    for (const column of match[2].matchAll(/ADD\s+COLUMN\s+"([^"]+)"/gim)) {
      alteredColumns.get(table).add(column[1])
    }
    for (const rename of match[2].matchAll(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gim)) {
      if (!renamedColumns.has(table)) renamedColumns.set(table, [])
      renamedColumns.get(table).push({ from: rename[1], to: rename[2] })
    }
  }

  for (const match of sql.matchAll(fkRe)) fks.push({ from: match[1], to: match[2] })
  return { tables, createdEnums, enumValues, alteredColumns, renamedColumns, fks }
}

function collectMigrations() {
  if (!exists(migrationsRoot)) {
    add(issues, 'MIGRATIONS_DIR_MISSING', 'No existe backend/prisma/migrations.')
    return []
  }
  return fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const parsed = parseMigrationName(entry.name)
      const file = path.join(migrationsRoot, entry.name, 'migration.sql')
      return { name: entry.name, file, parsed, sql: exists(file) ? read(file) : '' }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function auditMigrations(schemaInfo, migrations) {
  const seenTimestamps = new Map()
  const knownTables = new Set()
  const knownEnums = new Set()
  const allSqlColumns = new Map()
  const allEnumValues = new Map()

  if (!migrations.length) return
  if (!migrations[0].name.endsWith('_baseline')) {
    add(issues, 'BASELINE_NOT_FIRST', 'La primera migración no tiene sufijo _baseline.', migrations[0].name)
  }

  for (const migration of migrations) {
    if (!migration.parsed) add(issues, 'MIGRATION_NAME_INVALID', `Nombre de migración inválido: ${migration.name}`)
    if (!exists(migration.file)) add(issues, 'MIGRATION_SQL_MISSING', `${migration.name} no contiene migration.sql.`)
    if (migration.parsed) {
      const entries = seenTimestamps.get(migration.parsed.timestamp) ?? []
      entries.push(migration.name)
      seenTimestamps.set(migration.parsed.timestamp, entries)
    }
  }

  for (const [timestamp, names] of seenTimestamps) {
    if (names.length > 1) add(issues, 'MIGRATION_TIMESTAMP_DUPLICATE', `Prefijo temporal duplicado ${timestamp}.`, names.join(', '))
  }

  for (const migration of migrations) {
    const current = parseSql(migration.sql)
    const tablesCreatedHere = new Set(current.tables.keys())
    const enumsCreatedHere = new Set(current.createdEnums.keys())

    for (const table of tablesCreatedHere) {
      if (knownTables.has(table)) add(issues, 'TABLE_CREATED_TWICE', `${migration.name} vuelve a crear la tabla ${table}.`)
      knownTables.add(table)
      if (!allSqlColumns.has(table)) allSqlColumns.set(table, new Set())
      for (const column of current.tables.get(table)) allSqlColumns.get(table).add(column)
    }
    for (const [table, columns] of current.alteredColumns) {
      if (!knownTables.has(table) && !tablesCreatedHere.has(table)) {
        add(issues, 'ALTER_UNKNOWN_TABLE', `${migration.name} altera una tabla no creada antes.`, table)
      }
      if (!allSqlColumns.has(table)) allSqlColumns.set(table, new Set())
      for (const column of columns) {
        if (allSqlColumns.get(table).has(column)) add(issues, 'COLUMN_ADDED_TWICE', `${migration.name} vuelve a añadir ${table}.${column}.`)
        allSqlColumns.get(table).add(column)
      }
    }
    for (const [table, renames] of current.renamedColumns) {
      if (!knownTables.has(table) && !tablesCreatedHere.has(table)) {
        add(issues, 'RENAME_UNKNOWN_TABLE', `${migration.name} renombra una columna de una tabla no creada antes.`, table)
        continue
      }
      if (!allSqlColumns.has(table)) allSqlColumns.set(table, new Set())
      for (const rename of renames) {
        if (!allSqlColumns.get(table).has(rename.from)) {
          add(issues, 'RENAME_UNKNOWN_COLUMN', `${migration.name} renombra una columna no creada antes.`, `${table}.${rename.from}`)
          continue
        }
        allSqlColumns.get(table).delete(rename.from)
        allSqlColumns.get(table).add(rename.to)
      }
    }

    for (const enumName of enumsCreatedHere) {
      if (knownEnums.has(enumName)) add(issues, 'ENUM_CREATED_TWICE', `${migration.name} vuelve a crear el enum ${enumName}.`)
      knownEnums.add(enumName)
    }
    for (const enumName of current.enumValues.keys()) {
      if (!knownEnums.has(enumName)) add(issues, 'ALTER_UNKNOWN_ENUM', `${migration.name} modifica un enum no creado antes.`, enumName)
      if (!allEnumValues.has(enumName)) allEnumValues.set(enumName, new Set())
      for (const value of current.enumValues.get(enumName)) allEnumValues.get(enumName).add(value)
    }

    for (const fk of current.fks) {
      if (!knownTables.has(fk.from) && !tablesCreatedHere.has(fk.from)) add(issues, 'FK_UNKNOWN_SOURCE', `${migration.name} referencia una tabla origen no creada.`, fk.from)
      if (!knownTables.has(fk.to) && !tablesCreatedHere.has(fk.to)) add(issues, 'FK_UNKNOWN_TARGET', `${migration.name} referencia una tabla destino no creada.`, fk.to)
    }
  }

  for (const [model, fields] of schemaInfo.models) {
    const sqlFields = allSqlColumns.get(model) ?? new Set()
    const scalarFields = [...fields].filter(([, value]) => !schemaInfo.models.has(value.type.replace(/[?\[\]]/g, '')))
    const missing = scalarFields.map(([, value]) => value.column).filter((column) => !sqlFields.has(column))
    if (!allSqlColumns.has(model)) add(issues, 'MODEL_TABLE_MISSING', `El modelo ${model} no tiene tabla creada por las migraciones.`)
    else if (missing.length) add(issues, 'MODEL_COLUMNS_MISSING', `Faltan columnas SQL para el modelo ${model}.`, missing.join(', '))
  }

  for (const model of allSqlColumns.keys()) {
    if (!schemaInfo.models.has(model)) add(warnings, 'SQL_TABLE_NOT_IN_SCHEMA', `La tabla ${model} aparece en SQL pero no como modelo actual.`)
  }

  for (const [enumName, values] of schemaInfo.enums) {
    const migratedValues = allEnumValues.get(enumName) ?? new Set()
    const missing = [...values].filter((value) => !migratedValues.has(value))
    if (!knownEnums.has(enumName)) add(issues, 'SCHEMA_ENUM_MISSING', `El enum ${enumName} del schema no aparece en las migraciones.`)
    else if (missing.length) add(issues, 'SCHEMA_ENUM_VALUES_MISSING', `Faltan valores migrados para ${enumName}.`, missing.join(', '))
  }
  for (const enumName of knownEnums) {
    if (!schemaInfo.enums.has(enumName)) add(warnings, 'SQL_ENUM_NOT_IN_SCHEMA', `El enum ${enumName} aparece en SQL pero no en el schema actual.`)
  }

  const critical = ['ActionItem', 'ActionItemHistory', 'SalesSequenceEnrollment', 'SalesSequenceStepRun', 'OrganizationIntegrationCredential', 'WebhookEvent']
  for (const table of critical) {
    evidence.push({ criticalTable: table, sqlColumns: [...(allSqlColumns.get(table) ?? [])], schemaColumns: [...(schemaInfo.models.get(table)?.values() ?? [])].map((x) => x.column) })
  }
}

function auditDocs(migrations) {
  const names = new Set(migrations.map((migration) => migration.name))
  const missingRefs = new Map()
  const docsRoot = path.join(repoRoot, 'docs')
  if (!exists(docsRoot)) return
  const stack = [docsRoot]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(file)
      else if (entry.name.endsWith('.md') && entry.name !== 'PRISMA_INTEGRATION_AUDIT.md') {
        const content = read(file)
        for (const match of content.matchAll(/\b(\d{14}_[a-z0-9_]+)\b/g)) {
          if (!names.has(match[1])) {
            const files = missingRefs.get(match[1]) ?? []
            files.push(relative(file))
            missingRefs.set(match[1], files)
          }
        }
      }
    }
  }
  for (const [name, files] of missingRefs) add(warnings, 'DOC_MIGRATION_NOT_FOUND', `La documentación referencia una migración ausente: ${name}.`, [...new Set(files)].join(', '))
}

function auditTests() {
  if (!exists(packagePath)) return
  const pkg = JSON.parse(read(packagePath))
  const testCommand = String(pkg.scripts?.test ?? '')
  const guard = exists(guardPath) ? read(guardPath) : ''
  const helpers = exists(helperPath) ? read(helperPath) : ''
  const prismaClient = exists(path.join(repoRoot, 'backend', 'src', 'lib', 'prisma.ts')) ? read(path.join(repoRoot, 'backend', 'src', 'lib', 'prisma.ts')) : ''

  if (!/TEST_DATABASE_URL/.test(guard)) add(issues, 'TEST_GUARD_MISSING', 'El guard de tests no exige TEST_DATABASE_URL.')
  if (!/DATABASE_URL/.test(guard)) add(issues, 'APP_DATABASE_GUARD_MISSING', 'El guard no comprueba DATABASE_URL.')
  if (!/canonical/.test(guard) || !/testTarget\.canonical/.test(guard)) add(warnings, 'TEST_GUARD_COMPARISON_UNCLEAR', 'No se detecta la comparación normalizada entre TEST_DATABASE_URL y DATABASE_URL.')

  if (/process\.env\.DATABASE_URL\s*=\s*testDatabaseUrl/.test(helpers)) {
    add(warnings, 'TEST_CLIENT_URL_ORDER', 'El helper reasigna DATABASE_URL después de cargar el singleton Prisma; el guard no prueba qué URL usa el cliente.', 'testHelpers.ts importa prisma y src/lib/prisma.ts construye new PrismaClient() sin datasourceUrl.')
  }
  if (!/run-tests\.mjs/.test(testCommand)) add(warnings, 'TEST_RUNNER_MISSING', 'npm test no usa el runner que fija NODE_ENV y la URL de test.', testCommand)
  if (!/datasources\s*:\s*\{\s*db\s*:\s*\{\s*url:\s*databaseUrl/s.test(prismaClient)) {
    add(warnings, 'TEST_CLIENT_DATASOURCE_EXPLICIT_MISSING', 'src/lib/prisma.ts no fija explícitamente el datasource de test.')
  }
  if (/src\/__tests__\/\*\.test\.ts|src\\__tests__\\\*\.test\.ts/.test(testCommand) && exists(path.join(repoRoot, 'backend', 'src', '__tests__', 'contracts'))) {
    add(warnings, 'TEST_GLOB_NON_RECURSIVE', 'El script npm test usa un glob de primer nivel y puede omitir src/__tests__/contracts.', testCommand)
  }
  if (!exists(runnerPath)) add(warnings, 'TEST_RUNNER_FILE_MISSING', 'No existe backend/scripts/run-tests.mjs.')
  else {
    const runner = read(runnerPath)
    if (!/NODE_ENV:\s*'test'/.test(runner) || !/DATABASE_URL:\s*process\.env\.TEST_DATABASE_URL/.test(runner)) {
      add(warnings, 'TEST_RUNNER_ENV_INCOMPLETE', 'El runner no fija NODE_ENV=test y DATABASE_URL=TEST_DATABASE_URL antes de iniciar Node --test.')
    }
    if (!/collectTestFiles|readdirSync/.test(runner) || !/\.test\.ts/.test(runner)) {
      add(warnings, 'TEST_RUNNER_DISCOVERY_INCOMPLETE', 'El runner no muestra descubrimiento recursivo de archivos .test.ts.')
    }
  }

  const cleanupModels = ['actionItem', 'actionItemHistory', 'organizationIntegrationCredential', 'webhookEvent', 'organicIntegration', 'organicAction', 'organicAsset', 'organicOpportunity', 'organicProject', 'metaOAuthState']
  const omitted = cleanupModels.filter((model) => !new RegExp(`prisma\\.${model}\\.`).test(helpers))
  if (omitted.length) add(warnings, 'TEST_CLEANUP_INCOMPLETE', 'cleanupOrgs.ts no elimina todos los agregados org-scoped críticos.', omitted.join(', '))
}

function auditBaseline() {
  const baseline = path.join(migrationsRoot, '20260714000000_baseline', 'migration.sql')
  if (!exists(baseline)) return
  const sql = read(baseline)
  if (!/CREATE TABLE\s+"Organization"/.test(sql)) add(issues, 'BASELINE_INCOMPLETE', 'La baseline no crea Organization.')
  if (!/CREATE TABLE\s+"OpportunityLineItem"/.test(sql)) add(warnings, 'BASELINE_EXPECTED_SCOPE', 'La baseline no contiene OpportunityLineItem; revisar si el alcance histórico es intencionado.')
  if (!/IF NOT EXISTS/.test(sql)) add(warnings, 'BASELINE_NON_IDEMPOTENT', 'La baseline contiene DDL no idempotente; una base histórica no puede recibirla sin resolver previamente su procedencia.')
  evidence.push({ baselineBytes: Buffer.byteLength(sql), baselineHasCreateTable: (sql.match(/CREATE TABLE\s+"/g) ?? []).length, baselineHasCreateEnum: (sql.match(/CREATE TYPE\s+"/g) ?? []).length })
}

function gitMigrationStatus(migrations) {
  const result = spawnSync('git', ['-c', `safe.directory=${repoRoot.replaceAll('\\', '/')}`, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'backend/prisma/migrations'], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    evidence.push({ gitMigrationStatus: 'unavailable' })
    return
  }

  const lines = String(result.stdout ?? '').split(/\r?\n/).filter(Boolean)
  const entries = lines.map((line) => {
    const code = line.slice(0, 2)
    const file = line.slice(3).replaceAll('\\', '/')
    return { code, file }
  })
  const ledger = migrations.map((migration) => {
    const directory = `backend/prisma/migrations/${migration.name}/`
    const file = `${directory}migration.sql`
    const entry = entries.find((candidate) => candidate.file === file || candidate.file.startsWith(directory))
    const status = entry?.code === '??' ? 'untracked' : entry ? 'modified' : 'tracked'
    if (migration.name.endsWith('_baseline') && status === 'modified') {
      add(warnings, 'BASELINE_WORKTREE_MODIFIED', 'La baseline está modificada en el working tree; no debe editarse si ya fue aplicada.', migration.name)
    }
    if (status === 'untracked') add(warnings, 'MIGRATION_UNTRACKED', 'La migración existe en el working tree pero no está rastreada por Git.', migration.name)
    else if (status === 'modified') add(warnings, 'MIGRATION_WORKTREE_MODIFIED', 'La migración está modificada en el working tree.', migration.name)
    return { name: migration.name, status, ...(entry ? { gitCode: entry.code } : {}) }
  })
  const dirty = ledger.filter((migration) => migration.status !== 'tracked')
  if (dirty.length) add(warnings, 'MIGRATIONS_WORKTREE_DIRTY', 'Hay migraciones modificadas o no rastreadas; no son evidencia de que estén en el release.', `${dirty.length}/${ledger.length} migraciones fuera de un estado limpio`)
  evidence.push({ migrationLedger: ledger })
}

if (!exists(schemaPath)) add(issues, 'SCHEMA_MISSING', 'No existe backend/prisma/schema.prisma.')
else {
  const schemaInfo = parseSchema(read(schemaPath))
  const migrations = collectMigrations()
  auditMigrations(schemaInfo, migrations)
  auditBaseline()
  auditDocs(migrations)
  auditTests()
  gitMigrationStatus(migrations)
  evidence.push({ migrationCount: migrations.length, migrationNames: migrations.map((migration) => migration.name), schemaModelCount: schemaInfo.models.size, schemaEnumCount: schemaInfo.enums.size })
}

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  networkAccess: false,
  migrationsApplied: false,
  schemaEdited: false,
  strict: process.argv.includes('--strict'),
  status: issues.length ? 'findings' : warnings.length ? 'warnings' : 'clean',
  issueCount: issues.length,
  warningCount: warnings.length,
  issues,
  warnings,
  evidence,
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Prisma readiness audit: ${report.status}`)
  console.log(`Read-only: yes | network: no | migrations applied: no | schema edited: no`)
  for (const item of issues) console.log(`[ERROR] ${item.code}: ${item.message}${item.detail ? ` — ${item.detail}` : ''}`)
  for (const item of warnings) console.log(`[WARN]  ${item.code}: ${item.message}${item.detail ? ` — ${item.detail}` : ''}`)
  console.log(`Evidence: ${evidence.length} records`)
}

process.exitCode = issues.length || (report.strict && warnings.length) ? 2 : 0
