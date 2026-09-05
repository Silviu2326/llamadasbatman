import {
  RiApps2Line,
  RiBarChartLine,
  RiBook2Line,
  RiBookReadLine,
  RiBuilding2Line,
  RiCalendarLine,
  RiClapperboardLine,
  RiCompass3Line,
  RiDashboard3Line,
  RiFlowChart,
  RiFolderImageLine,
  RiGlobalLine,
  RiGroupLine,
  RiHome5Line,
  RiLeafLine,
  RiLineChartLine,
  RiListCheck2,
  RiMailLine,
  RiMessage3Line,
  RiMicLine,
  RiMore2Fill,
  RiPhoneLine,
  RiPlugLine,
  RiRobot2Line,
  RiRocket2Line,
  RiSettings4Line,
  RiShareForwardLine,
  RiShoppingCart2Line,
  RiSparkling2Line,
  RiTeamLine,
} from 'react-icons/ri'

export const APP_SPACES = [
  { id: 'home', label: 'Inicio', labelEn: 'Home', Icon: RiHome5Line, fallbackPath: '/dashboard' },
  { id: 'sales', label: 'Ventas', labelEn: 'Sales', Icon: RiLineChartLine, fallbackPath: '/pipeline' },
  { id: 'growth', label: 'Growth', labelEn: 'Growth', Icon: RiRocket2Line, fallbackPath: '/growth' },
  // Studio no tiene espacio propio: la ruta /studio sigue viva y la paleta lo
  // encuentra, pero no ocupa un sitio en el rail. Sus vecinos (Microapps y
  // Activos) se mudaron a «Más» para no quedarse huérfanos al retirarlo.
  { id: 'learn', label: 'Aprender', labelEn: 'Learn', Icon: RiBookReadLine, fallbackPath: '/aprender' },
  { id: 'more', label: 'Más', labelEn: 'More', Icon: RiMore2Fill, fallbackPath: '/configuracion' },
]

export const APP_MODULES = [
  { id: 'dashboard', moduleId: 'dashboard', space: 'home', label: 'Resumen', labelEn: 'Overview', to: '/dashboard', Icon: RiDashboard3Line, keywords: 'inicio prioridades alertas recientes dashboard' },
  { id: 'plan', moduleId: 'dashboard', space: 'home', label: 'Plan y objetivos', labelEn: 'Plan & goals', to: '/plan', Icon: RiLineChartLine, keywords: 'plan objetivos inversión previsión' },
  { id: 'insights', moduleId: 'insights', space: 'home', label: 'Análisis del negocio', labelEn: 'Business analysis', to: '/insights', Icon: RiBarChartLine, keywords: 'métricas rendimiento decisiones análisis negocio' },

  { id: 'growth-operations', moduleId: 'automations', space: 'growth', label: 'Operaciones', labelEn: 'Operations', to: '/operaciones-growth', aliases: ['/orquestador', '/trabajos', '/automatizaciones'], Icon: RiFlowChart, keywords: 'objetivos orquestador misiones acciones jobs trabajos ejecuciones cola aprobaciones automatizaciones flows workflows recetas disparadores' },

  { id: 'crm', moduleId: 'leads', space: 'sales', label: 'CRM', labelEn: 'CRM', to: '/ventas', aliases: ['/leads', '/cuentas', '/pipeline', '/inteligencia-comercial'], Icon: RiGroupLine, keywords: 'leads cuentas pipeline contactos oportunidades crm inteligencia previsiones señales' },
  { id: 'calendar', moduleId: 'meetings', space: 'sales', label: 'Calendario', labelEn: 'Calendar', to: '/calendario', aliases: ['/reuniones'], Icon: RiCalendarLine, keywords: 'calendario reuniones citas demos seguimientos' },
  { id: 'calls', moduleId: 'calls', space: 'sales', label: 'Llamadas', labelEn: 'Calls', to: '/llamadas', Icon: RiPhoneLine, keywords: 'voz conversaciones grabaciones' },
  { id: 'agents', moduleId: 'agents', space: 'sales', label: 'Agentes IA', labelEn: 'AI agents', to: '/agentes', Icon: RiRobot2Line, keywords: 'voz agentes comerciales' },
  { id: 'resources', moduleId: 'knowledge', space: 'sales', label: 'Documentos y guiones', labelEn: 'Documents and scripts', to: '/recursos-ia', aliases: ['/knowledge-base', '/playbooks'], Icon: RiBookReadLine, keywords: 'artículos fuentes conocimiento playbooks guiones plantillas ventas agentes seguimiento' },

  { id: 'growth-hub', moduleId: 'growth', space: 'growth', label: 'Resumen Growth', labelEn: 'Growth overview', to: '/growth', Icon: RiRocket2Line, keywords: 'growth hub crecimiento' },
  // El recorrido de captación es una sola sección (/captacion) con etapas
  // anidadas. La portada es el módulo principal; las etapas son módulos
  // propios para que la paleta y la navegación local lleguen a cada una.
  { id: 'capture', moduleId: 'campaigns', space: 'growth', label: 'Captación', labelEn: 'Acquisition', to: '/captacion', Icon: RiRocket2Line, keywords: 'captación recorrido planificar atraer convertir cerrar' },
  { id: 'capture-plan', moduleId: 'campaigns', space: 'growth', label: 'Planificar · Campañas', labelEn: 'Plan · Campaigns', to: '/captacion/planificar', Icon: RiShareForwardLine, keywords: 'campañas marketing objetivos', showInLocalNavigation: false },
  { id: 'capture-ads', moduleId: 'ads', space: 'growth', label: 'Atraer · Ads', labelEn: 'Attract · Ads', to: '/captacion/atraer/ads', aliases: ['/captacion/nueva'], Icon: RiBarChartLine, keywords: 'publicidad meta anuncios', showInLocalNavigation: false },
  { id: 'capture-organic', moduleId: 'organic', space: 'growth', label: 'Atraer · Orgánico y social', labelEn: 'Attract · Organic & social', to: '/captacion/atraer/organico', Icon: RiLeafLine, keywords: 'organic leads contenido redes social metricool radar estudio', showInLocalNavigation: false },
  { id: 'capture-prospects', moduleId: 'prospect-finder', space: 'growth', label: 'Atraer · Prospectos', labelEn: 'Attract · Prospects', to: '/captacion/atraer/prospectos', Icon: RiCompass3Line, keywords: 'buscar prospección empresas', showInLocalNavigation: false },
  { id: 'capture-web', moduleId: 'landings', space: 'growth', label: 'Convertir · Web y SEO', labelEn: 'Convert · Web & SEO', to: '/captacion/convertir', Icon: RiGlobalLine, keywords: 'web landing conversión seo posicionamiento auditoría búsquedas keywords', showInLocalNavigation: false },
  { id: 'capture-funnels', moduleId: 'funnels', space: 'growth', label: 'Cerrar · Funnels', labelEn: 'Close · Funnels', to: '/captacion/cerrar', Icon: RiFlowChart, keywords: 'embudos conversión journey', showInLocalNavigation: false },
  { id: 'email', moduleId: 'email', space: 'growth', label: 'Email marketing', labelEn: 'Email marketing', to: '/email-marketing', Icon: RiMailLine, keywords: 'newsletter mautic nutrición' },

  // `showInLocalNavigation: false` lo esconde de los menús sin romper la ruta:
  // /studio sigue resolviendo a un espacio y la paleta lo sigue encontrando.
  { id: 'studio', moduleId: 'studio', space: 'more', label: 'Studio de Cine', labelEn: 'Film Studio', to: '/studio', Icon: RiClapperboardLine, keywords: 'video producción storyboard tomas', showInLocalNavigation: false },
  { id: 'microapps', moduleId: 'microapps', space: 'more', label: 'Microapps', labelEn: 'Microapps', to: '/microapps', Icon: RiApps2Line, keywords: 'crear investigar generar herramientas ia' },
  { id: 'assets', moduleId: 'assets', space: 'more', label: 'Biblioteca', labelEn: 'Library', to: '/activos', Icon: RiFolderImageLine, keywords: 'activos imágenes vídeos documentos biblioteca' },
  { id: 'business', moduleId: 'business-info', space: 'more', label: 'Empresa', labelEn: 'Company', to: '/informacion-empresa', aliases: ['/rellenar-desde-web'], Icon: RiBuilding2Line, keywords: 'organización empresa perfil importar analizar web' },
  { id: 'integrations', moduleId: 'connections', space: 'more', label: 'Integraciones', labelEn: 'Integrations', to: '/integraciones', aliases: ['/conexiones', '/marketplace', '/desarrolladores'], Icon: RiPlugLine, keywords: 'proveedores conexiones credenciales extensiones marketplace api webhooks byok' },
  { id: 'settings', moduleId: 'settings', space: 'more', label: 'Configuración', labelEn: 'Settings', to: '/configuracion', Icon: RiSettings4Line, keywords: 'ajustes cuenta costes plan' },
  { id: 'administration', moduleId: 'administration', space: 'more', label: 'Administración', labelEn: 'Administration', to: '/administracion', aliases: ['/gobierno-empresarial', '/access-control', '/agencia/clientes'], Icon: RiTeamLine, keywords: 'roles permisos usuarios gobierno auditoría políticas clientes white-label agencia' },
  { id: 'ad-playbooks', moduleId: 'ad-playbooks', space: 'more', label: 'Recetas Ads', labelEn: 'Ad recipes', to: '/admin/ad-playbooks', Icon: RiBook2Line, keywords: 'admin recetas anuncios', showInLocalNavigation: false },

  { id: 'learn-center', moduleId: 'tutorials', space: 'learn', label: 'Centro de aprendizaje', labelEn: 'Learning center', to: '/aprender', aliases: ['/tutoriales', '/documentacion'], Icon: RiBookReadLine, keywords: 'aprender tutoriales documentación guías pasos onboarding formación referencia api ayuda configuración' },
]

export const SPACE_BY_ID = Object.fromEntries(APP_SPACES.map(space => [space.id, space]))
export const MODULE_BY_NAV_ID = Object.fromEntries(APP_MODULES.map(module => [module.id, module]))

const LOCAL_GROUPS = {
  sales: [
    { id: 'crm', label: 'CRM', labelEn: 'CRM', moduleIds: ['crm'] },
    { id: 'calendar', label: 'Planificación', labelEn: 'Planning', moduleIds: ['calendar'] },
    { id: 'conversation', label: 'Conversación', labelEn: 'Conversation', moduleIds: ['calls', 'agents'] },
    { id: 'resources', label: 'Recursos', labelEn: 'Resources', moduleIds: ['resources'] },
  ],
  growth: [
    { id: 'overview', label: 'Dirección', labelEn: 'Direction', moduleIds: ['growth-hub'] },
    { id: 'acquisition', label: 'Captación', labelEn: 'Acquisition', moduleIds: ['capture', 'capture-plan', 'capture-ads', 'capture-organic', 'capture-prospects', 'capture-web', 'capture-funnels'] },
    { id: 'channels', label: 'Canales', labelEn: 'Channels', moduleIds: ['email'] },
    { id: 'operations', label: 'Operación', labelEn: 'Operations', moduleIds: ['growth-operations'] },
  ],
  more: [
    { id: 'tools', label: 'Herramientas', labelEn: 'Tools', moduleIds: ['microapps', 'assets'] },
    { id: 'organization', label: 'Configuración', labelEn: 'Setup', moduleIds: ['business', 'integrations', 'settings'] },
    { id: 'administration', label: 'Administración', labelEn: 'Administration', moduleIds: ['administration'] },
  ],
  learn: [
    { id: 'learning', label: 'Aprende a usar Vendrava', labelEn: 'Learn Vendrava', moduleIds: ['learn-center'] },
  ],
}

export function localNavigationGroups(spaceId, modules, locale = 'es') {
  const definitions = LOCAL_GROUPS[spaceId]
  if (!definitions) return [{ id: 'main', label: '', modules }]
  const available = new Map(modules.map(module => [module.id, module]))
  const groups = definitions.map(group => ({
    id: group.id,
    label: locale === 'en' ? group.labelEn : group.label,
    modules: group.moduleIds.map(id => available.get(id)).filter(Boolean),
  })).filter(group => group.modules.length)
  const groupedIds = new Set(groups.flatMap(group => group.modules.map(module => module.id)))
  const rest = modules.filter(module => !groupedIds.has(module.id))
  if (rest.length) groups.push({ id: 'other', label: locale === 'en' ? 'Other' : 'Otros', modules: rest })
  return groups
}

export function localizedLabel(item, locale) {
  return locale === 'en' ? item.labelEn || item.label : item.label
}

export function pathMatchesModule(pathname, module) {
  const paths = [module.to, ...(module.aliases || [])]
  return paths.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

export function moduleForPath(pathname) {
  return [...APP_MODULES]
    .sort((a, b) => Math.max(b.to.length, ...(b.aliases || []).map(path => path.length)) - Math.max(a.to.length, ...(a.aliases || []).map(path => path.length)))
    .find(module => pathMatchesModule(pathname, module)) || null
}

export function spaceForPath(pathname) {
  const activeModule = moduleForPath(pathname)
  return SPACE_BY_ID[activeModule?.space] || SPACE_BY_ID.home
}
