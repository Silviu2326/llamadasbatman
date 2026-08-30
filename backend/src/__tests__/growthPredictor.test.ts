import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetForOneSale, project, recommendations, type PredictorSnapshot } from '../services/growthPredictor.service'

function snapshot(overrides: Partial<PredictorSnapshot> = {}): PredictorSnapshot {
  return {
    currency: 'EUR',
    windowDays: 90,
    history: { calls: 200, conversations: 80, qualified: 30, opportunities: 15, won: 3, revenue: 6000, adSpend: 0 },
    rates: {
      contact: { value: 0.4, source: 'own', sample: 200 },
      qualify: { value: 0.375, source: 'own', sample: 80 },
      opportunity: { value: 0.5, source: 'own', sample: 30 },
      win: { value: 0.2, source: 'own', sample: 15 },
    },
    dealValue: { value: 2000, source: 'own', sample: 3 },
    costPerMinute: 0.06,
    minutesPerCall: 3,
    ...overrides,
  }
}

test('la proyección encadena el embudo y no inventa ingresos', () => {
  const result = project(snapshot(), 180, 'pro')
  // 180 € / (0,06 × 3) = 1000 llamadas
  assert.equal(result.calls, 1000)
  assert.equal(result.conversations, 400)
  assert.equal(result.qualified, 150)
  assert.equal(result.opportunities, 75)
  assert.equal(result.sales, 15)
  assert.equal(result.revenue, 30_000)
  assert.equal(result.profit, 29_820)
})

test('avisa cuando el plan no da para tantos minutos', () => {
  // free = 60 minutos al mes; 1000 llamadas de 3 minutos son 3000.
  const capped = project(snapshot(), 180, 'free')
  assert.ok(capped.planCap)
  assert.equal(capped.planCap?.minutes, 60)
  assert.equal(capped.planCap?.exceededBy, 2940)

  // completo = 10.000 minutos: 3000 caben de sobra.
  assert.equal(project(snapshot(), 180, 'completo').planCap, null)
})

test('el presupuesto para una venta sale del embudo, no de un número redondo', () => {
  // 0,4 × 0,375 × 0,5 × 0,2 = 0,015 → 67 llamadas × 0,18 € = 13 €
  assert.equal(budgetForOneSale(snapshot()), 13)
})

test('sin muestra suficiente, la primera recomendación es conseguir muestra', () => {
  const sinDatos = snapshot({ history: { calls: 4, conversations: 1, qualified: 0, opportunities: 0, won: 0, revenue: 0, adSpend: 0 } })
  const list = recommendations(sinDatos)
  assert.equal(list[0].id, 'no-data')
  assert.match(list[0].detail, /4 llamadas/)
})

test('señala la etapa débil del embudo, no el presupuesto', () => {
  const malContacto = snapshot({
    rates: { ...snapshot().rates, contact: { value: 0.1, source: 'own', sample: 200 } },
  })
  const ids = recommendations(malContacto).map(item => item.id)
  assert.ok(ids.includes('contact-rate'))
})

test('avisa si los anuncios no se pagan solos', () => {
  const conAds = snapshot({ history: { calls: 200, conversations: 80, qualified: 30, opportunities: 15, won: 3, revenue: 1000, adSpend: 900 } })
  assert.ok(recommendations(conAds).some(item => item.id === 'ads-roi'))
})
