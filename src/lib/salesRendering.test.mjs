import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

let server, meeting, task, action, I18nProvider
before(async () => {
  server = await createServer({ server: { middlewareMode: true, host: '127.0.0.1', hmr: false }, appType: 'custom' })
  I18nProvider = (await server.ssrLoadModule('/src/i18n/index.js')).I18nProvider
  meeting = (await server.ssrLoadModule('/src/modals/NewReunionModal.jsx')).default
  task = (await server.ssrLoadModule('/src/modals/SalesTaskModal.jsx')).default
  action = (await server.ssrLoadModule('/src/components/SalesContactAction.jsx')).default
})
after(async () => { await server?.close() })
const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(I18nProvider, null, createElement(component, { onClose() {}, ...props }))))

test('meeting opened from CRM preselects the existing contact rather than creating a duplicate', () => {
  const html = render(meeting, { initialLead: { id: 'contact-test', name: 'Contacto de prueba' } })
  assert.match(html, /value="Contacto de prueba"/)
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(html, /Ej\. María Rodríguez/)
})
test('editing a calendar task retains its text and local due date field', () => {
  const html = render(task, { task: { id: 'task-test', title: 'Revisar propuesta', description: 'Cliente solicita precios', dueAt: '2026-09-07T11:00:00Z' } })
  assert.match(html, /value="Revisar propuesta"/)
  assert.match(html, /Cliente solicita precios/)
  assert.match(html, /type="datetime-local"/)
})
test('call confirmation stays disabled until the selected contact is loaded', () => {
  const html = render(action, { record: { entity: 'lead', id: 'contact-test', title: 'Contacto de prueba' }, action: 'call' })
  assert.match(html, /Cargando contacto/)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /La llamada está en cola/)
})
