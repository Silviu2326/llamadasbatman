import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { RemoteVoiceEngineSession } from '../voice/engine/remoteVoiceEngine'

const context = {
  callSid: 'test-call',
  orgId: 'org',
  leadId: 'lead',
  agentId: 'agent',
  campaignId: 'campaign',
  phone: '+441234567890',
  businessType: 'software',
  businessName: 'Vendrava',
  agentConfig: null,
  recordingConsentPending: false,
}

async function listen(server: WebSocketServer): Promise<number> {
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return address.port
}

for (const architecture of ['modular', 'duplex'] as const) {
  test(`remote session announces ${architecture} architecture to its gateway`, async () => {
    // El idioma anunciado sale de estas envs; se fijan aquí para no depender
    // de que backend/.env tenga el bloque VOICE_* descomentado.
    const languageEnv = architecture === 'duplex' ? 'VOICE_DUPLEX_LANGUAGE' : 'VOICE_CALL_LANGUAGE'
    const previousLanguage = process.env[languageEnv]
    process.env[languageEnv] = 'en-US'
    const server = new WebSocketServer({ port: 0 })
    let resolveStart!: (payload: Record<string, unknown>) => void
    const startSeen = new Promise<Record<string, unknown>>(resolve => { resolveStart = resolve })
    server.on('connection', socket => {
      socket.on('message', raw => {
        const payload = JSON.parse(raw.toString()) as Record<string, unknown>
        if (payload.type === 'session.start') {
          resolveStart(payload)
          socket.send(JSON.stringify({ type: 'session.ready', architecture }))
        }
      })
    })
    const port = await listen(server)
    const session = new RemoteVoiceEngineSession(context, 'English commercial prompt', {
      architecture,
      url: `ws://127.0.0.1:${port}/ws`,
      token: '',
      pipeline: { stt: 'kyutai', tts: 'qwen' },
    })

    try {
      await session.connect()
      const observed = await startSeen
      assert.equal(observed.architecture, architecture)
      const engine = observed.engine as Record<string, unknown>
      assert.equal(engine.controlPlane, 'node-policy-engine')
      assert.equal(engine.family, architecture === 'duplex' ? 'moshi' : 'oss-cascade')
      const agent = observed.agent as Record<string, unknown>
      assert.equal(agent.language, 'en-US')
      // La apertura viaja por sesión: el agente habla primero, en el idioma anunciado.
      assert.equal(typeof agent.greeting, 'string')
      assert.match(agent.greeting as string, /Alex/)
      assert.match(agent.greeting as string, /Is the person in charge available/)
      // La página de laboratorio elige STT/TTS por sesión; debe llegar al gateway.
      assert.deepEqual(observed.pipeline, { stt: 'kyutai', tts: 'qwen' })
    } finally {
      if (previousLanguage === undefined) delete process.env[languageEnv]
      else process.env[languageEnv] = previousLanguage
      await session.close()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
}
