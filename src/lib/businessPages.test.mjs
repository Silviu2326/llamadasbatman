import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

let server, analysis, plan, goals
before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  ;[analysis, plan, goals] = await Promise.all([
    server.ssrLoadModule('/src/components/Insights.jsx'),
    server.ssrLoadModule('/src/pages/GrowthPlanPage.jsx'),
    server.ssrLoadModule('/src/components/MonthlyGoals.jsx'),
  ])
})
after(async () => { await server?.close() })
const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)))
test('failed analysis offers retry without displaying zeros or updated-data claims', () => {
  const html = render(analysis.AnalysisState, { resource: { data: null, loading: false, error: 'No se pudieron cargar los resultados.' }, retry() {} })
  assert.match(html, /role="alert"/)
  assert.match(html, /Reintentar/)
  assert.doesNotMatch(html, /datos actualizados|No hay actividad|0 €/)
})
test('failed refresh explicitly marks preserved data as stale', () => {
  const html = render(analysis.AnalysisState, { resource: { data: {}, loading: false, error: 'Error de conexión.' }, retry() {} })
  assert.match(html, /pueden estar desactualizados/)
})
test('comparison labels a small sample and offers links to the real agent', () => {
  const html = render(analysis.ComparisonTable, { rows: [{ id: 'agent-a', name: 'Agente A', calls: 2, conversations: 1, withMeeting: 1, meetingRate: 50, smallSample: true }], dimension: 'agentId', onInspect() {}, number: String })
  assert.match(html, /Menos de 20 llamadas/)
  assert.match(html, /href="\/agentes\/agent-a"/)
  assert.doesNotMatch(html, /líder|mejor agente/)
})
test('plan shows the same saved targets and month figures through the shared editor', () => {
  const html = render(goals.MonthResults, { resource: { data: { goals: { monthlyRevenue: 1000, monthlyMeetings: 8 }, monthlyClosedWonValue: 250, monthlyMeetings: 4 }, loading: false, error: '' }, locale: 'es', showLinks: false, title: 'Objetivos del mes', onSaved() {}, retry() {} })
  assert.match(html, /Objetivos del mes/)
  assert.match(html, /25%/)
  assert.match(html, /50%/)
  assert.match(html, /Editar objetivos/)
  assert.doesNotMatch(html, /href="\/plan"/)
})
test('reverse simulator starts from saved target without offering a second goal save', () => {
  const html = render(plan.GoalBox, { savedGoal: 1000, currency: 'EUR', minutesAllowed: 10, params: { contact: .5, qualify: .5, opportunity: .5, win: .5, dealValue: 100, costPerMinute: .1, minutesPerCall: 2 } })
  assert.match(html, /value="1000"/)
  assert.match(html, /Usar objetivo guardado/)
  assert.match(html, /Necesita 320 minutos/)
  assert.doesNotMatch(html, /Guardar objetivos/)
})
