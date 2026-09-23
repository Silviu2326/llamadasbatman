import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { workflowInputSchema } from '../services/assistantWorkflows'

const input = (overrides: Record<string, unknown> = {}) => workflowInputSchema.parse({
  objective: 'Encontrar clínicas privadas', target: 'clínicas privadas', location: 'Madrid', kind: 'clients', source: 'saved',
  maxResults: 5, maxSearches: 4, followUp: true, allowExternalReview: false, requestId: randomUUID(), ...overrides,
})

test('workflow input enforces bounded search and result limits', () => {
  assert.equal(input().maxResults, 5)
  assert.throws(() => input({ maxResults: 21 }), /Too big|less than or equal to 20/i)
  assert.throws(() => input({ maxSearches: 0 }), /greater than or equal to 1/i)
})

test('workflow input rejects unsupported kinds and malformed request ids', () => {
  assert.throws(() => input({ kind: 'competitors' }), /Invalid enum value/i)
  assert.throws(() => input({ requestId: 'request-1' }), /Invalid uuid/i)
})

test('workflow input preserves explicit source and follow-up decisions', () => {
  const parsed = input({ source: 'web', followUp: false, allowExternalReview: true })
  assert.equal(parsed.source, 'web')
  assert.equal(parsed.followUp, false)
  assert.equal(parsed.allowExternalReview, true)
})
