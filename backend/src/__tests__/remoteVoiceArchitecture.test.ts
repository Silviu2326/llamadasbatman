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
}

async function listen(server: WebSocketServer): Promise<number> {
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return address.port
}

for (const architecture of ['modular', 'duplex'] as const) {
  test(`remote session announces ${architecture} architecture to its gateway`, async () => {
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
    } finally {
      await session.close()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
}
