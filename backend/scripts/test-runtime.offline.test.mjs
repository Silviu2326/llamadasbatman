import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath

function runGuard(env) {
  return spawnSync(node, ['scripts/test-database-guard.mjs'], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  })
}

test('guard acepta dos bases PostgreSQL no productivas distintas', () => {
  const result = runGuard({
    DATABASE_URL: 'postgresql://app:secret@db.internal/vendrava_staging',
    TEST_DATABASE_URL: 'postgresql://test:secret@db.internal/vendrava_staging_test',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Base de pruebas aislada validada/)
})

test('guard rechaza destino productivo, igualdad e identidad inválida', () => {
  const production = runGuard({
    DATABASE_URL: 'postgresql://app:secret@db.internal/vendrava_production',
    TEST_DATABASE_URL: 'postgresql://test:secret@db.internal/vendrava_test',
  })
  assert.notEqual(production.status, 0)
  assert.match(production.stderr, /productiva/i)

  const same = runGuard({
    DATABASE_URL: 'postgresql://app:secret@db.internal/vendrava_staging',
    TEST_DATABASE_URL: 'postgresql://other:secret@db.internal/vendrava_staging?schema=tests',
  })
  assert.notEqual(same.status, 0)
  assert.match(same.stderr, /misma base/i)

  const invalid = runGuard({
    DATABASE_URL: 'mysql://app:secret@db.internal/vendrava_staging',
    TEST_DATABASE_URL: 'postgresql://test:secret@db.internal/vendrava_test',
  })
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /PostgreSQL/i)
})

test('runner carga y lista recursivamente todos los tests, incluidos contracts', () => {
  const result = spawnSync(node, ['scripts/run-tests.mjs', '--list'], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: 'postgresql://app:secret@db.internal/vendrava_staging',
      TEST_DATABASE_URL: 'postgresql://test:secret@db.internal/vendrava_staging_test',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  const files = result.stdout.trim().split(/\r?\n/)
  assert.equal(files.length, 28)
  assert.ok(files.some((file) => file.replaceAll('\\', '/').includes('contracts/action-center.contract.test.ts')))
  assert.ok(files.every((file) => file.endsWith('.test.ts')))
})

test('prisma.ts selecciona TEST_DATABASE_URL explícitamente en modo test', () => {
  const source = fs.readFileSync(path.join(backendRoot, 'src', 'lib', 'prisma.ts'), 'utf8')
  assert.match(source, /process\.env\.TEST_DATABASE_URL/)
  assert.match(source, /NODE_ENV === 'test'/)
  assert.match(source, /datasources:\s*\{\s*db:\s*\{\s*url: databaseUrl/s)
})
