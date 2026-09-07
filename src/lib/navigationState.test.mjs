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
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.crm)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.calendar)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.crm)
  state = recordModuleVisit(state, MODULE_BY_NAV_ID.studio)

  assert.deepEqual(state.recentModuleIds.slice(0, 4), ['studio', 'crm', 'calendar'])
  assert.equal(state.lastModuleBySpace.sales, 'crm')
  assert.equal(state.lastModuleBySpace.more, 'studio')
})

test('fijar y desfijar es determinista y no admite IDs desconocidos', () => {
  let state = emptyNavigationState()
  state = togglePinnedModule(state, 'assets')
  state = togglePinnedModule(state, 'calendar')
  state = togglePinnedModule(state, 'assets')
  state = togglePinnedModule(state, 'does-not-exist')
  assert.deepEqual(state.pinnedModuleIds, ['calendar'])
})

test('los grupos locales cubren una vez todos los módulos del espacio', () => {
  for (const spaceId of ['sales', 'growth', 'more', 'learn']) {
    const modules = APP_MODULES.filter(module => module.space === spaceId)
    const grouped = localNavigationGroups(spaceId, modules, 'es').flatMap(group => group.modules)
    assert.equal(grouped.length, modules.length)
    assert.equal(new Set(grouped.map(module => module.id)).size, modules.length)
  }
})

test('la navegación global mantiene sus espacios y absorbe operación y recursos', () => {
  assert.deepEqual(APP_SPACES.map(space => space.id), ['home', 'sales', 'growth', 'learn', 'more', 'backoffice'])
  assert.equal(spaceForPath('/backoffice').id, 'backoffice')
  assert.equal(spaceForPath('/backoffice/usuarios').id, 'backoffice')
  assert.equal(moduleForPath('/backoffice/usuarios')?.id, 'backoffice-users')
  assert.equal(spaceForPath('/trabajos').id, 'growth')
  assert.equal(spaceForPath('/automatizaciones').id, 'growth')
  assert.equal(spaceForPath('/activos').id, 'more')
  assert.equal(spaceForPath('/knowledge-base').id, 'sales')
})

test('«Más» solo lista en la sidebar Biblioteca y Configuración', () => {
  const listed = APP_MODULES
    .filter(module => module.space === 'more' && module.showInLocalNavigation !== false)
    .map(module => module.id)
  assert.deepEqual(listed, ['assets', 'settings'])
  // Microapps y Studio siguen con ruta viva (paleta, atajos, enlaces de leads)
  // pero no ocupan hueco en el menú.
  assert.equal(MODULE_BY_NAV_ID.microapps.showInLocalNavigation, false)
  assert.equal(MODULE_BY_NAV_ID.studio.showInLocalNavigation, false)
})

test('las secciones de Configuración conservan módulo, alias y gating propios', () => {
  assert.equal(moduleForPath('/configuracion')?.id, 'settings')
  assert.equal(moduleForPath('/configuracion/empresa')?.id, 'business')
  assert.equal(moduleForPath('/configuracion/empresa/importar')?.id, 'business')
  assert.equal(moduleForPath('/configuracion/plan')?.id, 'settings-plan')
  assert.equal(moduleForPath('/configuracion/integraciones')?.id, 'integrations')
  assert.equal(moduleForPath('/configuracion/administracion')?.id, 'administration')
  // Las rutas antiguas siguen resolviendo al módulo que las absorbió.
  assert.equal(moduleForPath('/informacion-empresa')?.id, 'business')
  assert.equal(moduleForPath('/marketplace')?.id, 'integrations')
  assert.equal(moduleForPath('/access-control')?.id, 'administration')
  // El gating por plan sigue siendo por sección, no por la portada.
  assert.equal(MODULE_BY_NAV_ID.business.moduleId, 'business-info')
  assert.equal(MODULE_BY_NAV_ID.integrations.moduleId, 'connections')
  assert.equal(MODULE_BY_NAV_ID.administration.moduleId, 'administration')
})

test('los detalles conservan su módulo y espacio canónicos', () => {
  assert.equal(moduleForPath('/microapps/call-prep')?.id, 'microapps')
  assert.equal(spaceForPath('/microapps/call-prep').id, 'more')
  assert.equal(moduleForPath('/cuentas/account-1')?.id, 'crm')
  assert.equal(spaceForPath('/cuentas/account-1').id, 'sales')
})

test('el registro no publica destinos sin contrato de permisos', () => {
  const owner = { id: 'owner-1', orgId: 'org-1', role: 'owner' }
  const product = APP_MODULES.filter(module => module.space !== 'backoffice')
  assert.deepEqual(product.filter(module => !canNavigateTo(owner, module.to)).map(module => module.id), [])
})

test('el back office solo es alcanzable con el privilegio de operador', () => {
  const owner = { id: 'owner-1', orgId: 'org-1', role: 'owner' }
  const operator = { ...owner, isPlatformAdmin: true }
  const backoffice = APP_MODULES.filter(module => module.space === 'backoffice')

  assert.ok(backoffice.length)
  // Ni un owner llega: el privilegio cruza organizaciones y no lo concede
  // ningún rol del catálogo, así que no puede heredarse del RBAC del tenant.
  assert.deepEqual(backoffice.filter(module => canNavigateTo(owner, module.to)).map(module => module.id), [])
  assert.deepEqual(backoffice.filter(module => !canNavigateTo(operator, module.to)).map(module => module.id), [])
  // Y el privilegio no abre nada más que el back office.
  assert.equal(canNavigateTo({ id: 'x', orgId: 'org-1', role: 'guest', isPlatformAdmin: true }, '/ventas'), false)
})

test('preferencias y recientes quedan aislados por organización', () => {
  assert.notEqual(navigationStorageKey({ orgId: 'org-a' }), navigationStorageKey({ orgId: 'org-b' }))
  assert.equal(navigationStorageKey({ orgId: 'org-a' }), navigationStorageKey({ orgId: 'org-a' }))
})
