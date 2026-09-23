// Internal readiness checks only. Never originates an external call or publishes an agent.
const { createConnection } = require('node:net')
const { setTimeout: delay } = require('node:timers/promises')
const base = '/opt/vendrava/gateway/dist/'
const { createCallContext } = require(base + 'voice/intelligence/conversation/callContext')
const { createVoiceSession } = require(base + 'voice/engine/factory')
const { streamCerebras } = require(base + 'voice/intelligence/llm/cerebrasStream')
const { resolveAgentRuntime, missingRuntimeCredentials } = require(base + 'voice/runtimeConfig')

async function amiLogin() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 5038 })
    const timeout = setTimeout(() => done(new Error('AMI_TIMEOUT')), 5000)
    let text = '', settled = false
    function done(error) {
      if (settled) return
      settled = true; clearTimeout(timeout); socket.destroy()
      error ? reject(error) : resolve()
    }
    socket.on('error', () => done(new Error('AMI_CONNECTION_FAILED')))
    socket.on('connect', () => socket.write('Action: Login\r\nActionID: readiness\r\nUsername: ' + process.env.ZADARMA_AMI_USER + '\r\nSecret: ' + process.env.ZADARMA_AMI_SECRET + '\r\nEvents: off\r\n\r\n'))
    socket.on('data', data => {
      text += data.toString()
      if (text.includes('Response: Success')) done()
      else if (text.includes('Response: Error')) done(new Error('AMI_LOGIN_REJECTED'))
    })
  })
}

async function main() {
  await amiLogin()
  console.log('AMI authentication: OK')
  const agentId = 'internal-provider-check'
  // Synthetic configuration only: never load customer records or business scripts.
  const config = {
    softwareId: agentId, activo: true, agentType: 'sales', callDirection: 'outbound',
    identity: { agentName: 'Prueba', agentGender: 'neutral', agentAccent: 'es' },
    product: { companyName: 'Prueba interna' },
    playbook: { strategy: 'test', scripts: {} },
    compliance: { disclosureAi: true },
    behavior: { openingLine: 'Esta es una prueba interna de audio.' },
    voice: { ttsVoiceId: 'a66dfe8d17614abab815ce05a517979f', speed: 1 },
  }
  const runtime = resolveAgentRuntime(config)
  const missing = missingRuntimeCredentials(runtime)
  if (missing.length) throw new Error('MISSING_KEYS: ' + missing.join(','))
  let llm = ''
  for await (const chunk of streamCerebras({apiKey: process.env.CEREBRAS_API_KEY, model: runtime.primaryLlm.model,
    messages: [{role: 'user', content: 'Prueba interna. Responde solo OK.'}], maxTokens: 256, signal: AbortSignal.timeout(20000)})) llm += chunk
  if (!llm.trim()) throw new Error('LLM_EMPTY_RESPONSE')
  console.log('Cerebras response: OK')
  const ctx = createCallContext({ callSid: 'internal-readiness', phone: '', orgId: process.env.ZADARMA_ORG_ID, agentId, agentConfig: config })
  ctx.metadata.recordingPolicy = 'always'
  const session = await createVoiceSession(ctx, 'Esta es una prueba interna de funcionamiento. No hay clientes conectados.')
  let ready = false, bytes = 0
  const errors = []
  try {
    await session.attach({ onAudio: async pcm => { bytes += pcm.length }, onEvent: event => {
      if (event.type === 'session.ready') ready = true
      if (event.type === 'error') errors.push(event.payload?.code || 'PROVIDER_ERROR')
    } })
    const run = session.run()
    for (let i = 0; i < 200 && !bytes && !errors.length; i++) {
      if (ready) await session.sendAudio(Buffer.alloc(3200))
      await delay(100)
    }
    if (!ready || !bytes || errors.length) throw new Error('VOICE_CHECK_FAILED: ' + errors.join(','))
    console.log(JSON.stringify({deepgram: 'connected', fishAudio: 'speech_received', pcmBytes: bytes}))
    await session.close()
    await Promise.race([run, delay(2000)])
  } finally { await session.close() }
}
main().catch(error => { console.error(String(error.message).replace(/https?:\/\/\S+/g, '[upstream]')); process.exitCode = 1 })
