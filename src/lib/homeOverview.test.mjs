import test from 'node:test'
import assert from 'node:assert/strict'
import { actionCopy, goalProgress, isNewWorkspace, pendingActions, validGoals } from './homeOverview.js'

test('pending actions are deduplicated, sorted and exclude finished work', () => {
  const items = [
    { id: 'a', title: 'Normal', priority: 'low' },
    { id: 'b', title: 'Urgent', priority: 'urgent' },
    { id: 'b', title: 'Urgent', priority: 'urgent' },
    { id: 'c', title: 'Done', status: 'completed' },
    { id: 'd', title: 'Dismissed', status: 'dismissed' },
    { id: 'e', title: 'Blocked', status: 'blocked', priority: 'high' },
  ]
  assert.deepEqual(pendingActions({ items }).map(item => item.id), ['b', 'e', 'a'])
  assert.equal(items.length, 6)
})

test('malformed data is a failure, never an empty success', () => {
  for (const value of [null, {}, { items: null }, { error: 'Unavailable' }]) {
    assert.throws(() => pendingActions(value))
  }
  assert.deepEqual(pendingActions({ items: [] }), [])
})

test('known rules have concrete copy and do not expose technical evidence', () => {
  const copy = actionCopy({ kind: 'lead_without_contact', impact: { value: 5 }, evidence: 'JWT org-123', target: { path: '/leads' } })
  assert.equal(copy.title, 'Primer contacto pendiente')
  assert.match(copy.detail, /5 contactos/)
  assert.doesNotMatch(copy.detail, /JWT|org-123|€/)
})

test('navigation remains internal', () => {
  for (const path of ['https://example.com', '//example.com', null]) {
    assert.equal(actionCopy({ title: 'Review', target: { path } }).path, null)
  }
  assert.equal(actionCopy({ title: 'Review', target: { path: '/ventas?vista=leads' } }).path, '/ventas?vista=leads')
})

test('goals preserve overachievement and reject missing or zero targets', () => {
  assert.equal(goalProgress(120, 100), 120)
  assert.equal(goalProgress(0, 100), 0)
  assert.equal(goalProgress(100, 0), null)
  assert.equal(goalProgress(null, 100), null)
  assert.equal(goalProgress(100, undefined), null)
})

test('new workspace requires confirmed empty stats and activity', () => {
  const empty = { totalCalls: 0, totalLeads: 0, closedWonValue: 0, pipelineValue: 0, meetingsScheduled: 0, activeCampaigns: 0, timeSeries: [{ llamadas: 0 }] }
  assert.equal(isNewWorkspace(empty, []), true)
  assert.equal(isNewWorkspace(null, []), false)
  assert.equal(isNewWorkspace({}, []), false)
  assert.equal(isNewWorkspace(empty, null), false)
  assert.equal(isNewWorkspace(empty, [{ type: 'call' }]), false)
  assert.equal(isNewWorkspace({ ...empty, totalLeads: 1 }, []), false)
})

test('goal inputs must be positive safe integers', () => {
  assert.equal(validGoals({ monthlyRevenue: '40000', monthlyMeetings: '30' }), true)
  for (const monthlyMeetings of ['', 0, -1, .2, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validGoals({ monthlyRevenue: 1000, monthlyMeetings }), false)
  }
})
