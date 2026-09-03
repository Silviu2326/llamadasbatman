import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreCall } from '../voice/evaluation/callJudge'

test('el juez puntúa con los eventos que el pipeline emite hoy', () => {
  const result = scoreCall([
    { type: 'turn.user_finished', atMs: 100 },
    { type: 'turn.user_finished', atMs: 4000 },
    { type: 'latency.update', atMs: 900, payload: { total: 520, record: true } },
    { type: 'latency.update', atMs: 4800, payload: { total: 610, record: true } },
  ], { outcome: 'meeting_scheduled', transcript: 'agente: ¿Qué usáis hoy?\nprospecto: nada\nagente: Entiendo.' })

  assert.equal(result.dimensions.turnTaking, 100)          // ninguna interrupción
  assert.equal(result.dimensions.voiceNaturalness, 100)    // los dos turnos bajo 650 ms
  assert.equal(result.dimensions.discovery, 100)           // 1 pregunta en 2 turnos del agente
  assert.equal(result.criticalErrors.length, 0)
})

test('una dimensión sin señal vale null y no entra en la media', () => {
  const result = scoreCall([], { outcome: 'none', transcript: null })
  assert.equal(result.dimensions.turnTaking, null)
  assert.equal(result.dimensions.voiceNaturalness, null)
  assert.equal(result.dimensions.discovery, null)
  // objectionHandling ya no tiene productor: nunca se inventa una nota.
  assert.equal(result.dimensions.objectionHandling, null)
  // Solo promedia compliance (100) y crmAccuracy (78).
  assert.equal(result.overall, 89)
})

test('los turnos lentos bajan la naturalidad', () => {
  const result = scoreCall([
    { type: 'latency.update', payload: { total: 1800, record: true } },
    { type: 'latency.update', payload: { total: 2100, record: true } },
  ], { outcome: 'none' })
  assert.equal(result.dimensions.voiceNaturalness, 0)
})

test('las interrupciones constantes bajan el turn-taking', () => {
  const result = scoreCall([
    { type: 'turn.user_finished' },
    { type: 'turn.user_finished' },
    { type: 'barge_in.detected', atMs: 500 },
    { type: 'barge_in.detected', atMs: 900 },
  ], { outcome: 'none' })
  assert.equal(result.dimensions.turnTaking, 40)
})

test('hablar después de un opt-out sigue siendo error crítico', () => {
  const result = scoreCall([
    { type: 'compliance.opt_out', atMs: 100 },
    { type: 'audio.output_started', atMs: 200 },
  ], { outcome: 'not_interested' })
  assert.deepEqual(result.criticalErrors, ['assistant_spoke_after_opt_out'])
  assert.equal(result.dimensions.compliance, 0)
  assert.equal(result.trainingTag, 'critical_error')
})

test('la evaluación real mide saludo, objeción y cierre desde la conversación', () => {
  const result = scoreCall([], {
    outcome: 'meeting_scheduled',
    transcript: [
      'agente: Hola, soy Laura y llamo de Vendrava.',
      'cliente: Ahora no, me parece caro.',
      'agente: Entiendo la preocupación. ¿Qué presupuesto habías previsto?',
      'cliente: Podemos verlo mañana.',
      'agente: Gracias, agendamos la reunión mañana a esta hora.',
    ].join('\n'),
  })
  assert.equal(result.dimensions.greeting, 100)
  assert.equal(result.dimensions.objectionHandling, 100)
  assert.equal(result.dimensions.closing, 100)
})
