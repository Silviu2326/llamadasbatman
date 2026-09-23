import { test } from 'node:test'
import assert from 'node:assert/strict'
import { radarCsv, radarRows, radarObjectives, radarSummary, withRadarObjectives } from './opportunityRadar.js'
test('selección múltiple conserva búsquedas independientes y compatibilidad con el historial', () => {
  const previous = { kind: 'clients', target: 'Salones', criteria: '', location: 'Madrid' }
  const multi = withRadarObjectives(previous, [...radarObjectives(previous), { kind: 'suppliers', target: 'Hosting', criteria: 'Europa' }])
  assert.equal(radarSummary(multi), 'Clientes + Proveedores')
  const removed = withRadarObjectives(multi, radarObjectives(multi).slice(1))
  assert.equal(removed.kind, 'suppliers'); assert.equal(removed.target, 'Hosting'); assert.equal(removed.location, 'Madrid')
  assert.deepEqual(radarObjectives(withRadarObjectives(multi, [])), [])
})
const run = { id: 'run-1', createdAt: '2026-09-08', input: { radar: { kind: 'clients' } }, result: { data: { sources: [{ url: 'https://salon.example/' }], candidates: [{ name: 'Salón de prueba', kind: 'clients', sourceUrl: 'https://salon.example/', rationale: 'Posible encaje' }] } } }
test('agrupa candidatos repetidos y descarta fuentes ajenas al informe', () => {
  assert.equal(radarRows([run, { ...run, id: 'run-2' }]).length, 1)
  assert.equal(radarRows([{ ...run, result: { data: { ...run.result.data, sources: [] } } }]).length, 0)
})
test('cada búsqueda seleccionada conserva sus registros aunque aparezcan en otra', () => {
  assert.equal(radarRows([{ ...run, id: 'run-2' }])[0].runId, 'run-2')
})
test('el CSV protege fórmulas y escapa comillas, separadores y saltos', () => {
  const csv = radarCsv([{ ...run.result.data.candidates[0], name: '=HYPERLINK("bad")', rationale: 'A;B\nC' }])
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(csv.includes('"A;B\nC"'))
})
