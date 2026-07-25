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
import { EXPERIENCE_MODES } from '../lib/experienceConfig'
import ExperienceSwitcher from './ExperienceSwitcher'
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
const DASHBOARD_ITEM = { image: '/assets/sidebar-icons/dashboard.png', label: 'Dashboard', color: '#6366f1', to: '/dashboard', moduleId: 'dashboard' }
const OBJECTIVE_ITEM = { icon: RiSparkling2Line, label: 'Objetivos', color: '#a78bfa', to: '/orquestador', moduleId: 'dashboard' }

const SECTIONS = [
  {
    id: 'captacion',
    label: 'Captación',
    items: [
      { icon: RiShareForwardLine, label: 'Campañas',        color: '#ec4899', to: '/campanas', moduleId: 'campaigns' },
      { icon: RiBarChartLine,     label: 'Ads',             color: '#818cf8', to: '/ads', moduleId: 'ads' },
      { icon: RiShareForwardLine, label: 'Redes sociales',  color: '#ec4899', to: '/redes-sociales', moduleId: 'social' },
      { icon: RiCompass3Line,     label: 'Prospect Finder', color: '#22d3ee', to: '/prospectos', moduleId: 'prospect-finder' },
      { icon: RiGlobalLine,       label: 'Landings & webs', color: '#22d3ee', to: '/landings', moduleId: 'landings' },
      { icon: RiFlowChart,        label: 'Funnels',         color: '#a78bfa', to: '/funnels', moduleId: 'funnels' },
      { icon: RiLeafLine,         label: 'Organic Leads',   color: '#84cc16', to: '/organic', moduleId: 'organic' },
    ],
  },
  {
    id: 'conversacion',
    label: 'Conversación',
    items: [
      { icon: RiMessage3Line, label: 'Inbox',      color: '#38bdf8', to: '/conversacion/inbox', moduleId: 'inbox' },
      { icon: RiPhoneLine,  label: 'Llamadas',   color: '#10b981', to: '/llamadas', moduleId: 'calls' },
      { icon: RiRobot2Line, label: 'Agentes IA', color: '#8b5cf6', to: '/agentes', moduleId: 'agents' },
      { icon: RiBook2Line,  label: 'Playbooks',  color: '#14b8a6', to: '/playbooks', moduleId: 'playbooks' },
      { icon: RiMicLine,    label: 'Test de Voz', color: '#f43f5e', to: '/voz/test', moduleId: 'voice-test' },
    ],
  },
  {
    id: 'nutricion',
    label: 'Nutrición',
    items: [
      { icon: RiMailLine,  label: 'Email marketing',  color: '#6366f1', to: '/email-marketing', moduleId: 'email' },
      { icon: RiFlowChart, label: 'Automatizaciones', color: '#fb7185', to: '/automatizaciones', moduleId: 'automations' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { icon: RiFlowChart, label: 'Growth Hub', color: '#38bdf8', to: '/growth', moduleId: 'growth' },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    items: [
      { icon: RiGroupLine,         label: 'Leads',     color: '#f59e0b', to: '/leads', moduleId: 'leads' },
      { icon: RiShoppingCart2Line, label: 'Pipeline',  color: '#06b6d4', to: '/pipeline', moduleId: 'pipeline' },
      { icon: RiCalendarLine,      label: 'Reuniones', color: '#f97316', to: '/reuniones', moduleId: 'meetings' },
      { icon: RiFlowChart,         label: 'Inteligencia comercial', color: '#8b93ff', to: '/inteligencia-comercial', moduleId: 'revenue-intelligence' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { icon: RiBarChartLine, label: 'Insights',       color: '#a78bfa', to: '/insights', moduleId: 'insights' },
      { icon: RiBookReadLine, label: 'Knowledge Base', color: '#34d399', to: '/knowledge-base', moduleId: 'knowledge' },
      { icon: RiSettings4Line, label: 'Configuración', color: '#94a3b8', to: '/configuracion', moduleId: 'settings' },
      { icon: RiSettings4Line, label: 'Gobierno empresarial', color: '#38bdf8', to: '/gobierno-empresarial', moduleId: 'governance' },
      { icon: RiSettings4Line, label: 'Control de accesos', color: '#f59e0b', to: '/access-control', moduleId: 'access-control' },
      { icon: RiBook2Line, label: 'Recetas Ads', color: '#7c3aed', to: '/admin/ad-playbooks', moduleId: 'ad-playbooks' },
    ],
  },
]

const STORAGE_KEY = 'vozia_sidebar_collapsed:v1'

const SIDEBAR_IMAGES = {
  '/dashboard': '/assets/sidebar-icons/dashboard.png',
  '/funnels': '/assets/sidebar-icons/campaigns.png',
  '/campanas': '/assets/sidebar-icons/campaigns.png',
  '/landings': '/assets/sidebar-icons/campaigns.png',
  '/prospectos': '/assets/sidebar-icons/prospect-finder.png',
  '/redes-sociales': '/assets/sidebar-icons/social.png',
  '/llamadas': '/assets/sidebar-icons/calls.png',
  '/conversacion/inbox': '/assets/sidebar-icons/calls.png',
  '/agentes': '/assets/sidebar-icons/agents.png',
  '/playbooks': '/assets/sidebar-icons/playbooks.png',
  '/voz/test': '/assets/sidebar-icons/voice-test.png',
  '/email-marketing': '/assets/sidebar-icons/email.png',
  '/automatizaciones': '/assets/sidebar-icons/automations.png',
  '/leads': '/assets/sidebar-icons/leads.png',
  '/pipeline': '/assets/sidebar-icons/pipeline.png',
  '/reuniones': '/assets/sidebar-icons/meetings.png',
  '/insights': '/assets/sidebar-icons/insights.png',
  '/knowledge-base': '/assets/sidebar-icons/knowledge.png',
  '/configuracion': '/assets/sidebar-icons/settings.png',
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

function NavItem({ item, isHovered, onHover, onLeave, ripple, onClick, t }) {
  const Icon = item.icon
  const image = SIDEBAR_IMAGES[item.to]
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
            style={{ ...styles.ripple, left: ripple.x, top: ripple.y, background: item.color + '55' }}
            className="ripple-anim"
          />
        )}
        <span
          style={{
            ...styles.iconWrap,
            background: isActive ? item.color + '25' : isHovered ? item.color + '18' : 'transparent',
            boxShadow: isActive ? `0 0 12px ${item.color}55` : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {image ? (
            <img src={image} alt="" aria-hidden="true" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', opacity: isActive || isHovered ? 1 : 0.76, transition: 'opacity 0.2s ease, transform 0.2s ease', transform: isActive ? 'scale(1.08)' : 'none' }} />
          ) : (
            <Icon style={{ width: 18, height: 18, color: isActive ? item.color : isHovered ? item.color : '#6b7280', transition: 'color 0.2s ease' }} />
          )}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: isActive ? 600 : 500, color: isActive ? '#ffffff' : isHovered ? '#e2e8f0' : '#9ca3af', transition: 'color 0.2s ease', letterSpacing: 0.1 }}>
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
  const hiddenModuleCount = useMemo(() => permittedSections.reduce((count, section) => count + section.items.filter(item => (
    experience.isModuleAvailable(item.moduleId) && !experience.isModuleVisible(item.moduleId)
  )).length, 0), [experience, permittedSections])
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
      <aside className={`sidebar-aside${isOpen ? ' open' : ''}`} style={styles.aside}>
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
          />
        )}

        {experience.providerAvailable && (
          <div className="sidebar-experience-section">
            <ExperienceSwitcher compact />
            {experience.experienceMode !== EXPERIENCE_MODES.ADVANCED && hiddenModuleCount > 0 && (
              <button type="button" className="sidebar-show-all" onClick={() => experience.setExperienceMode(EXPERIENCE_MODES.ADVANCED)}>
                <span>{t('sidebar.viewAll')}</span>
                <small>{t('sidebar.modulesAvailable', { count: hiddenModuleCount })}</small>
              </button>
            )}
          </div>
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

      {/* Status */}
      <div style={{ ...styles.divider, margin: '4px 0' }} />
      <div style={{ padding: '12px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...styles.greenDot, background: '#64748b', boxShadow: 'none' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{t('sidebar.systemStatus')}</span>
        </div>
        <p style={{ fontSize: 11.5, color: '#4b5563', marginTop: 2, paddingLeft: 16 }}>
          {t('sidebar.statusUnavailable')}
        </p>
      </div>

      {/* Progress */}
      <div style={styles.divider} />
      <div style={{ padding: '12px 20px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#cbd5e1' }}>{t('sidebar.aiCallUsage')}</span>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 11.5, lineHeight: 1.45 }}>
          {t('sidebar.usageUnavailable')}
        </p>
      </div>

      {/* User */}
      <div style={styles.divider} />
      <div style={{ padding: '10px 12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => navigate('/configuracion')}
            style={{ ...styles.userBtn, flex: 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1a2235')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={styles.avatar}>{initials}</div>
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name ?? '—'}
              </p>
              <p style={{ fontSize: 11, color: '#4b5563', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email ?? ''}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            title={t('sidebar.logout')}
            style={styles.logoutBtn}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8717115'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563' }}
          >
            <RiLogoutBoxLine style={{ width: 16, height: 16 }} />
          </button>
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
    minHeight: '100vh',
    flexShrink: 0,
    background: 'linear-gradient(180deg, #0d1117 0%, #0a0e1a 100%)',
    borderRight: '1px solid #1e2433',
    // position handled by .sidebar-aside CSS class (responsive)
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #6366f1)',
    backgroundSize: '200% 100%',
    animation: 'gradientMove 3s linear infinite',
  },
  logoIcon: {
    width: 40, height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    boxShadow: '0 0 20px #6366f155, 0 4px 12px #0000004d',
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  logoText: {
    color: '#f1f5f9',
    fontWeight: 800,
    fontSize: 20,
    margin: 0,
    letterSpacing: -0.5,
  },
  logoSub: {
    color: '#374151',
    fontSize: 10.5,
    margin: '2px 0 0',
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, #1e2433 30%, #1e2433 70%, transparent)',
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
    color: '#374151',
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
    background: `linear-gradient(90deg, ${color}22 0%, ${color}10 100%)`,
    border: `1px solid ${color}35`,
    boxShadow: `inset 0 0 20px ${color}10, 0 2px 8px ${color}20`,
  }),
  navBtnHover: color => ({
    background: `${color}0d`,
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
    background: '#10b981',
    boxShadow: '0 0 8px #10b981',
    flexShrink: 0,
    display: 'inline-block',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 99,
    background: '#1e2433',
    position: 'relative',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 99,
    background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
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
    background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: 'white',
    flexShrink: 0,
    boxShadow: '0 0 12px #06b6d455',
  },
  logoutBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#4b5563',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s, color 0.2s',
  },
}
