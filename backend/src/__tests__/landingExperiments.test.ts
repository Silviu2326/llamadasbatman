import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignVariantKey, twoProportionZ } from '../services/landingExperiments.service'

/**
 * Reglas del A/B de docs/xarly/landings.md §9. Lo que protegen estas pruebas
 * es la frase que más daño haría si dejara de cumplirse: **nunca una ganadora
 * con 17 visitas**.
 */

test('la asignación es estable para la misma sesión', () => {
  const keys = ['a', 'b']
  const first = assignVariantKey('sesion-123', keys)
  for (let attempt = 0; attempt < 20; attempt++) {
    assert.equal(assignVariantKey('sesion-123', keys), first)
  }
})

test('el reparto entre variantes es razonablemente equilibrado', () => {
  const counts: Record<string, number> = { a: 0, b: 0 }
  for (let index = 0; index < 2000; index++) {
    counts[assignVariantKey(`sesion-${index}`, ['a', 'b'])!] += 1
  }
  const share = counts.a / 2000
  assert.ok(share > 0.45 && share < 0.55, `reparto desequilibrado: ${share}`)
})

test('sin variantes no hay asignación', () => {
  assert.equal(assignVariantKey('sesion', []), null)
})

test('17 visitas por variante nunca alcanzan significación', () => {
  // El caso literal de §9: 1 de 17 frente a 3 de 17 parece un +200%.
  const statistic = twoProportionZ({ exposures: 17, conversions: 1 }, { exposures: 17, conversions: 3 })
  assert.ok(statistic !== null)
  assert.ok(Math.abs(statistic.z) < 1.96, `z = ${statistic.z} no debería superar el umbral`)
})

test('una diferencia real con volumen sí alcanza significación', () => {
  const statistic = twoProportionZ({ exposures: 900, conversions: 36 }, { exposures: 900, conversions: 72 })
  assert.ok(statistic !== null)
  assert.ok(Math.abs(statistic.z) >= 1.96, `z = ${statistic.z} debería superar el umbral`)
  assert.equal(statistic.lift, 1)
})

test('una diferencia mínima con mucho volumen no se declara ganadora', () => {
  const statistic = twoProportionZ({ exposures: 900, conversions: 36 }, { exposures: 900, conversions: 38 })
  assert.ok(statistic !== null)
  assert.ok(Math.abs(statistic.z) < 1.96, `z = ${statistic.z} no debería superar el umbral`)
})

test('sin exposición no se calcula estadístico', () => {
  assert.equal(twoProportionZ({ exposures: 0, conversions: 0 }, { exposures: 100, conversions: 5 }), null)
})

test('el signo del estadístico identifica quién gana', () => {
  const challengerWins = twoProportionZ({ exposures: 900, conversions: 36 }, { exposures: 900, conversions: 90 })
  const controlWins = twoProportionZ({ exposures: 900, conversions: 90 }, { exposures: 900, conversions: 36 })
  assert.ok((challengerWins?.z ?? 0) > 0)
  assert.ok((controlWins?.z ?? 0) < 0)
})
