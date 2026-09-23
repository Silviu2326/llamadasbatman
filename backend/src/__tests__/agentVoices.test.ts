import assert from 'node:assert/strict'
import test from 'node:test'
import { listAgentVoices, publicVoice } from '../services/agentVoices.service'

const model = { _id: 'a'.repeat(32), title: 'Clara', type: 'tts', state: 'trained', visibility: 'public', languages: ['es'], tags: ['warm'], author: { nickname: 'Author', email: 'private' }, samples: [{ audio: 'https://platform.r2.fish.audio/task/sample.mp3' }], apiKey: 'secret' }

test('only exposes public trained voices and safe sample URLs', () => {
  for (const override of [{ visibility: 'private' }, { dmca_taken_down: true }, { type: 'svc' }, { state: 'created' }]) assert.equal(publicVoice({ ...model, ...override }), null)
  const voice = publicVoice(model)!
  assert.equal(voice.name, 'Clara')
  assert.equal(voice.previewUrl, model.samples[0].audio)
  assert.equal(JSON.stringify(voice).includes('secret'), false)
  assert.equal(JSON.stringify(voice).includes('private'), false)
  for (const audio of ['javascript:alert(1)', 'http://platform.r2.fish.audio/x', 'https://evil.example/x']) assert.equal(publicVoice({ ...model, samples: [{ audio }] })?.previewUrl, null)
})

test('catalog forwards filters, preserves paging and handles provider failures', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.FISH_API_KEY
  process.env.FISH_API_KEY = 'test-key'
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.searchParams.get('language'), 'es')
      assert.equal(url.searchParams.get('title'), 'Clara & Ana')
      assert.equal(url.searchParams.get('page_number'), '2')
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-key')
      return Response.json({ items: [model, { ...model, visibility: 'private' }], has_more: true })
    }
    const result = await listAgentVoices({ language: 'es', search: 'Clara & Ana', page: 2 })
    assert.equal(result.voices.length, 1)
    assert.equal(result.hasMore, true)
    globalThis.fetch = async () => new Response('upstream secret', { status: 401 })
    await assert.rejects(listAgentVoices({ page: 1 }), { statusCode: 502 })
    globalThis.fetch = async () => Response.json({ wrong: [] })
    await assert.rejects(listAgentVoices({ page: 1 }), { statusCode: 502 })
    delete process.env.FISH_API_KEY
    await assert.rejects(listAgentVoices({ page: 1 }), { statusCode: 503 })
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.FISH_API_KEY
    else process.env.FISH_API_KEY = originalKey
  }
})
