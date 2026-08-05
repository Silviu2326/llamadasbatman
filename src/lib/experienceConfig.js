export const EXPERIENCE_STORAGE_KEY = 'vendrava:experience-preferences:v1'
export const EXPERIENCE_STORAGE_VERSION = 1

export const EXPERIENCE_MODES = {
  BASIC: 'basic',
  RECOMMENDED: 'recommended',
  ADVANCED: 'advanced',
}

export const EXPERIENCE_MODE_OPTIONS = [
  {
    id: EXPERIENCE_MODES.BASIC,
    label: 'Básico',
    shortLabel: 'Básico',
    description: 'Solo las áreas esenciales para trabajar sin ruido.',
  },
  {
    id: EXPERIENCE_MODES.RECOMMENDED,
    label: 'Recomendado',
    shortLabel: 'Recomendado',
    description: 'Las áreas seleccionadas para tu negocio, objetivo y perfil.',
  },
  {
    id: EXPERIENCE_MODES.ADVANCED,
    label: 'Avanzado',
    shortLabel: 'Avanzado',
    description: 'Toda la plataforma disponible para tu plan.',
  },
]

export const PROFILE_OPTIONS = [
  {
    id: 'comercial',
    label: 'Comercial',
    description: 'Prioriza el seguimiento, las reuniones y el cierre.',
  },
  {
    id: 'admin',
    label: 'Administrador',
    description: 'Necesita control, permisos, configuración y visión global.',
  },
  {
    id: 'agencia',
    label: 'Agencia',
    description: 'Gestiona captación y resultados para varias cuentas o clientes.',
  },
  {
    id: 'direccion',
    label: 'Dirección',
    description: 'Busca decisiones rápidas sobre ingresos, rendimiento y riesgos.',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Orquesta campañas, contenido, audiencias y automatización.',
  },
]

export const BUSINESS_TYPE_OPTIONS = [
  { id: 'servicios', label: 'Servicios', description: 'Clínicas, despachos, formación o servicios profesionales.' },
  { id: 'local', label: 'Negocio local', description: 'Captas clientes en una ciudad o zona concreta.' },
  { id: 'b2b', label: 'B2B', description: 'Vendes a otras empresas con ciclos comerciales consultivos.' },
  { id: 'ecommerce', label: 'E-commerce', description: 'Vendes productos y necesitas volumen y recurrencia.' },
  { id: 'agencia', label: 'Agencia', description: 'Llevas marketing o ventas para clientes y cuentas distintas.' },
]

export const OBJECTIVE_OPTIONS = [
  { id: 'leads', label: 'Conseguir leads', description: 'Aumentar el número de oportunidades cualificadas.' },
  { id: 'ventas', label: 'Cerrar más ventas', description: 'Convertir mejor los leads que ya entran.' },
  { id: 'campanas', label: 'Coordinar campañas', description: 'Unir Ads, redes, email y landings en un mismo plan.' },
  { id: 'retencion', label: 'Mejorar la relación', description: 'Automatizar seguimiento, nutrición y reactivación.' },
  { id: 'visibilidad', label: 'Ganar visibilidad', description: 'Aprovechar búsquedas, contenido y presencia local.' },
]

export const PLAN_OPTIONS = [
  { id: 'starter', label: 'Starter', description: 'Operativa esencial para un equipo pequeño.' },
  { id: 'pro', label: 'Pro', description: 'Captación, conversación, automatización y ventas.' },
  { id: 'agency', label: 'Agency', description: 'Gestión avanzada de clientes, cuentas y crecimiento.' },
  { id: 'enterprise', label: 'Enterprise', description: 'Gobierno, permisos y control para organizaciones.' },
]

// Esta configuración solo gobierna la experiencia de navegación. La autorización
// efectiva sigue estando en navigationPermissions.js y en el backend.
export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', group: 'home', basicVisible: true, minPlan: 'starter' },
  { id: 'campaigns', label: 'Campañas', group: 'captacion', basicVisible: true, minPlan: 'pro' },
  { id: 'ads', label: 'Ads', group: 'captacion', basicVisible: true, minPlan: 'pro' },
  { id: 'social', label: 'Redes sociales', group: 'captacion', basicVisible: false, minPlan: 'pro' },
  { id: 'prospect-finder', label: 'Prospect Finder', group: 'captacion', basicVisible: false, minPlan: 'agency' },
  { id: 'landings', label: 'Landings & webs', group: 'captacion', basicVisible: false, minPlan: 'pro' },
  { id: 'funnels', label: 'Funnels', group: 'captacion', basicVisible: false, minPlan: 'pro' },
  { id: 'organic', label: 'Organic Leads', group: 'captacion', basicVisible: true, minPlan: 'pro' },
  { id: 'seo', label: 'SEO', group: 'captacion', basicVisible: false, minPlan: 'pro' },
  { id: 'inbox', label: 'Inbox', group: 'conversacion', basicVisible: true, minPlan: 'pro' },
  { id: 'calls', label: 'Llamadas', group: 'conversacion', basicVisible: true, minPlan: 'pro' },
  { id: 'agents', label: 'Agentes IA', group: 'conversacion', basicVisible: false, minPlan: 'pro' },
  { id: 'playbooks', label: 'Playbooks', group: 'conversacion', basicVisible: false, minPlan: 'pro' },
  { id: 'voice-test', label: 'Test de Voz', group: 'conversacion', basicVisible: false, minPlan: 'pro' },
  { id: 'qwen-omni', label: 'Qwen Omni (beta)', group: 'conversacion', basicVisible: false, minPlan: 'pro' },
  { id: 'email', label: 'Email marketing', group: 'nutricion', basicVisible: false, minPlan: 'pro' },
  { id: 'automations', label: 'Automatizaciones', group: 'nutricion', basicVisible: true, minPlan: 'pro' },
  { id: 'growth', label: 'Growth Hub', group: 'growth', basicVisible: false, minPlan: 'agency' },
  { id: 'leads', label: 'Leads', group: 'ventas', basicVisible: true, minPlan: 'starter' },
  { id: 'pipeline', label: 'Pipeline', group: 'ventas', basicVisible: true, minPlan: 'starter' },
  { id: 'meetings', label: 'Reuniones', group: 'ventas', basicVisible: true, minPlan: 'starter' },
  { id: 'revenue-intelligence', label: 'Inteligencia comercial', group: 'ventas', basicVisible: false, minPlan: 'pro' },
  { id: 'insights', label: 'Insights', group: 'sistema', basicVisible: false, minPlan: 'pro' },
  { id: 'knowledge', label: 'Knowledge Base', group: 'sistema', basicVisible: false, minPlan: 'pro' },
  { id: 'settings', label: 'Configuración', group: 'sistema', basicVisible: false, minPlan: 'starter' },
  { id: 'governance', label: 'Gobierno empresarial', group: 'sistema', basicVisible: false, minPlan: 'enterprise' },
  { id: 'access-control', label: 'Control de accesos', group: 'sistema', basicVisible: false, minPlan: 'enterprise' },
  { id: 'ad-playbooks', label: 'Recetas Ads', group: 'sistema', basicVisible: false, minPlan: 'agency' },
]

export const MODULE_BY_ID = Object.fromEntries(MODULES.map(module => [module.id, module]))
export const ALL_MODULE_IDS = MODULES.map(module => module.id)

export const DEFAULT_EXPERIENCE_PREFERENCES = {
  version: EXPERIENCE_STORAGE_VERSION,
  profile: 'comercial',
  businessType: 'servicios',
  objective: 'ventas',
  plan: 'pro',
  planSource: 'local',
  experienceMode: EXPERIENCE_MODES.RECOMMENDED,
  onboardingCompleted: false,
  recommendedModules: [],
}

const PLAN_RANK = { starter: 0, pro: 1, agency: 2, enterprise: 3 }

function safeWindow() {
  return typeof window !== 'undefined' ? window : null
}

function normalizePlanValue(value) {
  const candidate = typeof value === 'object' && value !== null
    ? value.id || value.key || value.slug || value.tier || value.name
    : value
  const normalized = String(candidate || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  const aliases = {
    free: 'starter',
    basic: 'starter',
    starter: 'starter',
    professional: 'pro',
    pro: 'pro',
    agency: 'agency',
    enterprise: 'enterprise',
  }
  return aliases[normalized] || null
}

export function getAccountPlan(user) {
  const candidates = [
    user?.plan,
    user?.subscriptionPlan,
    user?.subscription?.plan,
    user?.subscription?.tier,
    user?.billing?.plan,
    user?.account?.plan,
  ]
  return candidates.map(normalizePlanValue).find(Boolean) || null
}

export function getExperienceStorageKey(scope) {
  const identity = scope?.orgId || scope?.organizationId || scope?.tenantId || scope?.userId || scope?.id
  if (!identity) return EXPERIENCE_STORAGE_KEY
  const safeIdentity = String(identity).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  return `${EXPERIENCE_STORAGE_KEY}:${safeIdentity}`
}

export function readExperiencePreferences(storageKey = EXPERIENCE_STORAGE_KEY) {
  const currentWindow = safeWindow()
  if (!currentWindow?.localStorage) return null

  try {
    const raw = currentWindow.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === EXPERIENCE_STORAGE_VERSION ? parsed : null
  } catch {
    return null
  }
}

export function writeExperiencePreferences(preferences, storageKey = EXPERIENCE_STORAGE_KEY) {
  const currentWindow = safeWindow()
  if (!currentWindow?.localStorage) return false

  try {
    currentWindow.localStorage.setItem(storageKey, JSON.stringify({
      ...preferences,
      version: EXPERIENCE_STORAGE_VERSION,
    }))
    return true
  } catch {
    return false
  }
}

export function normalizeExperiencePreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const profile = PROFILE_OPTIONS.some(option => option.id === source.profile) ? source.profile : DEFAULT_EXPERIENCE_PREFERENCES.profile
  const businessType = BUSINESS_TYPE_OPTIONS.some(option => option.id === source.businessType) ? source.businessType : DEFAULT_EXPERIENCE_PREFERENCES.businessType
  const objective = OBJECTIVE_OPTIONS.some(option => option.id === source.objective) ? source.objective : DEFAULT_EXPERIENCE_PREFERENCES.objective
  const plan = PLAN_OPTIONS.some(option => option.id === source.plan) ? source.plan : DEFAULT_EXPERIENCE_PREFERENCES.plan
  const experienceMode = [EXPERIENCE_MODES.BASIC, EXPERIENCE_MODES.RECOMMENDED, EXPERIENCE_MODES.ADVANCED].includes(source.experienceMode)
    ? source.experienceMode
    : DEFAULT_EXPERIENCE_PREFERENCES.experienceMode
  const planSource = source.planSource === 'account' ? 'account' : 'local'
  const recommendedModules = Array.isArray(source.recommendedModules)
    ? source.recommendedModules.filter(moduleId => Boolean(MODULE_BY_ID[moduleId]))
    : []

  return {
    ...DEFAULT_EXPERIENCE_PREFERENCES,
    version: EXPERIENCE_STORAGE_VERSION,
    profile,
    businessType,
    objective,
    plan,
    planSource,
    experienceMode,
    onboardingCompleted: Boolean(source.onboardingCompleted),
    recommendedModules: [...new Set(recommendedModules)],
  }
}

function addModules(target, moduleIds) {
  moduleIds.forEach(moduleId => {
    if (MODULE_BY_ID[moduleId] && !target.includes(moduleId)) target.push(moduleId)
  })
}

export function getRecommendedModules(preferences = {}) {
  const { profile, businessType, objective, plan } = normalizeExperiencePreferences(preferences)
  const recommended = []

  addModules(recommended, ['dashboard', 'leads', 'pipeline', 'meetings'])

  const profileModules = {
    comercial: ['calls', 'inbox', 'agents', 'playbooks'],
    admin: ['dashboard', 'insights', 'settings', 'governance', 'access-control', 'automations'],
    agencia: ['campaigns', 'ads', 'organic', 'prospect-finder', 'social', 'landings', 'funnels', 'email', 'automations', 'growth', 'revenue-intelligence'],
    direccion: ['dashboard', 'insights', 'revenue-intelligence', 'pipeline', 'leads', 'meetings', 'growth'],
    marketing: ['campaigns', 'ads', 'organic', 'social', 'landings', 'email', 'automations', 'prospect-finder', 'growth'],
  }

  const businessModules = {
    servicios: ['organic', 'landings', 'calls'],
    local: ['organic', 'prospect-finder', 'ads', 'landings'],
    b2b: ['prospect-finder', 'agents', 'playbooks', 'revenue-intelligence'],
    ecommerce: ['ads', 'email', 'automations', 'social'],
    agencia: ['campaigns', 'ads', 'social', 'growth', 'revenue-intelligence'],
  }

  const objectiveModules = {
    leads: ['organic', 'prospect-finder', 'ads', 'landings'],
    ventas: ['pipeline', 'meetings', 'calls', 'agents'],
    campanas: ['campaigns', 'ads', 'social', 'email'],
    retencion: ['email', 'automations', 'inbox', 'calls'],
    visibilidad: ['organic', 'social', 'ads', 'landings'],
  }

  addModules(recommended, profileModules[profile] || [])
  addModules(recommended, businessModules[businessType] || [])
  addModules(recommended, objectiveModules[objective] || [])

  if (plan === 'starter') {
    addModules(recommended, ['inbox', 'calls'])
  }
  if (plan === 'agency' || plan === 'enterprise') {
    addModules(recommended, ['growth', 'revenue-intelligence'])
  }
  if (plan === 'enterprise') {
    addModules(recommended, ['governance', 'access-control', 'knowledge'])
  }

  return recommended.filter(moduleId => isModuleAvailableForPlan(moduleId, plan))
}

export function isModuleAvailableForPlan(moduleId, plan = 'pro') {
  const module = MODULE_BY_ID[moduleId]
  if (!module) return false
  return (PLAN_RANK[plan] ?? PLAN_RANK.pro) >= (PLAN_RANK[module.minPlan] ?? 0)
}

export function getOptionLabel(options, id, fallback = '') {
  return options.find(option => option.id === id)?.label || fallback || id
}

export function getProfileLabel(profile) {
  return getOptionLabel(PROFILE_OPTIONS, profile, 'Usuario')
}

export function getPlanLabel(plan) {
  return getOptionLabel(PLAN_OPTIONS, plan, 'Plan')
}
