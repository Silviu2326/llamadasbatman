import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APP_SPACES,
  APP_MODULES,
  localNavigationGroups,
  moduleForPath,
  MODULE_BY_NAV_ID,
  spaceForPath,
} from './appNavigation.js'
import {
  emptyNavigationState,
  navigationStorageKey,
  recordModuleVisit,
  togglePinnedModule,
} from './navigationState.js'
import { canNavigateTo } from './navigationPermissions.js'

test('recuerda el último módulo por espacio y ordena recientes sin duplicados', () => {
  let state = emptyNavigationState()
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.leads)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.pipeline)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.leads)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.studio)

  assert.deepEqual(state.recentModuleIds.slice(0, 4), ['studio', 'leads', 'pipeline'])
  assert.equal(state.lastModuleBySpace.sales, 'leads')
  assert.equal(state.lastModuleBySpace.create, 'studio')
})

test('fijar y desfijar es determinista y no admite IDs desconocidos', () => {
  let state = emptyNavigationState()
  state = togglePinnedModule(state, 'capabilities')
  state = togglePinnedModule(state, 'pipeline')
  state = togglePinnedModule(state, 'capabilities')
  state = togglePinnedModule(state, 'does-not-exist')
  assert.deepEqual(state.pinnedModuleIds, ['pipeline'])
})

test('los grupos locales cubren una vez todos los módulos del espacio', () => {
  for (const spaceId of ['sales', 'growth', 'create', 'more']) {
    const modules = APP_MODULES.filter(module => module.space === spaceId)
    const grouped = localNavigationGroups(spaceId, modules, 'es').flatMap(group => group.modules)
    assert.equal(grouped.length, modules.length)
    assert.equal(new Set(grouped.map(module => module.id)).size, modules.length)
  }
})

test('la navegación global mantiene sus espacios y absorbe operación y recursos', () => {
  assert.deepEqual(APP_SPACES.map(space => space.id), ['home', 'sales', 'growth', 'create', 'more', 'learn'])
  assert.equal(spaceForPath('/trabajos').id, 'growth')
  assert.equal(spaceForPath('/automatizaciones').id, 'growth')
  assert.equal(spaceForPath('/activos').id, 'create')
  assert.equal(spaceForPath('/knowledge-base').id, 'create')
})

test('los detalles conservan su módulo y espacio canónicos', () => {
  assert.equal(moduleForPath('/microapps/call-prep')?.id, 'microapps')
  assert.equal(spaceForPath('/microapps/call-prep').id, 'create')
  assert.equal(moduleForPath('/cuentas/account-1')?.id, 'accounts')
  assert.equal(spaceForPath('/cuentas/account-1').id, 'sales')
})

test('el registro no publica destinos sin contrato de permisos', () => {
  const owner = { id: 'owner-1', orgId: 'org-1', role: 'owner' }
  const unreachable = APP_MODULES.filter(module => !canNavigateTo(owner, module.to)).map(module => module.id)
  assert.deepEqual(unreachable, [])
})

test('preferencias y recientes quedan aislados por organización', () => {
  assert.notEqual(navigationStorageKey({ orgId: 'org-a' }), navigationStorageKey({ orgId: 'org-b' }))
  assert.equal(navigationStorageKey({ orgId: 'org-a' }), navigationStorageKey({ orgId: 'org-a' }))
})
