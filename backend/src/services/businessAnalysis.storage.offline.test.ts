// Run with a dummy TEST_DATABASE_URL. Every database method exercised here is mocked.
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { getAnalysisRecords, getBusinessAnalysis } from './businessAnalysis.service'
import { getDashboardGoals, updateDashboardGoals } from './dashboard.service'

function stub(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key]
  target[key] = implementation
  t.after(() => { target[key] = original })
}

test('goals saved from either page round-trip through the shared organization setting', async t => {
  let settings: any = { existingSetting: { enabled: true } }
  stub(t, prisma.organization, 'findUnique', async (query: any) => {
    assert.equal(query.where.id, 'org-a')
    return { settings }
  })
  stub(t, prisma.organization, 'update', async (query: any) => {
    assert.equal(query.where.id, 'org-a')
    settings = query.data.settings
    return { settings }
  })
  stub(t, prisma.meeting, 'count', async (query: any) => {
    assert.equal(query.where.orgId, 'org-a')
    assert.deepEqual(query.where.status, { not: 'cancelled' })
    assert.equal(query.where.scheduledAt.gte.getUTCDate(), 1)
    return 4
  })
  stub(t, prisma.opportunity, 'aggregate', async (query: any) => {
    assert.equal(query.where.orgId, 'org-a')
    assert.equal(query.where.stage, 'closed_won')
    assert.equal(query.where.currency, 'EUR')
    assert.ok(query.where.actualCloseDate)
    return { _sum: { value: 250 } }
  })
  const target = { monthlyRevenue: 1000, monthlyMeetings: 8 }
  await updateDashboardGoals('org-a', target)
  const loaded = await getDashboardGoals('org-a')
  assert.deepEqual(loaded, { goals: target, monthlyMeetings: 4, monthlyClosedWonValue: 250 })
  assert.deepEqual(settings.existingSetting, { enabled: true })
})

test('call details retain organization, period, grouping and real meeting filter on every page', async t => {
  const seen: any[] = []
  stub(t, prisma.call, 'count', async (query: any) => { seen.push(query.where); return 26 })
  stub(t, prisma.call, 'findMany', async (query: any) => {
    seen.push(query.where)
    assert.equal(query.skip, 25)
    assert.equal(query.take, 25)
    return [{ id: 'call-26', createdAt: new Date('2026-09-01'), outcome: 'meeting_scheduled', lead: { name: 'Contacto de prueba' } }]
  })
  const result = await getAnalysisRecords('org-a', { kind: 'calls', start: '2026-08-29T00:00:00Z', end: '2026-09-04T12:00:00Z', page: 2, campaignId: 'unassigned', agentId: 'agent-a', withMeeting: true })
  for (const where of seen) {
    assert.equal(where.orgId, 'org-a')
    assert.equal(where.campaignId, null)
    assert.equal(where.agentId, 'agent-a')
    assert.equal(where.meetings.some.orgId, 'org-a')
    assert.deepEqual(where.meetings.some.status, { not: 'cancelled' })
    assert.equal(where.createdAt.gte.toISOString(), '2026-08-29T00:00:00.000Z')
  }
  assert.equal(result.total, 26)
  assert.equal(result.rows[0].href, '/llamadas/call-26')
})

test('analysis source queries are organization scoped and exclude cancelled meeting evidence', async t => {
  stub(t, prisma.call, 'findMany', async (query: any) => {
    assert.equal(query.where.orgId, 'org-a')
    assert.equal(query.select.meetings.where.orgId, 'org-a')
    assert.deepEqual(query.select.meetings.where.status, { not: 'cancelled' })
    return []
  })
  stub(t, prisma.meeting, 'findMany', async (query: any) => {
    assert.equal(query.where.orgId, 'org-a')
    assert.deepEqual(query.where.status, { not: 'cancelled' })
    return []
  })
  stub(t, prisma.opportunity, 'findMany', async (query: any) => { assert.equal(query.where.orgId, 'org-a'); return [] })
  stub(t, prisma.opportunity, 'count', async (query: any) => { assert.equal(query.where.orgId, 'org-a'); assert.equal(query.where.actualCloseDate, null); return 2 })
  for (const model of [prisma.campaign, prisma.agent]) stub(t, model, 'findMany', async (query: any) => { assert.equal(query.where.orgId, 'org-a'); return [] })
  const result = await getBusinessAnalysis('org-a', 30)
  assert.equal(result.period.days, 30)
  assert.equal(result.warnings.missingCloseDates, 2)
  assert.equal(result.metrics.revenue.value, 0)
})
