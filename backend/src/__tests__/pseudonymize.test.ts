import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPseudonymizer, findResidualPii } from '../lib/pseudonymize'

/**
 * Seudonimización antes del LLM (`docs/xarly/README.md`): no negociable.
 *
 * Si algo de aquí se rompe, datos personales de clientes reales salen hacia un
 * tercero. Estas pruebas son la línea que impide que eso pase por descuido.
 */

test('teléfonos, emails y DNI no llegan nunca al modelo', () => {
  const p = createPseudonymizer()
  const text = 'Llámame al +34 600 123 456 o escribe a marta.ruiz@empresa.com. Mi DNI es 12345678Z.'
  const output = p.apply(text)

  assert.ok(!output.includes('600 123 456'), 'el teléfono sigue en el texto')
  assert.ok(!output.includes('marta.ruiz@empresa.com'), 'el email sigue en el texto')
  assert.ok(!output.includes('12345678Z'), 'el DNI sigue en el texto')
  assert.match(output, /\[TEL_\d+\]/)
  assert.match(output, /\[EMAIL_\d+\]/)
  assert.match(output, /\[DNI_\d+\]/)
})

test('el mismo valor recibe el mismo token en todo el lote', () => {
  // Sin esto, el mismo cliente en tres llamadas parecería tres personas y el
  // conteo de evidencias del Radar mentiría.
  const p = createPseudonymizer(['Marta Ruiz'])
  const first = p.apply('Marta Ruiz preguntó por el plazo.')
  const second = p.apply('Volvió a llamar Marta Ruiz.')

  const token = /\[CLIENTE_\d+\]/.exec(first)?.[0]
  assert.ok(token, 'no se tokenizó el nombre')
  assert.ok(second.includes(token!), 'el mismo nombre recibió otro token')
})

test('los valores distintos no se confunden', () => {
  const p = createPseudonymizer()
  const output = p.apply('Uno: 600111222. Otro: 600333444.')
  const tokens = new Set(output.match(/\[TEL_\d+\]/g))
  assert.equal(tokens.size, 2)
})

test('el nombre completo se sustituye entero, no solo el nombre de pila', () => {
  const p = createPseudonymizer(['Marta Ruiz'])
  const output = p.apply('Hablé con Marta Ruiz esta mañana.')
  assert.ok(!output.includes('Ruiz'), `el apellido quedó suelto: ${output}`)
})

test('un email no se rompe con el patrón de teléfono', () => {
  // El email va primero justamente por esto: contiene dígitos y puntos.
  const p = createPseudonymizer()
  const output = p.apply('Escríbeme a cliente2024@dominio.com')
  assert.match(output, /\[EMAIL_\d+\]/)
  assert.ok(!output.includes('[TEL_'), `el email se troceó como teléfono: ${output}`)
})

test('no se re-tokeniza lo ya tokenizado', () => {
  const p = createPseudonymizer()
  const once = p.apply('Teléfono 600123456')
  const twice = p.apply(once)
  assert.equal(once, twice)
})

test('los nombres muy cortos no se sustituyen dentro de otras palabras', () => {
  const p = createPseudonymizer(['Ana'])
  const output = p.apply('La mañana de la instalación fue bien.')
  assert.ok(output.includes('mañana'), `destrozó una palabra corriente: ${output}`)
})

test('el mapeo queda en el backend y permite auditar', () => {
  const p = createPseudonymizer(['Marta'])
  p.apply('Marta llamó desde el 600123456')
  const values = Array.from(p.mapping.values())
  assert.ok(values.some(value => value.includes('Marta')))
  assert.equal(p.stats().CLIENTE, 1)
  assert.equal(p.stats().TEL, 1)
})

test('la red de seguridad detecta PII superviviente', () => {
  assert.deepEqual(findResidualPii('todo limpio [CLIENTE_1]'), [])
  const residues = findResidualPii('quedó un email suelto: fuga@empresa.com')
  assert.equal(residues.length, 1)
  assert.equal(residues[0].category, 'EMAIL')
})

test('el texto útil sobrevive: el modelo tiene que poder analizarlo', () => {
  const p = createPseudonymizer(['Marta Ruiz'])
  const output = p.apply('Marta Ruiz preguntó cuánto tarda la instalación y si hay que pagar por adelantado.')
  assert.ok(output.includes('cuánto tarda la instalación'))
  assert.ok(output.includes('pagar por adelantado'))
})
