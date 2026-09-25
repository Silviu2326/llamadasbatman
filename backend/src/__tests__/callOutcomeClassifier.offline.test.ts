// Clasificación del resultado al colgar. Sin proveedor real: `complete` se
// inyecta y se comprueba el parseo estricto, los guardarraíles y el respaldo.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyOutcomeGuardrails,
  buildClassifierMessages,
  classifyCallOutcome,
  fallbackOutcome,
  normalizeFutureIso,
  parseOutcomeResponse,
  type TranscriptTurn,
} from '../voice/intelligence/callOutcomeClassifier'

const NOW = new Date('2026-09-24T09:00:00.000Z')
const CONVERSATION: TranscriptTurn[] = [
  { role: 'agente', text: 'Hola, soy Carlos de Vendrava. ¿Tiene un minuto?', atMs: 0 },
  { role: 'prospecto', text: 'Sí, dime. Nos interesa, ¿podemos verlo mañana a las diez?', atMs: 4200 },
  { role: 'agente', text: 'Perfecto, mañana a las diez. Gracias, hasta luego.', atMs: 9000 },
]

test('parseOutcomeResponse acepta JSON estricto, con o sin cercas de markdown', () => {
  const raw = '```json\n{"outcome":"meeting_scheduled","summary":"El contacto aceptó una reunión mañana a las diez.  Quedó en confirmar por email.","sentiment":"positivo","callbackAt":null,"meetingAt":"2026-09-25T10:00:00+02:00","highIntent":true}\n```'
  const parsed = parseOutcomeResponse(raw, { now: NOW })
  assert.ok(parsed)
  assert.equal(parsed.outcome, 'meeting_scheduled')
  assert.equal(parsed.sentiment, 'positive')
  assert.equal(parsed.meetingAt, '2026-09-25T08:00:00.000Z')
  assert.equal(parsed.callbackAt, null)
  assert.equal(parsed.highIntent, true)
  assert.equal(parsed.summary, 'El contacto aceptó una reunión mañana a las diez. Quedó en confirmar por email.')
  assert.equal(parsed.source, 'llm')
})

test('parseOutcomeResponse rechaza respuestas inválidas en vez de degradarlas', () => {
  assert.equal(parseOutcomeResponse('Claro, aquí tienes el análisis: la llamada fue bien.'), null)
  assert.equal(parseOutcomeResponse('{"outcome":"jackpot","summary":"x","sentiment":"neutral"}'), null)
  assert.equal(parseOutcomeResponse('{"outcome":"interested","sentiment":"neutral"}'), null, 'sin summary')
  assert.equal(parseOutcomeResponse('{"outcome":"interested","summary":"ok","sentiment":"feliz"}'), null, 'sentimiento fuera de vocabulario')
  assert.equal(parseOutcomeResponse('{"outcome":"interested","summary":"ok","sentiment":"neutral","extra":1}'), null, 'claves extra')
  assert.equal(parseOutcomeResponse('{"outcome":"fax_or_noise","summary":"ok","sentiment":"neutral"}'), null, 'no clasificable por el LLM')
  assert.equal(parseOutcomeResponse(''), null)
})

test('los alias del vocabulario antiguo se normalizan y las fechas imposibles se descartan', () => {
  const parsed = parseOutcomeResponse('{"outcome":"Rechazado","summary":"No le interesa.","sentiment":"negative","callbackAt":"ayer","meetingAt":"2020-01-01T10:00:00Z","highIntent":"false"}', { now: NOW })
  assert.ok(parsed)
  assert.equal(parsed.outcome, 'not_interested')
  assert.equal(parsed.callbackAt, null)
  assert.equal(parsed.meetingAt, null)
  assert.equal(parsed.highIntent, false)
  assert.equal(normalizeFutureIso('2026-09-24T08:57:00Z', NOW), '2026-09-24T08:57:00.000Z', 'cinco minutos de tolerancia')
  assert.equal(normalizeFutureIso('2028-01-01T10:00:00Z', NOW), null, 'más de un año vista')
  assert.equal(normalizeFutureIso('mañana', NOW), null)
})

test('fallbackOutcome reproduce el mapeo antiguo', () => {
  const base = { turns: CONVERSATION, now: NOW, durationSeconds: 12 }
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'optout' }).outcome, 'not_interested')
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'human_requested' }).outcome, 'human_requested')
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'callback_requested' }).outcome, 'callback_requested')
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'en_curso', transferRequested: true }).outcome, 'human_requested')
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'voicemail' }).outcome, 'voicemail')
  assert.equal(fallbackOutcome({ ...base, ctxOutcome: 'en_curso' }).outcome, 'none')
  const silent = fallbackOutcome({ turns: [CONVERSATION[0]], ctxOutcome: 'en_curso', durationSeconds: 8 })
  assert.equal(silent.outcome, 'none')
  assert.match(silent.summary, /Solo habló el agente/)
  assert.equal(silent.source, 'fallback')
})

test('los guardarraíles: opt-out gana al modelo y sin turnos del prospecto no hay interés', () => {
  const optimistic = parseOutcomeResponse('{"outcome":"meeting_scheduled","summary":"Reunión.","sentiment":"positive","meetingAt":"2026-09-25T10:00:00Z","highIntent":true}', { now: NOW })!
  const optout = applyOutcomeGuardrails(optimistic, { turns: CONVERSATION, ctxOutcome: 'optout' })
  assert.equal(optout.outcome, 'not_interested')
  assert.equal(optout.meetingAt, null)
  assert.equal(optout.highIntent, false)
  const nobody = applyOutcomeGuardrails(optimistic, { turns: [CONVERSATION[0]], ctxOutcome: 'en_curso' })
  assert.equal(nobody.outcome, 'none')
  const voicemail = applyOutcomeGuardrails({ ...optimistic, outcome: 'voicemail' }, { turns: [], ctxOutcome: 'en_curso' })
  assert.equal(voicemail.outcome, 'voicemail', 'buzón sin turnos se conserva')
  const transfer = applyOutcomeGuardrails(optimistic, { turns: CONVERSATION, ctxOutcome: 'en_curso', transferRequested: true })
  assert.equal(transfer.outcome, 'human_requested')
})

test('el buzón o la centralita detectados por el AMD ganan al modelo aunque el saludo parezca una persona', async () => {
  // El saludo del contestador se transcribió como turno del prospecto antes
  // de reconocer la máquina: el LLM leería "una conversación" y diría interés.
  const machineTurns: TranscriptTurn[] = [
    { role: 'agente', text: 'Hola, soy Carlos de Vendrava.', atMs: 0 },
    { role: 'prospecto', text: 'Hola, has llamado a Bar Pepe, ahora no podemos atenderte.', atMs: 1800 },
  ]
  const optimistic = { outcome: 'interested', summary: 'Parece interesado.', sentiment: 'positive', callbackAt: null, meetingAt: null, highIntent: true, source: 'llm' } as const
  assert.equal(applyOutcomeGuardrails(optimistic, { turns: machineTurns, ctxOutcome: 'voicemail' }).outcome, 'voicemail')
  assert.equal(applyOutcomeGuardrails(optimistic, { turns: machineTurns, ctxOutcome: 'ivr' }).outcome, 'ivr')
  assert.equal(applyOutcomeGuardrails(optimistic, { turns: machineTurns, ctxOutcome: 'voicemail' }).highIntent, false)
  let called = 0
  const result = await classifyCallOutcome({ turns: machineTurns, ctxOutcome: 'voicemail', now: NOW, durationSeconds: 6 }, { complete: async () => { called++; return JSON.stringify(optimistic) } })
  assert.equal(called, 0, 'con máquina detectada no se llama al modelo')
  assert.equal(result.outcome, 'voicemail')
  assert.equal(result.source, 'fallback')
  assert.match(result.summary, /buzón o una centralita/)
})

test('classifyCallOutcome usa el modelo cuando responde y cae al respaldo si tarda, falla o divaga', async () => {
  const input = { turns: CONVERSATION, ctxOutcome: 'en_curso', now: NOW, durationSeconds: 12, timeZone: 'Europe/Madrid' }
  const good = await classifyCallOutcome(input, {
    complete: async messages => {
      assert.equal(messages[0].role, 'system')
      assert.match(messages[1].content, /\[00:04\] prospecto: Sí, dime/)
      return '{"outcome":"meeting_scheduled","summary":"El contacto quiere verlo mañana a las diez.","sentiment":"positive","callbackAt":null,"meetingAt":"2026-09-25T10:00:00+02:00","highIntent":true}'
    },
  })
  assert.equal(good.outcome, 'meeting_scheduled')
  assert.equal(good.meetingAt, '2026-09-25T08:00:00.000Z')
  assert.equal(good.source, 'llm')

  const slow = await classifyCallOutcome(input, {
    timeoutMs: 500,
    complete: (_messages, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      setTimeout(() => resolve('{"outcome":"interested","summary":"tarde","sentiment":"neutral"}'), 5_000).unref()
    }),
  })
  assert.equal(slow.source, 'fallback')
  assert.equal(slow.outcome, 'none')

  const broken = await classifyCallOutcome(input, { complete: async () => { throw new Error('Cerebras 500') } })
  assert.equal(broken.source, 'fallback')
  const chatty = await classifyCallOutcome(input, { complete: async () => 'La llamada fue estupenda, enhorabuena.' })
  assert.equal(chatty.source, 'fallback')
})

test('sin turnos del prospecto no se llama al modelo', async () => {
  let calls = 0
  const result = await classifyCallOutcome({ turns: [CONVERSATION[0]], ctxOutcome: 'en_curso', now: NOW }, { complete: async () => { calls++; return '{}' } })
  assert.equal(calls, 0)
  assert.equal(result.outcome, 'none')
  const machine = await classifyCallOutcome({ turns: [], ctxOutcome: 'voicemail', now: NOW }, { complete: async () => { calls++; return '{}' } })
  assert.equal(calls, 0)
  assert.equal(machine.outcome, 'voicemail')
})

test('el prompt fija fecha, zona horaria y el vocabulario cerrado', () => {
  const [system, user] = buildClassifierMessages({ turns: CONVERSATION, ctxOutcome: 'en_curso', now: NOW, timeZone: 'Europe/Madrid', endReason: 'remote_hangup', businessName: 'Bar Pepe' })
  assert.match(system.content, /2026-09-24 11:00/)
  assert.match(system.content, /Europe\/Madrid/)
  for (const outcome of ['meeting_scheduled', 'interested', 'human_requested', 'callback_requested', 'not_interested', 'wrong_number', 'voicemail', 'ivr', 'none']) {
    assert.match(system.content, new RegExp(`"${outcome}"`))
  }
  assert.match(user.content, /Bar Pepe/)
  assert.match(user.content, /remote_hangup/)
})


test('English agents request English summaries, including provider failures and silent calls', async () => {
  const input = { turns: CONVERSATION, ctxOutcome: 'en_curso', language: 'en' as const, durationSeconds: 12 }
  const result = await classifyCallOutcome(input, { complete: async messages => {
    assert.match(messages[0].content, /summary.*English/)
    assert.doesNotMatch(messages[0].content, /frases en español/)
    throw new Error('provider unavailable')
  } })
  assert.match(result.summary, /The call lasted 12 seconds/)
  assert.match(fallbackOutcome({ ...input, turns: [] }).summary, /Only the agent spoke/)
  assert.match(fallbackOutcome({ ...input, ctxOutcome: 'optout' }).summary, /asked not to receive/)
  assert.match(fallbackOutcome({ ...input, ctxOutcome: 'human_requested' }).summary, /team member/)
  assert.match(fallbackOutcome({ ...input, ctxOutcome: 'callback_requested' }).summary, /callback is pending/)
  assert.match(fallbackOutcome({ ...input, ctxOutcome: 'voicemail' }).summary, /Voicemail/)
  assert.match(buildClassifierMessages({ ...input, language: 'es' })[0].content, /frases en español/)
})
