import test from 'node:test'
import assert from 'node:assert/strict'
import { groupSeries, validAnalysis } from './businessAnalysis.js'
import { simulate, reversePlan } from './growthSimulation.js'

const series = [
  { date: '2026-08-30', calls: 2, meetings: 1, revenue: 100 },
  { date: '2026-08-31', calls: 3, meetings: 2, revenue: 200 },
  { date: '2026-09-01', calls: 4, meetings: 0, revenue: 300 },
]
test('weekly groups start on Monday and actually combine daily figures', () => {
  assert.deepEqual(groupSeries(series, 'week'), [
    { date: '2026-08-24', calls: 2, meetings: 1, revenue: 100 },
    { date: '2026-08-31', calls: 7, meetings: 2, revenue: 500 },
  ])
  assert.deepEqual(groupSeries(series, 'day'), series)
})
test('monthly groups retain totals across a month boundary', () => {
  assert.deepEqual(groupSeries(series, 'month'), [
    { date: '2026-08-01', calls: 5, meetings: 3, revenue: 300 },
    { date: '2026-09-01', calls: 4, meetings: 0, revenue: 300 },
  ])
})
test('a malformed or failed report cannot become an empty success', () => {
  for (const value of [null, {}, { error: 'unavailable' }, { metrics: { calls: { value: 0 } } }]) assert.ok(!validAnalysis(value))
})
const params = { contact: .5, qualify: .5, opportunity: .5, win: .5, dealValue: 100, costPerMinute: .1, minutesPerCall: 2 }
test('simulation distinguishes estimated revenue from revenue minus voice spend', () => {
  const result = simulate({ ...params, budget: 20 })
  assert.equal(result.calls, 100)
  assert.equal(result.revenue, 625)
  assert.equal(result.profit, 605)
  assert.equal(result.minutes, 200)
})
test('zero budget yields no activity, even with positive rates', () => {
  const result = simulate({ ...params, budget: 0 })
  assert.equal(result.revenue, 0)
  assert.equal(result.calls, 0)
  assert.equal(result.costPerSale, null)
})
test('reverse simulation cannot promise a target when any conversion step is zero', () => {
  assert.equal(reversePlan(1000, { ...params, win: 0 }, 1000), null)
  assert.equal(reversePlan(Infinity, params, 1000), null)
  const result = reversePlan(1000, params, 100)
  assert.equal(result.calls, 160)
  assert.equal(result.budget, 32)
  assert.equal(result.fits, false)
  assert.equal(simulate({ ...params, budget: result.budget }).revenue, 1000)
})
