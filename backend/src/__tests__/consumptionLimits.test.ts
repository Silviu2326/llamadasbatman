import assert from 'node:assert/strict'
import test from 'node:test'
import { CONSUMPTION_LIMITS, CONSUMPTION_RESOURCES, periodStart } from '../access-control/consumption'
import { PLAN_KEYS } from '../access-control/entitlements'

test('ningún plan se queda sin techo de consumo', () => {
  for (const plan of PLAN_KEYS) {
    for (const resource of CONSUMPTION_RESOURCES) {
      const limit = CONSUMPTION_LIMITS[plan]?.[resource]
      // Un plan sin límite es una factura abierta: es justo el fallo a evitar.
      assert.ok(Number.isFinite(limit) && limit > 0, `${plan}.${resource} sin límite`)
    }
  }
})

test('los planes superiores nunca tienen menos cuota que los inferiores', () => {
  for (const resource of CONSUMPTION_RESOURCES) {
    const values = PLAN_KEYS.map(plan => CONSUMPTION_LIMITS[plan][resource])
    const ordered = [...values].sort((a, b) => a - b)
    assert.deepEqual(values, ordered, `${resource} no crece con el plan`)
  }
})

test('el periodo empieza el día 1 del mes en UTC', () => {
  const start = periodStart(new Date('2026-08-11T22:30:00Z'))
  assert.equal(start.toISOString(), '2026-08-01T00:00:00.000Z')
  // Un cambio de mes no puede contar el consumo del mes anterior.
  assert.equal(periodStart(new Date('2026-09-01T00:00:01Z')).toISOString(), '2026-09-01T00:00:00.000Z')
})
