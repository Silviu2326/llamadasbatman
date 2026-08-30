import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiApps2Line, RiArrowRightSLine, RiArrowDownSLine, RiArrowUpSLine, RiCheckboxCircleLine,
  RiErrorWarningLine, RiExternalLinkLine, RiHistoryLine, RiLayoutGridLine, RiListUnordered,
  RiSearchLine, RiShieldCheckLine, RiStarFill, RiStarLine, RiTimeLine, RiCloseLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import {
  MICROAPP_CATEGORY_META, MICROAPP_COLLECTION_META,
  microappCategoryMeta, microappCollectionMeta,
} from '../lib/openPlatform'
import { MICROAPPS_CATALOG_HERO, microappCategoryArt, microappCollectionArt } from '../lib/microappArt'
import './microapps-catalog.css'

// Categorías del contrato MicroappManifest (docs/plataforma-abierta/07-MICROAPPS.md §1),
// presentadas como objetivos («¿Qué quieres conseguir hoy?») en vez de taxonomía técnica.
const CATEGORY_FILTERS = ['', ...Object.keys(MICROAPP_CATEGORY_META)]
const COLLECTION_FILTERS = ['', ...Object.keys(MICROAPP_COLLECTION_META)]

const FAVORITES_KEY = 'mapps:favorites'
const HERO_KEY = 'mapps:hero-collapsed'
const RECENT_LIMIT = 6

// Sinónimos de búsqueda: lo que el usuario teclea rara vez coincide con el
// vocabulario del manifiesto (capabilities, permisos, widgets). Cada entrada
// amplía el texto indexado de la microapp cuando aparece su clave.
const SEARCH_SYNONYMS = [
  [/\bemail|mail|correo\b/, 'email correo mail newsletter envío'],
  [/\blinkedin\b/, 'linkedin red social perfil social'],
  [/\bllamad|call|voz|voice\b/, 'llamada call voz teléfono telefónica'],
  [/\blead|prospect|contacto\b/, 'lead prospecto contacto crm'],
  [/\bads?|anuncio|meta|facebook|instagram\b/, 'ads anuncios meta facebook instagram campaña publicidad'],
  [/\bseo|google|posicionamiento\b/, 'seo google posicionamiento búsqueda orgánico'],
  [/\bv[ií]deo|clip|reel|short\b/, 'vídeo video clip reel short studio'],
  [/\bimagen|image|foto\b/, 'imagen image foto visual creatividad'],
  [/\bweb|landing|p[aá]gina\b/, 'web landing página sitio url'],
  [/\bcompet|rival\b/, 'competencia competidor rival benchmark comparativa'],
  [/\binforme|report|resumen\b/, 'informe report resumen análisis'],
  [/\bcliente|churn|retenci|onboarding\b/, 'cliente churn retención onboarding cuenta success'],
]

const WIDGET_HINT = {
  lead: 'Lead del CRM', account: 'Cuenta del CRM', asset: 'Activo', url: 'URL',
  text: 'Texto', textarea: 'Texto', select: 'Opción', number: 'Número', toggle: 'Opción',
}

function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* modo privado o cuota llena: no bloquea */ }
}

function buildHaystack(app) {
  const base = [
    app.name, app.promise, app.id, app.category, microappCategoryMeta(app.category).label,
    microappCollectionMeta(app.collection).label,
    ...(app.capabilities || []), ...(app.dataAccess || []),
    ...(app.inputs || []).flatMap(input => [input.label, input.key, WIDGET_HINT[input.widget] || '']),
  ].join(' ').toLowerCase()
  const expanded = SEARCH_SYNONYMS.filter(([pattern]) => pattern.test(base)).map(([, words]) => words).join(' ')
  return `${base} ${expanded}`
}

function matchesSearch(haystack, term) {
  if (!term) return true
  return term.split(/\s+/).every(word => haystack.includes(word))
}

function relativeDays(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return null
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} d`
  const months = Math.floor(days / 30)
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

function inputsSummary(inputs) {
  if (!inputs?.length) return 'Sin entradas: se ejecuta directamente'
  const required = inputs.filter(input => input.required)
  const shown = (required.length ? required : inputs).slice(0, 3).map(input => input.label)
  const rest = (required.length ? required : inputs).length - shown.length
  return `Pide: ${shown.join(' · ')}${rest > 0 ? ` +${rest}` : ''}`
}

function effectsBadge(app) {
  if (app.approvalAction) return { className: 'approval', icon: <RiShieldCheckLine />, label: 'Requiere aprobación', title: `Antes de actuar fuera de la plataforma pide aprobación (${app.approvalAction}).` }
  if (app.effects === 'external') return { className: 'external', icon: <RiExternalLinkLine />, label: 'Actúa fuera', title: 'Tiene efectos externos: envía, publica o modifica algo fuera de la plataforma.' }
  // Hoy todo el catálogo es `local`: un badge «Solo lectura» en el 100% no
  // informaría de nada. Solo se señala lo excepcional (actúa fuera / aprobación).
  return null
}

function MicroappCard({ app, usage, favorite, onToggleFavorite, onOpen, view }) {
  const meta = microappCategoryMeta(app.category)
  const collectionMeta = microappCollectionMeta(app.collection)
  const badge = effectsBadge(app)
  const lastRun = relativeDays(usage?.lastAt)
  const stillFresh = usage?.staleAt ? new Date(usage.staleAt).getTime() > Date.now() : false
  return (
    <article className={`mapps-card ${view === 'list' ? 'list' : ''}`} style={{ '--cat': meta.color }}>
      {view !== 'list' && <span className="mapps-card-art" style={{ backgroundImage: `url(${microappCategoryArt(app.category)})` }} aria-hidden="true" />}
      <div className="mapps-card-body">
        <div className="mapps-card-head">
          <button type="button" className="mapps-card-open" onClick={() => onOpen(app)}>
            <strong>{app.name}</strong>
          </button>
          <button
            type="button"
            className={`mapps-star ${favorite ? 'on' : ''}`}
            onClick={() => onToggleFavorite(app.id)}
            aria-pressed={favorite}
            aria-label={favorite ? `Quitar ${app.name} de favoritos` : `Añadir ${app.name} a favoritos`}
            title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          >
            {favorite ? <RiStarFill /> : <RiStarLine />}
          </button>
        </div>
        <p className="mapps-card-promise">{app.promise}</p>
        <div className="mapps-card-meta">
          <span className="mapps-category">{meta.label}</span>
          <span className="mapps-collection" style={{ '--collection': collectionMeta.color }}>
            {app.editorialNumber != null ? `#${app.editorialNumber} · ` : ''}{collectionMeta.shortLabel}
          </span>
          {app.freshnessDays != null && (
            <span className="mapps-freshness" title={`El resultado se considera vigente durante ${app.freshnessDays} días`}>
              <RiTimeLine /> vigente {app.freshnessDays} d
            </span>
          )}
        </div>
        <div className="mapps-card-signals">
          <span className="mapps-inputs" title={(app.inputs || []).map(input => `${input.label}${input.required ? '' : ' (opcional)'}`).join(', ') || undefined}>
            {inputsSummary(app.inputs)}
          </span>
          {badge && <span className={`mapps-effects ${badge.className}`} title={badge.title}>{badge.icon} {badge.label}</span>}
          {lastRun && (
            <span className={`mapps-usage ${stillFresh ? 'fresh' : ''}`} title={stillFresh ? 'Tu último resultado sigue vigente' : 'Tu último resultado ya ha caducado'}>
              {stillFresh ? <RiCheckboxCircleLine /> : <RiHistoryLine />} Usada {lastRun}{usage.count > 1 ? ` · ${usage.count}×` : ''}
            </span>
          )}
        </div>
        <button type="button" className="mapps-card-cta" onClick={() => onOpen(app)}>Abrir <RiArrowRightSLine /></button>
      </div>
    </article>
  )
}

function Skeletons({ view }) {
  return (
    <div className={`mapps-grid ${view === 'list' ? 'list' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className={`mapps-card mapps-skeleton ${view === 'list' ? 'list' : ''}`}>
          {view !== 'list' && <span className="mapps-card-art" />}
          <div className="mapps-card-body">
            <span className="mapps-sk-line w60" /><span className="mapps-sk-line" /><span className="mapps-sk-line w80" /><span className="mapps-sk-line w40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MicroappsCatalogPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [apps, setApps] = useState([])
  const [listState, setListState] = useState('loading') // loading | ready | empty | error
  const [usage, setUsage] = useState({}) // microappId → { lastAt, count, staleAt }
  const [favorites, setFavorites] = useState(() => readJson(FAVORITES_KEY, []))
  const [heroCollapsed, setHeroCollapsed] = useState(() => readJson(HERO_KEY, false))
  const requestRef = useRef(0)

  const category = searchParams.get('objetivo') || ''
  const collection = searchParams.get('pack') || ''
  const search = searchParams.get('q') || ''
  const view = searchParams.get('vista') === 'lista' ? 'list' : 'grid'
  const deferredSearch = useDeferredValue(search)

  const setParam = useCallback((key, value) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value); else next.delete(key)
      return next
    }, { replace: key === 'q' })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      ;['objetivo', 'pack', 'q'].forEach(key => next.delete(key))
      return next
    })
  }, [setSearchParams])

  const fetchCatalog = useCallback(async () => {
    const requestId = ++requestRef.current
    setListState('loading')
    try {
      const response = await apiFetch('/api/microapps')
      if (!response.ok) throw new Error(`microapps_${response.status}`)
      const data = await response.json()
      if (requestRef.current !== requestId) return
      const items = Array.isArray(data) ? data : Array.isArray(data?.microapps) ? data.microapps : []
      setApps(items)
      setListState(items.length ? 'ready' : 'empty')
    } catch {
      if (requestRef.current === requestId) setListState('error')
    }
  }, [])

  // Historial ligero (GET /runs): alimenta «Recientes» y la señal «Usada hace X»
  // de cada tarjeta. Un 401/403 simplemente deja la sección vacía.
  const fetchUsage = useCallback(async () => {
    try {
      const response = await apiFetch('/api/microapps/runs?limit=100')
      if (!response.ok) return
      const data = await response.json()
      const runs = Array.isArray(data?.runs) ? data.runs : []
      const byApp = {}
      for (const run of runs) {
        const entry = byApp[run.microappId] || (byApp[run.microappId] = { lastAt: null, count: 0, staleAt: null })
        entry.count += 1
        if (!entry.lastAt || new Date(run.createdAt) > new Date(entry.lastAt)) {
          entry.lastAt = run.createdAt
          entry.staleAt = run.staleAt
        }
      }
      setUsage(byApp)
    } catch { /* la sección de recientes es opcional */ }
  }, [])

  useEffect(() => { fetchCatalog(); fetchUsage() }, [fetchCatalog, fetchUsage])

  const toggleFavorite = useCallback(id => {
    setFavorites(previous => {
      const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
      writeJson(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const toggleHero = useCallback(() => {
    setHeroCollapsed(previous => { writeJson(HERO_KEY, !previous); return !previous })
  }, [])

  const openApp = useCallback(app => {
    navigate(`/microapps/${app.id}`, { state: { from: `${location.pathname}${location.search}` } })
  }, [navigate, location.pathname, location.search])

  const indexed = useMemo(() => apps.map(app => ({ app, haystack: buildHaystack(app) })), [apps])

  const visible = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase()
    return indexed
      .filter(({ app, haystack }) => (!category || app.category === category) && (!collection || app.collection === collection) && matchesSearch(haystack, term))
      .map(({ app }) => app)
      .sort((a, b) => {
        const aSelected = a.catalogEdition === 'selected-60' ? 0 : 1
        const bSelected = b.catalogEdition === 'selected-60' ? 0 : 1
        return aSelected - bSelected || (a.editorialNumber ?? Number.MAX_SAFE_INTEGER) - (b.editorialNumber ?? Number.MAX_SAFE_INTEGER) || String(a.name).localeCompare(String(b.name), 'es')
      })
  }, [indexed, category, collection, deferredSearch])

  const filtering = Boolean(category || collection || deferredSearch.trim())
  const appById = useMemo(() => new Map(apps.map(app => [app.id, app])), [apps])
  const favoriteApps = useMemo(() => favorites.map(id => appById.get(id)).filter(Boolean), [favorites, appById])
  const recentApps = useMemo(() => (
    Object.entries(usage)
      .sort(([, a], [, b]) => new Date(b.lastAt) - new Date(a.lastAt))
      .map(([id]) => appById.get(id))
      .filter(Boolean)
      .slice(0, RECENT_LIMIT)
  ), [usage, appById])
  const selected = useMemo(() => visible.filter(app => app.catalogEdition === 'selected-60'), [visible])
  const others = useMemo(() => visible.filter(app => app.catalogEdition !== 'selected-60'), [visible])

  const renderGrid = list => (
    <div className={`mapps-grid ${view === 'list' ? 'list' : ''}`}>
      {list.map(app => (
        <MicroappCard
          key={app.id}
          app={app}
          view={view}
          usage={usage[app.id]}
          favorite={favorites.includes(app.id)}
          onToggleFavorite={toggleFavorite}
          onOpen={openApp}
        />
      ))}
    </div>
  )

  if (listState === 'loading') return <PageLoadingState label="Cargando microapps" />

  return (
    <main className="mapps-page dark-scroll">
      <header className={`mapps-header ${heroCollapsed ? 'collapsed' : ''}`} style={{ backgroundImage: `url(${MICROAPPS_CATALOG_HERO})` }}>
        <div className="mapps-title">
          <div className="mapps-title-icon"><RiApps2Line /></div>
          <div>
            <h1>¿Qué quieres conseguir hoy?</h1>
            {!heroCollapsed && <p>{apps.length || 147} habilidades especializadas: ejecútalas directamente o conviértelas en workflows con consejo de agentes, coste y evidencia trazable.</p>}
          </div>
        </div>
        <button type="button" className="mapps-button ghost" onClick={toggleHero} aria-expanded={!heroCollapsed}>
          {heroCollapsed ? <><RiArrowDownSLine /> Mostrar</> : <><RiArrowUpSLine /> Compactar</>}
        </button>
      </header>

      <section className="mapps-filters" aria-label="Filtros del catálogo">
        <div className="mapps-filter-chips" role="group" aria-label="Filtrar por objetivo">
          {CATEGORY_FILTERS.map(value => (
            <button
              key={value || 'all'}
              type="button"
              className={category === value ? 'active' : ''}
              style={value ? { '--chip': microappCategoryMeta(value).color } : undefined}
              onClick={() => setParam('objetivo', value)}
            >
              {value ? microappCategoryMeta(value).label : 'Todo'}
            </button>
          ))}
        </div>
        <label className="mapps-search">
          <RiSearchLine aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por nombre, objetivo, canal (email, LinkedIn…)"
            value={search}
            onChange={event => setParam('q', event.target.value)}
            aria-label="Buscar en el catálogo"
          />
        </label>
        <div className="mapps-view-toggle" role="group" aria-label="Tipo de vista">
          <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setParam('vista', '')} aria-label="Vista de tarjetas" title="Tarjetas"><RiLayoutGridLine /></button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setParam('vista', 'lista')} aria-label="Vista de lista" title="Lista"><RiListUnordered /></button>
        </div>
        <div className="mapps-collection-row">
          <span>Pack</span>
          <div className="mapps-filter-chips compact" role="group" aria-label="Filtrar por pack">
            {COLLECTION_FILTERS.map(value => (
              <button
                key={value || 'all-collections'}
                type="button"
                className={collection === value ? 'active' : ''}
                style={value ? { '--chip': microappCollectionMeta(value).color } : undefined}
                onClick={() => setParam('pack', value)}
              >
                {value ? microappCollectionMeta(value).shortLabel : 'Todos'}
              </button>
            ))}
          </div>
          <span className="mapps-count" aria-live="polite">
            {visible.length} de {apps.length}
            {filtering && <button type="button" className="mapps-clear" onClick={clearFilters}><RiCloseLine /> Limpiar</button>}
          </span>
        </div>
      </section>

      {collection && (
        <section className="mapps-pack-banner" style={{ backgroundImage: `url(${microappCollectionArt(collection)})` }} aria-label={`Pack ${microappCollectionMeta(collection).label}`}>
          <strong>{microappCollectionMeta(collection).label}</strong>
          <span>{apps.filter(app => app.collection === collection).length} microapps en este pack</span>
        </section>
      )}

      {listState === 'loading' && <Skeletons view={view} />}

      {listState === 'error' && (
        <div className="mapps-state error" role="alert">
          <RiErrorWarningLine />
          <strong>No se pudo cargar el catálogo de microapps.</strong>
          <span>Comprueba tu conexión o inténtalo de nuevo en unos segundos.</span>
          <button type="button" className="mapps-button secondary" onClick={fetchCatalog}>Reintentar</button>
        </div>
      )}

      {listState === 'empty' && (
        <div className="mapps-state" role="status">
          <RiApps2Line />
          <strong>Todavía no hay microapps publicadas</strong>
          <span>Cuando el backend publique el catálogo aparecerán aquí las recetas: investigación de empresas, preparación de llamadas, contenido y más.</span>
        </div>
      )}

      {listState === 'ready' && !filtering && (recentApps.length > 0 || favoriteApps.length > 0) && (
        <section className="mapps-shelves" aria-label="Tus microapps">
          {recentApps.length > 0 && (
            <div className="mapps-shelf">
              <h2><RiHistoryLine /> Recientes <small>lo último que has ejecutado</small></h2>
              {renderGrid(recentApps)}
            </div>
          )}
          {favoriteApps.length > 0 && (
            <div className="mapps-shelf">
              <h2><RiStarFill /> Favoritas <small>fijadas por ti</small></h2>
              {renderGrid(favoriteApps)}
            </div>
          )}
        </section>
      )}

      {listState === 'ready' && (
        visible.length === 0 ? (
          <div className="mapps-state" role="status">
            <RiSearchLine />
            <strong>Nada coincide con tu búsqueda</strong>
            <span>Prueba con otra palabra u otro objetivo, o quita los filtros.</span>
            <button type="button" className="mapps-button secondary" onClick={clearFilters}><RiCloseLine /> Limpiar filtros</button>
          </div>
        ) : (
          <section className="mapps-results" aria-label="Microapps disponibles">
            {selected.length > 0 && (
              <div className="mapps-shelf">
                {others.length > 0 && <h2>Selección <small>{selected.length} microapps curadas por packs</small></h2>}
                {renderGrid(selected)}
              </div>
            )}
            {others.length > 0 && (
              <div className="mapps-shelf">
                {selected.length > 0 && <h2>Catálogo completo <small>{others.length} más</small></h2>}
                {renderGrid(others)}
              </div>
            )}
          </section>
        )
      )}
    </main>
  )
}
