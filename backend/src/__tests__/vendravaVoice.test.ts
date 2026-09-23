import assert from 'node:assert/strict'
import test from 'node:test'
import { SpeechChunker } from '../voice/utils/speechChunker'
import { ProsodyMeter, describe as describeProsody } from '../voice/utils/prosody'
import { parseGuruAdvice } from '../voice/intelligence/conversation/vendravaGuru'
import { parseSseData } from '../voice/intelligence/llm/cerebrasStream'
import { sanitizeVendravaSettings, vendravaVoiceLanguageSupported, VendravaVoiceSession } from '../voice/pipelines/vendravaVoice'
import { createCallContext } from '../voice/intelligence/conversation/callContext'
import { defaultAgentConfig } from '../voice/agentConfig'
import { resolveAgentRuntime, runtimePipelineLabel, unsupportedRuntimeProviders } from '../voice/runtimeConfig'

function speech(seconds: number, amplitude: number, sampleRate = 16_000): Buffer {
  const samples = Math.round(seconds * sampleRate)
  const frame = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    // Un tono constante basta: el medidor solo mira energía, no forma de onda.
    frame.writeInt16LE(Math.round(Math.sin(index / 8) * amplitude * 32767), index * 2)
  }
  return frame
}

test('el saludo inicial usa la apertura guardada y conserva los avisos de IA y grabación', () => {
  const previous = process.env.DISCLOSE_AI
  process.env.DISCLOSE_AI = 'true'
  try {
    const agentConfig = defaultAgentConfig()
    agentConfig.identity = { agentName: 'Carlos', agentGender: 'neutral', agentAccent: 'es' }
    agentConfig.behavior = { openingLine: 'Te llamo por las mejoras de tu web. ¿Tienes veinte segundos?' }
    const ctx = createCallContext({ callSid: 'offline', phone: '+34600000000', agentConfig, direction: 'outbound' })
    ctx.recordingConsentPending = true
    const session = new VendravaVoiceSession(ctx, 'Asistente comercial') as any
    const greeting = session.greeting()
    assert.match(greeting, /^Hola, le llama Carlos, un asistente de IA\./)
    assert.match(greeting, /Te llamo por las mejoras de tu web/)
    assert.match(greeting, /grabamos esta llamada/)
    assert.doesNotMatch(greeting, /cómo va tu día/)
    agentConfig.behavior.openingLine = '  '
    const fallback = new VendravaVoiceSession(ctx, 'Asistente comercial') as any
    assert.match(fallback.greeting(), /cómo va tu día/)
    ctx.recordingConsentPending = false
    ctx.metadata.recordingPolicy = 'always'
    const recorded = new VendravaVoiceSession(ctx, 'Asistente comercial') as any
    assert.match(recorded.greeting(), /Esta llamada se está grabando\./)
    assert.doesNotMatch(recorded.greeting(), /grabamos esta llamada/)
  } finally {
    if (previous === undefined) delete process.env.DISCLOSE_AI
    else process.env.DISCLOSE_AI = previous
  }
})

test('SpeechChunker corta una primera frase corta y deja largas las siguientes', () => {
  const chunker = new SpeechChunker(12, 42)
  assert.deepEqual(chunker.push("Absolutely—I'll keep "), [])
  assert.deepEqual(chunker.push('it brief. Then we can continue.'), ["Absolutely—I'll keep it brief."])
  assert.deepEqual(chunker.flush(), ['Then we can continue.'])

  const long = new SpeechChunker()
  const chunks = long.push(
    "Absolutely, I'll keep it brief. I'm calling from Vendrava to see whether a faster "
    + 'voice workflow could help your team, and whether now is a reasonable moment. ',
  )
  assert.ok(chunks[0].length <= 64)
  assert.ok(chunks[1].length > 64)
})

test('SpeechChunker no emite trozos vacíos', () => {
  const chunker = new SpeechChunker()
  chunker.push('   ')
  assert.deepEqual(chunker.flush(), [])
})

test('ProsodyMeter separa un turno rápido y alto de uno lento y bajo', () => {
  const rushed = new ProsodyMeter()
  rushed.beginTurn(0, -400)
  rushed.pushAudio(speech(2, 0.9))
  const fast = rushed.endTurn(2000, 'yeah look I really only have a minute here so what is it')

  const calm = new ProsodyMeter()
  calm.beginTurn(0, -3000)
  calm.pushAudio(speech(6, 0.05))
  const slow = calm.endTurn(6000, 'sure, go ahead')

  assert.ok(fast.wordsPerMinute > slow.wordsPerMinute)
  assert.ok(fast.arousal > slow.arousal)
  assert.notEqual(fast.label, slow.label)
})

test('ProsodyMeter ignora el audio fuera de turno', () => {
  const meter = new ProsodyMeter()
  meter.pushAudio(speech(1, 0.9))
  meter.beginTurn(0)
  const reading = meter.endTurn(1000, 'hello')
  assert.equal(reading.arousal, 0)
  assert.equal(reading.replyDelayMs, undefined)
})

test('describeProsody nombra solo las señales que puede oír', () => {
  assert.match(describeProsody(0.9, 210, 100, 3), /talking fast/)
  assert.match(describeProsody(0.9, 210, 100, 3), /cut in 3 times/)
  assert.match(describeProsody(0.1, 95, 2000, 0), /hesitated/)
  assert.equal(describeProsody(0.4, 150, 800, 0), 'steady, neutral delivery')
})

test('parseGuruAdvice degrada a "sin consejo" en vez de romper la llamada', () => {
  const advice = parseGuruAdvice('READ: They are curious but short on time.\nNEXT: Skip the intro and ask for a 10-minute slot.')
  assert.equal(advice?.read, 'They are curious but short on time.')
  assert.equal(advice?.directive, 'Skip the intro and ask for a 10-minute slot.')
  assert.equal(parseGuruAdvice('I think Carlos should probably slow down a bit.'), undefined)
  assert.equal(parseGuruAdvice(''), undefined)
  assert.equal(parseGuruAdvice('NEXT: Ask one closing question.')?.directive, 'Ask one closing question.')
})

test('parseSseData recompone un JSON partido entre paquetes', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"del'))
      controller.enqueue(encoder.encode('ta":{"content":"Hi"}}]}\n\n'))
      controller.enqueue(encoder.encode(': ping\n\ndata: [DONE]\n\n'))
      controller.close()
    },
  })
  const values: string[] = []
  for await (const value of parseSseData(stream)) values.push(value)
  assert.deepEqual(values, ['{"choices":[{"delta":{"content":"Hi"}}]}', '[DONE]'])
})

test('el motor admite agentes en español e inglés, pero no otros idiomas', () => {
  const spanish = { ...defaultAgentConfig(), identity: { agentName: 'Alex', agentGender: 'neutral' as const, agentAccent: 'es' } }
  const english = { ...defaultAgentConfig(), identity: { agentName: 'Alex', agentGender: 'neutral' as const, agentAccent: 'en-US' } }
  const french = { ...defaultAgentConfig(), identity: { agentName: 'Alex', agentGender: 'neutral' as const, agentAccent: 'fr-FR' } }
  assert.equal(vendravaVoiceLanguageSupported(spanish), true)
  assert.equal(vendravaVoiceLanguageSupported(english), true)
  assert.equal(vendravaVoiceLanguageSupported(french), false)
  // Sin agente configurado (cabina de pruebas) se usa la persona de respaldo.
  assert.equal(vendravaVoiceLanguageSupported(null), true)
})

test('sanitizeVendravaSettings rechaza voice ids y velocidades fuera de rango', () => {
  const clean = sanitizeVendravaSettings({ voiceId: 'bad id!', speed: 9, ttsModel: 'speech-3', speculative: false })
  assert.notEqual(clean.voiceId, 'bad id!')
  assert.equal(clean.speed, 1.2)
  assert.equal(clean.ttsModel, 's2.1-pro')
  assert.equal(clean.speculative, false)
  assert.equal(sanitizeVendravaSettings({ voiceId: 'Custom_voice-1', speed: 0.95 }).voiceId, 'Custom_voice-1')
})

test('el runtime de cada agente se normaliza y conserva su pipeline', () => {
  const agent = {
    ...defaultAgentConfig(),
    runtime: {
      primaryLlm: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      guru: { provider: 'deepseek', model: 'deepseek-reasoner', enabled: true, structure: 'qualification-coach', instructions: 'Prioriza margen.' },
      transcriptionStt: { provider: 'cartesia', model: 'ink-2' },
      emotionStt: { provider: 'deepgram', model: 'flux-general-multi', enabled: true },
      tts: { provider: 'minimax', model: 'speech-2.8-hd' },
      temperature: '0.4',
      transcriptionLanguage: 'es',
      emotionMode: 'turn',
      turnTaking: 'fast',
    },
  }
  const runtime = resolveAgentRuntime(agent)
  assert.equal(runtime.primaryLlm.provider, 'groq')
  assert.equal(runtime.guru.structure, 'qualification-coach')
  assert.equal(runtime.tts.model, 'speech-2.8-hd')
  assert.equal(runtime.temperature, 0.4)
  assert.equal(unsupportedRuntimeProviders(runtime).length, 0)
  assert.match(runtimePipelineLabel(runtime), /Cartesia ink-2.*Groq llama-3.3.*MiniMax speech-2.8-hd/)
})
