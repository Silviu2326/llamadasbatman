export const COMMAND_PREFERENCES_KEY = 'vendrava:command-preferences:v2'
const LEGACY_COMMAND_PREFERENCES_KEY = 'vendrava:command-preferences:v1'

export const COMMAND_DEFAULT_PREFERENCES = Object.freeze({
  actions: true,
  navigation: true,
  microapps: true,
  flows: true,
  workspace: true,
  resultLimit: 12,
  density: 'comfortable',
  showSubtitles: true,
})

export const COMMAND_RESULT_LIMITS = [8, 12, 18, 24]

export const COMMAND_PREFERENCE_OPTIONS = [
  { id: 'actions', label: 'Acciones rápidas', labelEn: 'Quick actions', description: 'Crear campaña, ejecutar microapp y nueva producción' },
  { id: 'navigation', label: 'Navegación', labelEn: 'Navigation', description: 'Módulos y áreas principales del workspace' },
  { id: 'microapps', label: 'Microapps', labelEn: 'Microapps', description: 'Capacidades disponibles en tu catálogo' },
  { id: 'flows', label: 'Workflows', labelEn: 'Workflows', description: 'Automatizaciones y flujos publicados' },
  { id: 'workspace', label: 'Datos del workspace', labelEn: 'Workspace data', description: 'Leads, cuentas, oportunidades y campañas' },
]

export const COMMAND_SHORTCUTS = [
  { id: 'create-campaign', label: 'Crear campaña', labelEn: 'Create campaign', defaultKey: 'MOD+SHIFT+C', action: 'navigate', path: '/captacion/nueva', permissionPath: '/captacion/atraer/ads' },
  { id: 'run-microapp', label: 'Ejecutar una microapp', labelEn: 'Run a microapp', defaultKey: 'MOD+SHIFT+M', action: 'navigate', path: '/microapps', permissionPath: '/microapps' },
  { id: 'new-production', label: 'Nueva producción', labelEn: 'New production', defaultKey: 'MOD+SHIFT+P', action: 'navigate', path: '/studio', permissionPath: '/studio' },
  { id: 'go-growth', label: 'Ir a Growth', labelEn: 'Go to Growth', defaultKey: 'MOD+SHIFT+G', action: 'navigate', path: '/growth', permissionPath: '/growth' },
  { id: 'go-sales', label: 'Ir a Ventas', labelEn: 'Go to Sales', defaultKey: 'MOD+SHIFT+V', action: 'navigate', path: '/ventas', permissionPath: '/ventas' },
  { id: 'go-home', label: 'Ir a Inicio', labelEn: 'Go to Home', defaultKey: 'MOD+SHIFT+H', action: 'navigate', path: '/dashboard', permissionPath: '/dashboard' },
  { id: 'open-automations', label: 'Abrir automatizaciones', labelEn: 'Open automations', defaultKey: 'MOD+SHIFT+A', action: 'navigate', path: '/automatizaciones', permissionPath: '/automatizaciones' },
  { id: 'open-jobs', label: 'Abrir trabajos', labelEn: 'Open jobs', defaultKey: 'MOD+SHIFT+J', action: 'navigate', path: '/trabajos', permissionPath: '/trabajos' },
  { id: 'open-assets', label: 'Abrir activos', labelEn: 'Open assets', defaultKey: 'MOD+SHIFT+L', action: 'navigate', path: '/activos', permissionPath: '/activos' },
  { id: 'open-settings', label: 'Abrir configuración', labelEn: 'Open settings', defaultKey: 'MOD+SHIFT+E', action: 'navigate', path: '/configuracion', permissionPath: '/configuracion' },
  { id: 'open-leads', label: 'Abrir leads', labelEn: 'Open leads', defaultKey: 'MOD+ALT+L', action: 'navigate', path: '/ventas?vista=leads', permissionPath: '/ventas' },
  { id: 'open-accounts', label: 'Abrir cuentas', labelEn: 'Open accounts', defaultKey: 'MOD+ALT+A', action: 'navigate', path: '/ventas?vista=accounts', permissionPath: '/ventas' },
  { id: 'open-pipeline', label: 'Abrir pipeline', labelEn: 'Open pipeline', defaultKey: 'MOD+ALT+P', action: 'navigate', path: '/ventas?vista=pipeline', permissionPath: '/ventas' },
  { id: 'open-calls', label: 'Abrir llamadas', labelEn: 'Open calls', defaultKey: 'MOD+ALT+C', action: 'navigate', path: '/llamadas', permissionPath: '/llamadas' },
  { id: 'open-meetings', label: 'Abrir calendario', labelEn: 'Open calendar', defaultKey: 'MOD+ALT+R', action: 'navigate', path: '/calendario', permissionPath: '/calendario' },
  { id: 'open-inbox', label: 'Abrir llamadas', labelEn: 'Open calls', defaultKey: 'MOD+ALT+I', action: 'navigate', path: '/llamadas', permissionPath: '/llamadas' },
  { id: 'open-campaigns', label: 'Abrir campañas', labelEn: 'Open campaigns', defaultKey: 'MOD+ALT+G', action: 'navigate', path: '/captacion/planificar', permissionPath: '/captacion/planificar' },
  { id: 'open-microapps', label: 'Abrir microapps', labelEn: 'Open microapps', defaultKey: 'MOD+ALT+M', action: 'navigate', path: '/microapps', permissionPath: '/microapps' },
  { id: 'open-marketplace', label: 'Abrir marketplace', labelEn: 'Open marketplace', defaultKey: 'MOD+ALT+K', action: 'navigate', path: '/configuracion/integraciones?tab=extensiones', permissionPath: '/marketplace' },
  { id: 'open-connections', label: 'Abrir conexiones', labelEn: 'Open connections', defaultKey: 'MOD+ALT+O', action: 'navigate', path: '/configuracion/integraciones', permissionPath: '/conexiones' },
  { id: 'open-knowledge', label: 'Abrir base de conocimiento', labelEn: 'Open knowledge base', defaultKey: 'MOD+ALT+B', action: 'navigate', path: '/knowledge-base', permissionPath: '/knowledge-base' },
  { id: 'open-playbooks', label: 'Abrir playbooks', labelEn: 'Open playbooks', defaultKey: 'MOD+ALT+Y', action: 'navigate', path: '/playbooks', permissionPath: '/playbooks' },
  { id: 'open-capabilities', label: 'Abrir centro de capacidades', labelEn: 'Open capability center', defaultKey: 'MOD+ALT+Q', action: 'navigate', path: '/capacidades', permissionPath: '/capacidades' },
  { id: 'open-prospects', label: 'Abrir prospectos', labelEn: 'Open prospects', defaultKey: 'MOD+ALT+F', action: 'navigate', path: '/captacion/atraer/prospectos', permissionPath: '/captacion/atraer/prospectos' },
  { id: 'open-web', label: 'Abrir Web y SEO', labelEn: 'Open Web & SEO', defaultKey: 'MOD+ALT+W', action: 'navigate', path: '/captacion/convertir', permissionPath: '/captacion/convertir' },
  { id: 'open-organic', label: 'Abrir Orgánico y social', labelEn: 'Open Organic & social', defaultKey: 'MOD+ALT+E', action: 'navigate', path: '/captacion/atraer/organico', permissionPath: '/captacion/atraer/organico' },
  { id: 'open-email', label: 'Abrir email marketing', labelEn: 'Open email marketing', defaultKey: 'MOD+ALT+N', action: 'navigate', path: '/email-marketing', permissionPath: '/email-marketing' },
  { id: 'open-revenue', label: 'Abrir Inteligencia', labelEn: 'Open Intelligence', defaultKey: 'MOD+ALT+J', action: 'navigate', path: '/inteligencia', permissionPath: '/inteligencia' },
  { id: 'open-voice', label: 'Abrir agentes IA', labelEn: 'Open AI agents', defaultKey: 'MOD+ALT+V', action: 'navigate', path: '/agentes', permissionPath: '/agentes' },
]

export function commandStorageKey(user) {
  const identity = user?.orgId || user?.organizationId || user?.id || 'anonymous'
  return `${COMMAND_PREFERENCES_KEY}:${String(identity).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`
}

export function readCommandPreferences(user) {
  try {
    const stored = window.localStorage?.getItem(commandStorageKey(user)) || window.localStorage?.getItem(`${LEGACY_COMMAND_PREFERENCES_KEY}:${String(user?.orgId || user?.organizationId || user?.id || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`) || '{}'
    const value = JSON.parse(stored)
    const preferences = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return {
      ...COMMAND_DEFAULT_PREFERENCES,
      ...Object.fromEntries(Object.keys(COMMAND_DEFAULT_PREFERENCES).map(key => [key, preferences[key] !== false])),
      resultLimit: COMMAND_RESULT_LIMITS.includes(Number(preferences.resultLimit)) ? Number(preferences.resultLimit) : COMMAND_DEFAULT_PREFERENCES.resultLimit,
      density: preferences.density === 'compact' ? 'compact' : 'comfortable',
      showSubtitles: preferences.showSubtitles !== false,
      shortcuts: Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, typeof preferences.shortcuts?.[shortcut.id] === 'string' ? preferences.shortcuts[shortcut.id] : shortcut.defaultKey])),
      shortcutsEnabled: Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, preferences.shortcutsEnabled?.[shortcut.id] !== false])),
    }
  } catch {
    return {
      ...COMMAND_DEFAULT_PREFERENCES,
      shortcuts: Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, shortcut.defaultKey])),
      shortcutsEnabled: Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, true])),
    }
  }
}

export function saveCommandPreferences(user, preferences) {
  try {
    window.localStorage?.setItem(commandStorageKey(user), JSON.stringify(preferences))
    window.dispatchEvent(new CustomEvent('vendrava:command-preferences-changed', { detail: preferences }))
  } catch {
    // La configuración sigue funcionando durante la sesión aunque el storage esté bloqueado.
  }
}

export function shortcutFromEvent(event) {
  const key = String(event.key || '').toUpperCase()
  if (!key || ['CONTROL', 'META', 'ALT', 'SHIFT'].includes(key)) return null
  const parts = []
  if (event.metaKey || event.ctrlKey) parts.push('MOD')
  if (event.altKey) parts.push('ALT')
  if (event.shiftKey) parts.push('SHIFT')
  if (!parts.length) return null
  const normalizedKey = key === ' ' ? 'SPACE' : key
  parts.push(normalizedKey)
  return parts.join('+')
}

export function formatShortcut(shortcut, locale = 'es') {
  if (!shortcut) return locale === 'en' ? 'Not assigned' : 'Sin asignar'
  return shortcut.split('+').map(part => ({ MOD: '⌘/Ctrl', SHIFT: 'Shift', ALT: 'Alt', SPACE: 'Espacio' }[part] || part)).join(' + ')
}
