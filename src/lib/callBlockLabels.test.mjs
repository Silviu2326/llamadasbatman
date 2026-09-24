// node --test src/lib/callBlockLabels.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { CALL_BLOCK_LABELS, callBlockReasonLabel, describeCallBlock, gatewayCodeLabel } from './callBlockLabels.js'

test('cubre todos los motivos del dispatch (espejo de CALL_BLOCK_LABELS del backend)', () => {
  for (const reason of ['lead_without_phone', 'max_attempts', 'no_campaign', 'campaign_changed', 'campaign_inactive', 'agent_missing', 'agent_not_active', 'agent_incomplete', 'agent_voice_consent_missing', 'agent_limits', 'white_label_quota', 'invalid_phone', 'quota_exceeded', 'optout', 'outside_hours', 'missing_voice_consent', 'gateway_rejected']) {
    assert.ok(CALL_BLOCK_LABELS[reason], reason)
  }
  assert.equal(callBlockReasonLabel('agent_limits'), CALL_BLOCK_LABELS.agent_limits)
  assert.match(callBlockReasonLabel('algo_nuevo'), /algo_nuevo/)
})

test('traduce códigos de pasarela y detalles del dispatch', () => {
  assert.match(gatewayCodeLabel('ZADARMA_PHONE_MISMATCH'), /número del agente/)
  assert.match(gatewayCodeLabel('ORIGINATE_INVALID'), /No se llegó a llamar/)
  assert.match(gatewayCodeLabel('ZADARMA_GATEWAY_CALL_FAILED_503'), /no está disponible/)
  assert.equal(gatewayCodeLabel('daily_limit'), 'tope de llamadas diarias alcanzado')
  assert.equal(gatewayCodeLabel('voice,phone'), 'falta la voz, falta el número de salida')
  assert.equal(gatewayCodeLabel('XYZ'), '')
  assert.equal(gatewayCodeLabel(null), '')
})

test('describeCallBlock compone motivo y detalle, y deja el código crudo entre paréntesis si no lo conoce', () => {
  assert.equal(describeCallBlock({ reason: 'optout' }), CALL_BLOCK_LABELS.optout)
  assert.equal(describeCallBlock({ reason: 'gateway_rejected', detail: 'ZADARMA_PHONE_MISMATCH' }), `${CALL_BLOCK_LABELS.gateway_rejected} El número del agente no coincide con la línea configurada en la pasarela. Cambia el número de salida del agente por el de la línea.`)
  assert.equal(describeCallBlock({ reason: 'gateway_rejected', detail: 'RARO_123' }), `${CALL_BLOCK_LABELS.gateway_rejected} (RARO_123)`)
  assert.equal(describeCallBlock({ reason: 'agent_limits', detail: 'daily_limit' }), `${CALL_BLOCK_LABELS.agent_limits} tope de llamadas diarias alcanzado.`)
  assert.equal(describeCallBlock(null), '')
})
