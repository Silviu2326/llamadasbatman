/**
 * Navigation access is intentionally kept separate from the backend policy.
 * The server remains the source of truth for API authorization; this module
 * only prevents links to areas for which the current user has no read access.
 */

const READ_PERMISSIONS = [
  'dashboard.read',
  'leads.read',
  'accounts.read',
  'calls.read',
  'conversations.read',
  'campaigns.read',
  'organic.read',
  'ads.read',
  'social.read',
  'funnels.read',
  'agents.read',
  'playbooks.read',
  'automations.read',
  'jobs.read',
  'assets.read',
  'knowledge.read',
  'meetings.read',
  'pipeline.read',
  'tasks.read',
  'growth.read',
  'experiments.read',
  'memory.read',
  'organization.read',
  'governance.read',
  'integrations.read',
  'access_control.read',
  'playbooks.manage_global',
]

const BUSINESS_READ = [
  'dashboard.read',
  'leads.read',
  'accounts.read',
  'calls.read',
  'conversations.read',
  'campaigns.read',
  'ads.read',
  'social.read',
  'funnels.read',
  'agents.read',
  'playbooks.read',
  'automations.read',
  'jobs.read',
  'assets.read',
  'knowledge.read',
  'meetings.read',
  'pipeline.read',
  'tasks.read',
  'growth.read',
  'experiments.read',
  'memory.read',
]

const ROLE_ALIASES = {
  administrator: 'admin',
  administrador: 'admin',
  propietario: 'owner',
  owner_admin: 'admin',
  'revenue-ops': 'revenue_ops',
  revenueops: 'revenue_ops',
  'sales-manager': 'sales_manager',
  salesmanager: 'sales_manager',
  'sales-rep': 'sales_rep',
  salesrep: 'sales_rep',
  marketing: 'marketing_growth',
  'marketing-growth': 'marketing_growth',
  marketinggrowth: 'marketing_growth',
  analyst: 'analyst',
  analista: 'analyst',
  compliance: 'compliance',
  cumplimento: 'compliance',
  'finance-controller': 'finance_controller',
  financecontroller: 'finance_controller',
  finanzas: 'finance_controller',
  invitado: 'guest',
  lector: 'viewer',
}

const ROLE_FALLBACK_PERMISSIONS = {
  owner: [...READ_PERMISSIONS, 'organization.manage', 'leads.write', 'social.write', 'jobs.manage', 'assets.manage', 'integrations.manage', 'costs.request'],
  admin: [...READ_PERMISSIONS, 'organization.manage', 'leads.write', 'social.write', 'jobs.manage', 'assets.manage', 'integrations.manage'],
  revenue_ops: [...BUSINESS_READ, 'organic.read', 'organization.read', 'integrations.read', 'access_control.read', 'leads.write', 'jobs.manage', 'assets.manage', 'costs.request'],
  sales_manager: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'playbooks.read', 'knowledge.read', 'meetings.read', 'pipeline.read', 'tasks.read',
    'experiments.read', 'memory.read', 'organization.read', 'assets.read',
    'access_control.read',
  ],
  sales_rep: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'playbooks.read', 'knowledge.read', 'meetings.read', 'pipeline.read', 'tasks.read', 'assets.read',
  ],
  marketing_growth: [
    'dashboard.read', 'leads.read', 'campaigns.read', 'organic.read', 'ads.read', 'social.read',
    'funnels.read', 'agents.read', 'playbooks.read', 'automations.read', 'knowledge.read',
    'growth.read', 'experiments.read', 'memory.read', 'integrations.read',
    'leads.write', 'social.write', 'jobs.manage', 'assets.read', 'assets.manage', 'costs.request',
  ],
  analyst: ['dashboard.read', 'campaigns.read', 'organic.read', 'ads.read', 'social.read', 'assets.read', 'funnels.read', 'pipeline.read', 'growth.read', 'experiments.read', 'organization.read'],
  compliance: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'campaigns.read', 'organic.read', 'playbooks.read', 'knowledge.read', 'memory.read', 'governance.read',
    'organization.read', 'access_control.read', 'assets.read',
  ],
  finance_controller: ['dashboard.read', 'campaigns.read', 'organic.read', 'ads.read', 'growth.read', 'experiments.read', 'organization.read', 'audit.read', 'assets.read'],
  guest: ['dashboard.read'],
  // Legacy roles remain usable even when the server has not yet attached an
  // explicit permission list to the refreshed user object.
  agent: [...BUSINESS_READ, 'organization.read', 'integrations.read', 'integrations.manage', 'access_control.read', 'leads.write', 'social.write', 'jobs.manage', 'assets.manage', 'costs.request'],
  viewer: [...BUSINESS_READ, 'organization.read'],
}

const NAVIGATION_REQUIREMENTS = {
  '/dashboard': ['dashboard.read'],
  '/orquestador': ['dashboard.read'],
  '/operaciones-growth': { anyOf: ['dashboard.read', 'jobs.read', 'automations.read'] },
  '/plan': ['dashboard.read'],
  // Sección Captación: la portada se ve con cualquiera de sus etapas; cada
  // etapa exige lo mismo que exigía como página suelta. Las rutas antiguas se
  // conservan porque otras pantallas todavía preguntan por ellas.
  '/captacion': { anyOf: ['campaigns.read', 'ads.read', 'organic.read', 'social.read', 'funnels.read'] },
  '/captacion/planificar': ['campaigns.read'],
  '/captacion/atraer/ads': ['ads.read'],
  '/captacion/atraer/organico': { anyOf: ['organic.read', 'social.read'] },
  '/captacion/atraer/prospectos': ['leads.write', 'costs.request'],
  '/captacion/convertir': ['campaigns.read'],
  '/captacion/cerrar': ['funnels.read'],
  '/campanas': ['campaigns.read'],
  // «Orgánico y social» funde el centro de mando orgánico y las redes: basta
  // con poder leer una de las dos mitades; la API sigue autorizando cada panel.
  '/organico': { anyOf: ['organic.read', 'social.read'] },
  '/ads': ['ads.read'],
  // Prospect search/import is a paid operation and has no separate read
  // permission in the current backend policy.
  '/prospectos': ['leads.write', 'costs.request'],
  // «Web y SEO»: las landings cuelgan de campañas. El análisis SEO lanza un
  // LLM y exige además costs.request, que el backend comprueba en el endpoint.
  '/web': ['campaigns.read'],
  '/funnels': ['funnels.read'],
  '/conversacion/inbox': ['conversations.read'],
  '/llamadas': ['calls.read'],
  '/agentes': ['agents.read'],
  '/playbooks': ['playbooks.read'],
  '/voz/cabina': ['agents.read'],
  '/voz/test': ['agents.read'],
  '/voz/omni': ['agents.read'],
  '/voz/emocion': ['agents.read'],
  '/email-marketing': ['campaigns.read'],
  '/automatizaciones': ['automations.read'],
  '/trabajos': ['jobs.read'],
  '/activos': ['assets.read'],
  // Ejecutar una microapp gasta presupuesto (LLM/proveedores): misma barrera de
  // coste que /prospectos. No hay un "microapps.read" en la política actual.
  '/microapps': { anyOf: ['jobs.read', 'costs.request'] },
  '/integraciones': ['integrations.read'],
  '/conexiones': ['integrations.read'],
  '/conexiones/web': ['integrations.read'],
  '/studio': ['social.read'],
  '/marketplace': ['integrations.read'],
  '/growth': ['growth.read'],
  '/ventas': { anyOf: ['leads.read', 'accounts.read', 'pipeline.read'] },
  '/leads': ['leads.read'],
  '/cuentas': ['accounts.read'],
  '/pipeline': ['pipeline.read'],
  '/calendario': ['meetings.read'],
  '/reuniones': ['meetings.read'],
  // This page is transversal; any one of its read surfaces is enough to show
  // the entry point, while the API still decides which panels are available.
  '/inteligencia-comercial': { anyOf: ['leads.read', 'experiments.read', 'memory.read'] },
  '/insights': ['dashboard.read'],
  '/knowledge-base': ['knowledge.read'],
  '/recursos-ia': { anyOf: ['knowledge.read', 'playbooks.read'] },
  '/informacion-empresa': ['organization.read'],
  '/rellenar-desde-web': ['organization.read'],
  // /settings/me is available to authenticated users; organization.read keeps
  // the entry visible for personal settings while excluding a zero-permission
  // account from the navigation.
  '/configuracion': ['organization.read'],
  '/gobierno-empresarial': ['governance.read'],
  '/access-control': ['access_control.read'],
  '/administracion': { anyOf: ['access_control.read', 'governance.read', 'organization.manage'] },
  '/agencia/clientes': ['organization.manage'],
  '/desarrolladores': ['integrations.read'],
  '/admin/ad-playbooks': ['playbooks.manage_global'],
  '/capacidades': { anyOf: ['jobs.read', 'automations.read', 'integrations.read', 'costs.request'] },
  '/aprender': ['dashboard.read'],
  '/tutoriales': ['dashboard.read'],
  '/documentacion': ['dashboard.read'],
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase().replace(/\s+/g, '_')
  return ROLE_ALIASES[value] || value
}

function permissionKey(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  return String(value.permission || value.key || value.name || value.id || '').trim()
}

function permissionList(value) {
  if (Array.isArray(value)) return value.flatMap(item => permissionList(item))
  if (typeof value === 'string') return [value.trim()]
  if (!value || typeof value !== 'object') return []

  const direct = permissionKey(value)
  if (direct) return [direct]

  return Object.entries(value).flatMap(([key, enabled]) => {
    if (enabled === false || enabled == null) return []
    if (key.includes('.')) return [key]
    return permissionList(enabled)
  })
}

function explicitPermissions(user) {
  const candidates = [
    user?.permissions,
    user?.effectivePermissions,
    user?.grantedPermissions,
    user?.permissionKeys,
    user?.access?.permissions,
    user?.authorization?.permissions,
    user?.rolePermissions,
  ]

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue
    return new Set(permissionList(candidate).filter(Boolean))
  }
  return null
}

export function getEffectiveNavigationPermissions(user) {
  const explicit = explicitPermissions(user)
  const role = normalizeRole(user?.role || user?.roleKey || user?.access?.role)
  const fallback = ROLE_FALLBACK_PERMISSIONS[role] || []
  if (!explicit) return new Set(fallback)

  // Owner/admin siempre ven la navegación completa aunque el backend devuelva
  // una lista de permisos parcial; la API sigue autorizando cada llamada.
  if (role === 'owner' || role === 'admin') fallback.forEach(permission => explicit.add(permission))
  return explicit
}

export function hasNavigationPermission(user, requirement) {
  const permissions = getEffectiveNavigationPermissions(user)
  if (Array.isArray(requirement)) return requirement.every(permission => permissions.has(permission))
  if (requirement?.allOf) return requirement.allOf.every(permission => permissions.has(permission))
  if (requirement?.anyOf) return requirement.anyOf.some(permission => permissions.has(permission))
  return false
}

export function canNavigateTo(user, path) {
  const requirement = NAVIGATION_REQUIREMENTS[path]
  return Boolean(requirement) && hasNavigationPermission(user, requirement)
}

export function filterNavigationSections(user, sections) {
  return sections
    .map(section => ({ ...section, items: section.items.filter(item => canNavigateTo(user, item.to)) }))
    .filter(section => section.items.length > 0)
}

export function navigationPermissionRequirements() {
  return NAVIGATION_REQUIREMENTS
}
