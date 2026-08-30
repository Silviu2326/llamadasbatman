process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashStudioReviewToken, isStudioReviewTimecodeValid } from '../services/studioReview.service'

test('el token público se representa por un hash SHA-256 estable y no por el secreto', () => {
  const token = 'un-token-de-prueba-largo-y-no-secreto'
  const hash = hashStudioReviewToken(token)
  assert.equal(hash.length, 64)
  assert.notEqual(hash, token)
  assert.equal(hash, hashStudioReviewToken(token))
  assert.notEqual(hash, hashStudioReviewToken(`${token}-otro`))
})

test('el timecode respeta la duración real y usa un límite cerrado si falta metadata', () => {
  assert.equal(isStudioReviewTimecodeValid(0, 10_000), true)
  assert.equal(isStudioReviewTimecodeValid(10_000, 10_000), true)
  assert.equal(isStudioReviewTimecodeValid(10_001, 10_000), false)
  assert.equal(isStudioReviewTimecodeValid(-1, 10_000), false)
  assert.equal(isStudioReviewTimecodeValid(1.5, 10_000), false)
  assert.equal(isStudioReviewTimecodeValid(86_400_001, null), false)
})

test('la migración conserva aislamiento tenant en ambas relaciones públicas', () => {
  const here = join(process.cwd(), 'prisma/migrations/20260819010000_studio_review_room/migration.sql')
  const sql = readFileSync(here, 'utf8')
  assert.match(sql, /CREATE UNIQUE INDEX "StudioReviewLink_id_orgId_key"/)
  assert.match(sql, /FOREIGN KEY \("productionId", "orgId"\)/)
  assert.match(sql, /FOREIGN KEY \("assetId", "orgId"\)/)
  assert.match(sql, /CHECK \("status" IN \('open', 'resolved', 'hidden'\)\)/)
})
