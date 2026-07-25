import assert from 'node:assert/strict'
import test from 'node:test'
import { TtsRouter } from '../voice/tts/ttsRouter'

test('TtsRouter caches safe short phrases and preserves audio immutability', async () => {
  let calls = 0
  const router = new TtsRouter([{
    id: 'local-piper',
    model: 'es-model',
    ready: () => true,
    synthesize: async () => { calls += 1; return Buffer.from([1, 2, 3]) },
  }])

  const first = await router.synthesize('Te entiendo')
  const second = await router.synthesize('Te entiendo')
  assert.equal(first.cacheHit, false)
  assert.equal(second.cacheHit, true)
  assert.equal(calls, 1)
  second.audio[0] = 99
  const third = await router.synthesize('Te entiendo')
  assert.equal(third.audio[0], 1)
})

test('TtsRouter does not cache phone numbers', async () => {
  let calls = 0
  const router = new TtsRouter([{
    id: 'local-piper',
    model: 'es-model',
    ready: () => true,
    synthesize: async () => { calls += 1; return Buffer.from([1]) },
  }])

  await router.synthesize('Tu teléfono es 612345678')
  await router.synthesize('Tu teléfono es 612345678')
  assert.equal(calls, 2)
})
