import { APP_MODULES } from './appNavigation.js'

const STORAGE_VERSION = 2
const STORAGE_PREFIX = 'vendrava:navigation:v2'
const VALID_MODULE_IDS = new Set(APP_MODULES.map(module => module.id))

function browserStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null
}

function identityFor(scope) {
  const identity = scope?.orgId || scope?.organizationId || scope?.userId || scope?.id || 'anonymous'
  return String(identity).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

export function navigationStorageKey(scope) {
  return `${STORAGE_PREFIX}:${identityFor(scope)}`
}

export function emptyNavigationState() {
  return {
    version: STORAGE_VERSION,
    localPanelCollapsed: false,
    pinnedModuleIds: [],
    recentModuleIds: [],
    lastModuleBySpace: {},
  }
}

function normalize(value) {
  const source = value && typeof value === 'object' ? value : {}
  const pinnedModuleIds = Array.isArray(source.pinnedModuleIds)
    ? source.pinnedModuleIds.filter(id => VALID_MODULE_IDS.has(id)).slice(0, 12)
    : []
  const recentModuleIds = Array.isArray(source.recentModuleIds)
    ? source.recentModuleIds.filter(id => VALID_MODULE_IDS.has(id)).slice(0, 16)
    : []
  const lastModuleBySpace = Object.fromEntries(Object.entries(source.lastModuleBySpace || {})
    .filter(([, id]) => VALID_MODULE_IDS.has(id)))
  return {
    version: STORAGE_VERSION,
    localPanelCollapsed: Boolean(source.localPanelCollapsed),
    pinnedModuleIds: [...new Set(pinnedModuleIds)],
    recentModuleIds: [...new Set(recentModuleIds)],
    lastModuleBySpace,
  }
}

export function readNavigationState(scope) {
  try {
    const storage = browserStorage()
    const raw = storage?.getItem(navigationStorageKey(scope))
    return raw ? normalize(JSON.parse(raw)) : emptyNavigationState()
  } catch {
    return emptyNavigationState()
  }
}

export function writeNavigationState(scope, state) {
  const normalized = normalize(state)
  try {
    browserStorage()?.setItem(navigationStorageKey(scope), JSON.stringify(normalized))
  } catch {
    // La navegación continúa aunque el navegador bloquee almacenamiento local.
  }
  return normalized
}

export function recordModuleVisit(state, module) {
  if (!module?.id || !VALID_MODULE_IDS.has(module.id)) return normalize(state)
  return normalize({
    ...state,
    recentModuleIds: [module.id, ...(state.recentModuleIds || []).filter(id => id !== module.id)],
    lastModuleBySpace: { ...(state.lastModuleBySpace || {}), [module.space]: module.id },
  })
}

export function togglePinnedModule(state, moduleId) {
  if (!VALID_MODULE_IDS.has(moduleId)) return normalize(state)
  const current = state.pinnedModuleIds || []
  return normalize({
    ...state,
    pinnedModuleIds: current.includes(moduleId)
      ? current.filter(id => id !== moduleId)
      : [moduleId, ...current],
  })
}
