import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FishAudioLatencyError,
  measureFishAudioLatency,
} from '../services/fishAudioLatency.service'

test('mide el primer chunk real y conserva el audio completo', async () => {
  const originalKey = process.env.FISH_API_KEY
  const originalFetch = globalThis.fetch
  process.env.FISH_API_KEY = 'test-fish-key'

  const captured = { body: {} as Record<string, unknown>, headers: new Headers() }
  globalThis.fetch = async (_url, init) => {
    captured.body = JSON.parse(String(init?.body))
    captured.headers = new Headers(init?.headers)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0x49, 0x44, 0x33]))
        controller.enqueue(Uint8Array.from([1, 2, 3]))
        controller.close()
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'audio/mpeg' } })
  }

  try {
    const result = await measureFishAudioLatency({
      text: 'Hola, esta es una prueba corta de latencia.',
      voiceId: 'voice-model-id',
      model: 's2.1-pro-free',
      latency: 'balanced',
      speed: 1,
    })
    assert.deepEqual([...result.audio], [0x49, 0x44, 0x33, 1, 2, 3])
    assert.ok(result.ttfaMs >= 0)
    assert.ok(result.totalMs >= result.ttfaMs)
    assert.equal(captured.headers.get('authorization'), 'Bearer test-fish-key')
    assert.equal(captured.headers.get('model'), 's2.1-pro-free')
    assert.equal(captured.body.reference_id, 'voice-model-id')
    assert.equal(captured.body.latency, 'balanced')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.FISH_API_KEY
    else process.env.FISH_API_KEY = originalKey
  }
})

test('explica que falta la clave sin intentar una llamada externa', async () => {
  const originalKey = process.env.FISH_API_KEY
  delete process.env.FISH_API_KEY
  try {
    await assert.rejects(
      measureFishAudioLatency({
        text: 'Texto suficientemente largo para validar la prueba.',
        model: 's2.1-pro-free',
        latency: 'balanced',
        speed: 1,
      }),
      (error: unknown) => error instanceof FishAudioLatencyError && error.statusCode === 503,
    )
  } finally {
    if (originalKey !== undefined) process.env.FISH_API_KEY = originalKey
  }
})
