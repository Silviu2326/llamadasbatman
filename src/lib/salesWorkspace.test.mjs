import test from 'node:test'
import assert from 'node:assert/strict'
import { readSalesCollection, indexNextTasks, dueTime, calendarLanes } from './salesWorkspace.js'

const ok = body => ({ ok: true, json: async () => body })
test('reads beyond the first page and preserves date/search filters', async () => {
  const urls = []
  const rows = await readSalesCollection(async url => {
    urls.push(url)
    const page = Number(new URL(url, 'https://test.invalid').searchParams.get('page'))
    return ok({ data: [{ id: `row-${page}` }], total: 3, totalPages: 3 })
  }, '/api/meetings?dateFrom=2026-09-01&search=Ana')
  assert.equal(rows.length, 3)
  assert.equal(urls.length, 3)
  for (const url of urls) { assert.match(url, /dateFrom=2026-09-01/); assert.match(url, /search=Ana/) }
})
test('failed subsequent pages cannot masquerade as complete results', async () => {
  let page = 0
  await assert.rejects(readSalesCollection(async () => ++page === 1 ? ok({ data: [{ id: 'one' }], total: 2, totalPages: 2 }) : { ok: false }, '/api/leads'), /todos los registros/)
})
test('supports campaign items and unpaginated agent collections', async () => {
  assert.deepEqual(await readSalesCollection(async () => ok({ items: [{ id: 'campaign' }], total: 1 }), '/api/campaigns'), [{ id: 'campaign' }])
  assert.deepEqual(await readSalesCollection(async () => ok([{ id: 'agent' }]), '/api/agents'), [{ id: 'agent' }])
})
test('malformed payloads and stuck pagination are errors', async () => {
  await assert.rejects(readSalesCollection(async () => ok({ error: 'invalid' }), '/api/leads'), /lista válida/)
  await assert.rejects(readSalesCollection(async () => ok({ data: [{ id: 'one' }], total: 10 }), '/api/leads'), /incompleta/)
})
test('aborted requests propagate cancellation', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readSalesCollection(async (_, { signal }) => { signal.throwIfAborted() }, '/api/leads', { signal: controller.signal }), { name: 'AbortError' })
})
test('next step selects earliest open task by date, scoped to the entity', () => {
  const tasks = [
    { id: 'completed', leadId: 'lead', dueAt: '2026-01-01', status: 'completed' },
    { id: 'other', leadId: 'other', dueAt: '2026-01-01', status: 'open' },
    { id: 'october', leadId: 'lead', opportunityId: 'deal', dueAt: '2026-10-01', status: 'open' },
    { id: 'september', leadId: 'lead', dueAt: '2026-09-20', status: 'in_progress' },
    { id: 'undated', leadId: 'lead', status: 'open' },
  ]
  assert.equal(indexNextTasks(tasks).get('lead:lead').id, 'september')
  assert.equal(indexNextTasks(tasks).get('opportunity:deal').id, 'october')
  assert.equal(indexNextTasks(tasks).get('account:lead'), undefined)
  assert.equal(dueTime(null), Infinity)
  assert.equal(dueTime('invalid'), Infinity)
})
test('overlapping meetings get stable lanes; adjacent ones recover full width', () => {
  const event = (id, hour, duration, kind = 'meeting') => ({ id, kind, start: new Date(`2026-09-07T${hour}:00`), duration })
  const lanes = calendarLanes([event('a', '09:00', 60), event('b', '09:30', 60), event('c', '10:00', 30), event('a', '10:30', 30, 'task')])
  assert.equal(lanes.get('meeting:a').count, 2)
  assert.notEqual(lanes.get('meeting:a').lane, lanes.get('meeting:b').lane)
  assert.notEqual(lanes.get('meeting:b').lane, lanes.get('meeting:c').lane)
  assert.deepEqual(lanes.get('task:a'), { lane: 0, count: 1 })
})
