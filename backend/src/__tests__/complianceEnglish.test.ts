import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectOptout,
  detectRecordingConsentResponse,
  detectTransferRequest,
  disclosureLine,
  isEnglish,
  mustGetRecordingConsent,
  openingGreeting,
} from '../voice/compliance'

test('opt-out se detecta en español y en inglés', () => {
  assert.ok(detectOptout('por favor no me vuelvan a llamar'))
  assert.ok(detectOptout('Do not call me again'))
  assert.ok(detectOptout('please stop calling'))
  assert.ok(detectOptout('take me off your list'))
  assert.equal(detectOptout('me interesa, cuénteme más'), false)
  assert.equal(detectOptout('sounds interesting, tell me more'), false)
})

test('transferencia a humano se detecta en español y en inglés', () => {
  assert.ok(detectTransferRequest('quiero hablar con un humano'))
  assert.ok(detectTransferRequest('I want a human'))
  assert.ok(detectTransferRequest('can I talk to a person please'))
  assert.ok(detectTransferRequest("i don't want to talk to a robot"))
  assert.equal(detectTransferRequest('how does the product work'), false)
})

test('disclosure y consentimiento de grabación localizados', () => {
  assert.ok(disclosureLine('Alex', 'en-US').includes('AI assistant'))
  assert.ok(disclosureLine('Alex', 'es').includes('asistente de IA'))
  assert.ok(mustGetRecordingConsent('en').includes('record this call'))
  assert.ok(mustGetRecordingConsent('es').includes('grabamos esta llamada'))
  assert.ok(isEnglish('en-US'))
  assert.equal(isEnglish('es-MX'), false)
})

test('la apertura comercial incluye disclosure, presentación y consentimiento pendiente', () => {
  const english = openingGreeting({ agentName: 'Sam', companyName: 'Acme', lang: 'en-US', recordingConsentPending: true })
  assert.ok(english.includes('AI assistant'))
  assert.ok(english.includes('This is Sam, from Acme'))
  assert.ok(english.includes('record this call'))
  const spanish = openingGreeting({ lang: 'es' })
  assert.ok(spanish.includes('asistente de IA'))
  assert.ok(spanish.includes('Soy Alex, de VozIA'))
  assert.equal(spanish.includes('grabamos esta llamada'), false)
})

test('respuesta de consentimiento de grabación bilingüe', () => {
  assert.equal(detectRecordingConsentResponse('sí, claro'), 'granted')
  assert.equal(detectRecordingConsentResponse('yes, go ahead'), 'granted')
  assert.equal(detectRecordingConsentResponse('sure, no problem'), 'granted')
  assert.equal(detectRecordingConsentResponse('no, prefiero que no'), 'denied')
  assert.equal(detectRecordingConsentResponse("please don't record this"), 'denied')
  assert.equal(detectRecordingConsentResponse('no'), 'denied')
  assert.equal(detectRecordingConsentResponse('what is this about?'), null)
})
