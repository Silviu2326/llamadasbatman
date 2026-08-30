import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateMultiCapabilityFlows,
  aggregateRoutingSavings,
  aggregateUsage,
} from '../services/openPlatformMetrics.service'

test('margen agrupa proveedor y modo sin perder fracciones de céntimo', () => {
  const result = aggregateUsage([
    { provider: 'openai', billingMode: 'managed', _sum: { priceCents: '2.75', costCents: '2.125' }, _count: { _all: 2 } },
    { provider: 'openai', billingMode: 'byok', _sum: { priceCents: '0', costCents: '0' }, _count: { _all: 1 } },
    { provider: 'runway', billingMode: 'managed', _sum: { priceCents: '14', costCents: '10' }, _count: { _all: 1 } },
  ])
  assert.deepEqual(result.totals, { records: 4, priceCents: 16.75, costCents: 12.125, marginCents: 4.625 })
  assert.equal(result.byProvider.find(row => row.provider === 'openai')?.marginCents, 0.625)
  assert.equal(result.byBillingMode.find(row => row.billingMode === 'byok')?.records, 1)
})

test('ahorro de routing usa solo alternativas viables y no excluidos', () => {
  const result = aggregateRoutingSavings([
    { input: { _routing: { estimateCents: 3, alternatives: [{ providerId: 'b', estimateCents: 8 }], exclusions: [{ providerId: 'c', estimateCents: 99 }] } } },
    { input: { _routing: { estimateCents: 2, alternatives: [] } } },
    { input: { prompt: 'sin routing' } },
  ])
  assert.deepEqual(result, {
    jobsWithRouting: 2,
    jobsWithAlternatives: 1,
    chosenEstimateCents: 5,
    highestViableEstimateCents: 10,
    savingsCents: 5,
    savingsRate: 0.5,
  })
})

test('métrica de flows cuenta runs con al menos dos capabilities distintas', () => {
  const result = aggregateMultiCapabilityFlows([
    { id: 'one', steps: [{ jobId: 'a' }, { jobId: 'b' }, { jobId: 'parent' }] },
    { id: 'two', steps: [{ jobId: 'c' }, { jobId: 'd' }] },
    { id: 'three', steps: [] },
  ], [
    { id: 'a', kind: 'image.generate' },
    { id: 'b', kind: 'video.generate' },
    { id: 'parent', kind: 'microapp.run' },
    { id: 'c', kind: 'image.generate' },
    { id: 'd', kind: 'image.generate' },
  ])
  assert.equal(result.runsEvaluated, 3)
  assert.equal(result.multiCapabilityRuns, 1)
  assert.ok(Math.abs(result.percentage - (100 / 3)) < 0.000_001)
})
