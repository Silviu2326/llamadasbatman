import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const audit = path.join(root, 'scripts', 'prisma-readiness-audit.mjs')

test('el auditor Prisma es offline y no mutante', () => {
  const result = spawnSync(process.execPath, [audit, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'should-not-be-read', TEST_DATABASE_URL: 'should-not-be-read' },
  })

  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.readOnly, true)
  assert.equal(report.networkAccess, false)
  assert.equal(report.migrationsApplied, false)
  assert.equal(report.schemaEdited, false)
  assert.equal(report.issueCount, 0)
  assert.ok(report.evidence.some((entry) => entry.migrationCount === 15))
  assert.ok(report.warnings.some((entry) => entry.code === 'BASELINE_WORKTREE_MODIFIED'))
  assert.ok(report.warnings.some((entry) => entry.code === 'MIGRATION_UNTRACKED'))
  assert.equal(report.warnings.some((entry) => entry.code === 'TEST_CLIENT_URL_ORDER'), false)
  assert.equal(report.warnings.some((entry) => entry.code === 'TEST_GLOB_NON_RECURSIVE'), false)
  assert.equal(result.stdout.includes('should-not-be-read'), false)
})

test('el auditor no escribe artefactos', () => {
  const before = fs.readdirSync(path.join(root, 'backend', 'prisma', 'migrations')).sort()
  const result = spawnSync(process.execPath, [audit], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const after = fs.readdirSync(path.join(root, 'backend', 'prisma', 'migrations')).sort()
  assert.deepEqual(after, before)
})
