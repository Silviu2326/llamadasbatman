import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CALL_OUTCOME,
  isHumanConversation,
  isQualifyingOutcome,
  isValidCallOutcome,
  normalizeCallOutcome,
} from '../lib/callOutcome'

/**
 * `Call.outcome` es la base del embudo económico de Ads (docs/vendrava/ads.md
 * §4.4). Estas pruebas fijan el vocabulario para que nadie vuelva a introducir
 * valores que no se escriben nunca: antes de cerrarlo, tres pantallas
 * filtraban por `rejected` y `callback` y contaban cero para siempre.
 */

test('los resultados que escribe el motor de voz son válidos', () => {
  // OUTCOME_MAP de voice/telephony/mediaStream.ts
  for (const outcome of ['meeting_scheduled', 'callback_requested', 'not_interested', 'none']) {
    assert.equal(isValidCallOutcome(outcome), true, `${outcome} debería ser canónico`)
  }
  // Clasificación de máquina de voice/telephony/amdService.ts
  for (const outcome of ['voicemail', 'ivr', 'fax_or_noise', 'unknown']) {
    assert.equal(isValidCallOutcome(outcome), true, `${outcome} debería ser canónico`)
  }
})

test('cualifican la reunión, la transferencia a una persona y el interés explícito', () => {
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.MEETING_SCHEDULED), true)
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.TRANSFERRED_TO_HUMAN), true)
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.INTERESTED), true)
})

test('no cualifican el rechazo ni las llamadas sin interlocutor', () => {
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.NOT_INTERESTED), false)
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.VOICEMAIL), false)
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.IVR), false)
  assert.equal(isQualifyingOutcome(CALL_OUTCOME.NONE), false)
})

test('un rechazo es conversación humana; un buzón de voz no', () => {
  assert.equal(isHumanConversation(CALL_OUTCOME.NOT_INTERESTED), true)
  assert.equal(isHumanConversation(CALL_OUTCOME.VOICEMAIL), false)
  assert.equal(isHumanConversation(CALL_OUTCOME.FAX_OR_NOISE), false)
})

test('los alias antiguos se traducen al vocabulario canónico', () => {
  assert.equal(normalizeCallOutcome('rejected'), CALL_OUTCOME.NOT_INTERESTED)
  assert.equal(normalizeCallOutcome('optout'), CALL_OUTCOME.NOT_INTERESTED)
  assert.equal(normalizeCallOutcome('callback'), CALL_OUTCOME.TRANSFERRED_TO_HUMAN)
  assert.equal(normalizeCallOutcome('transferido'), CALL_OUTCOME.TRANSFERRED_TO_HUMAN)
  assert.equal(normalizeCallOutcome('demo_agendada'), CALL_OUTCOME.MEETING_SCHEDULED)
  assert.equal(normalizeCallOutcome('qualified'), CALL_OUTCOME.INTERESTED)
  assert.equal(normalizeCallOutcome('  MEETING_SCHEDULED  '), CALL_OUTCOME.MEETING_SCHEDULED)
})

test('un valor desconocido devuelve null y no se degrada a "none"', () => {
  // Degradarlo silenciosamente convertiría una llamada cualificada en una
  // llamada sin resultado y bajaría el CPQL sin que nadie lo notara.
  assert.equal(normalizeCallOutcome('inventado_por_el_proveedor'), null)
  assert.equal(normalizeCallOutcome(''), null)
  assert.equal(normalizeCallOutcome(undefined), null)
  assert.equal(normalizeCallOutcome(42), null)
})
