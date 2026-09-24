import assert from 'node:assert/strict'
import test from 'node:test'
import { detectOptout, detectRecordingConsentResponse, detectTransferRequest, detectVoiceConsentReply } from '../voice/compliance'

test('detectOptout entiende usted, tuteo, vosotros e impersonales, con o sin acentos', () => {
  const optouts = [
    'No me llamen más, por favor.', 'no me vuelva a llamar', '¡No me llames!', 'no me vuelvas a llamar nunca',
    'Bórrame de la lista, quítame de la lista', 'no me llaméis más', 'no me llameis', 'Dejadme en paz.', 'quitadme de la lista',
    'dad de baja mi número', 'No quiero recibir más llamadas', 'estoy en la lista Robinson', 'que no me llamen mas',
    'please do not call this number again',
  ]
  for (const text of optouts) assert.equal(detectOptout(text), true, text)
  const notOptouts = ['sí, llámame mañana', 'me interesa, ¿me llamas luego?', 'ahora no puedo hablar', '', 'no, gracias, ya tenemos proveedor']
  for (const text of notOptouts) assert.equal(detectOptout(text), false, text)
})

test('detectTransferRequest reconoce el tuteo y el plural', () => {
  for (const text of ['Pásame con alguien', 'pasadme con alguien de verdad', '¿Que me llame una persona?', 'No quiero hablar con una máquina']) {
    assert.equal(detectTransferRequest(text), true, text)
  }
  assert.equal(detectTransferRequest('vale, sigue contándome'), false)
})

test('detectVoiceConsentReply en español: afirmaciones cortas, negaciones y respuestas sin oferta', () => {
  for (const text of ['Sí, claro', 'vale', 'Llamadme cuando queráis', 'Perfecto, llámame', 'de acuerdo', 'sin problema']) {
    assert.equal(detectVoiceConsentReply(text, true), true, text)
  }
  for (const text of ['No, gracias', 'prefiero que no', 'nunca', 'no me llames', 'sí pero no me llaméis']) {
    assert.equal(detectVoiceConsentReply(text, true), false, text)
  }
  // Sin oferta previa solo vale si la respuesta pide expresamente la llamada de IA.
  assert.equal(detectVoiceConsentReply('vale', false), false)
  assert.equal(detectVoiceConsentReply('sí, que me llame el asistente de IA', false), true)
})

test('detectRecordingConsentResponse en español', () => {
  for (const text of ['Sí, sin problema', 'No hay problema', 'no pasa nada, graba', 'Como quieras', 'Vale, perfecto', 'lo acepto', 'por mí bien']) {
    assert.equal(detectRecordingConsentResponse(text), 'granted', text)
  }
  for (const text of ['No', 'no quiero que me grabes', 'No me grabéis', 'prefiero que no', 'sin grabación por favor', 'no lo autorizo', 'ni hablar']) {
    assert.equal(detectRecordingConsentResponse(text), 'denied', text)
  }
  assert.equal(detectRecordingConsentResponse('¿qué empresa me has dicho?'), null)
  assert.equal(detectRecordingConsentResponse(''), null)
})
