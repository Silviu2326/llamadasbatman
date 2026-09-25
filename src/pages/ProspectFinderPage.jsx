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
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './prospect.css'
import './growth-visual-standard.css'

const SORT_OPTIONS = ['quickScore', 'rating', 'userRatingCount']

function scoreTone(score = 0) {
  return score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cool'
}

function getApiError(body, fallback) {
  if (typeof body?.error === 'string') return body.error
  if (typeof body?.message === 'string') return body.message
  return fallback
}

function ProspectRow({ result, checked, onToggle }) {
  const { t } = useI18n()
  return (
    <article className={`prospect-row ${checked ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(result.placeId)}
        aria-label={t('prospects.row.select', { name: result.name })}
      />
      <div className="prospect-business">
        <strong>{result.name}</strong>
        {result.address ? <span><RiMapPin2Line /> {result.address}</span> : null}
      </div>
      <div className={`prospect-score ${scoreTone(result.quickScore)}`}>
        <strong>{result.quickScore ?? '—'}</strong>
        <span>{result.quickScore >= 60 ? t('prospects.row.high') : result.quickScore >= 30 ? t('prospects.row.medium') : t('prospects.row.explore')}</span>
      </div>
      <div className="prospect-rating">
        {result.rating != null
          ? <><span><RiStarFill /> {result.rating}</span><small>{t('prospects.row.reviews', { n: result.userRatingCount ?? 0 })}</small></>
          : <small>{t('prospects.row.noData')}</small>}
      </div>
      <div className="prospect-contact">
        {result.phone ? <span><RiPhoneLine /> {result.phone}</span> : <span className="muted">{t('prospects.row.noPhone')}</span>}
        {result.website
          ? <a href={result.website} target="_blank" rel="noreferrer"><RiGlobalLine /> {t('prospects.row.web')} <RiExternalLinkLine /></a>
          : <span className="muted">{t('prospects.row.noWeb')}</span>}
      </div>
      <div className="prospect-row-actions">
        {result.mapsUri
          ? <a href={result.mapsUri} target="_blank" rel="noreferrer" aria-label={t('prospects.row.openMaps', { name: result.name })}><RiMapPin2Line /></a>
          : null}
      </div>
    </article>
  )
}

export default function ProspectFinderPage() {
  const { t } = useI18n()
  const [sector, setSector] = useState('')
  const [sequenceId, setSequenceId] = useState('')
  const [sequences, setSequences] = useState([])
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
  const [autoEmail, setAutoEmail] = useState(false)
  const campaignSelectRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCampaigns() {
      setCampaignsLoading(true)
      setCampaignsError('')
      try {
        const response = await apiFetch('/api/campaigns?page=1&limit=100', { signal: controller.signal })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(getApiError(body, t('prospects.campaignsLoadFailed')))
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
    // `t` solo cambia con el idioma; recargar campañas por eso sería ruido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignReloadKey])

  // Secuencias opcionales: el backend admite `sequenceId` en la importación. Si
  // el listado no existe o falla, el selector simplemente no se muestra.
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/growth-programs?type=sales_sequence', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(body => {
        const items = Array.isArray(body) ? body : Array.isArray(body?.programs) ? body.programs : Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : []
        setSequences(items.filter(item => item && item.id && item.name))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

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
      if (!response.ok) throw new Error(getApiError(body, t('prospects.searchUnavailable')))
      const nextResults = Array.isArray(body.data) ? body.data : []
      setResults(nextResults)
      setSearchStatus(nextResults.length ? 'live' : 'empty')
      if (!nextResults.length) setNotice({ type: 'empty', title: t('prospects.searchDoneTitle'), detail: t('prospects.searchDoneEmpty') })
    } catch (searchError) {
      setSearchStatus('error')
      setError(DEMO_MODE
        ? t('prospects.demoNoResults')
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
      name: previous.name || `${t('prospects.outboundName')}${suggestedName ? ` · ${suggestedName}` : ''}`,
      objective: previous.objective || t('prospects.outboundObjective', { where: suggestedName ? t('prospects.outboundWhere', { place: suggestedName }) : '' }),
    }))
    setCampaignsError('')
    setCampaignCreatorOpen(true)
  }

  async function handleCreateCampaign(event) {
    event.preventDefault()
    const name = newCampaign.name.trim()
    if (!name) {
      setCampaignsError(t('prospects.campaignNameRequired'))
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
          objective: newCampaign.objective.trim() || t('prospects.defaultObjective'),
          goal: t('prospects.defaultGoal'),
          settings: { source: 'outbound_prospecting', channel: 'prospecting' },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiError(body, t('prospects.campaignCreateFailed')))
      setCampaigns(previous => [body, ...previous.filter(campaign => campaign.id !== body.id)])
      setCampaignId(body.id)
      setCampaignCreatorOpen(false)
      setNewCampaign({ name: '', objective: '' })
      setNotice({ type: 'campaign', title: t('prospects.campaignCreatedTitle'), detail: t('prospects.campaignCreatedDetail', { name: body.name }) })
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
      setError(t('prospects.selectAtLeastOne'))
      return
    }
    if (!campaignId) {
      setError(t('prospects.selectCampaignFirst'))
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
          // El email frío necesita hallazgos: sin auditar no hay nada cierto
          // que escribir, así que activarlo activa también la auditoría.
          autoEmail: autoEmail && autoAudit,
          sequenceId: sequenceId || undefined,
          items,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiError(body, t('prospects.importFailed')))
      // Desglose de la importación: quién se omitió y por qué, emails y llamadas.
      const names = list => [...new Set((list ?? []).map(item => item.name).filter(Boolean))].slice(0, 3).join(', ')
      const duplicates = Array.isArray(body.duplicates) ? body.duplicates : []
      const invalid = Array.isArray(body.invalid) ? body.invalid : []
      const emailsSent = body.emailsSent ?? body.emailed ?? 0
      const detail = [
        duplicates.length ? t('prospects.import.duplicates', { n: duplicates.length, names: names(duplicates) }) : '',
        invalid.length ? t('prospects.import.invalid', { n: invalid.length, names: names(invalid) }) : '',
        emailsSent ? t('prospects.import.emails', { n: emailsSent }) : '',
        // Los fallos se dicen con motivo: "3 sin email" no deja hacer nada.
        body.emailFailures?.length ? t('prospects.import.emailFailures', { n: body.emailFailures.length, reasons: [...new Set(body.emailFailures.map(item => item.reason))].slice(0, 2).join(' · ') }) : '',
        body.callsQueued ? t('prospects.import.callsQueued', { n: body.callsQueued }) : '',
      ].filter(Boolean).join(' ')
      const skippedCalls = body.callsSkipped?.count || 0
      setNotice({
        type: 'import',
        title: t('prospects.import.title', { n: body.imported || 0, campaign: selectedCampaign?.name || t('prospects.import.theCampaign') }),
        detail: detail || t('prospects.import.ready'),
        campaignId,
        warning: skippedCalls
          ? t(body.callsSkipped.reason === 'campaign_not_active' ? 'prospects.import.callsSkippedCampaign' : body.callsSkipped.reason === 'agent_not_published' ? 'prospects.import.callsSkippedAgent' : 'prospects.import.callsSkippedGeneric', { n: skippedCalls })
          : '',
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
    downloadCsv(t('prospects.csvFile', { sector, city }), visible.map(result => ({
      [t('prospects.csv.name')]: result.name,
      [t('prospects.csv.address')]: result.address ?? '',
      [t('prospects.csv.phone')]: result.phone ?? '',
      [t('prospects.csv.web')]: result.website ?? '',
      [t('prospects.csv.rating')]: result.rating ?? '',
      [t('prospects.csv.reviews')]: result.userRatingCount ?? '',
      [t('prospects.csv.opportunity')]: result.quickScore,
      [t('prospects.csv.maps')]: result.mapsUri ?? '',
    })))
  }

  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length

  return (
    <div className="prospect-page dark-scroll">
      <ProductPageHeader Icon={RiCompass3Line} title={t('prospects.title')} description={t('prospects.description')} />


      <section className="prospect-search-card" aria-labelledby="prospect-search-title">
        <div className="search-card-copy">
          <span className="prospect-step">{t('prospects.step1')}</span>
          <h2 id="prospect-search-title">{t('prospects.searchTitle')}</h2>
          <p>{t('prospects.searchText')}</p>
        </div>
        <form className="prospect-search-form" onSubmit={handleSearch}>
          <label htmlFor="prospect-sector"><span>{t('prospects.sector')}</span><div className="prospect-input"><RiSearchLine /><input id="prospect-sector" value={sector} onChange={event => setSector(event.target.value)} placeholder={t('prospects.sectorPlaceholder')} required /></div></label>
          <label htmlFor="prospect-city"><span>{t('prospects.city')}</span><div className="prospect-input"><RiMapPin2Line /><input id="prospect-city" value={city} onChange={event => setCity(event.target.value)} placeholder={t('prospects.cityPlaceholder')} required /></div></label>
          <button className="prospect-primary-button" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <RiLoader4Line className="prospect-spin" /> : <RiSparkling2Line />}{loading ? t('prospects.searching') : t('prospects.search')}
          </button>
        </form>
        <div className="search-card-hint"><RiCheckLine /> {t('prospects.enrichedHint')}</div>
      </section>

      <DataStatusBanner
        status={searchStatus === 'idle' ? (campaignsLoading ? 'loading' : campaignsError ? 'error' : campaigns.length ? 'live' : 'empty') : searchStatus}
        message={searchStatus === 'idle'
          ? campaignsLoading ? t('prospects.loadingCampaignsBanner') : campaignsError || (campaigns.length ? undefined : t('prospects.noCampaignsBanner'))
          : searchStatus === 'empty' ? t('prospects.emptyBanner') : undefined}
        onRetry={searchStatus === 'error'
          ? () => handleSearch({ preventDefault() {} })
          : searchStatus === 'idle' && (campaignsError || !campaigns.length) ? () => setCampaignReloadKey(key => key + 1) : undefined}
      />

      <div className="prospect-feedback" aria-live="polite" aria-atomic="true">
        {error ? <div className="prospect-alert error" role="alert">{error}</div> : null}
        {notice ? (
          <div className="prospect-alert success" role="status">
            <RiCheckLine />
            <span><strong>{notice.title}.</strong> {notice.detail} {notice.campaignId ? <a href={`/campanas/${notice.campaignId}`}>{t('prospects.openCampaign')} <RiExternalLinkLine /></a> : null}</span>
          </div>
        ) : null}
        {notice?.warning ? <div className="prospect-alert warning" role="alert"><RiPhoneLine /><span>{notice.warning}</span></div> : null}
      </div>

      {results.length > 0 ? (
        <>
          <div className="prospect-results-head">
            <div><span className="prospect-overline">{t('prospects.step2')}</span><h2>{t('prospects.results')} <em>{visible.length}</em></h2></div>
            <div className="prospect-tools">
              <button className={`prospect-ghost-button${filtersOpen ? ' active' : ''}`} type="button" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="prospect-filters"><RiFilter3Line /> {t('prospects.filters')} <RiArrowDownSLine /></button>
              <button className="prospect-ghost-button" type="button" onClick={handleExportCsv}><RiFileDownloadLine /> {t('prospects.exportCsv')}</button>
            </div>
          </div>

          {filtersOpen ? (
            <div className="prospect-filter-bar" id="prospect-filters">
              <label>{t('prospects.sortBy')}<select value={sortBy} onChange={event => setSortBy(event.target.value)}>{SORT_OPTIONS.map(option => <option key={option} value={option}>{t(`prospects.sort.${option}`)}</option>)}</select></label>
              <label>{t('prospects.minRating')}<input value={minRating} onChange={event => setMinRating(event.target.value)} type="number" step="0.1" min="0" max="5" placeholder="—" /></label>
              <label>{t('prospects.minReviews')}<input value={minReviews} onChange={event => setMinReviews(event.target.value)} type="number" min="0" placeholder="—" /></label>
              <label className="prospect-check"><input type="checkbox" checked={onlyNoWebsite} onChange={event => setOnlyNoWebsite(event.target.checked)} /> {t('prospects.noWebsite')}</label>
              <label className="prospect-check"><input type="checkbox" checked={onlyWithPhone} onChange={event => setOnlyWithPhone(event.target.checked)} /> {t('prospects.withPhone')}</label>
            </div>
          ) : null}

          <section className="prospect-table-card" aria-label={t('prospects.resultsAria')}>
            <div className="prospect-table-toolbar">
              <label className="select-all">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!visible.length} />
                <span>{selected.size ? t('prospects.selectedCount', { n: selected.size }) : t('prospects.selectResults')}</span>
              </label>

              <div className="prospect-import-workflow">
                <div className="prospect-campaign-selector">
                  <label htmlFor="prospect-campaign"><RiMegaphoneLine /><span>{t('prospects.targetCampaign')} <em>{t('prospects.required')}</em></span></label>
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
                      <option value="">{campaignsLoading ? t('prospects.loadingCampaigns') : t('prospects.selectCampaign')}</option>
                      {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                    </select>
                    <button className="prospect-new-campaign-button" type="button" onClick={openCampaignCreator} aria-expanded={campaignCreatorOpen} aria-controls="prospect-campaign-creator"><RiAddLine /> {t('prospects.newOutbound')}</button>
                  </div>
                  <small id="prospect-campaign-help">{t('prospects.campaignHelp')}</small>
                  {sequences.length ? (
                    <label htmlFor="prospect-sequence" className="prospect-sequence"><span>{t('prospects.sequenceLabel')}</span>
                      <select id="prospect-sequence" value={sequenceId} onChange={event => setSequenceId(event.target.value)}>
                        <option value="">{t('prospects.noSequence')}</option>
                        {sequences.map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {campaignsError && !campaignCreatorOpen ? <span className="prospect-inline-error" role="alert">{campaignsError}</span> : null}
                </div>

                <div className="prospect-import-actions">
                  <label><input type="checkbox" checked={autoAudit} onChange={event => setAutoAudit(event.target.checked)} /> {t('prospects.autoAudit')}</label>
                  <label><input type="checkbox" checked={autoCall} onChange={event => setAutoCall(event.target.checked)} /> {t('prospects.autoCall')}</label>
                  <label title={autoAudit ? t('prospects.autoEmailOn') : t('prospects.autoEmailOff')}>
                    <input type="checkbox" checked={autoEmail && autoAudit} disabled={!autoAudit} onChange={event => setAutoEmail(event.target.checked)} /> {t('prospects.autoEmail')}
                  </label>
                  <button className="prospect-import-button" type="button" disabled={!selected.size || importing} onClick={handleImport} aria-busy={importing}>
                    {importing ? <RiLoader4Line className="prospect-spin" /> : <RiUploadCloud2Line />}
                    {importing ? t('prospects.importing') : !campaignId && selected.size ? t('prospects.selectCampaignButton') : t('prospects.importSelected')}
                  </button>
                </div>
              </div>
            </div>

            {campaignCreatorOpen ? (
              <form className="prospect-campaign-creator" id="prospect-campaign-creator" onSubmit={handleCreateCampaign} aria-labelledby="prospect-campaign-creator-title">
                <div className="prospect-campaign-creator-copy">
                  <span className="prospect-creator-icon"><RiMegaphoneLine /></span>
                  <div><strong id="prospect-campaign-creator-title">{t('prospects.newCampaignTitle')}</strong><p>{t('prospects.newCampaignText')}</p></div>
                </div>
                <label htmlFor="new-outbound-name">{t('prospects.name')}<input id="new-outbound-name" value={newCampaign.name} onChange={event => setNewCampaign(previous => ({ ...previous, name: event.target.value }))} maxLength={140} required autoFocus /></label>
                <label htmlFor="new-outbound-objective">{t('prospects.objective')}<input id="new-outbound-objective" value={newCampaign.objective} onChange={event => setNewCampaign(previous => ({ ...previous, objective: event.target.value }))} maxLength={2000} /></label>
                <div className="prospect-creator-actions">
                  <button className="prospect-creator-cancel" type="button" onClick={() => { setCampaignCreatorOpen(false); setCampaignsError('') }}><RiCloseLine /> {t('prospects.cancel')}</button>
                  <button className="prospect-import-button" type="submit" disabled={creatingCampaign} aria-busy={creatingCampaign}>{creatingCampaign ? <RiLoader4Line className="prospect-spin" /> : <RiAddLine />}{creatingCampaign ? t('prospects.creating') : t('prospects.createAndSelect')}</button>
                </div>
                {campaignsError ? <div className="prospect-inline-error creator-error" role="alert">{campaignsError}</div> : null}
              </form>
            ) : null}

            <div className="prospect-table-head" aria-hidden="true"><span /><span>{t('prospects.colBusiness')}</span><span>{t('prospects.colOpportunity')}</span><span>{t('prospects.colReputation')}</span><span>{t('prospects.colContact')}</span><span>{t('prospects.colActions')}</span></div>
            <div className="prospect-table-body">
              {visible.map(result => <ProspectRow key={result.placeId} result={result} checked={selected.has(result.placeId)} onToggle={toggle} />)}
              {visible.length === 0 ? <div className="prospect-empty-filter">{t('prospects.noResultsFilters')}</div> : null}
            </div>
            <footer className="prospect-table-footer">{t('prospects.showing', { shown: visible.length, total: results.length })} <span>·</span> {t('prospects.sortedNote')}</footer>
          </section>
        </>
      ) : (
        <section className="prospect-empty-state">
          <div className="empty-orbit"><RiCompass3Line /></div>
          <div><span className="prospect-overline">{t('prospects.emptyOverline')}</span><h2>{t('prospects.emptyTitle')}</h2><p>{t('prospects.emptyText')}</p><div className="empty-features"><span><RiCheckLine /> {t('prospects.featureScore')}</span><span><RiCheckLine /> {t('prospects.featureContact')}</span><span><RiCheckLine /> {t('prospects.featureRating')}</span></div></div>
        </section>
      )}
    </div>
  )
}
