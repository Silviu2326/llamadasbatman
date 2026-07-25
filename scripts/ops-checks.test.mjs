import test from 'node:test'
import assert from 'node:assert/strict'
import { OPERATIONAL_FILES, REQUIRED_DOCS, checkDocumentation, checkMigrationInventory, checkOperationalEnvContract, checkSyntax, parseArgs, runChecks } from './ops-checks.mjs'

test('los checks operativos son no mutantes y tienen inventario completo', () => {
  assert.equal(parseArgs(['--json']).json, true)
  assert.equal(parseArgs(['--skip-prisma']).skipPrisma, true)
  assert.ok(OPERATIONAL_FILES.includes('scripts/staging-e2e.mjs'))
  assert.ok(REQUIRED_DOCS.includes('docs/STAGING_E2E_HARNESS.md'))
})

test('el contrato documental y de migraciones se puede auditar sin red', () => {
  const report = { pass: [], warn: [], fail: [] }
  checkMigrationInventory(report)
  checkOperationalEnvContract(report)
  checkDocumentation(report)
  assert.equal(report.fail.some(item => item.check.startsWith('docs.')), false)
  assert.equal(report.fail.some(item => item.check.startsWith('env.')), false)
})

test('el resultado del runner declara explícitamente que no muta ni abre red', () => {
  const output = runChecks({ skipPrisma: true })
  assert.equal(output.mutating, false)
  assert.equal(output.network, false)
  assert.equal(typeof output.ok, 'boolean')
})

test('la sintaxis de los scripts operativos es verificable de forma pura', () => {
  const report = { pass: [], warn: [], fail: [] }
  checkSyntax(report)
  assert.equal(report.fail.filter(item => item.check.startsWith('syntax.')).length, 0)
})
