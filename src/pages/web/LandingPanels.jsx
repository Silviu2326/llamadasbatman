import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightLine, RiBarChartGroupedLine, RiCloseLine, RiEditLine, RiExternalLinkLine,
  RiFileCopyLine, RiFilter3Line, RiGlobalLine, RiInformationLine, RiLayoutGridLine, RiListCheck,
  RiPauseCircleLine, RiPlayCircleLine, RiPulseLine, RiRefreshLine, RiSearchLine, RiSparkling2Line,
  RiTimeLine, RiUploadCloud2Line, RiUserAddLine,
} from 'react-icons/ri'
import { localeCode, useI18n } from '../../i18n'
import {
  FALLBACK_IMAGES, TEMPLATE_META, autonomyStatusLabel, changeTypeLabel, confidenceLabel, decisionLabel, describeChange,
  effortLabel, fieldLabel, formatMoney, formatNumber, formatPercent, formatRate, getConversion, getLink, statusMeta,
  templateKind, templateMeta, variantStatusLabel,
} from './landingModel'

/* ── Piezas pequeñas ───────────────────────────────────────────────────── */

export function LandingStatus({ item }) {
  const { t } = useI18n()
  const meta = statusMeta(item.external ? 'external' : item.status, t)
  return <span className={`gs-pill ${meta.tone ? `tone-${meta.tone}` : ''}`}>{meta.label}</span>
}

function LandingThumb({ item, featured = false }) {
  const { t } = useI18n()
  return (
    <div className={`wb-thumb${featured ? ' is-featured' : ''}`} style={{ '--thumb-color': templateMeta(item.templateId).color }}>
      <img src={item.image || FALLBACK_IMAGES[0]} alt="" />
      <span className="wb-thumb-label">{item.external ? t('webSeo.landings.thumb.website') : templateKind(item.templateId, t).toUpperCase()}</span>
      <strong>{item.name}</strong>
      <small>{item.external ? t('webSeo.landings.thumb.importedUrl') : item.offer || t('webSeo.landings.thumb.experience')}</small>
    </div>
  )
}

/* ── Atención requerida (landings.md §5.1) ─────────────────────────────── */

/** Un hallazgo de landing en la cola unificada. El orden lo da el backend por impacto. */
export function LandingDiagnosisCard({ diagnosis, onOpen }) {
  const { t } = useI18n()
  return (
    <article className={`gs-queue-card type-${diagnosis.type} tone-warn`}>
      <header>
        <span className="gs-queue-kind">{t('webSeo.landings.diag.kind', { title: diagnosis.title })}</span>
        <span className="gs-queue-meta">{diagnosis.level}</span>
      </header>
      <strong>{diagnosis.problem}</strong>
      <ul>{diagnosis.evidence.slice(0, 2).map(item => <li key={item}>{item}</li>)}</ul>
      <div className="gs-queue-impact">
        <span>{t('webSeo.landings.diag.impact')}</span>
        <strong>{t('webSeo.landings.diag.leadsMonth', { min: diagnosis.impact.minLeads, max: diagnosis.impact.maxLeads })}</strong>
        {/* Sin tasa de cualificación medida no se traduce a oportunidades. */}
        <small>{diagnosis.impact.maxOpportunities !== null ? t('webSeo.landings.diag.opps', { min: diagnosis.impact.minOpportunities, max: diagnosis.impact.maxOpportunities }) : t('webSeo.landings.diag.noQualRate')}</small>
      </div>
      <footer>
        <span>{t('webSeo.landings.diag.confEffort', { confidence: confidenceLabel(diagnosis.confidence, t), effort: effortLabel(diagnosis.effort, t) })}</span>
        <div><button type="button" className="gs-button small" onClick={() => onOpen(diagnosis.landingKey)}>{t('webSeo.landings.diag.seeDetail')} <RiArrowRightLine /></button></div>
      </footer>
    </article>
  )
}

/* ── Ranking económico (§5.2) ──────────────────────────────────────────── */

export function EconomicRanking({ items, onOpen }) {
  const { t } = useI18n()
  const measured = (items ?? []).filter(item => item.snapshot)
  return (
    <section className="gs-panel" aria-label={t('webSeo.landings.ranking.aria')}>
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiBarChartGroupedLine /></span>{t('webSeo.landings.ranking.title')}</h2><p>{t('webSeo.landings.ranking.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        {measured.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>{t('webSeo.landings.ranking.colLanding')}</th><th className="num">{t('webSeo.landings.ranking.colVisits')}</th><th className="num">{t('webSeo.landings.ranking.colLeads')}</th><th className="num">{t('webSeo.landings.ranking.colQualified')}</th><th className="num">{t('webSeo.landings.ranking.colSales')}</th><th className="num">{t('webSeo.landings.ranking.colRevenue')}</th><th>{t('webSeo.landings.ranking.colConfidence')}</th></tr></thead>
              <tbody>
                {measured.map(item => (
                  <tr key={item.campaignId} className="is-click" onClick={() => onOpen(item.landingKey)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') onOpen(item.landingKey) }}>
                    <td><strong>{item.name}</strong><small>/l/{item.slug}</small></td>
                    <td className="num">{formatNumber(item.snapshot.visits)}</td>
                    <td className="num">{formatNumber(item.snapshot.leads)}</td>
                    <td className="num">{formatNumber(item.snapshot.qualified)}</td>
                    <td className="num">{formatNumber(item.snapshot.sales)}</td>
                    <td className="num">{formatMoney(item.snapshot.revenueCents)}</td>
                    <td><span className={`gs-pill ${item.snapshot.confidence === 'high' ? 'tone-ok' : item.snapshot.confidence === 'medium' ? 'tone-warn' : ''}`}>{confidenceLabel(item.snapshot.confidence, t)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="gs-empty-inline">{t('webSeo.landings.ranking.empty')}</p>}
      </div>
    </section>
  )
}

/* ── Destacada y listado ───────────────────────────────────────────────── */

export function FeaturedLanding({ item, onOpen, onEdit, onCopy, onDetail }) {
  const { t } = useI18n()
  if (!item) return null
  const link = getLink(item)
  return (
    <section className="wb-featured gs-rise">
      <div className="wb-featured-copy">
        <div className="wb-featured-top"><LandingStatus item={item} /><span>{t('webSeo.landings.featured.label')}</span></div>
        <h2>{item.name}</h2>
        <p>{item.adCopy || t('webSeo.landings.featured.defaultCopy')}</p>
        <div className="wb-featured-url"><RiGlobalLine /> {item.external ? item.url : item.slug ? `/l/${item.slug}` : t('webSeo.landings.featured.pendingUrl')} <button type="button" onClick={() => onCopy(item)} aria-label={t('webSeo.landings.featured.copyLink')} disabled={!link}><RiFileCopyLine /></button></div>
        <div className="wb-featured-actions">
          <button type="button" className="gs-button primary" onClick={() => onOpen(item)}>{link ? <RiExternalLinkLine /> : <RiEditLine />} {link ? t('webSeo.landings.featured.open') : t('webSeo.landings.featured.configure')}</button>
          <button type="button" className="gs-button ghost" onClick={() => onEdit(item)}><RiEditLine /> {t('webSeo.landings.featured.edit')}</button>
          {item.landingKey ? <button type="button" className="gs-button ghost" onClick={() => onDetail(item.landingKey)}><RiPulseLine /> {t('webSeo.landings.featured.telemetry')}</button> : null}
        </div>
      </div>
      <div className="wb-featured-media">
        <LandingThumb item={item} featured />
        <div className="wb-featured-metric">
          <span>{item.external ? t('webSeo.landings.featured.metrics') : t('webSeo.landings.featured.campaignLeads')}</span>
          <strong>{formatNumber(item.leads)}</strong>
          <em>{item.external ? t('webSeo.landings.featured.notConnected') : t('webSeo.landings.featured.conversion', { pct: formatPercent(getConversion(item)) })}</em>
        </div>
      </div>
    </section>
  )
}

function RowActions({ item, onOpen, onEdit, onCopy, onToggleStatus, onDetail }) {
  const { t } = useI18n()
  return (
    <div className="wb-row-actions">
      {item.landingKey ? <button type="button" aria-label={t('webSeo.landings.row.telemetryOf', { name: item.name })} title={t('webSeo.landings.row.seeTelemetry')} onClick={event => { event.stopPropagation(); onDetail(item.landingKey) }}><RiPulseLine /></button> : null}
      <button type="button" aria-label={t('webSeo.landings.row.openOf', { name: item.name })} title={t('webSeo.landings.row.openLanding')} onClick={event => { event.stopPropagation(); onOpen(item) }}><RiExternalLinkLine /></button>
      <button type="button" aria-label={t('webSeo.landings.row.editOf', { name: item.name })} title={t('webSeo.landings.row.editLanding')} onClick={event => { event.stopPropagation(); onEdit(item) }}><RiEditLine /></button>
      <button type="button" aria-label={t('webSeo.landings.row.copyOf', { name: item.name })} title={t('webSeo.landings.row.copyLink')} onClick={event => { event.stopPropagation(); onCopy(item) }}><RiFileCopyLine /></button>
      {!item.external && item.slug ? (
        <button type="button" aria-label={item.status === 'published' ? t('webSeo.landings.row.pauseOf', { name: item.name }) : t('webSeo.landings.row.publishOf', { name: item.name })} title={item.status === 'published' ? t('webSeo.landings.row.pauseLanding') : t('webSeo.landings.row.publishLanding')} onClick={event => { event.stopPropagation(); onToggleStatus(item) }}>
          {item.status === 'published' ? <RiPauseCircleLine /> : <RiPlayCircleLine />}
        </button>
      ) : null}
    </div>
  )
}

export function LandingList({ items, externalCount, loading, loadError, onRetry, onOpen, onEdit, onCopy, onToggleStatus, onDetail, onCreate, onImport }) {
  const { t, locale } = useI18n()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [sort, setSort] = useState('name')
  const [view, setView] = useState('list')

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return items.filter(item => {
      const matchesFilter = filter === 'all' || (filter === 'external' ? item.external : item.status === filter)
      const matchesTemplate = templateFilter === 'all' || item.templateId === templateFilter
      const matchesSearch = !normalized || `${item.name} ${item.campaignName} ${item.slug} ${item.url || ''}`.toLowerCase().includes(normalized)
      return matchesFilter && matchesTemplate && matchesSearch
    }).sort((a, b) => {
      if (sort === 'leads') return (b.leads ?? -1) - (a.leads ?? -1)
      if (sort === 'conversion') return (getConversion(b) ?? -1) - (getConversion(a) ?? -1)
      return a.name.localeCompare(b.name, locale)
    })
  }, [items, filter, search, sort, templateFilter, locale])

  const tabs = [
    { id: 'all', label: t('webSeo.landings.list.all'), count: items.length },
    { id: 'published', label: t('webSeo.landings.list.published'), count: items.filter(item => item.status === 'published').length },
    { id: 'draft', label: t('webSeo.landings.list.drafts'), count: items.filter(item => item.status === 'draft').length },
    { id: 'none', label: t('webSeo.landings.list.none'), count: items.filter(item => item.status === 'none').length },
    { id: 'external', label: t('webSeo.landings.list.external'), count: externalCount },
  ]

  return (
    <section className="gs-panel wb-list-panel" aria-label={t('webSeo.landings.list.aria')}>
      <div className="wb-list-tabs" role="tablist">
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
        <div className="wb-list-tabs-actions">
          <button type="button" className="gs-button small ghost" onClick={onImport}><RiUploadCloud2Line /> {t('webSeo.landings.list.importUrl')}</button>
        </div>
      </div>
      <div className="wb-toolbar">
        <div className="wb-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('webSeo.landings.list.searchPlaceholder')} aria-label={t('webSeo.landings.list.searchAria')} /></div>
        <div className="wb-toolbar-actions">
          <label><RiFilter3Line /><select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label={t('webSeo.landings.list.filterTemplate')}><option value="all">{t('webSeo.landings.list.allTemplates')}</option>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
          <label><RiTimeLine /><select value={sort} onChange={event => setSort(event.target.value)} aria-label={t('webSeo.landings.list.sortAria')}><option value="name">{t('webSeo.landings.list.sortName')}</option><option value="leads">{t('webSeo.landings.list.sortLeads')}</option><option value="conversion">{t('webSeo.landings.list.sortConversion')}</option></select></label>
          <div className="wb-view-switch">
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label={t('webSeo.landings.list.viewList')} aria-pressed={view === 'list'}><RiListCheck /></button>
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label={t('webSeo.landings.list.viewGrid')} aria-pressed={view === 'grid'}><RiLayoutGridLine /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div>
      ) : filtered.length ? (
        <div className={`wb-list${view === 'grid' ? ' is-grid' : ''}`}>
          {filtered.map(item => {
            const meta = templateMeta(item.templateId)
            const conversion = getConversion(item)
            const actions = <RowActions item={item} onOpen={onOpen} onEdit={onEdit} onCopy={onCopy} onToggleStatus={onToggleStatus} onDetail={onDetail} />
            if (view === 'grid') {
              return (
                <article className="wb-card" key={item.id} onClick={() => onOpen(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item) } }}>
                  <LandingThumb item={item} />
                  <div className="wb-card-copy">
                    <div><strong>{item.name}</strong><LandingStatus item={item} /></div>
                    <span>{item.campaignName}</span>
                    <div><b>{formatNumber(item.leads)}</b><small>{t('webSeo.landings.list.campaignLeads')}</small><em>{formatPercent(conversion)}</em></div>
                  </div>
                  {actions}
                </article>
              )
            }
            return (
              <article className="wb-row" key={item.id} onClick={() => onOpen(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item) } }}>
                <LandingThumb item={item} />
                <div className="wb-row-main">
                  <div className="wb-row-title"><strong>{item.name}</strong><LandingStatus item={item} /></div>
                  <span className="wb-row-url">{item.external ? item.url : item.slug ? `/l/${item.slug}` : t('webSeo.landings.list.createUrl')}</span>
                  <div className="wb-row-meta"><span style={{ '--meta-color': meta.color }}><i />{item.external ? t('webSeo.landings.list.externalWeb') : meta.label}</span><span><RiGlobalLine /> {item.campaignName}</span><span>{item.updatedAt} · {item.updatedBy}</span></div>
                </div>
                <div className="wb-row-figure"><strong>{formatNumber(item.leads)}</strong><span>{item.external ? t('webSeo.landings.list.metricsNotConnected') : t('webSeo.landings.list.meetings', { n: formatNumber(item.meetings) })}</span></div>
                <div className="wb-row-figure"><strong>{formatPercent(conversion)}</strong><span>{Number.isFinite(item.visits) ? t('webSeo.landings.list.visitsMeasured', { n: formatNumber(item.visits) }) : item.external ? t('webSeo.landings.list.noMeasure') : t('webSeo.landings.list.noVisitsYet')}</span></div>
                {actions}
              </article>
            )
          })}
        </div>
      ) : (
        <div className={`gs-empty${loadError && !items.length ? ' is-error' : ''}`} role={loadError && !items.length ? 'alert' : 'status'}>
          <span>{loadError && !items.length ? <RiRefreshLine /> : items.length ? <RiSearchLine /> : <RiGlobalLine />}</span>
          <h3>{loadError && !items.length ? t('webSeo.landings.list.errorTitle') : items.length ? t('webSeo.landings.list.noResultsTitle') : t('webSeo.landings.list.emptyTitle')}</h3>
          <p>{loadError && !items.length ? t('webSeo.landings.list.errorText') : items.length ? t('webSeo.landings.list.noResultsText') : t('webSeo.landings.list.emptyText')}</p>
          <div className="gs-empty-actions">
            {loadError && !items.length ? <button type="button" className="gs-button primary" onClick={onRetry}><RiRefreshLine /> {t('webSeo.landings.list.retry')}</button>
              : items.length ? <button type="button" className="gs-button ghost" onClick={() => { setSearch(''); setFilter('all'); setTemplateFilter('all') }}>{t('webSeo.landings.list.clearFilters')}</button>
                : <><button type="button" className="gs-button primary" onClick={onCreate}><RiAddLine /> {t('webSeo.landings.list.createLanding')}</button><Link className="gs-button ghost" to="/captacion/planificar">{t('webSeo.landings.list.seeCampaigns')} <RiArrowRightLine /></Link></>}
          </div>
        </div>
      )}
      <footer className="wb-list-foot">
        <span>{t('webSeo.landings.list.showing', { shown: filtered.length, total: items.length })}</span>
        <span className={loadError ? 'is-error' : externalCount ? 'is-partial' : ''}>{loadError ? t('webSeo.landings.list.unsynced') : externalCount ? t('webSeo.landings.list.syncedExternal') : t('webSeo.landings.list.synced')}</span>
        <span><Link to="/captacion/cerrar">{t('webSeo.landings.list.openFunnels')} <RiArrowRightLine /></Link><Link to="/captacion/planificar">{t('webSeo.landings.list.manageCampaigns')} <RiArrowRightLine /></Link></span>
      </footer>
    </section>
  )
}

/* ── Imán de leads (auditoría gratuita) ────────────────────────────────── */

export function LeadMagnetPanel({ landingCampaigns, campaignId, onSelect, magnetUrl, notify }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!magnetUrl) return
    try {
      await navigator.clipboard.writeText(magnetUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      notify?.(t('webSeo.landings.magnet.copyFailed'))
    }
  }
  return (
    <section className="gs-panel" aria-labelledby="wb-magnet-title">
      <header className="gs-panel-head">
        <div><h2 id="wb-magnet-title"><span className="gs-panel-icon"><RiUserAddLine /></span>{t('webSeo.landings.magnet.title')}</h2><p>{t('webSeo.landings.magnet.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="wb-magnet-row">
          <select className="gs-select" value={campaignId} onChange={event => onSelect(event.target.value)}>
            <option value="">{t('webSeo.landings.magnet.selectCampaign')}</option>
            {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>)}
          </select>
          {magnetUrl ? (
            <>
              <code className="wb-url">{magnetUrl}</code>
              <button type="button" className="gs-button small" onClick={copy}><RiFileCopyLine /> {copied ? t('webSeo.landings.magnet.copied') : t('webSeo.landings.magnet.copyLink')}</button>
              <a className="gs-button small" href={magnetUrl} target="_blank" rel="noreferrer"><RiArrowRightLine /> {t('webSeo.landings.magnet.open')}</a>
            </>
          ) : null}
        </div>
        <p className="gs-note">{landingCampaigns.length ? t('webSeo.landings.magnet.spread') : t('webSeo.landings.magnet.needCampaign')}</p>
      </div>
    </section>
  )
}

/* ── Crear / editar / importar ─────────────────────────────────────────── */

export function LandingModal({ mode, item, onClose, onSave, saving }) {
  const { t } = useI18n()
  const isImport = mode === 'import'
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(isImport
    ? { name: item?.name || '', campaignName: item?.campaignName || '', url: item?.url || '' }
    : { name: item?.name || '', campaignName: item?.campaignName || '', slug: item?.slug || '', templateId: item?.templateId || 'generic-v1', offer: item?.offer || '', leadMagnet: item?.leadMagnet || '', adCopy: item?.adCopy || '' })
  function setField(field, value) { setForm(previous => ({ ...previous, [field]: value })) }
  function submit(event) {
    event.preventDefault()
    if (!form.name.trim() || (isImport ? !form.url.trim() : !form.slug.trim())) return
    onSave({ ...form, name: form.name.trim(), campaignName: form.campaignName.trim() })
  }
  return (
    <div className="gs-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="gs-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="wb-landing-modal-title">
        <header className="gs-modal-head">
          <span className="gs-modal-eyebrow">{isImport ? t('webSeo.landings.modal.addProperty') : isEdit ? t('webSeo.landings.modal.editExperience') : t('webSeo.landings.modal.newSpace')}</span>
          <h2 id="wb-landing-modal-title">{isImport ? t('webSeo.landings.modal.importSite') : isEdit ? t('webSeo.landings.modal.editLanding') : t('webSeo.landings.modal.createLanding')}</h2>
          <p>{isImport ? t('webSeo.landings.modal.importText') : t('webSeo.landings.modal.createText')}</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label={t('webSeo.landings.modal.close')}><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          <div className="gs-form-grid">
            {isImport ? (
              <>
                <label className="full">{t('webSeo.landings.modal.visibleName')}<input className="gs-input" autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder={t('webSeo.landings.modal.visibleNamePlaceholder')} /></label>
                <label className="full">{t('webSeo.landings.modal.siteUrl')}<input className="gs-input" type="url" value={form.url} onChange={event => setField('url', event.target.value)} placeholder="https://tuempresa.com" /></label>
                <label className="full">{t('webSeo.landings.modal.campaign')}<input className="gs-input" value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder={t('webSeo.landings.modal.campaignPlaceholderImport')} /></label>
              </>
            ) : (
              <>
                <label>{t('webSeo.landings.modal.landingName')}<input className="gs-input" autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder={t('webSeo.landings.modal.landingNamePlaceholder')} /></label>
                <label>{t('webSeo.landings.modal.campaign')}<input className="gs-input" value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder={t('webSeo.landings.modal.campaignPlaceholder')} /></label>
                <label>{t('webSeo.landings.modal.slug')}<input className="gs-input" value={form.slug} onChange={event => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder={t('webSeo.landings.modal.slugPlaceholder')} /><small>{t('webSeo.landings.modal.slugHint', { slug: form.slug || t('webSeo.landings.modal.slugFallback') })}</small></label>
                <label>{t('webSeo.landings.modal.template')}<select className="gs-select" value={form.templateId} onChange={event => setField('templateId', event.target.value)}>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label} · {templateKind(id, t)}</option>)}</select></label>
                <label className="full">{t('webSeo.landings.modal.offer')}<input className="gs-input" value={form.offer} onChange={event => setField('offer', event.target.value)} placeholder={t('webSeo.landings.modal.offerPlaceholder')} /></label>
                <label className="full">{t('webSeo.landings.modal.leadMagnet')}<input className="gs-input" value={form.leadMagnet} onChange={event => setField('leadMagnet', event.target.value)} placeholder={t('webSeo.landings.modal.leadMagnetPlaceholder')} /></label>
                <label className="full">{t('webSeo.landings.modal.adCopy')}<textarea className="gs-textarea" rows="3" value={form.adCopy} onChange={event => setField('adCopy', event.target.value)} placeholder={t('webSeo.landings.modal.adCopyPlaceholder')} /></label>
              </>
            )}
          </div>
        </div>
        <footer className="gs-modal-foot">
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose}>{t('webSeo.landings.modal.cancel')}</button>
            <button type="submit" className="gs-button primary" disabled={saving}>{saving ? t('webSeo.landings.modal.saving') : isImport ? t('webSeo.landings.modal.addSite') : isEdit ? t('webSeo.landings.modal.saveChanges') : t('webSeo.landings.modal.create')} <RiArrowRightLine /></button>
          </div>
        </footer>
      </form>
    </div>
  )
}

/* ── Detalle de landing (§5.3) ─────────────────────────────────────────── */

function LandingReport({ report }) {
  const { t } = useI18n()
  if (!report) return <p className="gs-empty-inline">{t('webSeo.landings.report.none')}</p>
  return (
    <div className="wb-report">
      <p className="wb-report-narrative">{report.narrative}</p>
      <div className="gs-minis">
        <div className="gs-mini"><span>{t('webSeo.landings.report.qualified')}</span><strong>{formatNumber(report.qualified)}</strong></div>
        <div className="gs-mini"><span>{t('webSeo.landings.report.sales')}</span><strong>{formatNumber(report.sales)}</strong></div>
        <div className="gs-mini"><span>{t('webSeo.landings.report.revenue')}</span><strong>{formatMoney(report.revenueCents)}</strong></div>
        <div className="gs-mini"><span>{t('webSeo.landings.report.spend')}</span><strong>{formatMoney(report.spendCents)}</strong></div>
        <div className="gs-mini"><span>CPQL</span><strong>{formatMoney(report.cpqlCents)}</strong></div>
        <div className="gs-mini"><span>CAC</span><strong>{formatMoney(report.cacCents)}</strong></div>
        <div className="gs-mini"><span>ROAS</span><strong>{report.roas === null ? '—' : `${report.roas}×`}</strong></div>
        <div className="gs-mini"><span>{t('webSeo.landings.report.confidence')}</span><strong>{confidenceLabel(report.confidence, t)}</strong></div>
      </div>
      {report.caveats.length ? <ul className="wb-caveats">{report.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul> : null}
    </div>
  )
}

function VariantsPanel({ variants, experiment, busy, onGenerate, onRequestApproval, onStart, onConclude, onDiscard }) {
  const { t } = useI18n()
  return (
    <>
      <h3 className="gs-subhead">{t('webSeo.landings.variants.title')}</h3>
      <div className="wb-variants-actions">
        <button type="button" className="gs-button primary" onClick={onGenerate} disabled={busy}><RiSparkling2Line /> {busy ? t('webSeo.landings.variants.working') : t('webSeo.landings.variants.propose')}</button>
        <small>{t('webSeo.landings.variants.note')}</small>
      </div>
      {experiment ? (
        <div className="wb-experiment">
          <div className="wb-experiment-head"><strong>{t('webSeo.landings.variants.experiment')}</strong><span className={`gs-pill ${experiment.decision === 'winner' ? 'tone-ok' : experiment.decision === 'inconclusive' ? 'tone-warn' : ''}`}>{decisionLabel(experiment.decision, t)}</span></div>
          <p>{experiment.reason}</p>
          <table className="gs-table">
            <thead><tr><th>{t('webSeo.landings.variants.colVariant')}</th><th className="num">{t('webSeo.landings.variants.colSessions')}</th><th className="num">{t('webSeo.landings.variants.colConversions')}</th><th className="num">{t('webSeo.landings.variants.colRate')}</th></tr></thead>
            <tbody>{experiment.results.map(result => <tr key={result.variantId}><td>{result.name}{result.isControl ? t('webSeo.landings.variants.control') : ''}</td><td className="num">{formatNumber(result.exposures)}</td><td className="num">{formatNumber(result.conversions)}</td><td className="num">{formatRate(result.conversionRate)}</td></tr>)}</tbody>
          </table>
          <small>{t('webSeo.landings.variants.thresholds', { exposures: experiment.thresholds.minExposuresPerVariant, conversions: experiment.thresholds.minConversionsTotal, confidence: experiment.thresholds.confidence })}</small>
          {experiment.decision === 'winner' || experiment.decision === 'inconclusive' ? <button type="button" className="gs-button small primary" onClick={() => onConclude(experiment.experimentId)} disabled={busy}>{t('webSeo.landings.variants.conclude')}</button> : null}
        </div>
      ) : null}
      {variants.length ? (
        <div className="wb-variant-list">
          {variants.map(variant => (
            <article key={variant.id} className="wb-variant">
              <header><strong>{variant.name}</strong><span className={`gs-pill ${variant.status === 'winner' ? 'tone-ok' : variant.status === 'active' ? 'tone-cyan' : variant.status === 'pending_approval' ? 'tone-warn' : variant.status === 'loser' || variant.status === 'discarded' ? 'tone-bad' : ''}`}>{variantStatusLabel(variant.status, t)}</span></header>
              <p>{variant.justification}</p>
              <small>{t('webSeo.landings.variants.baseVersion', { version: variant.baseVersion?.version ?? '—', change: describeChange(variant.patch, t) })}</small>
              <footer>
                {variant.status === 'generated' ? <button type="button" className="gs-button small ghost" onClick={() => onRequestApproval(variant.id)} disabled={busy}>{t('webSeo.landings.variants.requestApproval')}</button> : null}
                {variant.status === 'pending_approval' ? <button type="button" className="gs-button small ghost" onClick={() => onStart(variant.id)} disabled={busy}>{t('webSeo.landings.variants.start')}</button> : null}
                {variant.status !== 'active' && variant.status !== 'discarded' ? <button type="button" className="gs-button small ghost" onClick={() => onDiscard(variant.id)} disabled={busy}>{t('webSeo.landings.variants.discard')}</button> : null}
              </footer>
            </article>
          ))}
        </div>
      ) : <p className="gs-empty-inline">{t('webSeo.landings.variants.empty')}</p>}
    </>
  )
}

/** Autonomía (§10): en sombra se dice "habría hecho", nunca "habría ahorrado". */
function AutonomyPanel({ autonomy, onRun, busy }) {
  const { t, locale } = useI18n()
  if (!autonomy) return null
  const { config, decisions } = autonomy
  return (
    <>
      <h3 className="gs-subhead">{t('webSeo.landings.autonomy.title')}</h3>
      <div className="wb-autonomy">
        <span className={`wb-autonomy-level is-${config.level}`}>{config.level}</span>
        <div>
          <strong>{config.level === 'N1' ? t('webSeo.landings.autonomy.n1') : config.level === 'N2' ? t('webSeo.landings.autonomy.n2') : config.shadowMode ? t('webSeo.landings.autonomy.n3Shadow') : t('webSeo.landings.autonomy.n3')}</strong>
          <p>{config.shadowMode ? t('webSeo.landings.autonomy.shadowText') : t('webSeo.landings.autonomy.autoText')}</p>
          <small>{t('webSeo.landings.autonomy.observation', { days: config.observationDays, pct: Math.round(config.rollbackDropThreshold * 100) })}</small>
        </div>
        <button type="button" className="gs-button small" onClick={onRun} disabled={busy}>{busy ? t('webSeo.landings.autonomy.running') : t('webSeo.landings.autonomy.runPass')}</button>
      </div>
      {decisions?.length ? (
        <div className="wb-variant-list">
          {decisions.slice(0, 6).map(decision => (
            <article key={decision.id} className="wb-variant">
              <header><strong>{changeTypeLabel(decision.changeType, t)}</strong><span className={`gs-pill ${decision.status === 'applied' ? 'tone-ok' : decision.status === 'shadow' ? 'tone-cyan' : decision.status === 'blocked' || decision.status === 'rolled_back' ? 'tone-bad' : ''}`}>{autonomyStatusLabel(decision.status, t)}</span></header>
              <p>{decision.status === 'shadow' ? t('webSeo.landings.autonomy.wouldChange', { change: describeChange(decision.payload, t) }) : decision.status === 'blocked' ? decision.blockedReason : t('webSeo.landings.autonomy.change', { change: describeChange(decision.payload, t) })}</p>
              {decision.outcome ? <small>{decision.outcome.detail}</small> : null}
              <small>{t('webSeo.landings.autonomy.policy', { version: decision.policyVersion, date: new Date(decision.createdAt).toLocaleDateString(localeCode(locale)) })}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="gs-empty-inline">{t('webSeo.landings.autonomy.empty')}</p>
      )}
    </>
  )
}

export function LandingDetail({ detail, loading, onClose, variants, experiment, busy, actions, autonomy, report }) {
  const { t } = useI18n()
  return (
    <div className="gs-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="gs-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="wb-detail-title">
        <header className="gs-modal-head">
          <span className="gs-modal-eyebrow">{t('webSeo.landings.detail.eyebrow')}</span>
          <h2 id="wb-detail-title">{loading ? t('webSeo.landings.detail.loading') : detail?.name}</h2>
          {detail ? <p>{t('webSeo.landings.detail.sessions', { slug: detail.slug, n: detail.dropMap.sessions })}</p> : null}
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label={t('webSeo.landings.modal.close')}><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          {loading || !detail ? <div className="gs-skeleton"><i /><i /><i /></div> : (
            <>
              {detail.baseline?.insufficientReason ? <p className="gs-alert is-info"><RiInformationLine /><span>{detail.baseline.insufficientReason}</span></p> : null}

              <h3 className="gs-subhead">{t('webSeo.landings.detail.dropMap')}</h3>
              {detail.dropMap.sessions ? (
                <div className="gs-bars">
                  {detail.dropMap.steps.map(step => (
                    <div key={step.key} className="gs-bar-row">
                      <span>{step.label}</span>
                      <div className="gs-bar-track"><i style={{ width: `${Math.round((step.rate ?? 0) * 100)}%` }} /></div>
                      <strong>{formatRate(step.rate)}</strong>
                      <small>{formatNumber(step.value)}</small>
                    </div>
                  ))}
                  {/* Fuera del recorrido a propósito: se puede pulsar el CTA del hero sin llegar al final. */}
                  {detail.dropMap.depth ? <p className="gs-note">{detail.dropMap.depth.label}: <strong>{formatRate(detail.dropMap.depth.rate)}</strong> ({formatNumber(detail.dropMap.depth.value)}) {t('webSeo.landings.detail.depthNote')}</p> : null}
                </div>
              ) : <p className="gs-empty-inline">{t('webSeo.landings.detail.noSessions')}</p>}

              {detail.dropMap.fields.length ? (
                <>
                  <h3 className="gs-subhead">{t('webSeo.landings.detail.fieldDrop')} <small>{t('webSeo.landings.detail.fieldDropNote')}</small></h3>
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>{t('webSeo.landings.detail.colField')}</th><th className="num">{t('webSeo.landings.detail.colExposed')}</th><th className="num">{t('webSeo.landings.detail.colCompleted')}</th><th className="num">{t('webSeo.landings.detail.colAbandon')}</th><th className="num">{t('webSeo.landings.detail.colErrors')}</th><th className="num">{t('webSeo.landings.detail.colAvgTime')}</th></tr></thead>
                      <tbody>{detail.dropMap.fields.map(field => <tr key={field.field}><td><strong>{fieldLabel(field.field, t)}</strong></td><td className="num">{formatNumber(field.exposed)}</td><td className="num">{formatNumber(field.completed)}</td><td className={`num${field.abandonment > 0.45 ? ' is-bad' : ''}`}>{formatRate(field.abandonment)}</td><td className="num">{formatNumber(field.validationErrors)}</td><td className="num">{field.averageMs === null ? '—' : `${(field.averageMs / 1000).toFixed(1)} s`}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {detail.traffic.length ? (
                <>
                  <h3 className="gs-subhead">{t('webSeo.landings.detail.traffic')}</h3>
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>{t('webSeo.landings.detail.colChannel')}</th><th className="num">{t('webSeo.landings.detail.colSessions')}</th><th className="num">{t('webSeo.landings.detail.colSubmits')}</th><th className="num">{t('webSeo.landings.detail.colConversion')}</th></tr></thead>
                      <tbody>{detail.traffic.map(row => <tr key={row.channel}><td><strong>{row.channel}</strong></td><td className="num">{formatNumber(row.sessions)}</td><td className="num">{formatNumber(row.submits)}</td><td className="num">{formatRate(row.conversion)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <h3 className="gs-subhead">{t('webSeo.landings.detail.diagnosis')}</h3>
              {detail.diagnoses.length ? detail.diagnoses.map(diagnosis => (
                <article key={diagnosis.id} className="wb-diagnosis">
                  <strong>{diagnosis.title}</strong>
                  <p>{diagnosis.problem}</p>
                  <ul>{diagnosis.evidence.map(item => <li key={item}>{item}</li>)}</ul>
                  <p className="wb-diagnosis-reco"><RiSparkling2Line /> {diagnosis.recommendation}</p>
                  <small>{t('webSeo.landings.detail.diagImpact', { min: diagnosis.impact.minLeads, max: diagnosis.impact.maxLeads, confidence: confidenceLabel(diagnosis.confidence, t), effort: effortLabel(diagnosis.effort, t) })}{diagnosis.baselineUsed ? ` · ${diagnosis.baselineUsed}` : ''}</small>
                </article>
              )) : <p className="gs-empty-inline">{t('webSeo.landings.detail.noFindings')}</p>}

              <h3 className="gs-subhead">{t('webSeo.landings.detail.revenueReport')}</h3>
              <LandingReport report={report} />

              <VariantsPanel variants={variants} experiment={experiment} busy={busy} onGenerate={() => actions.generate(detail.landingKey)} onRequestApproval={actions.requestApproval} onStart={actions.start} onConclude={actions.conclude} onDiscard={actions.discard} />
              <AutonomyPanel autonomy={autonomy} onRun={actions.runAutonomy} busy={busy} />

              {detail.health ? (
                <p className="gs-note"><RiInformationLine /> {t('webSeo.landings.detail.health', { status: detail.health.verdict === 'ok' ? t('webSeo.landings.detail.healthOk') : detail.health.verdict === 'slow' ? t('webSeo.landings.detail.healthSlow') : detail.health.verdict === 'broken' ? t('webSeo.landings.detail.healthBroken', { code: detail.health.statusCode }) : t('webSeo.landings.detail.healthUnchecked') })}{detail.health.ttfbMs ? t('webSeo.landings.detail.ttfb', { ms: detail.health.ttfbMs }) : ''}</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
