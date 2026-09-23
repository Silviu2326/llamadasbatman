import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertCompleteRecordingAvailable, completedRecording, recordingUrl, waitForRecordingStart } from '../voice/telephony/zadarma/recordings'
import Fastify from 'fastify'
import { Readable } from 'node:stream'
import { createCallRecordingHandler } from '../controllers/callRecordings.controller'

function wav() {
  const file = Buffer.alloc(44 + 320)
  file.write('RIFF', 0); file.writeUInt32LE(file.length - 8, 4); file.write('WAVEfmt ', 8)
  file.writeUInt32LE(16, 16); file.writeUInt16LE(1, 20); file.writeUInt16LE(1, 22)
  file.writeUInt32LE(8000, 24); file.writeUInt32LE(16000, 28); file.writeUInt16LE(2, 32); file.writeUInt16LE(16, 34)
  file.write('data', 36); file.writeUInt32LE(320, 40)
  for (let i = 44; i < file.length; i += 2) file.writeInt16LE(i * 20, i)
  return file
}

test('private recordings serve only a complete WAV after MixMonitor finalizes it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vendrava-recording-test-'))
  const uuid = randomUUID()
  const previousDirectory = process.env.ZADARMA_RECORDING_DIR
  try {
    process.env.ZADARMA_RECORDING_DIR = dir
    // MixMonitor may create the file before flushing its buffered WAV header.
    await writeFile(path.join(dir, `${uuid}.wav`), '')
    await waitForRecordingStart(uuid)
    await writeFile(path.join(dir, `${uuid}.wav`), wav())
    await assert.rejects(completedRecording(uuid, dir), /ENOENT/)
    await writeFile(path.join(dir, `${uuid}.ready`), '')
    const result = await completedRecording(uuid, dir)
    const chunks = []
    for await (const chunk of result.stream()) chunks.push(Buffer.from(chunk))
    assert.deepEqual(Buffer.concat(chunks), wav())
    assert.equal(result.size, wav().length)
    assert.equal(recordingUrl(uuid), `/api/calls/recordings/${uuid}`)
    await writeFile(path.join(dir, `${uuid}.wav`), wav().subarray(0, 100))
    await assert.rejects(completedRecording(uuid, dir), /INCOMPLETE/)
    assert.throws(() => recordingUrl('../../secrets'))
    await assert.rejects(completedRecording('../secrets', dir), /INVALID_RECORDING_ID/)
  } finally {
    if (previousDirectory === undefined) delete process.env.ZADARMA_RECORDING_DIR
    else process.env.ZADARMA_RECORDING_DIR = previousDirectory
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()))
    assert.ok(path.basename(dir).startsWith('vendrava-recording-test-'))
    await rm(dir, { recursive: true, force: true })
  }
})

test('complete recording never overrides off or consent policy', async () => {
  const old = process.env.CALL_RECORDING_POLICY
  try {
    for (const policy of ['off', 'consent', 'typo']) {
      process.env.CALL_RECORDING_POLICY = policy
      await assert.rejects(assertCompleteRecordingAvailable(), /REQUIRES_ALWAYS_POLICY/)
    }
  } finally {
    if (old === undefined) delete process.env.CALL_RECORDING_POLICY
    else process.env.CALL_RECORDING_POLICY = old
  }
})

test('recording delivery checks organisation before reading files and rejects unfinished audio', async () => {
  const app = Fastify()
  const uuid = randomUUID()
  let loads = 0
  let ready = true
  const handler = createCallRecordingHandler({
    ownsRecording: async (org, id) => org === 'owner-org' && id === uuid,
    load: async () => {
      loads++
      if (!ready) throw new Error('filesystem/private/path must not leak')
      return { filename: `${uuid}.wav`, size: wav().length, stream: () => Readable.from([wav()]) as any }
    },
  })
  // Authentication is handled by the existing route hooks; simulate its
  // principal here to verify the recording-specific ownership boundary.
  app.addHook('preHandler', async req => { req.user = { orgId: req.headers['x-test-org'] } as any })
  app.get('/recordings/:uuid', handler)
  try {
    const get = (org: string) => app.inject({ url: `/recordings/${uuid}`, headers: { 'x-test-org': org } })
    assert.equal((await get('other-org')).statusCode, 404)
    assert.equal(loads, 0)
    const success = await get('owner-org')
    assert.equal(success.statusCode, 200)
    assert.match(String(success.headers['content-type']), /audio\/wav/)
    assert.match(String(success.headers['cache-control']), /no-store/)
    assert.deepEqual(success.rawPayload, wav())
    ready = false
    const waiting = await get('owner-org')
    assert.equal(waiting.statusCode, 409)
    assert.doesNotMatch(waiting.body, /filesystem|private\/path/)
  } finally { await app.close() }
})
