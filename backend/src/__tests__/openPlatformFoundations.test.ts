import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JOB_STATUSES } from '../services/jobs.service'
import { createAssetRelation, detectAssetFile } from '../services/assets.service'
import { isS3Configured } from '../lib/storage'
import { reserveForJob, WalletError } from '../services/wallet.service'

test('el contrato de jobs distingue espera remota y cancelación solicitada', () => {
  assert.ok(JOB_STATUSES.includes('waiting_provider'))
  assert.ok(JOB_STATUSES.includes('cancel_requested'))
})

test('la detección de assets usa magic bytes para vídeo y audio', () => {
  const mp4 = Buffer.alloc(16)
  mp4.write('ftyp', 4, 'latin1')
  assert.deepEqual(detectAssetFile(mp4), { kind: 'video', mimeType: 'video/mp4', extension: 'mp4' })

  const wav = Buffer.alloc(16)
  wav.write('RIFF', 0, 'latin1')
  wav.write('WAVE', 8, 'latin1')
  assert.deepEqual(detectAssetFile(wav), { kind: 'audio', mimeType: 'audio/wav', extension: 'wav' })
})

test('las validaciones de wallet y genealogía fallan antes de tocar la base', async () => {
  await assert.rejects(
    reserveForJob({ orgId: 'org', jobId: 'job', amountCents: -1 }),
    (error: unknown) => error instanceof WalletError && error.code === 'WALLET_AMOUNT_INVALID',
  )
  await assert.rejects(
    createAssetRelation({ orgId: 'org', parentId: 'same', childId: 'same', role: 'source' }),
    /Relación de asset inválida/,
  )
})

test('storage solo se considera configurado con las cuatro credenciales', () => {
  assert.equal(isS3Configured({}), false)
  assert.equal(isS3Configured({ S3_ENDPOINT: 'x', S3_ACCESS_KEY: 'x', S3_SECRET_KEY: 'x', S3_BUCKET: 'x' }), true)
})

test('la migración P0 contiene precisión, idempotencia y FKs tenant-safe', () => {
  const migration = readFileSync(
    path.join(process.cwd(), 'prisma/migrations/20260818120000_open_platform_foundations/migration.sql'),
    'utf8',
  )
  for (const expected of [
    'DECIMAL(20,8)',
    'UsageRecord_orgId_idempotencyKey_key',
    'Job_provider_providerJobId_key',
    'AssetRelation_parentId_orgId_fkey',
    'WalletHold_walletId_orgId_fkey',
    'Asset_accessClass_check',
    'WalletHold_status_check',
  ]) {
    assert.ok(migration.includes(expected), `falta ${expected}`)
  }
})
