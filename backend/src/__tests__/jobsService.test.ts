import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UNCERTAIN_EXTERNAL_OUTCOME,
  hasJobExecutor,
  isRetryableJobError,
  jobSummary,
  registerJobExecutor,
  unregisterJobExecutor,
} from '../services/jobs.service'
import type { Job } from '@prisma/client'
import { shouldReleaseWalletHoldForFailure } from '../jobs/jobDispatcher'

/**
 * Piezas del contrato universal de trabajo que no necesitan base de datos:
 * el registro de ejecutores en memoria, la regla de reintento y la proyección
 * ligera. Las transiciones con Postgres (claim, lease, webhook) viven en el
 * dispatcher y se cubren con los patrones de integración del repo.
 */

test('el registro de ejecutores responde por kind y rechaza duplicados', async () => {
  const kind = 'test.image.generate'
  assert.equal(hasJobExecutor(kind), false)

  registerJobExecutor(kind, async () => ({ output: { ok: true } }))
  assert.equal(hasJobExecutor(kind), true)

  // Dos dominios reclamando el mismo kind es un bug de arranque: debe reventar
  // en el registro, no pisarse en silencio en producción.
  assert.throws(() => registerJobExecutor(kind, async () => ({})), /duplicado/i)

  unregisterJobExecutor(kind)
  assert.equal(hasJobExecutor(kind), false)
})

test('un fallo con efecto externo incierto nunca es reintentable', () => {
  // Regla heredada de automations.service.ts: si el proceso murió entre la
  // llamada al proveedor y la confirmación, repetir podría duplicar el efecto.
  assert.equal(isRetryableJobError({ code: UNCERTAIN_EXTERNAL_OUTCOME, message: 'x' }), false)

  // Cualquier otro fallo (o un failed sin detalle) sí admite reintento manual.
  assert.equal(isRetryableJobError({ code: 'PROVIDER_TIMEOUT', message: 'x' }), false)
  assert.equal(isRetryableJobError({ code: 'EXECUTOR_ERROR', message: 'x' }), true)
  assert.equal(isRetryableJobError(null), true)
  // Un error malformado (sin code) no puede bloquear el reintento humano.
  assert.equal(isRetryableJobError(['no-es-objeto'] as never), true)
})

test('un resultado externo incierto conserva el hold para conciliación', () => {
  assert.equal(shouldReleaseWalletHoldForFailure(UNCERTAIN_EXTERNAL_OUTCOME), false)
  assert.equal(shouldReleaseWalletHoldForFailure('PROVIDER_TIMEOUT'), false)
  assert.equal(shouldReleaseWalletHoldForFailure('VALIDATION_ERROR'), true)
  assert.equal(shouldReleaseWalletHoldForFailure('EXECUTOR_ERROR', 'marketplace.run'), false)
})

test('la proyección ligera nunca incluye input ni output', () => {
  const job = {
    id: 'job-1',
    orgId: 'org-1',
    kind: 'image.generate',
    status: 'succeeded',
    priority: 0,
    createdById: 'user-1',
    microappId: null,
    flowRunId: null,
    parentJobId: null,
    provider: 'magnific',
    providerJobId: 'prov-1',
    costEstimateCents: 12,
    costActualCents: 9,
    input: { prompt: 'secreto de negocio', _routing: { chosen: 'magnific' } },
    output: { assetId: 'asset-1' },
    error: null,
    leaseExpiresAt: null,
    workerId: null,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(),
    startedAt: new Date(),
    finishedAt: new Date(),
  } as unknown as Job

  const summary = jobSummary(job)
  assert.equal(summary.id, 'job-1')
  assert.equal(summary.costActualCents, 9)
  assert.ok(!('input' in summary))
  assert.ok(!('output' in summary))
})
