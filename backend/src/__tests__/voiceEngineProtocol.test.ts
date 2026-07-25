import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeVoiceEngineEvent } from '../voice/engine/remoteVoiceEngine'

test('decodes a valid assistant audio event', () => {
  const event = decodeVoiceEngineEvent(JSON.stringify({
    type: 'assistant.audio',
    sampleRate: 24000,
    pcmBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
  }))

  assert.equal(event?.type, 'assistant.audio')
  assert.equal(event?.sampleRate, 24000)
  assert.equal(event?.pcmBase64, 'AQIDBA==')
})

test('rejects malformed and oversized engine events', () => {
  assert.equal(decodeVoiceEngineEvent('{not-json'), null)
  assert.equal(decodeVoiceEngineEvent(Buffer.alloc(512 * 1024 + 1)), null)
})
