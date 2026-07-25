import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreCall } from '../voice/evaluation/callJudge'

test('Call Judge scores discovery and objections from trace events', () => {
  const result = scoreCall([
    { type: 'turn.user_finished', atMs: 100 },
    { type: 'sales_action.selected', atMs: 200, payload: { action: 'ASK_DISCOVERY_QUESTION' } },
    { type: 'sales_action.selected', atMs: 300, payload: { action: 'HANDLE_OBJECTION' } },
    { type: 'tts.first_audio', atMs: 350 },
  ], { outcome: 'meeting_scheduled', transcript: 'ok' })
  assert.ok(result.overall >= 70)
  assert.equal(result.criticalErrors.length, 0)
  assert.equal(result.trainingTag, 'needs_review')
})

test('Call Judge detects audio after opt-out as critical', () => {
  const result = scoreCall([
    { type: 'compliance.opt_out', atMs: 100 },
    { type: 'audio.output_started', atMs: 200 },
  ], { outcome: 'not_interested' })
  assert.deepEqual(result.criticalErrors, ['assistant_spoke_after_opt_out'])
  assert.equal(result.dimensions.compliance, 0)
})
