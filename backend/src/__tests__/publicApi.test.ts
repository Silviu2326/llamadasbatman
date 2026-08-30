import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { looksLikeApiKey, mintApiKey } from '../services/apiKeys.service'
import { isWebhookTopic, signPayload, WEBHOOK_TOPICS } from '../services/webhooks.service'

test('las claves se emiten con prefijo, hash y nada reconstruible', () => {
  const first = mintApiKey()
  const second = mintApiKey()
  assert.ok(first.key.startsWith('vk_'))
  assert.notEqual(first.key, second.key)
  assert.notEqual(first.keyHash, second.keyHash)
  // El prefijo se guarda para identificar la clave en la lista, pero no puede
  // contener el secreto entero: es lo único que queda visible tras crearla.
  assert.ok(!first.prefix.includes(first.key.slice(3)))
  assert.ok(first.prefix.length < first.key.length)
  assert.equal(looksLikeApiKey(first.key), true)
  assert.equal(looksLikeApiKey('vk_corto'), false)
  assert.equal(looksLikeApiKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc'), false)
  assert.equal(looksLikeApiKey(undefined), false)
})

test('la firma del webhook es verificable e incluye el instante', () => {
  const secret = 'whsec_prueba'
  const body = JSON.stringify({ topic: 'lead.created', data: { leadId: 'lead_1' } })
  const header = signPayload(secret, body, 1_700_000_000)
  const [t, v1] = header.split(',').map(part => part.split('=')[1])
  assert.equal(t, '1700000000')
  assert.equal(v1, createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'))
  // Cambiar el cuerpo invalida la firma: es lo que impide reenviar un payload
  // manipulado con la cabecera original.
  assert.notEqual(signPayload(secret, `${body} `, 1_700_000_000), header)
  assert.notEqual(signPayload(`${secret}x`, body, 1_700_000_000), header)
})

test('solo se suscriben topics que el producto emite de verdad', () => {
  assert.equal(isWebhookTopic('lead.created'), true)
  assert.equal(isWebhookTopic('opportunity.won'), true)
  assert.equal(isWebhookTopic('lead.inventado'), false)
  assert.equal(isWebhookTopic(''), false)
  assert.ok(WEBHOOK_TOPICS.length > 0)
})
