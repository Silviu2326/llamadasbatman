import assert from 'node:assert/strict'
import test from 'node:test'
import { TurnManager } from '../voice/turn/turnManager'

test('TurnManager requires sustained energy before hard interruption', () => {
  const manager = new TurnManager({ threshold: 0.04, requiredFrames: 3, minimumSpeechMs: 100, debounceMs: 500 })

  assert.equal(manager.observeRms(0.05, 1_000), null)
  assert.equal(manager.observeRms(0.05, 1_050), null)
  assert.equal(manager.observeRms(0.05, 1_120)?.state, 'USER_INTERRUPTING')
  assert.equal(manager.getState(), 'USER_INTERRUPTING')
})

test('TurnManager debounces repeated interruptions and returns to listening', () => {
  const manager = new TurnManager({ threshold: 0.04, requiredFrames: 1, minimumSpeechMs: 0, debounceMs: 500 })

  assert.equal(manager.observeRms(0.05, 2_000)?.state, 'USER_INTERRUPTING')
  assert.equal(manager.observeRms(0.05, 2_100), null)
  assert.equal(manager.observeRms(0.0, 2_200), null)
  assert.equal(manager.observeRms(0.0, 2_250)?.state, 'LISTENING')
  assert.equal(manager.getState(), 'LISTENING')
})
