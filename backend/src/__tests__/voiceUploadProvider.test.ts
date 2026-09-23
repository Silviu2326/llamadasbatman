import assert from 'node:assert/strict'
import test from 'node:test'
import { createPrivateVoice, decodeVoiceAudio, findPrivateVoice, MAX_VOICE_BYTES } from '../services/voiceUploadProvider'

const wav = Buffer.alloc(200)
wav.write('RIFF'); wav.write('WAVE', 8)

test('validates actual audio bytes and bounded canonical base64', () => {
  assert.equal(decodeVoiceAudio(wav.toString('base64')).mime, 'audio/wav')
  const mp3 = Buffer.alloc(200); mp3.write('ID3')
  assert.equal(decodeVoiceAudio(mp3.toString('base64')).extension, 'mp3')
  for (const value of ['not base64', '', Buffer.from('<script>not audio</script>'.repeat(20)).toString('base64'), Buffer.alloc(MAX_VOICE_BYTES + 1).toString('base64')]) assert.throws(() => decodeVoiceAudio(value))
})

test('sends private multipart binary without retries or provider secrets in errors', async t => {
  const previous = process.env.FISH_API_KEY
  process.env.FISH_API_KEY = 'test-key'
  try {
    const file = decodeVoiceAudio(wav.toString('base64'))
    const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
      const form = options.body as FormData
      assert.equal(form.get('visibility'), 'private')
      assert.equal(form.get('train_mode'), 'fast')
      assert.equal(form.get('generate_sample'), 'false')
      assert.deepEqual(Buffer.from(await (form.get('voices') as Blob).arrayBuffer()), wav)
      assert.equal(options.headers['Content-Type'], undefined)
      return Response.json({ _id: 'a'.repeat(32), visibility: 'private', state: 'trained' })
    })
    assert.equal((await createPrivateVoice('Test', file)).state, 'trained')
    fetchMock.mock.mockImplementation(async () => { throw new Error('secret key') })
    await assert.rejects(createPrivateVoice('Test', file), (error: any) => error.uncertain === true && !error.message.includes('secret'))
    assert.equal(fetchMock.mock.callCount(), 2)
    fetchMock.mock.mockImplementation(async () => new Response('secret', { status: 422 }))
    await assert.rejects(createPrivateVoice('Test', file), (error: any) => error.uncertain === false)
    fetchMock.mock.mockImplementation(async () => Response.json({ items: [{ _id: 'x', title: 'other tenant', visibility: 'private' }] }))
    assert.equal(await findPrivateVoice('Vendrava expected'), null)
  } finally {
    if (previous === undefined) delete process.env.FISH_API_KEY; else process.env.FISH_API_KEY = previous
  }
})
