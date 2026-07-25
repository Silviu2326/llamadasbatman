import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RiAddLine, RiArrowDownSLine, RiCheckLine, RiCloseLine, RiCompass3Line,
  RiExternalLinkLine, RiFileDownloadLine, RiFilter3Line, RiGlobalLine,
  RiLoader4Line, RiMapPin2Line, RiMegaphoneLine, RiPhoneLine, RiSearchLine,
  RiSparkling2Line, RiStarFill, RiUploadCloud2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import { DEMO_MODE } from '../lib/dataMode'
import { downloadCsv } from '../lib/csv'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import prospectCompass from '../assets/prospect-compass.png'
import CaptureJourney from '../components/capture/CaptureJourney'
import './prospect.css'

const SORT_OPTIONS = [
  { value: 'quickScore', label: 'Oportunidad' },
  { value: 'rating', label: 'Rating' },
  { value: 'userRatingCount', label: 'Reseñas' },
]

function scoreTone(score = 0) {
  return score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cool'
}

function getApiError(body, fallback) {
  if (typeof body?.error === 'string') return body.error
  if (typeof body?.message === 'string') return body.message
  return fallback
}

function ProspectRow({ result, checked, onToggle }) {
  return (
    <article className={`prospect-row ${checked ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(result.placeId)}
        aria-label={`Seleccionar ${result.name}`}
      />
      <div className="prospect-business">
        <strong>{result.name}</strong>
        {result.address ? <span><RiMapPin2Line /> {result.address}</span> : null}
      </div>
      <div className={`prospect-score ${scoreTone(result.quickScore)}`}>
        <strong>{result.quickScore ?? '—'}</strong>
        <span>{result.quickScore >= 60 ? 'Alta' : result.quickScore >= 30 ? 'Media' : 'Por explorar'}</span>
      </div>
      <div className="prospect-rating">
        {result.rating != null
          ? <><span><RiStarFill /> {result.rating}</span><small>{result.userRatingCount ?? 0} reseñas</small></>
          : <small>Sin datos</small>}
      </div>
      <div className="prospect-contact">
        {result.phone ? <span><RiPhoneLine /> {result.phone}</span> : <span className="muted">Sin teléfono</span>}
        {result.website
          ? <a href={result.website} target="_blank" rel="noreferrer"><RiGlobalLine /> Web <RiExternalLinkLine /></a>
          : <span className="muted">Sin web</span>}
      </div>
      <div className="prospect-row-actions">
        {result.mapsUri
          ? <a href={result.mapsUri} target="_blank" rel="noreferrer" aria-label={`Abrir ${result.name} en Maps`}><RiMapPin2Line /></a>
          : null}
      </div>
    </article>
  )
}

export default function ProspectFinderPage() {
  const { locale } = useI18n()
  const [sector, setSector] = useState('')
  const [city, setCity] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState('')
  const [campaignReloadKey, setCampaignReloadKey] = useState(0)
  const [campaignCreatorOpen, setCampaignCreatorOpen] = useState(false)
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', objective: '' })
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [searchStatus, setSearchStatus] = useState('idle')
  const [sortBy, setSortBy] = useState('quickScore')
  const [minRating, setMinRating] = useState('')
  const [minReviews, setMinReviews] = useState('')
  const [onlyNoWebsite, setOnlyNoWebsite] = useState(false)
  const [onlyWithPhone, setOnlyWithPhone] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [autoAudit, setAutoAudit] = useState(false)
  const [autoCall, setAutoCall] = useState(false)
  const campaignSelectRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCampaigns() {
      setCampaignsLoading(true)
      setCampaignsError('')
      try {
        const response = await apiFetch('/api/campaigns?page=1&limit=100', { signal: controller.signal })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(getApiError(body, 'No se pudieron cargar las campañas'))
        const items = Array.isArray(body) ? body : body.items
        setCampaigns(Array.isArray(items) ? items : [])
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setCampaignsError(loadError.message)
      } finally {
        if (!controller.signal.aborted) setCampaignsLoading(false)
      }
    }

    loadCampaigns()
    return () => controller.abort()
  }, [campaignReloadKey])

  const visible = useMemo(() => {
    const filtered = results.filter(result => {
      if (minRating && (result.rating == null || result.rating < Number(minRating))) return false
      if (minReviews && (result.userRatingCount == null || result.userRatingCount < Number(minReviews))) return false
      if (onlyNoWebsite && result.website) return false
      if (onlyWithPhone && !result.phone) return false
      return true
    })
    return [...filtered].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1))
  }, [results, sortBy, minRating, minReviews, onlyNoWebsite, onlyWithPhone])

  const visibleSelectedCount = useMemo(
    () => visible.reduce((total, result) => total + (selected.has(result.placeId) ? 1 : 0), 0),
    [selected, visible],
  )
  const selectedCampaign = campaigns.find(campaign => campaign.id === campaignId)

  async function handleSearch(event) {
    event.preventDefault()
    if (!sector.trim() || !city.trim()) return
    setLoading(true)
    setSearchStatus('loading')
    setError('')
    setNotice(null)
    setResults([])
    setSelected(new Set())
    try {
      const response = await apiFetch('/api/prospects/search', {
        method: 'POST',
        body: JSON.stringify({ sector: sector.trim(), city: city.trim() }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiError(body, 'La búsqueda no está disponible ahora'))
      const nextResults = Array.isArray(body.data) ? body.data : []
      setResults(nextResults)
      setSearchStatus(nextResults.length ? 'live' : 'empty')
      if (!nextResults.length) setNotice({ type: 'empty', title: 'Búsqueda completada', detail: 'No encontramos negocios con esos criterios. Prueba una zona más amplia.' })
    } catch (searchError) {
      setSearchStatus('error')
      setError(DEMO_MODE
        ? 'El modo demo está habilitado, pero Prospect Finder no usa resultados simulados. Conecta el buscador real e inténtalo de nuevo.'
        : searchError.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function toggle(placeId) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }

  function toggleAll() {
    setSelected(previous => {
      const next = new Set(previous)
      const allVisibleSelected = visible.length > 0 && visible.every(result => next.has(result.placeId))
      visible.forEach(result => allVisibleSelected ? next.delete(result.placeId) : next.add(result.placeId))
      return next
    })
  }

  function openCampaignCreator() {
    const suggestedName = [sector.trim(), city.trim()].filter(Boolean).join(' · ')
    setNewCampaign(previous => ({
      name: previous.name || `Outbound${suggestedName ? ` · ${suggestedName}` : ''}`,
      objective: previous.objective || `Captar nuevos clientes mediante prospección outbound${suggestedName ? ` en ${suggestedName}` : ''}.`,
    }))
    setCampaignsError('')
    setCampaignCreatorOpen(true)
  }

  async function handleCreateCampaign(event) {
    event.preventDefault()
    const name = newCampaign.name.trim()
    if (!name) {
      setCampaignsError('Escribe un nombre para la campaña outbound')
      return
    }

    setCreatingCampaign(true)
    setCampaignsError('')
    setError('')
    try {
      const response = await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          objective: newCampaign.objective.trim() || 'Captar nuevos clientes mediante prospección outbound.',
          goal: 'Generar oportunidades comerciales cualificadas',
          settings: { source: 'outbound_prospecting', channel: 'prospecting' },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiError(body, 'No se pudo crear la campaña'))
      setCampaigns(previous => [body, ...previous.filter(campaign => campaign.id !== body.id)])
      setCampaignId(body.id)
      setCampaignCreatorOpen(false)
      setNewCampaign({ name: '', objective: '' })
      setNotice({ type: 'campaign', title: 'Campaña outbound creada', detail: `${body.name} ya está seleccionada como destino de la importación.` })
    } catch (createError) {
      setCampaignsError(createError.message)
    } finally {
      setCreatingCampaign(false)
    }
  }

  async function handleImport() {
    const items = visible.filter(result => selected.has(result.placeId))
    setError('')
    setNotice(null)

    if (!items.length) {
      setError('Selecciona al menos un prospecto para importar')
      return
    }
    if (!campaignId) {
      setError('Selecciona o crea una campaña para continuar con la importación')
      campaignSelectRef.current?.focus()
      return
    }
    setImporting(true)
    try {
      const response = await apiFetch('/api/prospects/import', {
        method: 'POST',
        body: JSON.stringify({
          campaignId,
          sector: sector.trim(),
          city: city.trim(),
          enrich: true,
          autoAudit,
          autoCall,
          items,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiError(body, 'No se pudieron importar los prospectos seleccionados'))
      setNotice({
        type: 'import',
        title: `${body.imported || 0} prospectos importados en ${selectedCampaign?.name || 'la campaña'}`,
        detail: body.skipped ? `${body.skipped} ya estaban en tu CRM y se omitieron de forma segura.` : 'La lista ya está disponible para seguimiento comercial.',
        campaignId,
      })
      const processedIds = new Set(items.map(item => item.placeId))
      setResults(previous => previous.filter(result => !processedIds.has(result.placeId)))
      setSelected(new Set())
    } catch (importError) {
      setError(importError.message)
    } finally {
      setImporting(false)
    }
  }

  function handleExportCsv() {
    downloadCsv(`prospectos-${sector}-${city}.csv`, visible.map(result => ({
      nombre: result.name,
      direccion: result.address ?? '',
      telefono: result.phone ?? '',
      web: result.website ?? '',
      rating: result.rating ?? '',
      resenas: result.userRatingCount ?? '',
      oportunidad: result.quickScore,
      maps: result.mapsUri ?? '',
    })))
  }

  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length

  return (
    <div className="prospect-page dark-scroll">
      <header className="prospect-header">
        <div className="prospect-title">
          <div className="prospect-mark"><img src={prospectCompass} alt="" /><RiCompass3Line /></div>
          <div><span className="prospect-overline">{locale === 'en' ? 'Revenue intelligence' : 'Inteligencia comercial'}</span><h1>Prospect Finder</h1><p>{locale === 'en' ? 'Find opportunities and activate them within a campaign.' : 'Encuentra oportunidades y actívalas dentro de una campaña.'}</p></div>
        </div>
        <div className="prospect-header-meta">
          <span className="prospect-live"><i /> {locale === 'en' ? 'Search engine ready' : 'Motor de búsqueda listo'}</span>
          <span className="prospect-kicker-stat"><strong>{results.length || '—'}</strong> {locale === 'en' ? 'prospects found' : 'prospectos encontrados'}</span>
        </div>
      </header>

      <CaptureJourney active="attract" />

      <section className="prospect-search-card" aria-labelledby="prospect-search-title">
        <div className="search-card-copy">
          <span className="prospect-step">01 / Descubre</span>
          <h2 id="prospect-search-title">Construye tu próxima lista de oportunidades.</h2>
          <p>Combina sector y ciudad para encontrar negocios con señales claras de crecimiento.</p>
        </div>
        <form className="prospect-search-form" onSubmit={handleSearch}>
          <label htmlFor="prospect-sector"><span>Sector</span><div className="prospect-input"><RiSearchLine /><input id="prospect-sector" value={sector} onChange={event => setSector(event.target.value)} placeholder="Clínicas dentales" required /></div></label>
          <label htmlFor="prospect-city"><span>Ciudad o zona</span><div className="prospect-input"><RiMapPin2Line /><input id="prospect-city" value={city} onChange={event => setCity(event.target.value)} placeholder="Valencia" required /></div></label>
          <button className="prospect-primary-button" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <RiLoader4Line className="prospect-spin" /> : <RiSparkling2Line />}{loading ? 'Buscando…' : 'Buscar prospectos'}
          </button>
        </form>
        <div className="search-card-hint"><RiCheckLine /> Datos de negocio enriquecidos automáticamente</div>
      </section>

      <DataStatusBanner
        status={searchStatus === 'idle' ? (campaignsLoading ? 'loading' : campaignsError ? 'error' : campaigns.length ? 'live' : 'empty') : searchStatus}
        message={searchStatus === 'idle'
          ? campaignsLoading ? 'Consultando campañas disponibles para importar prospectos.' : campaignsError || (campaigns.length ? undefined : 'Todavía no hay campañas de destino; crea una para poder importar.')
          : searchStatus === 'empty' ? 'La búsqueda respondió correctamente, pero no devolvió negocios con esos criterios.' : undefined}
        onRetry={searchStatus === 'error'
          ? () => handleSearch({ preventDefault() {} })
          : searchStatus === 'idle' && (campaignsError || !campaigns.length) ? () => setCampaignReloadKey(key => key + 1) : undefined}
      />

      <div className="prospect-feedback" aria-live="polite" aria-atomic="true">
        {error ? <div className="prospect-alert error" role="alert">{error}</div> : null}
        {notice ? (
          <div className="prospect-alert success" role="status">
            <RiCheckLine />
            <span><strong>{notice.title}.</strong> {notice.detail} {notice.campaignId ? <a href={`/campanas/${notice.campaignId}`}>Abrir campaña <RiExternalLinkLine /></a> : null}</span>
          </div>
        ) : null}
      </div>

      {results.length > 0 ? (
        <>
          <div className="prospect-results-head">
            <div><span className="prospect-overline">02 / Califica y activa</span><h2>Resultados de búsqueda <em>{visible.length}</em></h2></div>
            <div className="prospect-tools">
              <button className={`prospect-ghost-button${filtersOpen ? ' active' : ''}`} type="button" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="prospect-filters"><RiFilter3Line /> Filtros <RiArrowDownSLine /></button>
              <button className="prospect-ghost-button" type="button" onClick={handleExportCsv}><RiFileDownloadLine /> Exportar CSV</button>
            </div>
          </div>

          {filtersOpen ? (
            <div className="prospect-filter-bar" id="prospect-filters">
              <label>Ordenar por<select value={sortBy} onChange={event => setSortBy(event.target.value)}>{SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Rating mínimo<input value={minRating} onChange={event => setMinRating(event.target.value)} type="number" step="0.1" min="0" max="5" placeholder="—" /></label>
              <label>Reseñas mínimas<input value={minReviews} onChange={event => setMinReviews(event.target.value)} type="number" min="0" placeholder="—" /></label>
              <label className="prospect-check"><input type="checkbox" checked={onlyNoWebsite} onChange={event => setOnlyNoWebsite(event.target.checked)} /> Sin web</label>
              <label className="prospect-check"><input type="checkbox" checked={onlyWithPhone} onChange={event => setOnlyWithPhone(event.target.checked)} /> Con teléfono</label>
            </div>
          ) : null}

          <section className="prospect-table-card" aria-label="Resultados de prospección">
            <div className="prospect-table-toolbar">
              <label className="select-all">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!visible.length} />
                <span>{selected.size ? `${selected.size} seleccionados` : 'Seleccionar resultados'}</span>
              </label>

              <div className="prospect-import-workflow">
                <div className="prospect-campaign-selector">
                  <label htmlFor="prospect-campaign"><RiMegaphoneLine /><span>Campaña de destino <em>Obligatoria</em></span></label>
                  <div className="prospect-campaign-controls">
                    <select
                      id="prospect-campaign"
                      ref={campaignSelectRef}
                      value={campaignId}
                      onChange={event => { setCampaignId(event.target.value); setCampaignsError(''); setError('') }}
                      disabled={campaignsLoading}
                      required
                      aria-invalid={!campaignId && selected.size > 0}
                      aria-describedby="prospect-campaign-help"
                    >
                      <option value="">{campaignsLoading ? 'Cargando campañas…' : 'Selecciona una campaña'}</option>
                      {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                    </select>
                    <button className="prospect-new-campaign-button" type="button" onClick={openCampaignCreator} aria-expanded={campaignCreatorOpen} aria-controls="prospect-campaign-creator"><RiAddLine /> Nueva outbound</button>
                  </div>
                  <small id="prospect-campaign-help">Todos los prospectos se atribuirán a esta campaña.</small>
                  {campaignsError && !campaignCreatorOpen ? <span className="prospect-inline-error" role="alert">{campaignsError}</span> : null}
                </div>

                <div className="prospect-import-actions">
                  <label><input type="checkbox" checked={autoAudit} onChange={event => setAutoAudit(event.target.checked)} /> Auditar al importar</label>
                  <label><input type="checkbox" checked={autoCall} onChange={event => setAutoCall(event.target.checked)} /> Activar llamada</label>
                  <button className="prospect-import-button" type="button" disabled={!selected.size || importing} onClick={handleImport} aria-busy={importing}>
                    {importing ? <RiLoader4Line className="prospect-spin" /> : <RiUploadCloud2Line />}
                    {importing ? 'Importando…' : !campaignId && selected.size ? 'Selecciona campaña' : 'Importar seleccionados'}
                  </button>
                </div>
              </div>
            </div>

            {campaignCreatorOpen ? (
              <form className="prospect-campaign-creator" id="prospect-campaign-creator" onSubmit={handleCreateCampaign} aria-labelledby="prospect-campaign-creator-title">
                <div className="prospect-campaign-creator-copy">
                  <span className="prospect-creator-icon"><RiMegaphoneLine /></span>
                  <div><strong id="prospect-campaign-creator-title">Nueva campaña outbound</strong><p>Créala aquí y quedará seleccionada para importar esta lista.</p></div>
                </div>
                <label htmlFor="new-outbound-name">Nombre<input id="new-outbound-name" value={newCampaign.name} onChange={event => setNewCampaign(previous => ({ ...previous, name: event.target.value }))} maxLength={140} required autoFocus /></label>
                <label htmlFor="new-outbound-objective">Objetivo<input id="new-outbound-objective" value={newCampaign.objective} onChange={event => setNewCampaign(previous => ({ ...previous, objective: event.target.value }))} maxLength={2000} /></label>
                <div className="prospect-creator-actions">
                  <button className="prospect-creator-cancel" type="button" onClick={() => { setCampaignCreatorOpen(false); setCampaignsError('') }}><RiCloseLine /> Cancelar</button>
                  <button className="prospect-import-button" type="submit" disabled={creatingCampaign} aria-busy={creatingCampaign}>{creatingCampaign ? <RiLoader4Line className="prospect-spin" /> : <RiAddLine />}{creatingCampaign ? 'Creando…' : 'Crear y seleccionar'}</button>
                </div>
                {campaignsError ? <div className="prospect-inline-error creator-error" role="alert">{campaignsError}</div> : null}
              </form>
            ) : null}

            <div className="prospect-table-head" aria-hidden="true"><span /><span>Negocio</span><span>Oportunidad</span><span>Reputación</span><span>Contacto</span><span>Acciones</span></div>
            <div className="prospect-table-body">
              {visible.map(result => <ProspectRow key={result.placeId} result={result} checked={selected.has(result.placeId)} onToggle={toggle} />)}
              {visible.length === 0 ? <div className="prospect-empty-filter">No hay resultados con estos filtros. Ajusta la búsqueda para ampliar tu lista.</div> : null}
            </div>
            <footer className="prospect-table-footer">Mostrando <strong>{visible.length}</strong> de {results.length} resultados <span>·</span> Los resultados se ordenan por oportunidad.</footer>
          </section>
        </>
      ) : (
        <section className="prospect-empty-state">
          <div className="empty-orbit"><RiCompass3Line /></div>
          <div><span className="prospect-overline">Tu radar comercial</span><h2>Empieza con una búsqueda inteligente.</h2><p>Introduce un sector y una ciudad para descubrir negocios, revisar sus señales y convertir los mejores en leads accionables.</p><div className="empty-features"><span><RiCheckLine /> Score de oportunidad</span><span><RiCheckLine /> Web y teléfono</span><span><RiCheckLine /> Rating y reseñas</span></div></div>
        </section>
      )}
    </div>
  )
}
