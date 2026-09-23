import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setAssistantRoute, registerAssistantScreen, assistantScreenContext, screenCommandTarget, performAssistantScreenCommand } from './assistantScreen.js'

test('solo permite operaciones y rutas conocidas disponibles para el usuario', () => {
  const modules = [{ id: 'crm', label: 'CRM' }]
  assert.equal(screenCommandTarget({ name: 'show_crm', args: { search: 'Ana' } }, modules).path, '/ventas')
  for (const command of [{ name: 'eval', args: {} }, { name: 'open_section', args: { section: 'https://evil.example' } }, { name: 'show_crm', args: { script: 'document.cookie' } }, { name: 'open_contact', args: { leadId: '../private' } }]) assert.throws(() => screenCommandTarget(command, modules))
  assert.throws(() => screenCommandTarget({ name: 'open_section', args: { section: 'calendar' } }, modules), /permisos/)
})

test('espera la confirmación de pantalla y conserva el contexto seleccionado', async () => {
  setAssistantRoute('/ventas', 'org-a:user-a')
  let context = { ready: true, selected: { type: 'lead', id: 'ana', label: 'Ana' }, filters: { search: '' } }
  const unregister = registerAssistantScreen('crm', () => context, async () => {
    setTimeout(() => { context = { ...context, filters: { search: 'Ana' } } }, 20)
    return { message: 'Filtro aplicado', verify: current => current.filters.search === 'Ana' }
  })
  const result = await performAssistantScreenCommand({ name: 'show_crm', args: { search: 'Ana' } }, { navigate: () => {}, availableModules: [{ id: 'crm' }] })
  assert.equal(result, 'Filtro aplicado'); assert.equal(assistantScreenContext().selected.id, 'ana'); unregister()
})

test('protege formularios abiertos y limpia el contexto al cambiar de empresa', async () => {
  setAssistantRoute('/ventas', 'org-a:user-a')
  let navigated = false
  const unregister = registerAssistantScreen('crm', () => ({ form: 'new_contact', selected: { type: 'lead', id: 'ana' } }), async () => {})
  await assert.rejects(performAssistantScreenCommand({ name: 'open_section', args: { section: 'calendar' } }, { navigate: () => { navigated = true }, availableModules: [{ id: 'calendar' }] }), /formulario/)
  assert.equal(navigated, false)
  setAssistantRoute('/ventas', 'org-b:user-b'); assert.equal(assistantScreenContext().selected, undefined); unregister()
})
