// Comprobacion minima de planGate: distinguir "no esta en tu plan" de "el
// servicio se ha caido" es justo el bug que arreglaba esta tanda, asi que la
// rama no puede quedarse sin test. Sin framework: node --test src/lib/planGate.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { planGateMessage, readPlanGate } from './planGate.js'

const fakeResponse = (status, body) => ({
  status,
  clone: () => ({ json: async () => { if (body === undefined) throw new Error('no json'); return body } }),
})

test('403 con codigo de plan se reconoce como bloqueo', async () => {
  const gate = await readPlanGate(fakeResponse(403, {
    error: 'La capacidad "ads" no esta incluida en el plan free',
    code: 'PLAN_CAPABILITY_REQUIRED', capability: 'ads', plan: 'free', upgradeRequired: true,
  }))
  assert.equal(gate.code, 'PLAN_CAPABILITY_REQUIRED')
  assert.equal(gate.capability, 'ads')
  assert.equal(gate.plan, 'free')
})

test('403 de integracion deshabilitada y 409 de limite tambien son bloqueo', async () => {
  const disabled = await readPlanGate(fakeResponse(403, { code: 'INTEGRATION_DISABLED', integration: 'metricool' }))
  assert.equal(disabled.code, 'INTEGRATION_DISABLED')
  const limit = await readPlanGate(fakeResponse(409, { code: 'LIMIT_REACHED', resource: 'leads' }))
  assert.equal(limit.resource, 'leads')
})

test('caidas reales NO son bloqueo de plan: devuelven null', async () => {
  // Esto es lo que importa: si esto devolviera un gate, un 503 real se pintaria
  // como "mejora tu plan" y el usuario no sabria que el servicio esta caido.
  assert.equal(await readPlanGate(fakeResponse(503, { error: 'Service unavailable' })), null)
  assert.equal(await readPlanGate(fakeResponse(500, { error: 'boom' })), null)
  assert.equal(await readPlanGate(fakeResponse(401, { error: 'Unauthorized' })), null)
  assert.equal(await readPlanGate(fakeResponse(200, { ok: true })), null)
})

test('403 sin codigo conocido no se traga como bloqueo de plan', async () => {
  assert.equal(await readPlanGate(fakeResponse(403, { error: 'No tienes permisos' })), null)
  assert.equal(await readPlanGate(fakeResponse(403, undefined)), null)
  assert.equal(await readPlanGate(null), null)
})

test('el mensaje cambia segun el motivo y el idioma', () => {
  const plan = { code: 'PLAN_CAPABILITY_REQUIRED', plan: 'free', capability: 'ads', resource: null }
  assert.match(planGateMessage(plan, 'es'), /plan free/)
  assert.match(planGateMessage(plan, 'en'), /free plan/)
  assert.match(planGateMessage({ code: 'LIMIT_REACHED', resource: 'leads' }, 'es'), /límite de leads/)
  assert.match(planGateMessage({ code: 'INTEGRATION_DISABLED' }, 'es'), /administrador/)
  assert.equal(planGateMessage(null), '')
})
