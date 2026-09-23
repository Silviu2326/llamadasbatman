// User-authorized synthetic provider test. No customer data or phone calls.
const base = process.env.VENDRAVA_PROVIDER_CHECK_CODE_DIR || '/opt/vendrava/gateway/dist/voice/'
const { streamCerebras } = require(base + 'intelligence/llm/cerebrasStream')
const { createVoiceSession } = require(base + 'engine/factory')
const { createCallContext } = require(base + 'intelligence/conversation/callContext')
const results = {}
const deadline = setTimeout(() => {
  console.log(JSON.stringify({ ...results, timeout: true }))
  process.exit(1)
}, 25000)
async function llm() {
  let text = '', firstMs
  const start = Date.now()
  for await (const chunk of streamCerebras({
    apiKey: process.env.CEREBRAS_API_KEY, model: 'gpt-oss-120b',
    messages: [{role: 'user', content: 'Prueba interna. Responde solo OK.'}],
    maxTokens: 256, signal: AbortSignal.timeout(18000),
  })) { firstMs ??= Date.now() - start; text += chunk }
  results.cerebras = { ok: Boolean(text.trim()), firstMs, output: text.slice(0, 60) }
}
async function voice() {
  const config = {
    softwareId: 'internal-check', activo: true, agentType: 'sales', callDirection: 'outbound',
    identity: { agentName: 'Prueba', agentAccent: 'es', agentGender: 'neutral' },
    product: { companyName: 'Prueba interna' }, playbook: { strategy: 'test', scripts: {} },
    compliance: { disclosureAi: true }, behavior: { openingLine: 'Esta es una prueba interna de audio.' },
    voice: { ttsVoiceId: 'a66dfe8d17614abab815ce05a517979f', speed: 1 },
  }
  const ctx = createCallContext({callSid: 'internal-check', phone: '', agentConfig: config})
  const session = await createVoiceSession(ctx, 'Prueba interna sin clientes conectados.')
  let ready = false, bytes = 0, firstMs
  const errors = [], start = Date.now()
  const feeder = setInterval(() => { if (ready) void session.sendAudio(Buffer.alloc(3200)) }, 100)
  let timeout
  try {
    await session.attach({
      onAudio: async pcm => { firstMs ??= Date.now() - start; bytes += pcm.length },
      onEvent: event => {
        if (event.type === 'session.ready') ready = true
        if (event.type === 'error') errors.push(event.payload?.code || 'PROVIDER_ERROR')
      },
    })
    await Promise.race([session.run(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('VOICE_TIMEOUT')), 18000) })])
    results.voice = { deepgramConnected: ready, fishPcmBytes: bytes, firstAudioMs: firstMs, errors, ok: ready && bytes > 0 && !errors.length }
  } finally { clearTimeout(timeout); clearInterval(feeder); await session.close() }
}
Promise.allSettled([llm(), voice()]).then(outcomes => {
  outcomes.forEach((r, i) => {
    if (r.status === 'rejected') results[i ? 'voice' : 'cerebras'] = { ok: false, error: String(r.reason?.message || r.reason).replace(/https?:\/\/\S+/g, '[upstream]').slice(0, 200) }
  })
  clearTimeout(deadline)
  console.log('PROVIDER_CHECK ' + JSON.stringify(results))
  process.exit(results.cerebras?.ok && results.voice?.ok ? 0 : 1)
})
