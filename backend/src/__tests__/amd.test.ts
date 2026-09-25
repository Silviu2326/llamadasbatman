import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAmd, classifyOpeningSpeech } from '../voice/telephony/amd'

test('AMD maps Twilio machine and fax results', () => {
  assert.equal(classifyAmd({ answeredBy: 'machine_end_beep' }).classification, 'VOICEMAIL')
  assert.equal(classifyAmd({ answeredBy: 'fax' }).classification, 'FAX_OR_NOISE')
})

test('AMD reconoce recepción e IVR también en inglés', () => {
  // El motor de voz llama en inglés: sin esto, una recepcionista pasaba por
  // decisor y el agente le soltaba el pitch entero.
  assert.equal(classifyAmd({ answeredBy: 'human', speechResult: 'Good morning, reception, who is calling?' }).classification, 'GATEKEEPER')
  assert.equal(classifyAmd({ speechResult: 'For sales press 1, for support press 2' }).classification, 'IVR')
})

test('AMD recognizes gatekeeper and IVR opening speech', () => {
  assert.equal(classifyAmd({ answeredBy: 'human', speechResult: 'Buenos días, recepción' }).classification, 'GATEKEEPER')
  assert.equal(classifyAmd({ speechResult: 'Marque una opción' }).classification, 'IVR')
})

test('una frase débil suelta no cuelga a una persona; una fuerte o dos débiles sí', () => {
  // Frases que dicen personas de verdad al descolgar: nunca son máquina.
  assert.equal(classifyOpeningSpeech('¿Para hablar con quién?').classification, 'HUMAN')
  assert.equal(classifyOpeningSpeech('El gerente no está disponible ahora').classification, 'HUMAN')
  assert.equal(classifyOpeningSpeech('Sí, ¿qué extensión busca?').classification, 'HUMAN')
  assert.equal(classifyOpeningSpeech('Le paso con el contestador de mi jefe, espere').classification, 'HUMAN')
  // Fuertes: una basta.
  assert.equal(classifyOpeningSpeech('Deje su mensaje después de la señal').classification, 'VOICEMAIL')
  assert.equal(classifyOpeningSpeech('Please leave a message after the tone').classification, 'VOICEMAIL')
  assert.equal(classifyOpeningSpeech('Bienvenido, pulse 1 para ventas').classification, 'IVR')
  assert.equal(classifyOpeningSpeech('For sales press 1, for support press 2').classification, 'IVR')
  // Débiles: dos distintas.
  assert.equal(classifyOpeningSpeech('El número al que llama no está disponible, contestador automático').classification, 'VOICEMAIL')
  assert.equal(classifyOpeningSpeech('El teléfono no está disponible. Deje un mensaje de voz').classification, 'VOICEMAIL')
  assert.equal(classifyOpeningSpeech('Marque una opción').classification, 'IVR')
  assert.equal(classifyAmd({ speechResult: 'Para hablar con quién' }).classification, 'UNKNOWN')
})
