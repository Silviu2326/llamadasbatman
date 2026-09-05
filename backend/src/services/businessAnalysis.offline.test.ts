import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisWindow, buildAnalysis, change, type AnalysisInput } from './businessAnalysis.metrics'

const now = new Date('2026-09-04T12:00:00Z')
const window = analysisWindow(7, now)
const call = (patch: Partial<AnalysisInput['calls'][number]> = {}): AnalysisInput['calls'][number] => ({ id: 'c1', createdAt: new Date('2026-09-01T10:00:00Z'), status: 'completed', outcome: 'none', sentiment: null, campaignId: 'campaign', agentId: 'agent', meetings: [], ...patch })
const opportunity = (patch: Partial<AnalysisInput['opportunities'][number]> = {}): AnalysisInput['opportunities'][number] => ({ createdAt: new Date('2026-08-01T10:00:00Z'), actualCloseDate: new Date('2026-09-01T10:00:00Z'), stage: 'closed_won', value: 100, currency: 'EUR', lossReason: null, ...patch })
const report = (patch: Partial<AnalysisInput> = {}) => buildAnalysis({ calls: [], meetings: [], opportunities: [], ...patch }, window)

test('period includes first day from midnight and compares an equal elapsed duration', () => {
  assert.equal(window.start.toISOString(), '2026-08-29T00:00:00.000Z')
  assert.equal(window.end.getTime() - window.start.getTime(), window.previousEnd.getTime() - window.previousStart.getTime())
  const result = report({ calls: [call({ createdAt: window.start }), call({ createdAt: window.end }), call({ createdAt: window.previousStart })] })
  assert.equal(result.metrics.calls.value, 1)
  assert.equal(result.metrics.calls.previous, 1)
  assert.equal(result.series.reduce((total, row) => total + row.calls, 0), 1)
})
test('revenue uses close date and ignores open opportunities and other currencies', () => {
  const result = report({ opportunities: [opportunity(), opportunity({ value: 10000, stage: 'proposal', actualCloseDate: null }), opportunity({ currency: 'USD', value: 999 }), opportunity({ actualCloseDate: null }), opportunity({ actualCloseDate: new Date('2026-08-25T12:00:00Z'), value: 50 })] })
  assert.equal(result.metrics.revenue.value, 100)
  assert.equal(result.metrics.revenue.previous, 50)
  assert.equal(result.metrics.revenue.change, 100)
  assert.equal(result.warnings.otherCurrencies, 1)
  assert.equal(result.series.reduce((total, row) => total + row.revenue, 0), 100)
})
test('close rate uses won and lost closures; stage distribution is a separate creation cohort', () => {
  const result = report({ opportunities: [opportunity(), opportunity({ stage: 'closed_lost', lossReason: 'Precio' }), opportunity({ createdAt: now, actualCloseDate: null, stage: 'lead' })] })
  assert.equal(result.metrics.winRate.value, 50)
  assert.equal(result.sample.opportunities, 0)
  assert.deepEqual(result.losses, [{ key: 'Precio', count: 1 }])
})
test('completed alone is not evidence of human conversation; multiple meetings count one call', () => {
  const result = report({ calls: [call(), call({ id: 'c2', meetings: [{ id: 'm1' }, { id: 'm2' }], outcome: 'meeting_scheduled' })] })
  assert.equal(result.campaigns[0].conversations, 1)
  assert.equal(result.campaigns[0].withMeeting, 1)
  assert.equal(result.campaigns[0].meetingRate, 50)
  assert.equal(result.campaigns[0].smallSample, true)
})
test('campaign comparison includes all groups and unassigned calls, ordered by meetings', () => {
  const calls = Array.from({ length: 7 }, (_, index) => call({ id: `c${index}`, campaignId: `campaign${index}` }))
  calls.push(call({ campaignId: null, meetings: [{ id: 'meeting' }] }))
  const result = report({ calls })
  assert.equal(result.campaigns.length, 8)
  assert.equal(result.campaigns[0].id, null)
  assert.equal(result.campaigns.reduce((total, row) => total + row.calls, 0), result.metrics.calls.value)
})
test('empty and absent baselines do not fabricate a conversion or 100% growth', () => {
  assert.equal(report().metrics.winRate.value, null)
  assert.equal(change(50, 0), null)
  assert.equal(change(0, 50), -100)
})
