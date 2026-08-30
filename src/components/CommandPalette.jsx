import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiApps2Line,
  RiAddLine,
  RiArrowRightLine,
  RiBuilding2Line,
  RiClapperboardLine,
  RiCloseLine,
  RiCommandLine,
  RiFlowChart,
  RiGroupLine,
  RiLoader4Line,
  RiSearchLine,
  RiSettings4Line,
  RiShareForwardLine,
  RiShoppingCart2Line,
  RiSparkling2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useExperience } from '../contexts/ExperienceContext'
import { useI18n } from '../i18n'
import { APP_MODULES, localizedLabel, SPACE_BY_ID } from '../lib/appNavigation'
import { canNavigateTo } from '../lib/navigationPermissions'
import { COMMAND_DEFAULT_PREFERENCES, COMMAND_PREFERENCE_OPTIONS, COMMAND_RESULT_LIMITS, COMMAND_SHORTCUTS, formatShortcut, readCommandPreferences, saveCommandPreferences, shortcutFromEvent } from '../lib/commandCenter'

const RECENTS_KEY = 'vendrava:command-recents:v2'

const CREATE_ACTIONS = [
  { key: 'action:create-campaign', type: 'action', title: 'Crear campaña', subtitle: 'Abre el asistente de captación', path: '/captacion/nueva', permissionPath: '/captacion/atraer/ads', keywords: 'crear nueva campaña ads captación', Icon: RiShareForwardLine },
  { key: 'action:run-microapp', type: 'action', title: 'Ejecutar una microapp', subtitle: 'Elige una capacidad y configura su ejecución', path: '/microapps', permissionPath: '/microapps', keywords: 'crear ejecutar microapp herramienta ia', Icon: RiApps2Line },
  { key: 'action:create-production', type: 'action', title: 'Nueva producción', subtitle: 'Abre Studio para preparar una producción', path: '/studio', permissionPath: '/studio', keywords: 'crear nueva producción studio vídeo', Icon: RiClapperboardLine },
]

function storageKey(user) {
  const identity = user?.orgId || user?.organizationId || user?.id || 'anonymous'
  return `${RECENTS_KEY}:${String(identity).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`
}

function readRecents(user) {
  try {
    const value = JSON.parse(window.localStorage?.getItem(storageKey(user)) || '[]')
    return Array.isArray(value) ? value.slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecent(user, item) {
  try {
    const next = [item, ...readRecents(user).filter(entry => entry.key !== item.key)].slice(0, 6)
    window.localStorage?.setItem(storageKey(user), JSON.stringify(next))
  } catch {
    // El launcher sigue funcionando cuando el storage está bloqueado.
  }
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function matches(item, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = normalize(`${item.title} ${item.subtitle || ''} ${item.keywords || ''}`)
  return words.every(word => haystack.includes(word))
}

function ResultIcon({ item }) {
  const Icon = item.Icon || (item.type === 'microapp' ? RiApps2Line : RiFlowChart)
  return <span className={`command-result-icon command-result-icon--${item.type || 'module'}`}><Icon /></span>
}

function resultTypeLabel(type) {
  return {
    microapp: 'Microapp',
    flow: 'Flow',
    action: 'Acción',
    lead: 'Lead',
    account: 'Cuenta',
    opportunity: 'Oportunidad',
    campaign: 'Campaña',
  }[type] || 'Módulo'
}

function resultSection(item, locale) {
  if (item.type === 'action') return locale === 'en' ? 'Quick actions' : 'Acciones rápidas'
  if (item.type === 'module') return locale === 'en' ? 'Navigation' : 'Navegación'
  if (item.type === 'microapp') return locale === 'en' ? 'Microapps' : 'Microapps'
  if (item.type === 'flow') return locale === 'en' ? 'Workflows' : 'Workflows'
  return locale === 'en' ? 'Workspace data' : 'Datos del workspace'
}

async function readJson(response) {
  if (!response.ok) return null
  return response.json().catch(() => null)
}

export default function CommandPalette({ open, onClose, pinnedModuleIds = [], recentModuleIds = [] }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const experience = useExperience()
  const { locale } = useI18n()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [remote, setRemote] = useState([])
  const [loading, setLoading] = useState(false)
  const [entities, setEntities] = useState([])
  const [entityLoading, setEntityLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferences, setPreferences] = useState(() => readCommandPreferences(user))
  const [shortcutCapture, setShortcutCapture] = useState(null)
  const [shortcutError, setShortcutError] = useState('')

  useEffect(() => {
    setPreferences(readCommandPreferences(user))
    setPreferencesOpen(false)
    setShortcutCapture(null)
    setShortcutError('')
  }, [user?.id, user?.orgId])

  const modules = useMemo(() => APP_MODULES
    .filter(item => preferences.navigation && canNavigateTo(user, item.to) && experience.isModuleVisible(item.moduleId, { isActive: false }))
    .map(item => ({
      key: `module:${item.id}`,
      type: 'module',
      title: localizedLabel(item, locale),
      subtitle: localizedLabel(SPACE_BY_ID[item.space], locale),
      path: item.to,
      keywords: item.keywords,
      Icon: item.Icon,
    })), [experience, locale, preferences.navigation, user])
  const actions = useMemo(() => CREATE_ACTIONS
    .filter(item => canNavigateTo(user, item.permissionPath))
    .map(item => ({ ...item, title: locale === 'en' ? ({
      'action:create-campaign': 'Create campaign',
      'action:run-microapp': 'Run a microapp',
      'action:create-production': 'New production',
    }[item.key] || item.title) : item.title })), [locale, preferences.actions, user])

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setActiveIndex(0)
    setPreferencesOpen(false)
    setShortcutCapture(null)
    setShortcutError('')
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown) }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return undefined
    let active = true
    setRemote([])
    setLoading(true)
    const requests = []
    if (preferences.microapps && canNavigateTo(user, '/microapps')) {
      requests.push(apiFetch('/api/microapps').then(async response => {
        if (!response.ok) return []
        const body = await response.json().catch(() => [])
        const items = Array.isArray(body) ? body : body.microapps || []
        return items.map(app => ({
          key: `microapp:${app.id}`,
          type: 'microapp',
          title: app.name,
          subtitle: app.promise,
          path: `/microapps/${app.id}`,
          keywords: `${app.id} ${app.category || ''} ${(app.capabilities || []).join(' ')}`,
        }))
      }))
    }
    if (preferences.flows && canNavigateTo(user, '/automatizaciones')) {
      requests.push(apiFetch('/api/flows').then(async response => {
        if (!response.ok) return []
        const body = await response.json().catch(() => [])
        const items = Array.isArray(body) ? body : body.flows || []
        return items.map(flow => ({
          key: `flow:${flow.id}`,
          type: 'flow',
          title: flow.name,
          subtitle: flow.description || 'Flow publicado',
          path: `/capacidades?tab=flows&flow=${encodeURIComponent(flow.id)}`,
          keywords: `${flow.slug || ''} workflow automatización`,
        }))
      }))
    }
    Promise.allSettled(requests).then(results => {
      if (!active) return
      setRemote(results.flatMap(result => result.status === 'fulfilled' ? result.value : []))
      setLoading(false)
    })
    return () => { active = false }
  }, [open, preferences.flows, preferences.microapps, user?.id, user?.orgId])

  useEffect(() => {
    const query = deferredQuery.trim()
    if (!open || !preferences.workspace || query.length < 2) { setEntities([]); setEntityLoading(false); return undefined }
    const controller = new AbortController()
    let active = true
    setEntities([])
    const timer = window.setTimeout(async () => {
      setEntityLoading(true)
      const encoded = encodeURIComponent(query)
      const requests = []
      if (canNavigateTo(user, '/leads')) requests.push(apiFetch(`/api/leads?page=1&limit=5&search=${encoded}`, { signal: controller.signal }).then(readJson).then(body => (Array.isArray(body?.data) ? body.data : []).map(item => ({ key: `lead:${item.id}`, type: 'lead', title: item.name || item.email || 'Lead', subtitle: item.company || item.email || item.phone || 'Lead', path: `/leads/${item.id}`, keywords: `${item.company || ''} ${item.email || ''}`, Icon: RiGroupLine }))))
      if (canNavigateTo(user, '/cuentas')) requests.push(apiFetch(`/api/accounts?page=1&limit=5&search=${encoded}`, { signal: controller.signal }).then(readJson).then(body => (Array.isArray(body?.data) ? body.data : []).map(item => ({ key: `account:${item.id}`, type: 'account', title: item.name || item.domain || 'Cuenta', subtitle: item.domain || item.industry || 'Cuenta', path: `/cuentas/${item.id}`, keywords: `${item.domain || ''} ${item.industry || ''}`, Icon: RiBuilding2Line }))))
      if (canNavigateTo(user, '/pipeline')) requests.push(apiFetch(`/api/pipeline/list?page=1&limit=5&search=${encoded}`, { signal: controller.signal }).then(readJson).then(body => (Array.isArray(body?.data) ? body.data : []).map(item => ({ key: `opportunity:${item.id}`, type: 'opportunity', title: item.name || 'Oportunidad', subtitle: item.account?.name || item.lead?.name || item.stage || 'Pipeline', path: `/pipeline/${item.id}`, keywords: `${item.account?.name || ''} ${item.lead?.name || ''} ${item.stage || ''}`, Icon: RiShoppingCart2Line }))))
      if (canNavigateTo(user, '/campanas')) requests.push(apiFetch(`/api/campaigns?page=1&limit=5&search=${encoded}`, { signal: controller.signal }).then(readJson).then(body => (Array.isArray(body?.items) ? body.items : []).map(item => ({ key: `campaign:${item.id}`, type: 'campaign', title: item.name || 'Campaña', subtitle: item.status || 'Campaña', path: `/campanas/${item.id}`, keywords: `${item.status || ''} ${item.description || ''}`, Icon: RiShareForwardLine }))))
      const settled = await Promise.allSettled(requests)
      if (active) {
        setEntities(settled.flatMap(result => result.status === 'fulfilled' ? result.value : []).slice(0, 12))
        setEntityLoading(false)
      }
    }, 180)
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [deferredQuery, open, preferences.workspace, user?.id, user?.orgId, user?.role])

  const results = useMemo(() => {
    const all = [...actions, ...modules, ...remote, ...entities]
      .filter(item => {
        if (item.type === 'action') return preferences.actions
        if (item.type === 'module') return preferences.navigation
        if (item.type === 'microapp') return preferences.microapps
        if (item.type === 'flow') return preferences.flows
        return preferences.workspace
      })
    if (!deferredQuery.trim()) {
      const preferredKeys = [
        ...pinnedModuleIds.map(id => `module:${id}`),
        ...recentModuleIds.map(id => `module:${id}`),
        ...readRecents(user).map(item => item.key),
      ]
      const rank = new Map([...new Set(preferredKeys)].map((key, index) => [key, index]))
      return [...all].sort((left, right) => (rank.get(left.key) ?? 999) - (rank.get(right.key) ?? 999)).slice(0, preferences.resultLimit)
    }
    return all.filter(item => matches(item, deferredQuery)).slice(0, preferences.resultLimit)
  }, [actions, deferredQuery, entities, modules, pinnedModuleIds, preferences, recentModuleIds, remote, user])
  const resultCountLabel = locale === 'en'
    ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
    : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`

  useEffect(() => { setActiveIndex(0) }, [deferredQuery])

  useEffect(() => {
    if (!shortcutCapture) return undefined
    const onKeyDown = event => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setShortcutCapture(null)
        setShortcutError('')
        return
      }
      const nextShortcut = shortcutFromEvent(event)
      if (!nextShortcut) {
        setShortcutError(locale === 'en' ? 'Use at least one modifier: Ctrl, ⌘, Alt or Shift.' : 'Usa al menos un modificador: Ctrl, ⌘, Alt o Shift.')
        return
      }
      const conflict = COMMAND_SHORTCUTS.find(item => item.id !== shortcutCapture && preferences.shortcutsEnabled?.[item.id] !== false && preferences.shortcuts?.[item.id] === nextShortcut)
      if (conflict) {
        setShortcutError(locale === 'en' ? `That combination is already assigned to “${conflict.labelEn}”.` : `Esa combinación ya está asignada a «${conflict.label}».`)
        return
      }
      const nextPreferences = { ...preferences, shortcuts: { ...preferences.shortcuts, [shortcutCapture]: nextShortcut } }
      saveCommandPreferences(user, nextPreferences)
      setPreferences(nextPreferences)
      setShortcutCapture(null)
      setShortcutError('')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [locale, preferences, shortcutCapture, user])

  function choose(item) {
    if (!item) return
    saveRecent(user, { key: item.key, title: item.title, path: item.path, type: item.type })
    navigate(item.path)
    onClose()
  }

  function handleKeys(event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(results.length - 1, index + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)) }
    if (event.key === 'Enter') { event.preventDefault(); choose(results[activeIndex]) }
  }

  function togglePreference(id) {
    const next = { ...preferences, [id]: !preferences[id] }
    saveCommandPreferences(user, next)
    setPreferences(next)
  }

  function resetPreferences() {
    const next = {
      ...COMMAND_DEFAULT_PREFERENCES,
      shortcuts: { ...preferences.shortcuts },
      shortcutsEnabled: { ...preferences.shortcutsEnabled },
    }
    saveCommandPreferences(user, next)
    setPreferences(next)
  }

  function resetShortcuts() {
    const shortcuts = Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, shortcut.defaultKey]))
    const shortcutsEnabled = Object.fromEntries(COMMAND_SHORTCUTS.map(shortcut => [shortcut.id, true]))
    const next = { ...preferences, shortcuts, shortcutsEnabled }
    saveCommandPreferences(user, next)
    setPreferences(next)
    setShortcutCapture(null)
    setShortcutError('')
  }

  function updatePreference(id, value) {
    const next = { ...preferences, [id]: value }
    saveCommandPreferences(user, next)
    setPreferences(next)
  }

  function toggleShortcut(id) {
    const next = { ...preferences, shortcutsEnabled: { ...preferences.shortcutsEnabled, [id]: preferences.shortcutsEnabled?.[id] === false } }
    saveCommandPreferences(user, next)
    setPreferences(next)
  }

  function availableShortcuts() {
    return COMMAND_SHORTCUTS.filter(shortcut => shortcut.action === 'command' || canNavigateTo(user, shortcut.permissionPath))
  }

  const shortcutList = availableShortcuts()
  const enabledShortcutCount = shortcutList.filter(shortcut => preferences.shortcutsEnabled?.[shortcut.id] !== false).length

  if (!open) return null
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`command-palette command-palette--${preferences.density}${preferences.showSubtitles ? '' : ' command-palette--no-subtitles'}`} role="dialog" aria-modal="true" aria-label="Buscar o ejecutar">
        <header className="command-heading">
          <div>
            <span className="command-eyebrow"><RiCommandLine /> {locale === 'en' ? 'Command center' : 'Centro de comandos'}</span>
            <strong>{locale === 'en' ? 'Find your next move' : 'Encuentra tu siguiente movimiento'}</strong>
            <small>{locale === 'en' ? 'Navigate, create or run anything in your workspace.' : 'Navega, crea o ejecuta cualquier cosa de tu workspace.'}</small>
          </div>
          <div className="command-heading-actions">
            <span className="command-result-count">{resultCountLabel}</span>
            <button type="button" className={`command-settings-trigger${preferencesOpen ? ' active' : ''}`} onClick={() => setPreferencesOpen(value => !value)} aria-expanded={preferencesOpen} aria-label={locale === 'en' ? 'Configure command center' : 'Configurar centro de comandos'} title={locale === 'en' ? 'Configure command center' : 'Configurar centro de comandos'}><RiSettings4Line /></button>
          </div>
        </header>
        {preferencesOpen ? <div className="command-preferences" role="group" aria-label={locale === 'en' ? 'Command center elements' : 'Elementos del centro de comandos'}>
          <div className="command-preferences-heading"><div><strong>{locale === 'en' ? 'Choose what appears here' : 'Elige qué aparece aquí'}</strong><small>{locale === 'en' ? 'Your choices are saved for this workspace.' : 'Tus preferencias se guardan para este workspace.'}</small></div><button type="button" onClick={resetPreferences}>{locale === 'en' ? 'Reset' : 'Restablecer'}</button></div>
          <div className="command-preferences-grid">
            {COMMAND_PREFERENCE_OPTIONS.map(option => <label className="command-preference-row" key={option.id}><input type="checkbox" checked={Boolean(preferences[option.id])} onChange={() => togglePreference(option.id)} /><span className="command-preference-check" aria-hidden="true" /><span><strong>{locale === 'en' ? option.labelEn : option.label}</strong><small>{option.description}</small></span></label>)}
          </div>
          <div className="command-display-heading"><div><strong>{locale === 'en' ? 'Display and results' : 'Vista y resultados'}</strong><small>{locale === 'en' ? 'Control how much information the launcher shows.' : 'Controla cuánta información muestra el lanzador.'}</small></div></div>
          <div className="command-display-grid">
            <label className="command-display-control"><span><strong>{locale === 'en' ? 'Results shown' : 'Resultados visibles'}</strong><small>{locale === 'en' ? 'More results means more scrolling.' : 'Más resultados implica más scroll.'}</small></span><select value={preferences.resultLimit} onChange={event => updatePreference('resultLimit', Number(event.target.value))}>{COMMAND_RESULT_LIMITS.map(limit => <option key={limit} value={limit}>{limit}</option>)}</select></label>
            <div className="command-display-control"><span><strong>{locale === 'en' ? 'Density' : 'Densidad'}</strong><small>{locale === 'en' ? 'Choose compact or comfortable rows.' : 'Elige filas compactas o cómodas.'}</small></span><div className="command-segmented" role="group" aria-label={locale === 'en' ? 'Result density' : 'Densidad de resultados'}><button type="button" className={preferences.density === 'compact' ? 'active' : ''} onClick={() => updatePreference('density', 'compact')}>{locale === 'en' ? 'Compact' : 'Compacta'}</button><button type="button" className={preferences.density !== 'compact' ? 'active' : ''} onClick={() => updatePreference('density', 'comfortable')}>{locale === 'en' ? 'Comfort' : 'Cómoda'}</button></div></div>
            <label className="command-display-control command-display-control--toggle"><span><strong>{locale === 'en' ? 'Show descriptions' : 'Mostrar descripciones'}</strong><small>{locale === 'en' ? 'Keep the context under each result.' : 'Mantén el contexto bajo cada resultado.'}</small></span><input type="checkbox" checked={preferences.showSubtitles !== false} onChange={event => updatePreference('showSubtitles', event.target.checked)} /><span className="command-preference-check" aria-hidden="true" /></label>
          </div>
          <div className="command-shortcuts-heading"><div><strong>{locale === 'en' ? 'Keyboard shortcuts' : 'Atajos de teclado'}</strong><small>{locale === 'en' ? `Enable the ones you want and change their combinations. ${enabledShortcutCount} of ${shortcutList.length} active.` : `Activa los que quieras y cambia sus combinaciones. ${enabledShortcutCount} de ${shortcutList.length} activos.`}</small></div><button type="button" onClick={resetShortcuts}>{locale === 'en' ? 'Restore shortcuts' : 'Restablecer atajos'}</button></div>
          <div className="command-shortcuts-list">
            {shortcutList.map(shortcut => { const enabled = preferences.shortcutsEnabled?.[shortcut.id] !== false; return <div className={`command-shortcut-row${enabled ? '' : ' disabled'}`} key={shortcut.id}><label className="command-shortcut-toggle"><input type="checkbox" checked={enabled} onChange={() => toggleShortcut(shortcut.id)} aria-label={`${locale === 'en' ? 'Enable shortcut for' : 'Activar atajo de'} ${locale === 'en' ? shortcut.labelEn : shortcut.label}`} /><span className="command-preference-check" aria-hidden="true" /></label><span><strong>{locale === 'en' ? shortcut.labelEn : shortcut.label}</strong><small>{shortcut.id === 'open-command' ? (locale === 'en' ? 'Global launcher' : 'Lanzador global') : (locale === 'en' ? 'Global action' : 'Acción global')}</small></span><button type="button" className={shortcutCapture === shortcut.id ? 'capturing' : ''} onClick={() => { setShortcutCapture(shortcut.id); setShortcutError('') }} aria-label={`${locale === 'en' ? 'Change shortcut for' : 'Cambiar atajo de'} ${locale === 'en' ? shortcut.labelEn : shortcut.label}`}>{shortcutCapture === shortcut.id ? (locale === 'en' ? 'Press keys…' : 'Pulsa teclas…') : formatShortcut(preferences.shortcuts?.[shortcut.id] || shortcut.defaultKey, locale)}</button></div> })}
          </div>
          {shortcutError ? <p className="command-shortcuts-error" role="alert">{shortcutError}</p> : null}
        </div> : null}
        <label className="command-input">
          <RiSearchLine aria-hidden="true" />
          <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={handleKeys} placeholder={locale === 'en' ? 'Search, create or run…' : 'Buscar, crear o ejecutar…'} aria-label={locale === 'en' ? 'Search, create or run' : 'Buscar, crear o ejecutar'} />
          {loading || entityLoading ? <RiLoader4Line className="command-spin" aria-label="Cargando" /> : query ? <button type="button" className="command-clear" onClick={() => setQuery('')} aria-label={locale === 'en' ? 'Clear search' : 'Limpiar búsqueda'}><RiCloseLine /></button> : <kbd>ESC</kbd>}
        </label>
        <div className="command-results" role="listbox" aria-label="Resultados">
          {results.map((item, index) => (
            <Fragment key={item.key}>
              {index === 0 || resultSection(results[index - 1], locale) !== resultSection(item, locale) ? <div className="command-section-label"><span>{resultSection(item, locale)}</span>{index === 0 && !deferredQuery.trim() ? <small>{locale === 'en' ? 'Suggested for you' : 'Sugerido para ti'}</small> : null}</div> : null}
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : ''}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(item)}
              >
                <ResultIcon item={item} />
                <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                <em>{resultTypeLabel(item.type)}</em>
                <RiArrowRightLine aria-hidden="true" />
              </button>
            </Fragment>
          ))}
          {!results.length && !loading ? <div className="command-empty"><RiSparkling2Line /><strong>{query ? `Sin resultados para “${query}”` : 'Sin resultados todavía'}</strong><span>{query ? 'Prueba con otra palabra o busca un lead, cuenta, microapp o workflow.' : 'Prueba una acción, módulo, microapp o workflow.'}</span></div> : null}
        </div>
        <footer className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>ESC</kbd> cerrar</span><span className="command-footer-note">Los permisos y el plan siguen aplicándose.</span></footer>
      </section>
    </div>
  )
}
