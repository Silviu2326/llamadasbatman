import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createConnection, type AddressInfo } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { AudioSocketParser, packet, PcmPlaybackQueue, SipPcmBridge, uuidFromBytes } from '../voice/telephony/zadarma/audioSocket'
import { createAudioSocketServer } from '../voice/telephony/zadarma/audioServer'
import { SipCallRegistry } from '../voice/telephony/zadarma/registry'
import { amiAction, originate, originateFields } from '../voice/telephony/zadarma/ami'
import { loadZadarmaGatewayConfig } from '../voice/telephony/zadarma/config'
import { buildZadarmaControl } from '../voice/telephony/zadarma/gateway'
import type { VoiceSession, VoiceSessionCallbacks } from '../voice/engine/voiceSession'
import { createServer } from 'node:net'

function sine(rate: number, frequency: number, ms: number) {
  const b = Buffer.alloc(Math.round(rate * ms / 1000) * 2)
  for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(12000 * Math.sin(i * frequency * 2 * Math.PI / rate)), i * 2)
  return b
}
const rms = (b: Buffer) => Math.sqrt(Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2) ** 2).reduce((a, b) => a + b, 0) / (b.length / 2))
function fakeSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return { attach: async () => {}, sendAudio: async () => {}, cancelResponse: async () => {}, stopResponding: async () => {}, updateEotTimeout: async () => {}, run: async () => {}, close: async () => {}, ...overrides }
}
const env = {
  ZADARMA_GATEWAY_ENABLED: 'true', ZADARMA_ORG_ID: 'org-test', ZADARMA_GATEWAY_TOKEN: 't'.repeat(40),
  ZADARMA_CALLER_ID: '+34910000000', ZADARMA_AMI_USER: 'test', ZADARMA_AMI_SECRET: 'test-only',
}

test('AudioSocket parses arbitrary TCP fragmentation, lengths and UUID byte order', () => {
  const id = randomUUID()
  const frames = Buffer.concat([packet(1, Buffer.from(id.replaceAll('-', ''), 'hex')), packet(0x10, sine(8000, 500, 20)), packet(0)])
  const parser = new AudioSocketParser()
  const result = [...frames].flatMap(byte => parser.push(Buffer.from([byte])))
  assert.equal(uuidFromBytes(result[0].payload), id)
  assert.deepEqual(result.map(r => r.type), [1, 0x10, 0])
  assert.equal(result[1].payload.length, 320)
  for (const bad of [Buffer.from([1, 0, 15]), Buffer.from([0x10, 0, 3]), Buffer.from([0x10, 255, 255]), Buffer.from([0x12, 0, 2])]) {
    assert.throws(() => new AudioSocketParser().push(bad))
  }
})

test('PCM8↔engine resampling keeps duration, amplitude and state across odd TTS chunks', () => {
  const audio = sine(24000, 700, 200)
  const expected = new SipPcmBridge().output(audio)
  const converter = new SipPcmBridge()
  const actual = Buffer.concat([converter.output(audio.subarray(0, 77)), converter.output(audio.subarray(77, 913)), converter.output(audio.subarray(913))])
  assert.deepEqual(actual, expected)
  assert.equal(expected.length, 3200)
  assert.ok(rms(expected) > 7000)
  const input = sine(8000, 700, 200)
  const whole = new SipPcmBridge().input(input)
  const incremental = new SipPcmBridge()
  assert.deepEqual(Buffer.concat([incremental.input(input.subarray(0, 320)), incremental.input(input.subarray(320))]), whole)
  assert.equal(whole.length, 6400)
  assert.ok(rms(whole) > 7000)
  const alias = new SipPcmBridge().output(sine(24000, 7000, 200))
  assert.ok(rms(alias.subarray(160)) < rms(expected.subarray(160)) * 0.03)
})

test('playback pads final PCM frame, applies backpressure above the soft limit and only rejects at the hard limit', async () => {
  // 40 ms blandos (640 B), 100 ms duros (1600 B).
  const queue = new PcmPlaybackQueue(40, 100)
  void queue.push(Buffer.alloc(322, 1))
  assert.equal(queue.nextFrame()!.length, 320)
  const tail = queue.nextFrame()!
  assert.equal(tail.readUInt16LE(0), 257)
  assert.equal(tail.readUInt16LE(2), 0)
  assert.equal(queue.nextFrame(), null)

  // Por encima del límite blando no se cuelga: la promesa espera a que drene.
  let drained = false
  const waiting = queue.push(Buffer.alloc(960)).then(() => { drained = true })
  await delay(5)
  assert.equal(drained, false, 'debe esperar mientras la cola supera el límite blando')
  assert.equal(queue.queuedMs, 60)
  queue.nextFrame()
  await waiting
  assert.equal(drained, true, 'se libera al bajar del límite blando')

  // Solo el límite duro (respuesta desbocada) sigue lanzando.
  assert.throws(() => queue.push(Buffer.alloc(1600)), /BACKLOG/)
  assert.throws(() => queue.push(Buffer.alloc(3)), /ODD/)

  // La interrupción vacía la cola y libera a quien esperaba.
  let released = false
  void queue.push(Buffer.alloc(640)).then(() => { released = true })
  await delay(5)
  assert.equal(released, false)
  queue.clear()
  await delay(0)
  assert.equal(released, true)
  assert.equal(queue.nextFrame(), null)
})

test('a 20 s response no longer hangs up: the queue holds it and drains at real time', async () => {
  const queue = new PcmPlaybackQueue()
  assert.equal(queue.softBytes, 16000 * 15)
  assert.equal(queue.hardBytes, 16000 * 60)
  const twentySeconds = Buffer.alloc(16000 * 20)
  let settled = false
  const pending = queue.push(twentySeconds).then(() => { settled = true })
  assert.equal(queue.queuedMs, 20_000)
  // 5 s de drenado (250 tramas) bastan para bajar del límite blando.
  for (let i = 0; i < 250; i++) queue.nextFrame()
  await pending
  assert.equal(settled, true)
  assert.equal(queue.queuedMs, 15_000)
  assert.throws(() => queue.push(Buffer.alloc(16000 * 46)), /BACKLOG/)
})

test('one-use registry refuses replay, concurrent lead duplication, excess capacity and expired reservations', async () => {
  const registry = new SipCallRegistry(1, 10)
  const start = async () => ({ session: fakeSession(), callbacks: {}, finish: async () => {} })
  const id = registry.reserve('org:lead', start)
  assert.throws(() => registry.reserve('org:lead', start), /ALREADY_CALLING/)
  assert.throws(() => registry.reserve('org:other', start), /CAPACITY/)
  const call = await registry.claim(id, () => {})
  await assert.rejects(registry.claim(id, () => {}), /USED/)
  await call.finish('done')
  assert.equal(registry.size, 0)
  const expired = registry.reserve('org:lead', start)
  await delay(25)
  await assert.rejects(registry.claim(expired, () => {}), /UNKNOWN/)
})

test('real local TCP exchanges paced audio with VoiceSession and closes once', async () => {
  let callbacks!: VoiceSessionCallbacks
  let input: Buffer = Buffer.alloc(0)
  let closes = 0
  let finishes = 0
  const id = randomUUID()
  const registry = new SipCallRegistry()
  const reservation = registry.reserve(id, async () => ({
    session: fakeSession({ attach: async c => { callbacks = c }, sendAudio: async b => { input = Buffer.concat([input, b]) }, close: async () => { closes++ } }),
    callbacks: {}, finish: async () => { finishes++ },
  }))
  const media = createAudioSocketServer((id, hangup) => registry.claim(id, hangup))
  media.server.listen(0, '127.0.0.1')
  await once(media.server, 'listening')
  const client = createConnection({ host: '127.0.0.1', port: (media.server.address() as AddressInfo).port })
  const parser = new AudioSocketParser()
  const received: { time: number; payload: Buffer }[] = []
  client.on('data', chunk => { for (const msg of parser.push(chunk)) if (msg.type === 0x10) received.push({ time: Date.now(), payload: msg.payload }) })
  try {
    await once(client, 'connect')
    client.write(Buffer.concat([packet(1, Buffer.from(reservation.replaceAll('-', ''), 'hex')), packet(0x10, sine(8000, 500, 20))]))
    for (let i = 0; i < 100 && !input.length; i++) await delay(5)
    assert.equal(input.length, 640)
    await callbacks.onAudio(sine(24000, 700, 100))
    for (let i = 0; i < 100 && received.length < 5; i++) await delay(5)
    assert.equal(received.length, 5)
    assert.ok(received[4].time - received[0].time >= 55, 'five frames must not be sent as a burst')
    assert.ok(received.every(frame => frame.payload.length === 320))
    await callbacks.onAudio(sine(24000, 700, 100))
    await callbacks.onInterrupt!()
    await delay(60)
    assert.equal(received.length, 5, 'interruption discards queued speech')
    client.end(packet(0))
    await once(client, 'close')
    for (let i = 0; i < 100 && !finishes; i++) await delay(5)
    assert.equal(closes, 1)
    assert.equal(finishes, 1)
    assert.equal(registry.size, 0)
  } finally { client.destroy(); await media.shutdown() }
})

test('disconnect during asynchronous session creation still disposes the late session', async () => {
  let resolveStart!: (value: any) => void
  let finished = 0
  let requested = false
  const media = createAudioSocketServer(async () => {
    requested = true
    return new Promise(resolve => { resolveStart = resolve })
  })
  media.server.listen(0, '127.0.0.1')
  await once(media.server, 'listening')
  const client = createConnection({ host: '127.0.0.1', port: (media.server.address() as AddressInfo).port })
  try {
    await once(client, 'connect')
    client.write(packet(1, Buffer.alloc(16)))
    for (let i = 0; i < 100 && !requested; i++) await delay(5)
    client.destroy()
    await delay(20)
    resolveStart({ session: fakeSession(), callbacks: {}, finish: async () => { finished++ } })
    for (let i = 0; i < 100 && !finished; i++) await delay(5)
    assert.equal(finished, 1)
  } finally { client.destroy(); await media.shutdown() }
})

test('gateway requires credentials, fixed tenant and immutable idempotency context', async () => {
  const cfg = loadZadarmaGatewayConfig(env)
  const registry = new SipCallRegistry()
  let dials = 0
  let prepares = 0
  const control = buildZadarmaControl(cfg, registry, {
    prepare: async () => { prepares++; return { phone: '+34910000001', start: async () => ({ session: fakeSession(), callbacks: {}, finish: async () => {} }) } },
    prepareTest: async () => { assert.fail('Una petición de campaña no puede tomar el camino de prueba') },
    originate: async () => { dials++ },
  })
  const payload = { requestId: randomUUID(), orgId: cfg.orgId, leadId: 'lead', agentId: 'agent', campaignId: 'campaign' }
  const send = (p: unknown = payload, authorization = `Bearer ${cfg.token}`) => control.inject({ method: 'POST', url: '/calls', payload: p as any, headers: { authorization } })
  try {
    assert.equal((await send(payload, 'Bearer bad')).statusCode, 401)
    assert.equal((await send({ ...payload, orgId: 'other' })).statusCode, 403)
    assert.equal((await send({ ...payload, phone: '+34999999999' })).statusCode, 400)
    assert.equal(prepares, 0)
    const [one, two] = await Promise.all([send(), send()])
    assert.equal(one.statusCode, 200)
    assert.deepEqual(one.json(), two.json())
    assert.equal(dials, 1)
    assert.equal((await send({ ...payload, leadId: 'other' })).statusCode, 409)
  } finally { await control.close() }
})

test('AMI rejects header injection and authenticates before originate over local TCP', async () => {
  const cfg = loadZadarmaGatewayConfig(env)
  assert.throws(() => amiAction({ Secret: 'x\r\nAction: Originate' }))
  assert.throws(() => originateFields(randomUUID(), '+34910000000/evil', cfg.callerId, cfg.ami))
  assert.equal(originateFields(randomUUID(), '+34683529629', cfg.callerId, cfg.ami).Channel, `PJSIP/+34683529629@${cfg.ami.endpoint}`)
  const actions: string[] = []
  const server = createServer(socket => {
    let pending = ''
    socket.write('Asterisk Call Manager/9.0\r\n')
    socket.on('data', chunk => {
      pending += chunk.toString()
      let pos: number
      while ((pos = pending.indexOf('\r\n\r\n')) >= 0) {
        const block = pending.slice(0, pos); pending = pending.slice(pos + 4)
        actions.push(block)
        const id = /ActionID: ([^\r]+)/.exec(block)![1]
        socket.write(`Response: Success\r\nActionID: ${id}\r\n\r\n`)
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    await originate({ ...cfg.ami, port: (server.address() as AddressInfo).port }, randomUUID(), '+34910000001', cfg.callerId)
    assert.equal(actions.length, 2)
    assert.match(actions[0], /Action: Login/)
    assert.match(actions[1], /Context: vendrava-recorded/)
    assert.match(actions[1], /Variable: VENDRAVA_AUDIO_PORT=9092/)
    assert.doesNotMatch(actions[1], /Application: AudioSocket/)
    assert.match(actions[1], /Channel: PJSIP\/\+34910000001@zadarma-ai/)
  } finally { server.close() }
})

test('gateway is opt-in, rejects weak credentials and conflicting ports', () => {
  assert.throws(() => loadZadarmaGatewayConfig({}), /DISABLED/)
  assert.throws(() => loadZadarmaGatewayConfig({ ...env, ZADARMA_GATEWAY_TOKEN: 'weak' }), /SHORT/)
  assert.throws(() => loadZadarmaGatewayConfig({ ...env, ZADARMA_CONTROL_PORT: '9092' }), /CONFLICT/)
})
