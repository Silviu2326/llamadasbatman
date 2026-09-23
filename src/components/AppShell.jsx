import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiComputerLine,
  RiGlobalLine,
  RiLayoutGridLine,
  RiLogoutBoxLine,
  RiMenuLine,
  RiMoonLine,
  RiNotification3Line,
  RiPushpinFill,
  RiPushpinLine,
  RiRobot2Line,
  RiSearchLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiSunLine,
  RiTimeLine,
  RiUserLine,
  RiUserSharedLine,
  RiSparkling2Line,
} from 'react-icons/ri'
import { useAuth } from '../contexts/AuthContext'
import { useExperience } from '../contexts/ExperienceContext'
import { useBrand } from '../lib/brand'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import { useTheme } from '../hooks/useTheme'
import { canNavigateTo } from '../lib/navigationPermissions'
import { COMMAND_SHORTCUTS, readCommandPreferences, shortcutFromEvent } from '../lib/commandCenter'
import {
  APP_MODULES,
  APP_SPACES,
  localNavigationGroups,
  localizedLabel,
  MODULE_BY_NAV_ID,
  moduleForPath,
  pathMatchesModule,
  SPACE_BY_ID,
  spaceForPath,
} from '../lib/appNavigation'
import {
  readNavigationState,
  recordModuleVisit,
  togglePinnedModule,
  writeNavigationState,
} from '../lib/navigationState'
import AppErrorBoundary from './AppErrorBoundary'
import PlatformAssistant from './PlatformAssistant'
import { setAssistantRoute } from '../lib/assistantScreen'
import { preloadHomeLink } from '../lib/homePageModules'
import '../app-shell.css'

function initialsFor(user) {
  const source = user?.name || user?.email || 'V'
  return source.split(/[\s@]+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

function AccountMenu({ user, locale, setLocale, theme, setTheme, isAutoTheme, navigate, onLogout }) {
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState(null)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = event => { if (!anchorRef.current?.contains(event.target)) { setOpen(false); setSubmenu(null) } }
    const onKey = event => { if (event.key === 'Escape') { setOpen(false); setSubmenu(null) } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const themeLabel = isAutoTheme ? (locale === 'en' ? 'System' : 'Sistema') : theme === 'dark' ? (locale === 'en' ? 'Dark' : 'Oscuro') : (locale === 'en' ? 'Light' : 'Claro')
  const languageLabel = locale === 'en' ? 'English' : 'Español'
  const closeMenu = () => { setOpen(false); setSubmenu(null) }
  const goToAccount = () => { closeMenu(); navigate('/configuracion') }
  const selectTheme = value => { setTheme(value === 'system' ? null : value); setSubmenu(null) }

  return (
    <div ref={anchorRef} className="shell-account-anchor">
      <button type="button" className="shell-account-trigger" onClick={() => setOpen(value => !value)} aria-label={user?.name || 'Tu cuenta'} aria-expanded={open} aria-haspopup="menu">
        <span className="shell-avatar">{initialsFor(user)}</span>
        <RiArrowDownSLine aria-hidden="true" />
      </button>
      {open ? (
        <div className="shell-account-menu" role="menu" aria-label="Menú de cuenta">
          <header className="shell-account-profile">
            <span className="shell-avatar">{initialsFor(user)}</span>
            <span><strong>{user?.name || 'Tu cuenta'}</strong><small>{user?.email || ''}</small></span>
          </header>
          <div className="shell-account-divider" />
          <button type="button" role="menuitem" className="shell-account-item" onClick={goToAccount}><RiUserLine aria-hidden="true" /><span>{locale === 'en' ? 'My account' : 'Mi cuenta'}</span><RiArrowRightSLine aria-hidden="true" /></button>
          <div className="shell-account-divider" />
          <button type="button" role="menuitem" className="shell-account-item" onClick={() => setSubmenu(value => value === 'language' ? null : 'language')} aria-expanded={submenu === 'language'}><RiGlobalLine aria-hidden="true" /><span>{locale === 'en' ? 'Language' : 'Idioma'}</span><em>{languageLabel}</em><RiArrowRightSLine aria-hidden="true" /></button>
          {submenu === 'language' ? <div className="shell-account-submenu" role="group" aria-label={locale === 'en' ? 'Language' : 'Idioma'}><button type="button" className={locale === 'es' ? 'selected' : ''} onClick={() => { setLocale('es'); setSubmenu(null) }}>Español{locale === 'es' ? <RiCheckLine aria-hidden="true" /> : null}</button><button type="button" className={locale === 'en' ? 'selected' : ''} onClick={() => { setLocale('en'); setSubmenu(null) }}>English{locale === 'en' ? <RiCheckLine aria-hidden="true" /> : null}</button></div> : null}
          <button type="button" role="menuitem" className="shell-account-item" onClick={() => setSubmenu(value => value === 'appearance' ? null : 'appearance')} aria-expanded={submenu === 'appearance'}><>{theme === 'dark' ? <RiMoonLine aria-hidden="true" /> : <RiSunLine aria-hidden="true" />}</><span>{locale === 'en' ? 'Appearance' : 'Apariencia'}</span><em>{themeLabel}</em><RiArrowRightSLine aria-hidden="true" /></button>
          {submenu === 'appearance' ? <div className="shell-account-submenu" role="group" aria-label={locale === 'en' ? 'Appearance' : 'Apariencia'}><button type="button" className={isAutoTheme ? 'selected' : ''} onClick={() => selectTheme('system')}>{locale === 'en' ? 'System' : 'Sistema'}{isAutoTheme ? <RiCheckLine aria-hidden="true" /> : null}</button><button type="button" className={!isAutoTheme && theme === 'dark' ? 'selected' : ''} onClick={() => selectTheme('dark')}>{locale === 'en' ? 'Dark' : 'Oscuro'}{!isAutoTheme && theme === 'dark' ? <RiCheckLine aria-hidden="true" /> : null}</button><button type="button" className={!isAutoTheme && theme === 'light' ? 'selected' : ''} onClick={() => selectTheme('light')}>{locale === 'en' ? 'Light' : 'Claro'}{!isAutoTheme && theme === 'light' ? <RiCheckLine aria-hidden="true" /> : null}</button></div> : null}
          <div className="shell-account-divider" />
          <button type="button" role="menuitem" className="shell-account-item shell-account-item-danger" onClick={() => { closeMenu(); onLogout() }}><RiLogoutBoxLine aria-hidden="true" /><span>{locale === 'en' ? 'Sign out' : 'Cerrar sesión'}</span></button>
        </div>
      ) : null}
    </div>
  )
}

function SpaceButton({ space, active, locale, onClick, compact = false }) {
  if (!space) return null
  const Icon = space.Icon
  const label = localizedLabel(space, locale)
  return (
    <button type="button" className={`shell-space${active ? ' active' : ''}${compact ? ' compact' : ''}${space.directPath ? ' shell-space-direct' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} title={label}>
      <span><Icon aria-hidden="true" /></span>
      <small>{label}</small>
    </button>
  )
}

function AgentShortcut({ item, locale, pathname, onNavigate }) {
  const active = pathMatchesModule(pathname, item)
  return (
    <NavLink
      to={item.to}
      className={`shell-space shell-quick-agent${active ? ' active' : ''}`}
      onClick={() => onNavigate(item)}
      aria-current={active ? 'page' : undefined}
      title={locale === 'en' ? 'AI agents' : 'Agentes IA'}
    >
      <span><RiRobot2Line aria-hidden="true" /></span>
      <small>{locale === 'en' ? 'Agents' : 'Agentes'}</small>
    </NavLink>
  )
}

function ModuleNavRow({ item, locale, pathname, pinned, onNavigate, onTogglePin, compact = false }) {
  const Icon = item.Icon
  return (
    <div className={`shell-local-row${compact ? ' compact' : ''}`}>
      <NavLink to={item.to} onClick={() => onNavigate(item)} className={() => pathMatchesModule(pathname, item) ? 'active' : ''}>
        <span className="shell-local-icon"><Icon aria-hidden="true" /></span>
        <span>{localizedLabel(item, locale)}</span>
      </NavLink>
      <button
        type="button"
        className={`shell-pin${pinned ? ' active' : ''}`}
        onClick={() => onTogglePin(item.id)}
        aria-label={pinned ? `Desfijar ${localizedLabel(item, locale)}` : `Fijar ${localizedLabel(item, locale)}`}
        title={pinned ? 'Desfijar' : 'Fijar'}
      >
        {pinned ? <RiPushpinFill /> : <RiPushpinLine />}
      </button>
    </div>
  )
}

function LocalNavigation({ space, modules, locale, pathname, onNavigate, pinnedModules, onTogglePin, query = '' }) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredModules = normalizedQuery
    ? modules.filter(item => localizedLabel(item, locale).toLocaleLowerCase().includes(normalizedQuery))
    : modules
  const pinned = normalizedQuery
    ? pinnedModules.filter(item => localizedLabel(item, locale).toLocaleLowerCase().includes(normalizedQuery))
    : pinnedModules
  const promoted = new Set(pinned.map(item => item.id))
  const groups = localNavigationGroups(space.id, filteredModules.filter(item => !promoted.has(item.id)), locale)
  const hasResults = pinned.length > 0 || groups.some(group => group.modules.length > 0)
  return (
    <nav className="shell-local-links" aria-label={`${localizedLabel(space, locale)} · navegación local`}>
      {pinned.length ? <section className="shell-local-group shell-local-group--pinned"><h2><RiPushpinFill /> {locale === 'en' ? 'Pinned' : 'Fijados'}</h2>{pinned.map(item => <ModuleNavRow key={item.id} item={item} locale={locale} pathname={pathname} pinned onNavigate={onNavigate} onTogglePin={onTogglePin} compact />)}</section> : null}
      {groups.map(group => <section className="shell-local-group" key={group.id}>{group.label ? <h2>{group.label}</h2> : null}{group.modules.map(item => <ModuleNavRow key={item.id} item={item} locale={locale} pathname={pathname} pinned={false} onNavigate={onNavigate} onTogglePin={onTogglePin} />)}</section>)}
      {normalizedQuery && !hasResults ? <div className="shell-local-empty"><RiSearchLine /><strong>{locale === 'en' ? 'No areas found' : 'No se encontraron áreas'}</strong><span>{locale === 'en' ? 'Try another term.' : 'Prueba con otro término.'}</span></div> : null}
    </nav>
  )
}

function NotificationButton({ compact = false }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = event => { if (!anchorRef.current?.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={anchorRef} className={`shell-notification-anchor${compact ? ' compact' : ''}`}>
      <button type="button" className="shell-icon-button" onClick={() => setOpen(value => !value)} aria-label="Notificaciones" aria-expanded={open} aria-haspopup="dialog">
        <RiNotification3Line />
      </button>
      {open ? (
        <section className="shell-notification-menu" role="dialog" aria-label="Notificaciones">
          <header>
            <div><span>Centro de avisos</span><strong>Notificaciones</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones"><RiCloseLine /></button>
          </header>
          <div className="shell-notification-empty">
            <span><RiNotification3Line /></span>
            <strong>Todo al día</strong>
            <p>No tienes notificaciones nuevas. Aquí aparecerán los avisos importantes de tu workspace.</p>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function MobileLocalNav({ modules, locale, pathname, onOpenAll }) {
  const scrollRef = useRef(null)
  const [fade, setFade] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    const start = node.scrollLeft > 4
    const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 4
    setFade(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return undefined
    node.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, modules, pathname])

  if (!modules.length) return null
  return (
    <nav className="shell-mobile-local" aria-label="Navegación local">
      <div className="shell-mobile-local-scroll" ref={scrollRef} onScroll={measure} style={{ '--fade-start': fade.start ? '22px' : '0px', '--fade-end': fade.end ? '22px' : '0px' }}>
        {modules.map(item => (
          <NavLink key={item.id} to={item.to} className={() => pathMatchesModule(pathname, item) ? 'active' : ''}><item.Icon /><span>{localizedLabel(item, locale)}</span></NavLink>
        ))}
      </div>
      {modules.length > 3 ? (
        <button type="button" className="shell-mobile-local-all" onClick={onOpenAll} aria-haspopup="dialog">
          <RiLayoutGridLine /><span>{locale === 'en' ? 'All' : 'Todos'}</span>
        </button>
      ) : null}
    </nav>
  )
}

function LocalModulesSheet({ open, onClose, locale, space, modules, pathname, navigateToModule }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    document.querySelector('.shell-mobile-sheet--local button.active')?.scrollIntoView({ block: 'center' })
  }, [open])

  if (!open) return null
  const groups = localNavigationGroups(space.id, modules, locale)
  const title = localizedLabel(space, locale)
  return (
    <div className="shell-mobile-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="shell-mobile-sheet shell-mobile-sheet--local" role="dialog" aria-modal="true" aria-label={title}>
        <header><div><strong>{title}</strong><span>{modules.length} {locale === 'en' ? 'areas' : 'áreas'} · {locale === 'en' ? 'Choose where to go' : 'Elige a dónde ir'}</span></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header>
        <div className="shell-mobile-sheet-body">
        {groups.map(group => (
          <section className="shell-mobile-shortcuts" key={group.id}>
            {group.label ? <header><strong>{group.label}</strong></header> : null}
            <div>
              {group.modules.map(item => {
                const active = pathMatchesModule(pathname, item)
                return (
                  <button type="button" key={item.id} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => navigateToModule(item)}>
                    <item.Icon /><span>{localizedLabel(item, locale)}</span>{active ? <RiCheckLine /> : <RiArrowRightSLine />}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        </div>
      </section>
    </div>
  )
}

function MobileSheet({ open, onClose, locale, visibleBySpace, activeSpaceId, pathname, navigateToModule, pinnedModules, recentModules, user, onLogout }) {
  const [expandedSpaceId, setExpandedSpaceId] = useState(activeSpaceId)

  useEffect(() => {
    if (!open) return undefined
    setExpandedSpaceId(activeSpaceId)
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeSpaceId, onClose, open])

  if (!open) return null
  return (
    <div className="shell-mobile-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="shell-mobile-sheet" role="dialog" aria-modal="true" aria-label={locale === 'en' ? 'All spaces' : 'Todos los espacios'}>
        <header><div><strong>{locale === 'en' ? 'All spaces' : 'Todos los espacios'}</strong><span>{locale === 'en' ? 'Navigate without losing context' : 'Navega sin perder el contexto'}</span></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header>
        <div className="shell-mobile-sheet-spaces">
          {APP_SPACES.filter(space => (visibleBySpace.get(space.id) || []).length > 0).map(space => {
            const modules = (visibleBySpace.get(space.id) || []).filter(module => module.showInLocalNavigation !== false)
            const directModule = space.directPath ? modules.find(module => module.to === space.directPath) : null
            const expanded = !space.directPath && expandedSpaceId === space.id && modules.length > 0
            const isActive = activeSpaceId === space.id
            return (
              <div key={space.id} className={`shell-mobile-space${isActive ? ' active' : ''}${expanded ? ' expanded' : ''}`}>
                <button type="button" onClick={() => space.directPath ? directModule && navigateToModule(directModule) : setExpandedSpaceId(expanded ? null : space.id)} disabled={space.directPath ? !directModule : !modules.length} aria-expanded={space.directPath ? undefined : expanded}>
                  <space.Icon /><span><strong>{localizedLabel(space, locale)}</strong>{!space.directPath ? <small>{modules.length} {locale === 'en' ? 'areas' : 'áreas'}</small> : null}</span>{space.directPath ? <RiArrowRightSLine /> : <RiArrowDownSLine />}
                </button>
                {expanded ? (
                  <div className="shell-mobile-space-modules">
                    {localNavigationGroups(space.id, modules, locale).map(group => (
                      <div key={group.id} className="shell-mobile-space-group">
                        {group.label ? <h3>{group.label}</h3> : null}
                        {group.modules.map(item => {
                          const current = pathMatchesModule(pathname, item)
                          return (
                            <button type="button" key={item.id} className={current ? 'active' : ''} aria-current={current ? 'page' : undefined} onClick={() => navigateToModule(item)}>
                              <item.Icon /><span>{localizedLabel(item, locale)}</span>{current ? <RiCheckLine /> : <RiArrowRightSLine />}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {pinnedModules.length ? <section className="shell-mobile-shortcuts"><header><strong>{locale === 'en' ? 'Pinned' : 'Fijados'}</strong></header><div>{pinnedModules.slice(0, 4).map(item => <button type="button" key={item.id} onClick={() => navigateToModule(item)}><item.Icon /><span>{localizedLabel(item, locale)}</span><RiArrowRightSLine /></button>)}</div></section> : null}
        {recentModules.length ? <section className="shell-mobile-shortcuts"><header><strong>{locale === 'en' ? 'Recent' : 'Recientes'}</strong></header><div>{recentModules.slice(0, 3).map(item => <button type="button" key={item.id} onClick={() => navigateToModule(item)}><RiTimeLine /><span>{localizedLabel(item, locale)}</span><small>{localizedLabel(SPACE_BY_ID[item.space], locale)}</small></button>)}</div></section> : null}
        <footer><span className="shell-avatar">{initialsFor(user)}</span><span><strong>{user?.name || 'Tu cuenta'}</strong><small>{user?.email}</small></span><button type="button" onClick={onLogout}><RiLogoutBoxLine /> Salir</button></footer>
      </section>
    </div>
  )
}

/**
 * Aviso permanente mientras se está viendo la plataforma como otra persona.
 *
 * Va fuera de la zona desplazable y ocupa todo el ancho a propósito: el riesgo
 * real de una suplantación es olvidar que está activa y creer que se actúa como
 * uno mismo. El contador hasta la caducidad recuerda además que la sesión no se
 * renueva.
 */
function ImpersonationBanner({ impersonation, onStop, navigate }) {
  const [leaving, setLeaving] = useState(false)
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!impersonation?.expiresAt) return undefined
    function tick() {
      const seconds = Math.max(Math.round((new Date(impersonation.expiresAt).getTime() - Date.now()) / 1000), 0)
      setRemaining(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [impersonation?.expiresAt])

  if (!impersonation) return null

  async function stop() {
    setLeaving(true)
    const restored = await onStop()
    setLeaving(false)
    navigate(restored ? '/backoffice/auditoria' : '/login')
  }

  return <div className="shell-impersonation-banner" role="alert">
    <RiUserSharedLine aria-hidden="true" />
    <p>
      Estás viendo la plataforma como <strong>{impersonation.target?.name}</strong> ({impersonation.target?.email})
      {impersonation.organization ? <> en <strong>{impersonation.organization.name}</strong></> : null}.
      Todo lo que hagas queda registrado a nombre de {impersonation.operator?.email || 'tu cuenta'}.
    </p>
    <span className="shell-impersonation-timer" title="Tiempo restante; la sesión no se renueva">{remaining}</span>
    <button type="button" onClick={stop} disabled={leaving}>{leaving ? 'Saliendo…' : 'Volver a mi cuenta'}</button>
  </div>
}

export default function AppShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, switchOrganization, impersonation, stopImpersonation } = useAuth()
  const experience = useExperience()
  const brand = useBrand()
  const { locale, setLocale } = useI18n()
  const [theme, setTheme, isAutoTheme] = useTheme()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const closeAssistant = useCallback(() => setAssistantOpen(false), [])
  useLayoutEffect(() => setAssistantRoute(location.pathname, `${user?.orgId}:${user?.id}`), [location.pathname, user?.orgId, user?.id])
  const [commandPreferences, setCommandPreferences] = useState(() => readCommandPreferences(user))
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [localSheetOpen, setLocalSheetOpen] = useState(false)
  const [organizations, setOrganizations] = useState([])
  const [organizationState, setOrganizationState] = useState('idle')
  const [localNavQuery, setLocalNavQuery] = useState('')
  const [navigationState, setNavigationState] = useState(() => readNavigationState(user))
  const closeMobileSheet = useCallback(() => setMobileSheetOpen(false), [])
  const closeLocalSheet = useCallback(() => setLocalSheetOpen(false), [])
  const openLocalSheet = useCallback(() => setLocalSheetOpen(true), [])

  const activeModule = moduleForPath(location.pathname)
  const activeSpace = spaceForPath(location.pathname)
  const hasLocalNavigation = !activeSpace.directPath
  const visibleModules = useMemo(() => APP_MODULES.filter(item => (
    canNavigateTo(user, item.to)
    // El back office no es producto de la organización: ni el plan ni el modo
    // de experiencia deciden si se ve. Su única puerta es el privilegio de
    // operador, que `canNavigateTo` ya ha comprobado.
    && (item.space === 'backoffice' || experience.isModuleVisible(item.moduleId, { isActive: pathMatchesModule(location.pathname, item) }))
  )), [experience, location.pathname, user])
  const visibleBySpace = useMemo(() => {
    const grouped = new Map(APP_SPACES.map(space => [space.id, []]))
    visibleModules.forEach(item => grouped.get(item.space)?.push(item))
    return grouped
  }, [visibleModules])
  const localModules = (visibleBySpace.get(activeSpace.id) || []).filter(item => item.showInLocalNavigation !== false)
  const visibleModuleIds = useMemo(() => new Set(visibleModules.map(module => module.id)), [visibleModules])
  const pinnedModules = useMemo(() => navigationState.pinnedModuleIds.map(id => MODULE_BY_NAV_ID[id]).filter(item => item && item.showInShortcuts !== false && visibleModuleIds.has(item.id)), [navigationState.pinnedModuleIds, visibleModuleIds])
  const recentModules = useMemo(() => navigationState.recentModuleIds.map(id => MODULE_BY_NAV_ID[id]).filter(item => item && item.showInShortcuts !== false && visibleModuleIds.has(item.id)), [navigationState.recentModuleIds, visibleModuleIds])

  useEffect(() => {
    setNavigationState(readNavigationState(user))
  }, [user?.id, user?.orgId])

  useEffect(() => {
    setCommandPreferences(readCommandPreferences(user))
    const onPreferencesChange = event => setCommandPreferences(event.detail || readCommandPreferences(user))
    window.addEventListener('vendrava:command-preferences-changed', onPreferencesChange)
    return () => window.removeEventListener('vendrava:command-preferences-changed', onPreferencesChange)
  }, [user?.id, user?.orgId])

  useEffect(() => {
    if (!activeModule) return
    rememberModuleVisit(activeModule)
  }, [activeModule?.id, user?.id, user?.orgId])

  useEffect(() => {
    const onKey = event => {
      const pressed = shortcutFromEvent(event)
      if (!pressed) return
      const shortcut = COMMAND_SHORTCUTS.find(item => commandPreferences.shortcutsEnabled?.[item.id] !== false && commandPreferences.shortcuts?.[item.id] === pressed)
      if (!shortcut) return
      const target = event.target
      const isEditable = target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (isEditable) return
      if (!canNavigateTo(user, shortcut.permissionPath)) return
      event.preventDefault()
      navigate(shortcut.path)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [commandPreferences, navigate, user])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    setOrganizationState('loading')
    apiFetch('/api/auth/organizations')
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error('organizations')
        if (active) { setOrganizations(Array.isArray(body.organizations) ? body.organizations : []); setOrganizationState('ready') }
      })
      .catch(() => { if (active) setOrganizationState('error') })
    return () => { active = false }
  }, [user?.id, user?.orgId])

  useEffect(() => { setMobileSheetOpen(false); setLocalSheetOpen(false) }, [location.pathname])
  useEffect(() => { setLocalNavQuery('') }, [activeSpace.id])

  function goToSpace(spaceId) {
    const modules = visibleBySpace.get(spaceId) || []
    const directPath = SPACE_BY_ID[spaceId]?.directPath
    if (directPath) {
      const destination = modules.find(module => module.to === directPath)
      if (destination) navigateToModule(destination)
      return
    }
    if (spaceId === activeSpace.id && navigationState.localPanelCollapsed) {
      updateNavigationState({ ...navigationState, localPanelCollapsed: false })
      setMobileSheetOpen(false)
      return
    }
    const remembered = MODULE_BY_NAV_ID[navigationState.lastModuleBySpace?.[spaceId]]
    // El destino por defecto sale de los módulos que el menú enseña: si no,
    // pulsar un espacio podía aterrizar en uno escondido a propósito (Studio,
    // o una etapa suelta del recorrido de captación). Lo recordado sí puede
    // ser un módulo oculto: ahí volver donde estabas manda.
    const listed = modules.filter(module => module.showInLocalNavigation !== false)
    const destination = remembered && modules.some(module => module.id === remembered.id)
      ? remembered.to
      : listed[0]?.to || modules[0]?.to || SPACE_BY_ID[spaceId]?.fallbackPath
    const destinationModule = modules.find(module => module.to === destination)
    if (destinationModule) rememberModuleVisit(destinationModule)
    if (destination) navigate(destination)
    setMobileSheetOpen(false)
  }

  function updateNavigationState(next) {
    const saved = writeNavigationState(user, next)
    setNavigationState(saved)
  }

  function rememberModuleVisit(module) {
    setNavigationState(current => {
      const next = recordModuleVisit(current, module)
      writeNavigationState(user, next)
      return next
    })
  }

  function togglePin(moduleId) {
    setNavigationState(current => {
      const next = togglePinnedModule(current, moduleId)
      writeNavigationState(user, next)
      return next
    })
  }

  function toggleLocalPanel() {
    setNavigationState(current => {
      const next = writeNavigationState(user, { ...current, localPanelCollapsed: !current.localPanelCollapsed })
      return next
    })
  }

  function navigateToModule(module) {
    rememberModuleVisit(module)
    navigate(module.to)
    setMobileSheetOpen(false)
    setLocalSheetOpen(false)
  }

  async function changeOrganization(event) {
    const orgId = event.target.value
    if (!orgId || orgId === user?.orgId) return
    setOrganizationState('switching')
    try {
      await switchOrganization(orgId)
      navigate('/dashboard', { replace: true })
      setOrganizationState('ready')
    } catch {
      setOrganizationState('error')
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell${navigationState.localPanelCollapsed || !hasLocalNavigation ? ' shell-local-collapsed' : ''}${impersonation ? ' shell-impersonating' : ''}`} onPointerOverCapture={preloadHomeLink} onFocusCapture={preloadHomeLink}>
      <ImpersonationBanner impersonation={impersonation} onStop={stopImpersonation} navigate={navigate} />
      <aside className="shell-desktop-nav" aria-label="Navegación principal">
        <div className="shell-rail">
          <button className="shell-brand-mark" type="button" onClick={() => navigate('/dashboard')} title={brand.brandName}>
            <img src={brand.logoUrl || '/logo.png'} alt="" />
          </button>
          <nav className="shell-space-list" aria-label="Espacios">
            {APP_SPACES.map(space => visibleBySpace.get(space.id)?.length ? (
              <SpaceButton key={space.id} space={space} active={activeSpace.id === space.id} locale={locale} onClick={() => goToSpace(space.id)} />
            ) : null)}
            {visibleBySpace.get('sales')?.some(item => item.id === 'agents') ? (
              <AgentShortcut item={MODULE_BY_NAV_ID.agents} locale={locale} pathname={location.pathname} onNavigate={rememberModuleVisit} />
            ) : null}
          </nav>
          <div className="shell-rail-bottom">
            <button type="button" className="shell-assistant-button" onClick={() => setAssistantOpen(true)} aria-label={locale === 'en' ? 'Open platform assistant' : 'Abrir asistente de la plataforma'} aria-haspopup="dialog" aria-expanded={assistantOpen} aria-controls="platform-assistant-dialog"><RiSparkling2Line aria-hidden="true" /><span>{locale === 'en' ? 'Assistant' : 'Asistente'}</span></button>
            <AccountMenu user={user} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} isAutoTheme={isAutoTheme} navigate={navigate} onLogout={handleLogout} />
          </div>
        </div>

        {hasLocalNavigation ? <div className="shell-local-panel" aria-hidden={navigationState.localPanelCollapsed}>
          <header className="shell-local-header">
            <div className="shell-local-title"><span>{localizedLabel(activeSpace, locale)}</span></div>
            {organizations.length > 1 ? (
              <label className="shell-org-select"><span className="sr-only">Organización</span><select value={user?.orgId || ''} onChange={changeOrganization} disabled={organizationState === 'switching'}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select><RiArrowDownSLine /></label>
            ) : <small>{brand.brandName}</small>}
          <label className="shell-local-search"><RiSearchLine aria-hidden="true" /><span className="sr-only">Buscar en esta área</span><input value={localNavQuery} onChange={event => setLocalNavQuery(event.target.value)} placeholder={locale === 'en' ? 'Search this area…' : 'Buscar en esta área…'} /></label>
          </header>
          <LocalNavigation space={activeSpace} modules={localModules} locale={locale} pathname={location.pathname} pinnedModules={pinnedModules} onNavigate={rememberModuleVisit} onTogglePin={togglePin} query={localNavQuery} />
          {organizationState === 'error' ? <p className="shell-local-error" role="alert">No se pudo cargar la organización.</p> : null}
        </div> : null}
        {hasLocalNavigation ? <button
          type="button"
          className="shell-nav-toggle"
          onClick={toggleLocalPanel}
          aria-label={navigationState.localPanelCollapsed ? 'Mostrar navegación local' : 'Contraer navegación local'}
          title={navigationState.localPanelCollapsed ? 'Mostrar navegación' : 'Contraer navegación'}
        >
          {navigationState.localPanelCollapsed ? <RiSidebarUnfoldLine /> : <RiSidebarFoldLine />}
        </button> : null}
      </aside>

      <div className="shell-workspace">
        <header className="shell-topbar shell-topbar-desktop">
          <div className="shell-topbar-leading">
            <div className="shell-context-trail" aria-label="Contexto actual">{activeModule?.to !== activeSpace.directPath ? <><span>{localizedLabel(activeSpace, locale)}</span><RiArrowRightSLine /></> : null}<strong>{activeModule ? localizedLabel(activeModule, locale) : localizedLabel(activeSpace, locale)}</strong></div>
          </div>
          <div className="shell-topbar-actions">
            {canNavigateTo(user, '/trabajos') ? <button type="button" className="shell-approval-link" onClick={() => navigate('/trabajos?status=awaiting_approval')}><RiCheckLine /> Aprobaciones</button> : null}
            {/* El back office ya tiene su propio espacio en el rail, con sus
                secciones en el panel local: un botón suelto en la barra
                superior era una segunda puerta a lo mismo. */}
            <NotificationButton />
          </div>
        </header>

        <div className="shell-mobile-chrome">
          <header className="shell-mobile-header"><button className="shell-mobile-brand" type="button" onClick={() => navigate('/dashboard')}><img src={brand.logoUrl || '/logo.png'} alt="" /><strong>{brand.brandName}</strong></button><span>{activeModule?.to !== activeSpace.directPath ? <small>{localizedLabel(activeSpace, locale)}</small> : null}{activeModule ? localizedLabel(activeModule, locale) : localizedLabel(activeSpace, locale)}</span><NotificationButton compact /><button type="button" onClick={() => setAssistantOpen(true)} aria-label={locale === 'en' ? 'Open platform assistant' : 'Abrir asistente de la plataforma'} aria-haspopup="dialog" aria-expanded={assistantOpen} aria-controls="platform-assistant-dialog"><RiSparkling2Line aria-hidden="true" /></button><button type="button" onClick={() => setMobileSheetOpen(true)} aria-label="Abrir navegación"><RiMenuLine /></button></header>
          {hasLocalNavigation ? <MobileLocalNav modules={localModules} locale={locale} pathname={location.pathname} onOpenAll={openLocalSheet} /> : null}
        </div>

        <main id="main-content" className="shell-main-content">
          <AppErrorBoundary key={location.pathname}>{children}</AppErrorBoundary>
        </main>

        <nav className="shell-mobile-bottom" aria-label="Espacios principales">
          {['home', 'sales', 'growth', 'more'].map(id => {
            const space = SPACE_BY_ID[id]
            return <SpaceButton key={id} space={space} compact active={activeSpace.id === id} locale={locale} onClick={() => goToSpace(id)} />
          })}
        </nav>
      </div>

      <LocalModulesSheet open={localSheetOpen} onClose={closeLocalSheet} locale={locale} space={activeSpace} modules={localModules} pathname={location.pathname} navigateToModule={navigateToModule} />
      <MobileSheet open={mobileSheetOpen} onClose={closeMobileSheet} locale={locale} visibleBySpace={visibleBySpace} activeSpaceId={activeSpace.id} pathname={location.pathname} navigateToModule={navigateToModule} pinnedModules={pinnedModules} recentModules={recentModules.filter(item => !pinnedModules.some(pinned => pinned.id === item.id))} user={user} onLogout={handleLogout} />
      <PlatformAssistant key={`${user?.id}:${user?.orgId}`} open={assistantOpen} onClose={closeAssistant} onOpen={() => setAssistantOpen(true)} brandName={brand.brandName} page={activeModule ? localizedLabel(activeModule, locale) : localizedLabel(activeSpace, locale)} pageId={activeModule?.id} availableModules={visibleModules} locale={locale} />
    </div>
  )
}
