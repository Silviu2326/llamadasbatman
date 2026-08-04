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
  owner: [...READ_PERMISSIONS, 'leads.write', 'costs.request'],
  admin: [...BUSINESS_READ, 'organic.read', 'organization.read', 'integrations.read', 'access_control.read', 'playbooks.manage_global'],
  revenue_ops: [...BUSINESS_READ, 'organic.read', 'organization.read', 'integrations.read', 'access_control.read', 'leads.write', 'costs.request'],
  sales_manager: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'playbooks.read', 'knowledge.read', 'meetings.read', 'pipeline.read', 'tasks.read',
    'experiments.read', 'memory.read', 'organization.read',
    'access_control.read',
  ],
  sales_rep: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'playbooks.read', 'knowledge.read', 'meetings.read', 'pipeline.read', 'tasks.read',
  ],
  marketing_growth: [
    'dashboard.read', 'leads.read', 'campaigns.read', 'organic.read', 'ads.read', 'social.read',
    'funnels.read', 'agents.read', 'playbooks.read', 'automations.read', 'knowledge.read',
    'growth.read', 'experiments.read', 'memory.read', 'integrations.read',
    'leads.write', 'costs.request',
  ],
  analyst: ['dashboard.read', 'campaigns.read', 'organic.read', 'ads.read', 'social.read', 'funnels.read', 'pipeline.read', 'growth.read', 'experiments.read', 'organization.read'],
  compliance: [
    'dashboard.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
    'campaigns.read', 'organic.read', 'playbooks.read', 'knowledge.read', 'memory.read', 'governance.read',
    'organization.read', 'access_control.read',
  ],
  finance_controller: ['dashboard.read', 'campaigns.read', 'organic.read', 'ads.read', 'growth.read', 'experiments.read', 'organization.read', 'audit.read'],
  guest: ['dashboard.read'],
  // Legacy roles remain usable even when the server has not yet attached an
  // explicit permission list to the refreshed user object.
  agent: [...BUSINESS_READ, 'organization.read', 'integrations.read', 'access_control.read', 'leads.write', 'costs.request'],
  viewer: [...BUSINESS_READ, 'organization.read'],
}

const NAVIGATION_REQUIREMENTS = {
  '/dashboard': ['dashboard.read'],
  '/campanas': ['campaigns.read'],
  '/organic': ['organic.read'],
  '/ads': ['ads.read'],
  '/redes-sociales': ['social.read'],
  // Prospect search/import is a paid operation and has no separate read
  // permission in the current backend policy.
  '/prospectos': ['leads.write', 'costs.request'],
  '/landings': ['campaigns.read'],
  '/funnels': ['funnels.read'],
  '/conversacion/inbox': ['conversations.read'],
  '/llamadas': ['calls.read'],
  '/agentes': ['agents.read'],
  '/playbooks': ['playbooks.read'],
  '/voz/test': ['agents.read'],
  '/voz/omni': ['agents.read'],
  '/email-marketing': ['campaigns.read'],
  '/automatizaciones': ['automations.read'],
  '/growth': ['growth.read'],
  '/leads': ['leads.read'],
  '/pipeline': ['pipeline.read'],
  '/reuniones': ['meetings.read'],
  // This page is transversal; any one of its read surfaces is enough to show
  // the entry point, while the API still decides which panels are available.
  '/inteligencia-comercial': { anyOf: ['leads.read', 'experiments.read', 'memory.read'] },
  '/insights': ['dashboard.read'],
  '/knowledge-base': ['knowledge.read'],
  // /settings/me is available to authenticated users; organization.read keeps
  // the entry visible for personal settings while excluding a zero-permission
  // account from the navigation.
  '/configuracion': ['organization.read'],
  '/gobierno-empresarial': ['governance.read'],
  '/access-control': ['access_control.read'],
  '/admin/ad-playbooks': ['playbooks.manage_global'],
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
  if (explicit) return explicit

  const role = normalizeRole(user?.role || user?.roleKey || user?.access?.role)
  return new Set(ROLE_FALLBACK_PERMISSIONS[role] || [])
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
