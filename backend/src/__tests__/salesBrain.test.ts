import assert from 'node:assert/strict'
import test from 'node:test'
import { createProspectState, decideNextAction } from '../voice/intelligence/salesBrain'

test('Sales Brain moves a normal prospect into discovery', () => {
  const decision = decideNextAction(createProspectState(), 'Sí, dime cómo funciona')
  assert.equal(decision.state.stage, 'discovery')
  assert.equal(decision.action, 'ASK_DISCOVERY_QUESTION')
})

test('Sales Brain makes opt-out terminal', () => {
  const decision = decideNextAction(createProspectState(), 'No me llames más, por favor')
  assert.equal(decision.state.stage, 'opt_out')
  assert.equal(decision.action, 'END_POLITELY')
  assert.ok(decision.state.constraints.includes('opt_out'))
})

test('Sales Brain records objection evidence without inventing a reply', () => {
  const decision = decideNextAction(createProspectState(), 'Ahora mismo es demasiado caro')
  assert.equal(decision.state.stage, 'objection')
  assert.equal(decision.action, 'HANDLE_OBJECTION')
  assert.equal(decision.state.objections[0]?.label, 'price')
  assert.equal(decision.state.evidence[0]?.source, 'user')
})
