import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightLine, RiBarChartGroupedLine, RiCloseLine, RiEditLine, RiExternalLinkLine,
  RiFileCopyLine, RiFilter3Line, RiGlobalLine, RiInformationLine, RiLayoutGridLine, RiListCheck,
  RiPauseCircleLine, RiPlayCircleLine, RiPulseLine, RiRefreshLine, RiSearchLine, RiSparkling2Line,
  RiTimeLine, RiUploadCloud2Line, RiUserAddLine,
} from 'react-icons/ri'
import { getLocale, localeCode } from '../../i18n'
import {
  AUTONOMY_STATUS_LABEL, CHANGE_TYPE_LABEL, CONFIDENCE_LABEL, DECISION_LABEL, EFFORT_LABEL, FALLBACK_IMAGES,
  FIELD_LABEL, STATUS_META, TEMPLATE_META, VARIANT_STATUS_LABEL, describeChange, formatMoney, formatNumber,
  formatPercent, formatRate, getConversion, getLink, templateMeta,
} from './landingModel'

/* ── Piezas pequeñas ───────────────────────────────────────────────────── */

export function LandingStatus({ item }) {
  const meta = STATUS_META[item.external ? 'external' : item.status] || { label: 'Sin estado', tone: '' }
  return <span className={`gs-pill ${meta.tone ? `tone-${meta.tone}` : ''}`}>{meta.label}</span>
}

function LandingThumb({ item, featured = false }) {
  return (
    <div className={`wb-thumb${featured ? ' is-featured' : ''}`} style={{ '--thumb-color': templateMeta(item.templateId).color }}>
      <img src={item.image || FALLBACK_IMAGES[0]} alt="" />
      <span className="wb-thumb-label">{item.external ? 'SITIO WEB' : templateMeta(item.templateId).kind.toUpperCase()}</span>
      <strong>{item.name}</strong>
      <small>{item.external ? 'URL importada' : item.offer || 'Experiencia de captación'}</small>
    </div>
  )
}

/* ── Atención requerida (landings.md §5.1) ─────────────────────────────── */

/** Un hallazgo de landing en la cola unificada. El orden lo da el backend por impacto. */
export function LandingDiagnosisCard({ diagnosis, onOpen }) {
  return (
    <article className={`gs-queue-card type-${diagnosis.type} tone-warn`}>
      <header>
        <span className="gs-queue-kind">Landing · {diagnosis.title}</span>
        <span className="gs-queue-meta">{diagnosis.level}</span>
      </header>
      <strong>{diagnosis.problem}</strong>
      <ul>{diagnosis.evidence.slice(0, 2).map(item => <li key={item}>{item}</li>)}</ul>
      <div className="gs-queue-impact">
        <span>Impacto estimado</span>
        <strong>{diagnosis.impact.minLeads}–{diagnosis.impact.maxLeads} leads/mes</strong>
        {/* Sin tasa de cualificación medida no se traduce a oportunidades. */}
        <small>{diagnosis.impact.maxOpportunities !== null ? `≈ ${diagnosis.impact.minOpportunities}–${diagnosis.impact.maxOpportunities} oportunidades` : 'Oportunidades: sin tasa de cualificación medida'}</small>
      </div>
      <footer>
        <span>Confianza {CONFIDENCE_LABEL[diagnosis.confidence]} · esfuerzo {EFFORT_LABEL[diagnosis.effort]}</span>
        <div><button type="button" className="gs-button small" onClick={() => onOpen(diagnosis.landingKey)}>Ver detalle <RiArrowRightLine /></button></div>
      </footer>
    </article>
  )
}

/* ── Ranking económico (§5.2) ──────────────────────────────────────────── */

export function EconomicRanking({ items, onOpen }) {
  const measured = (items ?? []).filter(item => item.snapshot)
  return (
    <section className="gs-panel" aria-label="Ranking económico">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiBarChartGroupedLine /></span>Qué landing produce compradores</h2><p>Ordenadas por ingresos atribuidos, no por volumen de leads. Las landings sin medición no aparecen: no han perdido, es que no se sabe.</p></div>
      </header>
      <div className="gs-panel-body">
        {measured.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>Landing</th><th className="num">Visitas</th><th className="num">Leads</th><th className="num">Cualificados</th><th className="num">Ventas</th><th className="num">Ingresos</th><th>Confianza</th></tr></thead>
              <tbody>
                {measured.map(item => (
                  <tr key={item.campaignId} className="is-click" onClick={() => onOpen(item.landingKey)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') onOpen(item.landingKey) }}>
                    <td><strong>{item.name}</strong><small>/l/{item.slug}</small></td>
                    <td className="num">{formatNumber(item.snapshot.visits)}</td>
                    <td className="num">{formatNumber(item.snapshot.leads)}</td>
                    <td className="num">{formatNumber(item.snapshot.qualified)}</td>
                    <td className="num">{formatNumber(item.snapshot.sales)}</td>
                    <td className="num">{formatMoney(item.snapshot.revenueCents)}</td>
                    <td><span className={`gs-pill ${item.snapshot.confidence === 'high' ? 'tone-ok' : item.snapshot.confidence === 'medium' ? 'tone-warn' : ''}`}>{CONFIDENCE_LABEL[item.snapshot.confidence]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="gs-empty-inline">Ninguna landing tiene todavía telemetría suficiente para ordenarla por ingresos.</p>}
      </div>
    </section>
  )
}

/* ── Destacada y listado ───────────────────────────────────────────────── */

export function FeaturedLanding({ item, onOpen, onEdit, onCopy, onDetail }) {
  if (!item) return null
  const link = getLink(item)
  return (
    <section className="wb-featured gs-rise">
      <div className="wb-featured-copy">
        <div className="wb-featured-top"><LandingStatus item={item} /><span>Landing destacada</span></div>
        <h2>{item.name}</h2>
        <p>{item.adCopy || 'Configura la oferta y el siguiente paso de esta experiencia de captación.'}</p>
        <div className="wb-featured-url"><RiGlobalLine /> {item.external ? item.url : item.slug ? `/l/${item.slug}` : 'URL pública pendiente'} <button type="button" onClick={() => onCopy(item)} aria-label="Copiar enlace" disabled={!link}><RiFileCopyLine /></button></div>
        <div className="wb-featured-actions">
          <button type="button" className="gs-button primary" onClick={() => onOpen(item)}>{link ? <RiExternalLinkLine /> : <RiEditLine />} {link ? 'Abrir landing' : 'Configurar landing'}</button>
          <button type="button" className="gs-button ghost" onClick={() => onEdit(item)}><RiEditLine /> Editar</button>
          {item.landingKey ? <button type="button" className="gs-button ghost" onClick={() => onDetail(item.landingKey)}><RiPulseLine /> Telemetría</button> : null}
        </div>
      </div>
      <div className="wb-featured-media">
        <LandingThumb item={item} featured />
        <div className="wb-featured-metric">
          <span>{item.external ? 'Métricas' : 'Leads de campaña'}</span>
          <strong>{formatNumber(item.leads)}</strong>
          <em>{item.external ? 'No conectadas' : `${formatPercent(getConversion(item))} conversión medida`}</em>
        </div>
      </div>
    </section>
  )
}

function RowActions({ item, onOpen, onEdit, onCopy, onToggleStatus, onDetail }) {
  return (
    <div className="wb-row-actions">
      {item.landingKey ? <button type="button" aria-label={`Telemetría de ${item.name}`} title="Ver telemetría" onClick={event => { event.stopPropagation(); onDetail(item.landingKey) }}><RiPulseLine /></button> : null}
      <button type="button" aria-label={`Abrir ${item.name}`} title="Abrir landing" onClick={event => { event.stopPropagation(); onOpen(item) }}><RiExternalLinkLine /></button>
      <button type="button" aria-label={`Editar ${item.name}`} title="Editar landing" onClick={event => { event.stopPropagation(); onEdit(item) }}><RiEditLine /></button>
      <button type="button" aria-label={`Copiar enlace de ${item.name}`} title="Copiar enlace" onClick={event => { event.stopPropagation(); onCopy(item) }}><RiFileCopyLine /></button>
      {!item.external && item.slug ? (
        <button type="button" aria-label={item.status === 'published' ? `Pausar ${item.name}` : `Publicar ${item.name}`} title={item.status === 'published' ? 'Pausar landing' : 'Publicar landing'} onClick={event => { event.stopPropagation(); onToggleStatus(item) }}>
          {item.status === 'published' ? <RiPauseCircleLine /> : <RiPlayCircleLine />}
        </button>
      ) : null}
    </div>
  )
}

export function LandingList({ items, externalCount, loading, loadError, onRetry, onOpen, onEdit, onCopy, onToggleStatus, onDetail, onCreate, onImport }) {
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
      return a.name.localeCompare(b.name, 'es')
    })
  }, [items, filter, search, sort, templateFilter])

  const tabs = [
    { id: 'all', label: 'Todas', count: items.length },
    { id: 'published', label: 'Publicadas', count: items.filter(item => item.status === 'published').length },
    { id: 'draft', label: 'Borradores', count: items.filter(item => item.status === 'draft').length },
    { id: 'none', label: 'Sin landing', count: items.filter(item => item.status === 'none').length },
    { id: 'external', label: 'Webs externas', count: externalCount },
  ]

  return (
    <section className="gs-panel wb-list-panel" aria-label="Landings y webs">
      <div className="wb-list-tabs" role="tablist">
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
        <div className="wb-list-tabs-actions">
          <button type="button" className="gs-button small ghost" onClick={onImport}><RiUploadCloud2Line /> Importar URL</button>
        </div>
      </div>
      <div className="wb-toolbar">
        <div className="wb-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar landing, campaña o URL…" aria-label="Buscar landing" /></div>
        <div className="wb-toolbar-actions">
          <label><RiFilter3Line /><select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label="Filtrar por plantilla"><option value="all">Todas las plantillas</option>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
          <label><RiTimeLine /><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Ordenar landings"><option value="name">Por nombre</option><option value="leads">Más leads</option><option value="conversion">Mejor conversión</option></select></label>
          <div className="wb-view-switch">
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="Vista lista" aria-pressed={view === 'list'}><RiListCheck /></button>
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Vista cuadrícula" aria-pressed={view === 'grid'}><RiLayoutGridLine /></button>
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
                    <div><b>{formatNumber(item.leads)}</b><small> leads de campaña</small><em>{formatPercent(conversion)}</em></div>
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
                  <span className="wb-row-url">{item.external ? item.url : item.slug ? `/l/${item.slug}` : 'Crea una URL para activar esta landing'}</span>
                  <div className="wb-row-meta"><span style={{ '--meta-color': meta.color }}><i />{item.external ? 'Web externa' : meta.label}</span><span><RiGlobalLine /> {item.campaignName}</span><span>{item.updatedAt} · {item.updatedBy}</span></div>
                </div>
                <div className="wb-row-figure"><strong>{formatNumber(item.leads)}</strong><span>{item.external ? 'métricas no conectadas' : `${formatNumber(item.meetings)} reuniones`}</span></div>
                <div className="wb-row-figure"><strong>{formatPercent(conversion)}</strong><span>{Number.isFinite(item.visits) ? `${formatNumber(item.visits)} visitas medidas` : item.external ? 'sin medición' : 'aún sin visitas medidas'}</span></div>
                {actions}
              </article>
            )
          })}
        </div>
      ) : (
        <div className={`gs-empty${loadError && !items.length ? ' is-error' : ''}`} role={loadError && !items.length ? 'alert' : 'status'}>
          <span>{loadError && !items.length ? <RiRefreshLine /> : items.length ? <RiSearchLine /> : <RiGlobalLine />}</span>
          <h3>{loadError && !items.length ? 'No pudimos cargar tus landings' : items.length ? 'No hay resultados con estos filtros' : 'Aún no tienes campañas ni landings'}</h3>
          <p>{loadError && !items.length ? 'Reintenta la conexión. Tus datos no se han sustituido por contenido demo.' : items.length ? 'Ajusta la búsqueda o limpia los filtros para volver a ver tus propiedades.' : 'Crea una landing vinculada a una campaña para empezar a captar y medir oportunidades.'}</p>
          <div className="gs-empty-actions">
            {loadError && !items.length ? <button type="button" className="gs-button primary" onClick={onRetry}><RiRefreshLine /> Reintentar</button>
              : items.length ? <button type="button" className="gs-button ghost" onClick={() => { setSearch(''); setFilter('all'); setTemplateFilter('all') }}>Limpiar filtros</button>
                : <><button type="button" className="gs-button primary" onClick={onCreate}><RiAddLine /> Crear landing</button><Link className="gs-button ghost" to="/captacion/planificar">Ver campañas <RiArrowRightLine /></Link></>}
          </div>
        </div>
      )}
      <footer className="wb-list-foot">
        <span>Mostrando <strong>{filtered.length}</strong> de {items.length} propiedades</span>
        <span className={loadError ? 'is-error' : externalCount ? 'is-partial' : ''}>{loadError ? 'Campañas sin sincronizar' : externalCount ? 'Campañas sincronizadas · webs externas guardadas en este navegador' : 'Datos sincronizados con campañas'}</span>
        <span><Link to="/captacion/cerrar">Abrir Funnels <RiArrowRightLine /></Link><Link to="/captacion/planificar">Gestionar campañas <RiArrowRightLine /></Link></span>
      </footer>
    </section>
  )
}

/* ── Imán de leads (auditoría gratuita) ────────────────────────────────── */

export function LeadMagnetPanel({ landingCampaigns, campaignId, onSelect, magnetUrl, notify }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!magnetUrl) return
    try {
      await navigator.clipboard.writeText(magnetUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      notify?.('No se pudo copiar: selecciona el enlace y cópialo a mano.')
    }
  }
  return (
    <section className="gs-panel" aria-labelledby="wb-magnet-title">
      <header className="gs-panel-head">
        <div><h2 id="wb-magnet-title"><span className="gs-panel-icon"><RiUserAddLine /></span>Imán de leads: auditoría SEO gratuita</h2><p>Una página pública donde cualquier negocio audita su web dejando su contacto, y entra como lead en la campaña de la landing con el informe adjunto.</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="wb-magnet-row">
          <select className="gs-select" value={campaignId} onChange={event => onSelect(event.target.value)}>
            <option value="">Campaña que recibirá los leads…</option>
            {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>)}
          </select>
          {magnetUrl ? (
            <>
              <code className="wb-url">{magnetUrl}</code>
              <button type="button" className="gs-button small" onClick={copy}><RiFileCopyLine /> {copied ? 'Copiado' : 'Copiar enlace'}</button>
              <a className="gs-button small" href={magnetUrl} target="_blank" rel="noreferrer"><RiArrowRightLine /> Abrir</a>
            </>
          ) : null}
        </div>
        <p className="gs-note">{landingCampaigns.length ? 'Difúndelo en redes, firma de email o anuncios: cada auditoría completada crea un lead con fuente «seo_audit», su score y el informe completo.' : 'Necesitas una campaña con landing publicada: la auditoría pública se ata a ella para atribuir los leads.'}</p>
      </div>
    </section>
  )
}

/* ── Crear / editar / importar ─────────────────────────────────────────── */

export function LandingModal({ mode, item, onClose, onSave, saving }) {
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
          <span className="gs-modal-eyebrow">{isImport ? 'Añadir propiedad' : isEdit ? 'Editar experiencia' : 'Nuevo espacio de captación'}</span>
          <h2 id="wb-landing-modal-title">{isImport ? 'Importar sitio web' : isEdit ? 'Editar landing' : 'Crear nueva landing'}</h2>
          <p>{isImport ? 'Añade una web externa para tenerla localizada junto a tus landings. Se guarda en este navegador.' : 'Define la base de la experiencia y deja lista su URL pública.'}</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          <div className="gs-form-grid">
            {isImport ? (
              <>
                <label className="full">Nombre visible<input className="gs-input" autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Web corporativa" /></label>
                <label className="full">URL del sitio<input className="gs-input" type="url" value={form.url} onChange={event => setField('url', event.target.value)} placeholder="https://tuempresa.com" /></label>
                <label className="full">Campaña asociada<input className="gs-input" value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Presencia de marca" /></label>
              </>
            ) : (
              <>
                <label>Nombre de la landing<input className="gs-input" autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Consulta inicial" /></label>
                <label>Campaña asociada<input className="gs-input" value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Servicios legales — Mayo" /></label>
                <label>Slug público<input className="gs-input" value={form.slug} onChange={event => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="consulta-inicial" /><small>Se verá en /l/{form.slug || 'tu-slug'}</small></label>
                <label>Plantilla<select className="gs-select" value={form.templateId} onChange={event => setField('templateId', event.target.value)}>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label} · {meta.kind}</option>)}</select></label>
                <label className="full">Oferta principal<input className="gs-input" value={form.offer} onChange={event => setField('offer', event.target.value)} placeholder="Consulta inicial gratuita" /></label>
                <label className="full">Lead magnet<input className="gs-input" value={form.leadMagnet} onChange={event => setField('leadMagnet', event.target.value)} placeholder="Guía, checklist o recurso gratuito" /></label>
                <label className="full">Copy de captación<textarea className="gs-textarea" rows="3" value={form.adCopy} onChange={event => setField('adCopy', event.target.value)} placeholder="Explica qué conseguirá la persona y cuál es el siguiente paso." /></label>
              </>
            )}
          </div>
        </div>
        <footer className="gs-modal-foot">
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="gs-button primary" disabled={saving}>{saving ? 'Guardando…' : isImport ? 'Añadir sitio' : isEdit ? 'Guardar cambios' : 'Crear landing'} <RiArrowRightLine /></button>
          </div>
        </footer>
      </form>
    </div>
  )
}

/* ── Detalle de landing (§5.3) ─────────────────────────────────────────── */

function LandingReport({ report }) {
  if (!report) return <p className="gs-empty-inline">Sin informe en euros todavía.</p>
  return (
    <div className="wb-report">
      <p className="wb-report-narrative">{report.narrative}</p>
      <div className="gs-minis">
        <div className="gs-mini"><span>Cualificados</span><strong>{formatNumber(report.qualified)}</strong></div>
        <div className="gs-mini"><span>Ventas</span><strong>{formatNumber(report.sales)}</strong></div>
        <div className="gs-mini"><span>Ingresos</span><strong>{formatMoney(report.revenueCents)}</strong></div>
        <div className="gs-mini"><span>Gasto</span><strong>{formatMoney(report.spendCents)}</strong></div>
        <div className="gs-mini"><span>CPQL</span><strong>{formatMoney(report.cpqlCents)}</strong></div>
        <div className="gs-mini"><span>CAC</span><strong>{formatMoney(report.cacCents)}</strong></div>
        <div className="gs-mini"><span>ROAS</span><strong>{report.roas === null ? '—' : `${report.roas}×`}</strong></div>
        <div className="gs-mini"><span>Confianza</span><strong>{CONFIDENCE_LABEL[report.confidence]}</strong></div>
      </div>
      {report.caveats.length ? <ul className="wb-caveats">{report.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul> : null}
    </div>
  )
}

function VariantsPanel({ variants, experiment, busy, onGenerate, onRequestApproval, onStart, onConclude, onDiscard }) {
  return (
    <>
      <h3 className="gs-subhead">Variantes y experimentos</h3>
      <div className="wb-variants-actions">
        <button type="button" className="gs-button primary" onClick={onGenerate} disabled={busy}><RiSparkling2Line /> {busy ? 'Trabajando…' : 'Proponer variante'}</button>
        <small>La variante nace del diagnóstico activo, con su justificación escrita. Sin diagnóstico no hay hipótesis que probar.</small>
      </div>
      {experiment ? (
        <div className="wb-experiment">
          <div className="wb-experiment-head"><strong>Experimento en curso</strong><span className={`gs-pill ${experiment.decision === 'winner' ? 'tone-ok' : experiment.decision === 'inconclusive' ? 'tone-warn' : ''}`}>{DECISION_LABEL[experiment.decision] || experiment.decision}</span></div>
          <p>{experiment.reason}</p>
          <table className="gs-table">
            <thead><tr><th>Variante</th><th className="num">Sesiones</th><th className="num">Conversiones</th><th className="num">Tasa</th></tr></thead>
            <tbody>{experiment.results.map(result => <tr key={result.variantId}><td>{result.name}{result.isControl ? ' (control)' : ''}</td><td className="num">{formatNumber(result.exposures)}</td><td className="num">{formatNumber(result.conversions)}</td><td className="num">{formatRate(result.conversionRate)}</td></tr>)}</tbody>
          </table>
          <small>Asignación por sesión · umbral: {experiment.thresholds.minExposuresPerVariant} sesiones por variante, {experiment.thresholds.minConversionsTotal} conversiones y {experiment.thresholds.confidence} de confianza.</small>
          {experiment.decision === 'winner' || experiment.decision === 'inconclusive' ? <button type="button" className="gs-button small primary" onClick={() => onConclude(experiment.experimentId)} disabled={busy}>Cerrar experimento y aplicar resultado</button> : null}
        </div>
      ) : null}
      {variants.length ? (
        <div className="wb-variant-list">
          {variants.map(variant => (
            <article key={variant.id} className="wb-variant">
              <header><strong>{variant.name}</strong><span className={`gs-pill ${variant.status === 'winner' ? 'tone-ok' : variant.status === 'active' ? 'tone-cyan' : variant.status === 'pending_approval' ? 'tone-warn' : variant.status === 'loser' || variant.status === 'discarded' ? 'tone-bad' : ''}`}>{VARIANT_STATUS_LABEL[variant.status] || variant.status}</span></header>
              <p>{variant.justification}</p>
              <small>Sobre la versión {variant.baseVersion?.version ?? '—'} · {describeChange(variant.patch)}</small>
              <footer>
                {variant.status === 'generated' ? <button type="button" className="gs-button small ghost" onClick={() => onRequestApproval(variant.id)} disabled={busy}>Enviar a aprobación</button> : null}
                {variant.status === 'pending_approval' ? <button type="button" className="gs-button small ghost" onClick={() => onStart(variant.id)} disabled={busy}>Activar experimento</button> : null}
                {variant.status !== 'active' && variant.status !== 'discarded' ? <button type="button" className="gs-button small ghost" onClick={() => onDiscard(variant.id)} disabled={busy}>Descartar</button> : null}
              </footer>
            </article>
          ))}
        </div>
      ) : <p className="gs-empty-inline">Todavía no hay variantes para esta landing.</p>}
    </>
  )
}

/** Autonomía (§10): en sombra se dice "habría hecho", nunca "habría ahorrado". */
function AutonomyPanel({ autonomy, onRun, busy }) {
  if (!autonomy) return null
  const { config, decisions } = autonomy
  return (
    <>
      <h3 className="gs-subhead">Autonomía</h3>
      <div className="wb-autonomy">
        <span className={`wb-autonomy-level is-${config.level}`}>{config.level}</span>
        <div>
          <strong>{config.level === 'N1' ? 'Solo recomienda' : config.level === 'N2' ? 'Aprobación con un clic' : config.shadowMode ? 'Automático en modo sombra' : 'Automático'}</strong>
          <p>{config.shadowMode ? 'El modo sombra registra lo que haría sin tocar ninguna landing.' : 'Los cambios permitidos se aplican solos, con observación y reversión automática.'}</p>
          <small>Observación {config.observationDays} días · revierte si la conversión cae un {Math.round(config.rollbackDropThreshold * 100)}%</small>
        </div>
        <button type="button" className="gs-button small" onClick={onRun} disabled={busy}>{busy ? 'Ejecutando…' : 'Ejecutar pasada'}</button>
      </div>
      {decisions?.length ? (
        <div className="wb-variant-list">
          {decisions.slice(0, 6).map(decision => (
            <article key={decision.id} className="wb-variant">
              <header><strong>{CHANGE_TYPE_LABEL[decision.changeType] || decision.changeType}</strong><span className={`gs-pill ${decision.status === 'applied' ? 'tone-ok' : decision.status === 'shadow' ? 'tone-cyan' : decision.status === 'blocked' || decision.status === 'rolled_back' ? 'tone-bad' : ''}`}>{AUTONOMY_STATUS_LABEL[decision.status] || decision.status}</span></header>
              <p>{decision.status === 'shadow' ? `Habría cambiado: ${describeChange(decision.payload)}.` : decision.status === 'blocked' ? decision.blockedReason : `Cambio: ${describeChange(decision.payload)}.`}</p>
              {decision.outcome ? <small>{decision.outcome.detail}</small> : null}
              <small>Política {decision.policyVersion} · {new Date(decision.createdAt).toLocaleDateString(localeCode(getLocale()))}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="gs-empty-inline">Sin decisiones registradas. Hoy N3 no tiene ningún cambio que pueda aplicar en esta landing: los únicos campos obligatorios son los esenciales, y el CTA, la FAQ y el orden de los bloques todavía no son editables. Los guardarraíles, el registro y la reversión ya funcionan; falta superficie que tocar.</p>
      )}
    </>
  )
}

export function LandingDetail({ detail, loading, onClose, variants, experiment, busy, actions, autonomy, report }) {
  return (
    <div className="gs-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="gs-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="wb-detail-title">
        <header className="gs-modal-head">
          <span className="gs-modal-eyebrow">Detalle de landing</span>
          <h2 id="wb-detail-title">{loading ? 'Cargando…' : detail?.name}</h2>
          {detail ? <p>/l/{detail.slug} · {detail.dropMap.sessions} sesiones medidas en 28 días</p> : null}
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          {loading || !detail ? <div className="gs-skeleton"><i /><i /><i /></div> : (
            <>
              {detail.baseline?.insufficientReason ? <p className="gs-alert is-info"><RiInformationLine /><span>{detail.baseline.insufficientReason}</span></p> : null}

              <h3 className="gs-subhead">Mapa de caída</h3>
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
                  {detail.dropMap.depth ? <p className="gs-note">{detail.dropMap.depth.label}: <strong>{formatRate(detail.dropMap.depth.rate)}</strong> ({formatNumber(detail.dropMap.depth.value)}) — señal de profundidad, no un paso del recorrido.</p> : null}
                </div>
              ) : <p className="gs-empty-inline">Sin sesiones medidas en el período: no hay recorrido que dibujar.</p>}

              {detail.dropMap.fields.length ? (
                <>
                  <h3 className="gs-subhead">Abandono por campo <small>sobre quienes llegaron al campo, no sobre el total</small></h3>
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>Campo</th><th className="num">Expuestos</th><th className="num">Completados</th><th className="num">Abandono</th><th className="num">Errores</th><th className="num">Tiempo medio</th></tr></thead>
                      <tbody>{detail.dropMap.fields.map(field => <tr key={field.field}><td><strong>{FIELD_LABEL[field.field] || field.field}</strong></td><td className="num">{formatNumber(field.exposed)}</td><td className="num">{formatNumber(field.completed)}</td><td className={`num${field.abandonment > 0.45 ? ' is-bad' : ''}`}>{formatRate(field.abandonment)}</td><td className="num">{formatNumber(field.validationErrors)}</td><td className="num">{field.averageMs === null ? '—' : `${(field.averageMs / 1000).toFixed(1)} s`}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {detail.traffic.length ? (
                <>
                  <h3 className="gs-subhead">Origen del tráfico</h3>
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>Canal</th><th className="num">Sesiones</th><th className="num">Envíos</th><th className="num">Conversión</th></tr></thead>
                      <tbody>{detail.traffic.map(row => <tr key={row.channel}><td><strong>{row.channel}</strong></td><td className="num">{formatNumber(row.sessions)}</td><td className="num">{formatNumber(row.submits)}</td><td className="num">{formatRate(row.conversion)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <h3 className="gs-subhead">Diagnóstico</h3>
              {detail.diagnoses.length ? detail.diagnoses.map(diagnosis => (
                <article key={diagnosis.id} className="wb-diagnosis">
                  <strong>{diagnosis.title}</strong>
                  <p>{diagnosis.problem}</p>
                  <ul>{diagnosis.evidence.map(item => <li key={item}>{item}</li>)}</ul>
                  <p className="wb-diagnosis-reco"><RiSparkling2Line /> {diagnosis.recommendation}</p>
                  <small>Impacto {diagnosis.impact.minLeads}–{diagnosis.impact.maxLeads} leads/mes · confianza {CONFIDENCE_LABEL[diagnosis.confidence]} · esfuerzo {EFFORT_LABEL[diagnosis.effort]}{diagnosis.baselineUsed ? ` · ${diagnosis.baselineUsed}` : ''}</small>
                </article>
              )) : <p className="gs-empty-inline">Sin hallazgos: o la landing va bien, o todavía no hay datos suficientes para afirmar lo contrario.</p>}

              <h3 className="gs-subhead">Informe en euros</h3>
              <LandingReport report={report} />

              <VariantsPanel variants={variants} experiment={experiment} busy={busy} onGenerate={() => actions.generate(detail.landingKey)} onRequestApproval={actions.requestApproval} onStart={actions.start} onConclude={actions.conclude} onDiscard={actions.discard} />
              <AutonomyPanel autonomy={autonomy} onRun={actions.runAutonomy} busy={busy} />

              {detail.health ? (
                <p className="gs-note"><RiInformationLine /> Salud técnica: {detail.health.verdict === 'ok' ? 'sin incidencias' : detail.health.verdict === 'slow' ? 'la landing carga despacio' : detail.health.verdict === 'broken' ? `la landing responde con error ${detail.health.statusCode}` : 'sin comprobar'}{detail.health.ttfbMs ? ` · primer byte ${detail.health.ttfbMs} ms` : ''}</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
