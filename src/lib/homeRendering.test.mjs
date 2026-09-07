import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

let server
let components
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  components = await server.ssrLoadModule('/src/components/Dashboard.jsx')
})
after(async () => { await server?.close() })
const resource = (data, error = '') => ({ data, error, loading: false })
const render = (name, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(components[name], { retry() {}, locale: 'es', ...props })))

test('failed action request shows retry, never a healthy empty state', () => {
  const html = render('PendingList', { resource: resource(null, 'No se han podido cargar los datos.') })
  assert.match(html, /Reintentar/)
  assert.doesNotMatch(html, /No hay pendientes detectados|Todo bajo control/)
})

test('partially available action sources do not claim everything is clear', () => {
  const html = render('PendingList', { resource: resource({ items: [], degraded: true, warnings: [{ source: 'leads' }] }) })
  assert.match(html, /lista puede estar incompleta/)
  assert.doesNotMatch(html, /No hay pendientes detectados/)
})

test('confirmed new workspace presents first steps', () => {
  const html = render('PendingList', { resource: resource({ items: [] }), newWorkspace: true })
  assert.match(html, /Empieza por aquí/)
  assert.match(html, /Añadir contactos/)
  assert.match(html, /Preparar agente/)
})

test('a truncated response never claims there is no pending work', () => {
  const html = render('PendingList', { resource: resource({ items: [], total: 120, received: 100 }) })
  assert.match(html, /primeros 100 registros/)
  assert.doesNotMatch(html, /No hay pendientes detectados/)
})

test('failed refresh preserves rows and labels them stale', () => {
  const html = render('PendingList', { resource: resource({ items: [{ id: 'one', title: 'Revisar propuesta', priority: 'high', target: { path: '/pipeline' } }] }, 'Error al actualizar.') })
  assert.match(html, /pueden estar desactualizados/)
  assert.match(html, /Revisar propuesta/)
})

test('monthly results use month fields, not historical totals', () => {
  const html = render('MonthResults', { resource: resource({ monthlyClosedWonValue: 100, monthlyMeetings: 2, closedWonValue: 900000, meetingsScheduled: 900, goals: { monthlyRevenue: 1000, monthlyMeetings: 10 } }) })
  assert.match(html, /10%/)
  assert.match(html, /20%/)
  assert.doesNotMatch(html, /900000|900\.000/)
})

test('activity links point to the actual record without inventing outcomes', () => {
  const html = render('RecentActivity', { resource: resource([{ type: 'call', createdAt: '2026-09-04T12:00:00Z', data: { id: 'call-1', lead: { name: 'Laura' } } }]) })
  assert.match(html, /href="\/llamadas\/call-1"/)
  assert.match(html, /Llamada con Laura/)
  assert.doesNotMatch(html, /mostró interés|Venta conseguida/)
})
