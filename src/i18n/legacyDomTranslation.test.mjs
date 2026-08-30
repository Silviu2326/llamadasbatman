// La tabla de traduccion sustituye por subcadena, asi que el orden manda: una
// frase corta contenida en otra larga la parte por la mitad ("Cancelar reunion"
// -> "Cancel reunion"). Ese es el bug que arreglaba esta tanda, no puede
// quedarse sin test. Sin framework: node --test src/i18n/legacyDomTranslation.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPhrases, translate } from './legacyDomTranslation.js'

await loadPhrases()

test('la frase larga gana a la corta que contiene', () => {
  // 'Guardar' y 'Guardar cambios' estan los dos en la tabla.
  assert.equal(translate('Guardar cambios'), 'Save changes')
  assert.equal(translate('Guardar'), 'Save')
})

test('conserva los espacios que rodean al texto del nodo', () => {
  assert.equal(translate(' Guardar '), ' Save ')
})

test('un texto sin traduccion se devuelve intacto', () => {
  assert.equal(translate('Rosa Alta Consulting'), 'Rosa Alta Consulting')
  assert.equal(translate(''), '')
})

test('los segmentos alrededor de una interpolacion se traducen por separado', () => {
  // Una frase con ${...} llega al DOM partida; cada trozo se traduce solo.
  const left = translate('Rendimiento de campañas')
  assert.equal(left, 'Campaign performance')
})
