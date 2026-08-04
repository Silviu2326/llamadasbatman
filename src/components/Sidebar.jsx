import React, { useMemo, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import '../sidebar.css'
import {
  RiDashboard3Fill, RiPhoneLine, RiGroupLine, RiMessage3Line,
  RiRobot2Line, RiShoppingCart2Line, RiCalendarLine, RiBook2Line,
  RiBarChartLine, RiFlowChart, RiBookReadLine, RiSettings4Line,
  RiLogoutBoxLine, RiMicLine, RiCompass3Line, RiShareForwardLine, RiMailLine, RiGlobalLine, RiLeafLine, RiSparkling2Line,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import { useAuth } from '../contexts/AuthContext'
import { canNavigateTo, filterNavigationSections } from '../lib/navigationPermissions'
import { useExperience } from '../contexts/ExperienceContext'
import { useTheme } from '../hooks/useTheme'
import { useMediaQuery } from '../hooks/useMediaQuery'
import OnboardingModal from './OnboardingModal'
import { useI18n } from '../i18n'

const NAV_LABEL_KEYS = {
  dashboard: 'nav.dashboard', objectives: 'nav.objectives', campaigns: 'nav.campaigns', ads: 'nav.ads', social: 'nav.social',
  'prospect-finder': 'nav.prospectFinder', landings: 'nav.landings', funnels: 'nav.funnels', organic: 'nav.organicLeads', inbox: 'nav.inbox',
  calls: 'nav.calls', agents: 'nav.agents', playbooks: 'nav.playbooks', 'voice-test': 'nav.voiceTest', email: 'nav.emailMarketing',
  automations: 'nav.automations', growth: 'nav.growthHub', leads: 'nav.leads', pipeline: 'nav.pipeline', meetings: 'nav.meetings',
  'revenue-intelligence': 'nav.revenueIntelligence', insights: 'nav.insights', knowledge: 'nav.knowledgeBase', settings: 'nav.settings',
  governance: 'nav.governance', 'access-control': 'nav.accessControl', 'ad-playbooks': 'nav.adRecipes',
}

const SECTION_LABEL_KEYS = {
  captacion: 'nav.acquisition', conversacion: 'nav.conversation', nutricion: 'nav.nurturing', growth: 'nav.growth', ventas: 'nav.sales', sistema: 'nav.system',
}

function getNavLabel(item, t) {
  if (item.to === '/orquestador') return t('nav.objectives')
  return item.moduleId && NAV_LABEL_KEYS[item.moduleId] ? t(NAV_LABEL_KEYS[item.moduleId]) : item.label
}

// Dashboard queda fijo arriba, fuera de secciones (es el "home"). El resto se
// agrupa según el embudo del producto (ver PLATAFORMA_EXPLICACION_GENERAL.md)
// para que una lista de 17 items no sea un solo bloque plano.
const DASHBOARD_ITEM = { label: 'Dashboard', color: 'var(--accent)', to: '/dashboard', moduleId: 'dashboard' }
const OBJECTIVE_ITEM = { icon: RiSparkling2Line, label: 'Objetivos', color: 'var(--violet)', to: '/orquestador', moduleId: 'dashboard' }

const SECTIONS = [
  {
    id: 'captacion',
    label: 'Captación',
    items: [
      { icon: RiShareForwardLine, label: 'Campañas',        color: 'var(--pink)', to: '/campanas', moduleId: 'campaigns' },
      { icon: RiBarChartLine,     label: 'Ads',             color: 'var(--accent-soft)', to: '/ads', moduleId: 'ads' },
      { icon: RiShareForwardLine, label: 'Redes sociales',  color: 'var(--pink)', to: '/redes-sociales', moduleId: 'social' },
      { icon: RiCompass3Line,     label: 'Buscador de prospectos', color: 'var(--cyan)', to: '/prospectos', moduleId: 'prospect-finder' },
      { icon: RiGlobalLine,       label: 'Landings y webs', color: 'var(--cyan)', to: '/landings', moduleId: 'landings' },
      { icon: RiFlowChart,        label: 'Funnels',         color: 'var(--violet)', to: '/funnels', moduleId: 'funnels' },
      { icon: RiLeafLine,         label: 'Captación orgánica',   color: 'var(--lime)', to: '/organic', moduleId: 'organic' },
    ],
  },
  {
    id: 'conversacion',
    label: 'Conversación',
    items: [
      { icon: RiMessage3Line, label: 'Bandeja de entrada',      color: 'var(--cyan-soft)', to: '/conversacion/inbox', moduleId: 'inbox' },
      { icon: RiPhoneLine,  label: 'Llamadas',   color: 'var(--success)', to: '/llamadas', moduleId: 'calls' },
      { icon: RiRobot2Line, label: 'Agentes IA', color: 'var(--violet)', to: '/agentes', moduleId: 'agents' },
      { icon: RiBook2Line,  label: 'Playbooks',  color: 'var(--success)', to: '/playbooks', moduleId: 'playbooks' },
      { icon: RiMicLine,    label: 'Probar voz', color: 'var(--danger)', to: '/voz/test', moduleId: 'voice-test' },
      { icon: RiMicLine,    label: 'Qwen Omni (beta)', color: 'var(--cyan)', to: '/voz/omni', moduleId: 'qwen-omni' },
    ],
  },
  {
    id: 'nutricion',
    label: 'Nutrición',
    items: [
      { icon: RiMailLine,  label: 'Email marketing',  color: 'var(--accent)', to: '/email-marketing', moduleId: 'email' },
      { icon: RiFlowChart, label: 'Automatizaciones', color: 'var(--danger-soft)', to: '/automatizaciones', moduleId: 'automations' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { icon: RiFlowChart, label: 'Growth Hub', color: 'var(--cyan-soft)', to: '/growth', moduleId: 'growth' },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    items: [
      { icon: RiGroupLine,         label: 'Leads',     color: 'var(--warn)', to: '/leads', moduleId: 'leads' },
      { icon: RiShoppingCart2Line, label: 'Pipeline',  color: 'var(--cyan-deep)', to: '/pipeline', moduleId: 'pipeline' },
      { icon: RiCalendarLine,      label: 'Reuniones', color: 'var(--warn)', to: '/reuniones', moduleId: 'meetings' },
      { icon: RiFlowChart,         label: 'Inteligencia comercial', color: 'var(--accent-soft)', to: '/inteligencia-comercial', moduleId: 'revenue-intelligence' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { icon: RiBarChartLine, label: 'Insights',       color: 'var(--violet)', to: '/insights', moduleId: 'insights' },
      { icon: RiBookReadLine, label: 'Base de conocimiento', color: 'var(--success)', to: '/knowledge-base', moduleId: 'knowledge' },
      { icon: RiSettings4Line, label: 'Configuración', color: 'var(--muted)', to: '/configuracion', moduleId: 'settings' },
      { icon: RiSettings4Line, label: 'Gobierno empresarial', color: 'var(--cyan-soft)', to: '/gobierno-empresarial', moduleId: 'governance' },
      { icon: RiSettings4Line, label: 'Control de accesos', color: 'var(--warn)', to: '/access-control', moduleId: 'access-control' },
      { icon: RiBook2Line, label: 'Recetas Ads', color: 'var(--violet-deep)', to: '/admin/ad-playbooks', moduleId: 'ad-playbooks' },
    ],
  },
]

const STORAGE_KEY = 'vozia_sidebar_collapsed:v1'

// Iconos generados con Magnific (gpt-2), estilo mono-línea con acento índigo→violeta.
// Cada slug existe en /assets/sidebar-icons/light/ y /dark/ con el mismo glifo.
const SIDEBAR_ICONS = {
  '/dashboard': 'dashboard',
  '/orquestador': 'objectives',
  '/campanas': 'campaigns',
  '/ads': 'ads',
  '/redes-sociales': 'social',
  '/prospectos': 'prospect-finder',
  '/landings': 'landings',
  '/funnels': 'funnels',
  '/organic': 'organic',
  '/conversacion/inbox': 'inbox',
  '/llamadas': 'calls',
  '/agentes': 'agents',
  '/playbooks': 'playbooks',
  '/voz/test': 'voice-test',
  '/voz/omni': 'qwen-omni',
  '/email-marketing': 'email',
  '/automatizaciones': 'automations',
  '/growth': 'growth',
  '/leads': 'leads',
  '/pipeline': 'pipeline',
  '/reuniones': 'meetings',
  '/inteligencia-comercial': 'revenue-intelligence',
  '/insights': 'insights',
  '/knowledge-base': 'knowledge',
  '/configuracion': 'settings',
  '/gobierno-empresarial': 'governance',
  '/access-control': 'access-control',
  '/admin/ad-playbooks': 'ad-playbooks',
}

function loadCollapsed() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === 'boolean'))
  } catch {
    return {}
  }
}

function saveCollapsed(value) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // La navegación sigue funcionando aunque el navegador bloquee el storage.
  }
}

function NavItem({ item, isHovered, onHover, onLeave, ripple, onClick, t, theme }) {
  const Icon = item.icon
  const slug = SIDEBAR_ICONS[item.to]
  const image = slug ? `/assets/sidebar-icons/${theme === 'light' ? 'light' : 'dark'}/${slug}.png` : null
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={({ isActive }) => ({
        ...styles.navBtn,
        textDecoration: 'none',
        ...(isActive ? styles.navBtnActive(item.color) : {}),
        ...(!isActive && isHovered ? styles.navBtnHover(item.color) : {}),
      })}
      className="nav-item-enter"
    >
      {({ isActive }) => (<>
        {ripple && (
          <span
            style={{ ...styles.ripple, left: ripple.x, top: ripple.y, background: `color-mix(in srgb, ${item.color} 33%, transparent)` }}
            className="ripple-anim"
          />
        )}
        <span
          style={{
            ...styles.iconWrap,
            background: isActive
              ? `color-mix(in srgb, ${item.color} 15%, transparent)`
              : isHovered ? `color-mix(in srgb, ${item.color} 9%, transparent)` : 'transparent',
            boxShadow: isActive ? `0 0 12px color-mix(in srgb, ${item.color} 33%, transparent)` : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {image ? (
            <img src={image} alt="" aria-hidden="true" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', opacity: isActive || isHovered ? 1 : 0.76, transition: 'opacity 0.2s ease, transform 0.2s ease', transform: isActive ? 'scale(1.08)' : 'none' }} />
          ) : (
            <Icon style={{ width: 18, height: 18, color: isActive ? item.color : isHovered ? item.color : 'var(--dim)', transition: 'color 0.2s ease' }} />
          )}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--text-strong)' : isHovered ? 'var(--text)' : 'var(--muted)', transition: 'color 0.2s ease', letterSpacing: 0.1 }}>
          {getNavLabel(item, t)}
        </span>
        {isActive && <span style={{ ...styles.activeDot, background: item.color, boxShadow: `0 0 8px ${item.color}` }} className="pulse-dot" />}
      </>)}
    </NavLink>
  )
}

export default function Sidebar({ isOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const [hoveredKey, setHoveredKey] = useState(null)
  const [ripple, setRipple] = useState(null)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const experience = useExperience()
  const [theme, setTheme, isAutoTheme] = useTheme()
  // A <=768px la barra sale del flujo y pasa a ser un cajon superpuesto.
  const isDrawer = useMediaQuery('(max-width: 768px)')
  const permittedSections = useMemo(() => filterNavigationSections(user, SECTIONS), [user])
  const visibleSections = useMemo(() => permittedSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => experience.isModuleVisible(
        item.moduleId,
        { isActive: location.pathname.startsWith(item.to) },
      )),
    }))
    .filter(section => section.items.length > 0), [experience, location.pathname, permittedSections])
  const canSeeDashboard = canNavigateTo(user, DASHBOARD_ITEM.to) && experience.isModuleVisible(
    DASHBOARD_ITEM.moduleId,
    { isActive: location.pathname.startsWith(DASHBOARD_ITEM.to) },
  )

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handleClick(key, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({ key, x: e.clientX - rect.left, y: e.clientY - rect.top })
    setTimeout(() => setRipple(null), 600)
  }

  function toggleSection(id) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      saveCollapsed(next)
      return next
    })
  }

  return (
    <>
      <aside
      className={`sidebar-aside${isOpen ? ' open' : ''}`}
      style={styles.aside}
      // Con el cajon cerrado en movil, sus ~25 enlaces seguian siendo enfocables
      // fuera de pantalla. inert los saca del foco y del arbol accesible.
      inert={isDrawer && !isOpen ? '' : undefined}
    >
      {/* Animated top glow border */}
      <div style={styles.topGlow} />

      {/* Logo */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="VozIA"
            className="logo-spin-hover"
            style={{ width: 58, height: 58, borderRadius: 13, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', boxShadow: '0 0 22px #6366f155' }}
          />
          <div>
            <p style={styles.logoText}>VozIA</p>
            <p style={styles.logoSub}>AI Voice Revenue Platform</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Nav */}
      <nav className="sidebar-nav" style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
        {canSeeDashboard ? (
          <NavItem
            item={DASHBOARD_ITEM}
            isHovered={hoveredKey === DASHBOARD_ITEM.to}
            onHover={() => setHoveredKey(DASHBOARD_ITEM.to)}
            onLeave={() => setHoveredKey(null)}
            ripple={ripple?.key === DASHBOARD_ITEM.to ? ripple : null}
            onClick={e => handleClick(DASHBOARD_ITEM.to, e)}
            t={t}
            theme={theme}
          />
        ) : null}

        {canSeeDashboard && (
          <NavItem
            item={OBJECTIVE_ITEM}
            isHovered={hoveredKey === OBJECTIVE_ITEM.to}
            onHover={() => setHoveredKey(OBJECTIVE_ITEM.to)}
            onLeave={() => setHoveredKey(null)}
            ripple={ripple?.key === OBJECTIVE_ITEM.to ? ripple : null}
            onClick={e => handleClick(OBJECTIVE_ITEM.to, e)}
            t={t}
            theme={theme}
          />
        )}

        {visibleSections.map(section => {
          const hasActiveItem = section.items.some(it => location.pathname.startsWith(it.to))
          const isCollapsed = !!collapsed[section.id] && !hasActiveItem
          const sectionItemsId = `sidebar-section-items-${section.id}`
          return (
            <div key={section.id} style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={!isCollapsed}
                aria-controls={sectionItemsId}
                style={styles.sectionHeader}
              >
                <span>{SECTION_LABEL_KEYS[section.id] ? t(SECTION_LABEL_KEYS[section.id]) : section.label}</span>
                <HiChevronDown style={{ width: 12, height: 12, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              <div id={sectionItemsId} className={`sidebar-section-items${isCollapsed ? ' collapsed' : ''}`}>
                <div>
                  {section.items.map(item => (
                    <NavItem
                      key={item.to}
                      item={item}
                      isHovered={hoveredKey === item.to}
                      onHover={() => setHoveredKey(item.to)}
                      onLeave={() => setHoveredKey(null)}
                      ripple={ripple?.key === item.to ? ripple : null}
                      onClick={e => handleClick(item.to, e)}
                      t={t}
                      theme={theme}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}

      </nav>

      <div className="sidebar-locale-switcher" role="group" aria-label={t('common.language')}>
        <span>{t('common.language')}</span>
        <button type="button" className={locale === 'es' ? 'active' : ''} onClick={() => setLocale('es')}>ES</button>
        <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
      </div>

      <div className="sidebar-locale-switcher" role="group" aria-label={t('common.theme')}>
        <span>{t('common.theme')}</span>
        <button type="button" className={isAutoTheme ? 'active' : ''} onClick={() => setTheme(null)}>{t('common.themeAuto')}</button>
        <button
          type="button"
          className={!isAutoTheme && theme === 'light' ? 'active' : ''}
          onClick={() => setTheme('light')}
          title={t('common.themeLight')}
          aria-label={t('common.themeLight')}
        >☀</button>
        <button
          type="button"
          className={!isAutoTheme && theme === 'dark' ? 'active' : ''}
          onClick={() => setTheme('dark')}
          title={t('common.themeDark')}
          aria-label={t('common.themeDark')}
        >☾</button>
      </div>


      {/* User */}
      <div style={styles.divider} />
      <div style={{ padding: '10px 12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => navigate('/configuracion')}
            style={{ ...styles.userBtn, flex: 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={styles.avatar}>{initials}</div>
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'Tu cuenta'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--dim)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || 'Sesión activa'}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            title={t('sidebar.logout')}
            style={styles.logoutBtn}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8717115'; e.currentTarget.style.color = 'var(--danger-soft)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--faint)' }}
          >
            <RiLogoutBoxLine style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 12px' }}>
          <button type="button" onClick={() => navigate('/privacidad')} style={styles.legalLink}>{t('legal.privacyTitle')}</button>
          <span style={{ color: 'var(--dim)', fontSize: 11 }}>·</span>
          <button type="button" onClick={() => navigate('/terminos')} style={styles.legalLink}>{t('legal.termsTitle')}</button>
        </div>
      </div>
      </aside>
      {experience.providerAvailable && !experience.onboardingCompleted && <OnboardingModal />}
    </>
  )
}

const styles = {
  aside: {
    display: 'flex',
    flexDirection: 'column',
    width: 224,
    minHeight: '100dvh',
    flexShrink: 0,
    background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface) 100%)',
    borderRight: '1px solid var(--line)',
    // position handled by .sidebar-aside CSS class (responsive)
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    background: 'linear-gradient(90deg, var(--accent), var(--violet), var(--pink), var(--accent))',
    backgroundSize: '200% 100%',
    animation: 'gradientMove 3s linear infinite',
  },
  logoIcon: {
    width: 40, height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--accent-deep) 0%, var(--violet-deep) 100%)',
    boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 33%, transparent), 0 4px 12px var(--shadow-color)',
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  logoText: {
    color: 'var(--text-strong)',
    fontWeight: 800,
    fontSize: 20,
    margin: 0,
    letterSpacing: -0.5,
  },
  logoSub: {
    color: 'var(--dim)',
    fontSize: 10.5,
    margin: '2px 0 0',
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, var(--line) 30%, var(--line) 70%, transparent)',
    margin: '0',
  },
  sectionHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 10px 6px',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--dim)',
  },
  navBtn: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    marginBottom: 2,
    overflow: 'hidden',
    transition: 'transform 0.15s ease',
  },
  navBtnActive: color => ({
    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 13%, transparent) 0%, color-mix(in srgb, ${color} 6%, transparent) 100%)`,
    border: `1px solid color-mix(in srgb, ${color} 21%, transparent)`,
    boxShadow: `inset 0 0 20px color-mix(in srgb, ${color} 6%, transparent), 0 2px 8px color-mix(in srgb, ${color} 13%, transparent)`,
  }),
  navBtnHover: color => ({
    background: `color-mix(in srgb, ${color} 5%, transparent)`,
    transform: 'translateX(3px)',
  }),
  iconWrap: {
    width: 32, height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activeDot: {
    width: 6, height: 6,
    borderRadius: '50%',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  ripple: {
    position: 'absolute',
    width: 6, height: 6,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%) scale(0)',
    pointerEvents: 'none',
  },
  greenDot: {
    width: 8, height: 8,
    borderRadius: '50%',
    background: 'var(--success)',
    boxShadow: '0 0 8px var(--success)',
    flexShrink: 0,
    display: 'inline-block',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 99,
    background: 'var(--line)',
    position: 'relative',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 99,
    background: 'linear-gradient(90deg, var(--accent-deep) 0%, var(--violet-deep) 50%, var(--violet) 100%)',
    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
  },
  progressShine: {
    position: 'absolute',
    top: 0,
    width: 12, height: '100%',
    background: 'rgba(255,255,255,0.4)',
    borderRadius: 99,
    filter: 'blur(2px)',
    transition: 'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  userBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  avatar: {
    width: 34, height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, var(--cyan) 0%, var(--cyan-deep) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--surface)',
    flexShrink: 0,
    boxShadow: '0 0 12px #06b6d455',
  },
  legalLink: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--dim)', fontSize: 11, fontFamily: 'inherit',
  },
  logoutBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--dim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s, color 0.2s',
  },
}
