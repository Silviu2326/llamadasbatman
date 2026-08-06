import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTONOMOUS_CHANGES, HUMAN_ONLY_CHANGES, SENSITIVE_CONTENT_RULES } from '../services/landingAutonomy.service'

/**
 * Guardarraíles de docs/vendrava/landings.md §10.
 *
 * Estas pruebas existen para que aflojar un guardarraíl sea un acto consciente
 * y visible en el diff, no un efecto colateral de "mejorar" una expresión
 * regular. Lo que protegen es que N3 no publique por su cuenta un precio, una
 * garantía, una afirmación sanitaria ni el nombre de un cliente.
 */

function firstMatch(text: string) {
  return SENSITIVE_CONTENT_RULES.find(rule => rule.pattern.test(text))?.reason ?? null
}

test('los precios y promociones nunca pasan como texto inocente', () => {
  // «9 €» fue un fallo real: el `\b` tras el símbolo nunca casa porque «€» no
  // es carácter de palabra, y el texto se colaba.
  for (const text of ['Desde 9 € al mes', 'Solo 49€ este mes', 'Presupuesto sin coste', 'Precio cerrado', 'Oferta de verano', 'Gratis hoy']) {
    assert.equal(firstMatch(text), 'menciona precios o promociones', `debería bloquear: ${text}`)
  }
})

test('las garantías exigen persona', () => {
  for (const text of ['Garantía total', 'Te devolvemos el dinero', 'Resultado garantizado']) {
    assert.equal(firstMatch(text), 'incluye una garantía', `debería bloquear: ${text}`)
  }
})

test('las afirmaciones legales o sanitarias exigen persona', () => {
  for (const text of ['Producto homologado', 'Tratamiento médico', 'Asesoría jurídica certificada']) {
    assert.equal(firstMatch(text), 'contiene afirmaciones legales o sanitarias', `debería bloquear: ${text}`)
  }
})

test('la prueba social se detecta en singular y en plural', () => {
  for (const text of ['Lo que dicen nuestros clientes reales', 'Un testimonio de verdad', 'Casos de éxito', 'Opiniones de clientes']) {
    assert.equal(firstMatch(text), 'usa prueba social', `debería bloquear: ${text}`)
  }
})

test('las condiciones contractuales exigen persona', () => {
  for (const text of ['Sin permanencia ni cláusulas', 'Consulta el contrato']) {
    assert.equal(firstMatch(text), 'toca condiciones contractuales', `debería bloquear: ${text}`)
  }
})

test('un CTA neutro sigue siendo automatizable', () => {
  for (const text of ['Habla con nosotros', 'Pide tu cita hoy', 'Cuéntanos qué necesitas', 'Reserva tu visita']) {
    assert.equal(firstMatch(text), null, `no debería bloquear: ${text}`)
  }
})

test('las dos listas de §10 no se solapan', () => {
  const autonomous = new Set<string>(Object.values(AUTONOMOUS_CHANGES))
  for (const forbidden of Object.values(HUMAN_ONLY_CHANGES)) {
    assert.equal(autonomous.has(forbidden), false, `${forbidden} no puede estar en ambas listas`)
  }
})

test('la lista de cambios automáticos es exactamente la de §10', () => {
  assert.deepEqual(
    Object.values(AUTONOMOUS_CHANGES).sort(),
    ['block_order', 'cta_text', 'faq', 'hero_variant', 'optional_field'],
  )
})
