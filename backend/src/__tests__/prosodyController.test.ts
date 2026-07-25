import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProsodyPlan, normalizeForSpeech, selectTtsRoute } from '../voice/tts/prosodyController'

test('prosody normalization makes phone numbers and acronyms speakable', () => {
  const text = normalizeForSpeech('Llámanos al 612 345 678 y revisamos el CRM')
  assert.match(text, /seis uno dos/)
  assert.match(text, /ce erre eme/)
})

test('TTS route prioritizes local fast speech for sensitive numeric data', () => {
  assert.equal(selectTtsRoute('Tu teléfono es 612345678', { localReady: true, remoteReady: true }), 'local_fast')
  assert.equal(selectTtsRoute('Te entiendo', { localReady: true }), 'cache')
})

test('prosody slows down empathetic responses', () => {
  const plan = buildProsodyPlan('Entiendo que ahora no sea un buen momento', { emotion: 'molesto' })
  assert.equal(plan.style, 'empathetic')
  assert.equal(plan.pace, 'slow')
  assert.equal(plan.interruptible, true)
})
