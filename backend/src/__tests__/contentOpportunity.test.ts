import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OPPORTUNITY_TYPES, findLiteralQuote, verifyOpportunity, weekOf } from '../services/contentOpportunity.service'

/**
 * Verificación de oportunidades del Radar (`docs/vendrava/pantallas.md` §1).
 *
 * Lo que protegen estas pruebas es la frase que sostiene toda la pantalla:
 * "8 menciones en 12 llamadas". Si ese número puede salir de ids inventados, la
 * tarjeta es una alucinación con aspecto de dato, y el usuario tomaría
 * decisiones de contenido sobre algo que nadie dijo nunca.
 */

const valid = new Set(['call-1', 'call-2', 'call-3', 'call-4'])
const base = { type: 'objection', title: 'El plazo frena', summary: 'Preguntan por el plazo.' }

test('una propuesta con evidencia real se acepta', () => {
  const result = verifyOpportunity({ ...base, sourceIds: ['call-1', 'call-2', 'call-3'] }, valid)
  assert.ok(result)
  assert.equal(result.evidenceCount, 3)
})

test('los ids inventados se caen enteros', () => {
  const result = verifyOpportunity({ ...base, sourceIds: ['inventado-1', 'inventado-2', 'inventado-3'] }, valid)
  assert.equal(result, null)
})

test('una mezcla de real e inventado no alcanza el mínimo', () => {
  // Lo peligroso no es el id falso: es que sumado a uno real dé una cifra
  // creíble. Solo cuentan los que existen.
  const result = verifyOpportunity({ ...base, sourceIds: ['call-1', 'inventado-1', 'inventado-2'] }, valid)
  assert.equal(result, null)
})

test('por debajo de tres conversaciones no es una señal, es una anécdota', () => {
  assert.equal(verifyOpportunity({ ...base, sourceIds: ['call-1', 'call-2'] }, valid), null)
})

test('los ids repetidos no inflan el conteo', () => {
  const result = verifyOpportunity({ ...base, sourceIds: ['call-1', 'call-1', 'call-1', 'call-2', 'call-3'] }, valid)
  assert.equal(result?.evidenceCount, 3)
})

test('un tipo fuera del vocabulario se rechaza', () => {
  const result = verifyOpportunity({ ...base, type: 'inventado', sourceIds: ['call-1', 'call-2', 'call-3'] }, valid)
  assert.equal(result, null)
})

test('sin título o sin resumen no hay tarjeta que mostrar', () => {
  assert.equal(verifyOpportunity({ ...base, title: '  ', sourceIds: ['call-1', 'call-2', 'call-3'] }, valid), null)
  assert.equal(verifyOpportunity({ ...base, summary: '', sourceIds: ['call-1', 'call-2', 'call-3'] }, valid), null)
})

test('el vocabulario de tipos es el de pantallas.md', () => {
  assert.deepEqual(
    [...OPPORTUNITY_TYPES].sort(),
    ['competitor', 'emotional', 'faq', 'objection', 'pre_purchase', 'success_story'],
  )
})

test('la semana empieza en lunes y no se mueve dentro de la misma semana', () => {
  const miercoles = weekOf(new Date('2026-08-05T18:00:00Z'))
  const viernes = weekOf(new Date('2026-08-07T09:00:00Z'))
  assert.equal(miercoles.toISOString().slice(0, 10), '2026-08-03')
  assert.equal(miercoles.getTime(), viernes.getTime())
})

test('un domingo pertenece a su semana, no a la siguiente', () => {
  assert.equal(weekOf(new Date('2026-08-09T23:00:00Z')).toISOString().slice(0, 10), '2026-08-03')
})

/**
 * Citas literales — la regla de privacidad del `README.md`: las tarjetas
 * muestran conteos y paráfrasis, nunca lo que dijo alguien con sus palabras.
 * Sin consentimiento registrado no hay cita, y no existe forma de darlo por
 * pieza: aquí la regla es que no se cita nunca.
 *
 * El prompt ya lo pide, pero un prompt no es una garantía: esto comprueba lo
 * que el modelo devolvió contra el material del que salió.
 */

const TRANSCRIPCION = [
  'Cliente: si tardais mas de una semana no me sirve, tengo la obra parada esperando.',
  'Agente: lo normal son cuatro dias desde que aceptas el presupuesto.',
].join('\n')

test('una tarjeta que cita al cliente no llega a la pantalla', () => {
  // Perder una tarjeta es más barato que publicar la frase de una persona.
  const citando = {
    ...base,
    summary: 'Si tardáis más de una semana no me sirve, tengo la obra parada esperando.',
    sourceIds: ['call-1', 'call-2', 'call-3'],
  }
  assert.equal(verifyOpportunity(citando, valid, [TRANSCRIPCION]), null)
  // Y con el título, igual: la tarjeta entera es lo que se enseña.
  assert.equal(
    verifyOpportunity({ ...citando, title: citando.summary, summary: base.summary }, valid, [TRANSCRIPCION]),
    null,
  )
})

test('la evidencia citada se cae sola, sin llevarse la oportunidad', () => {
  // La tarjeta sigue teniendo conteos y resumen, que es lo que pide el
  // documento; lo único que se pierde es el texto que copiaba a alguien.
  const result = verifyOpportunity({
    ...base,
    evidenceSummary: 'Si tardáis más de una semana no me sirve, tengo la obra parada esperando.',
    sourceIds: ['call-1', 'call-2', 'call-3'],
  }, valid, [TRANSCRIPCION])

  assert.ok(result)
  assert.equal(result.evidenceSummary, null)
  assert.equal(result.evidenceCount, 3)
})

test('la paráfrasis pasa: es lo que la pantalla tiene que enseñar', () => {
  const result = verifyOpportunity({
    ...base,
    summary: 'Ocho personas preguntan cuánto se tarda y creen que son semanas.',
    evidenceSummary: '8 menciones del plazo en 8 llamadas distintas.',
    sourceIds: ['call-1', 'call-2', 'call-3'],
  }, valid, [TRANSCRIPCION])

  assert.ok(result)
  assert.equal(result.evidenceSummary, '8 menciones del plazo en 8 llamadas distintas.')
})

test('la cita se reconoce aunque cambien las tildes y la puntuación', () => {
  // Es justo lo que hace un modelo al "citar": reescribe los acentos y las
  // comas. Comparar el texto tal cual dejaría pasar la frase entera.
  assert.ok(findLiteralQuote('«Si tardais mas de una semana, no me sirve»', [TRANSCRIPCION]))
  // Y una coincidencia corta no es una cita, es el idioma.
  assert.equal(findLiteralQuote('No me sirve', [TRANSCRIPCION]), null)
  // Sin material contra el que comparar no se inventa un veredicto.
  assert.equal(findLiteralQuote('Si tardáis más de una semana no me sirve, tengo la obra parada', []), null)
})
