import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowInputSchema, ASSISTANT_ROUTINE_RULE, nextRoutineRun, routineSlotRequestId, shouldNotifyRun, newCandidateKeys } from '../services/assistantRoutines'

const input = () => ({ objective: 'Encontrar clientes', target: 'software B2B', location: 'Madrid', kind: 'clients' as const, source: 'web' as const, maxResults: 5, maxSearches: 3, followUp: false, allowExternalReview: true, requestId: randomUUID() })

test('workflow input enforces search and result hard limits', () => {
  assert.equal(workflowInputSchema.safeParse(input()).success, true)
  assert.equal(workflowInputSchema.safeParse({ ...input(), maxResults: 21 }).success, false)
  assert.equal(workflowInputSchema.safeParse({ ...input(), maxSearches: 0 }).success, false)
})

test('routine scheduler uses a durable isolated rule namespace and deterministic interval', () => {
  assert.equal(ASSISTANT_ROUTINE_RULE, 'assistant-routine.schedule')
  const slot = new Date('2026-01-01T00:00:00.000Z')
  assert.equal(nextRoutineRun(slot, 24, new Date('2026-01-01T01:00:00.000Z')).toISOString(), '2026-01-02T00:00:00.000Z')
  assert.equal(nextRoutineRun(slot, 168, new Date('2026-01-09T00:00:00.000Z')).toISOString(), '2026-01-15T00:00:00.000Z')
  assert.equal(routineSlotRequestId('trigger-a', slot), routineSlotRequestId('trigger-a', slot))
  assert.notEqual(routineSlotRequestId('trigger-a', slot), routineSlotRequestId('trigger-b', slot))
})

test('notification policy reports only actionable new candidates and does not spam', () => {
  assert.equal(shouldNotifyRun({ status: 'review', candidates: [{ sourceUrl: 'https://new.test' }] }), true)
  assert.equal(shouldNotifyRun({ status: 'review', notificationSentAt: new Date().toISOString() }), false)
  assert.deepEqual(newCandidateKeys([{ sourceUrl: 'https://seen.test' }, { sourceUrl: 'https://new.test' }, { id: 'candidate-3' }], ['https://seen.test']), ['https://new.test', 'candidate-3'])
})
