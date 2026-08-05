import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowDownSLine, RiArrowRightLine, RiBarChartGroupedLine,
  RiCheckLine, RiCloseLine, RiDeleteBinLine, RiEditLine, RiExternalLinkLine,
  RiEyeLine, RiFileCopyLine, RiFilter3Line, RiGlobalLine, RiLayoutGridLine,
  RiListCheck, RiMore2Line, RiPauseCircleLine, RiPlayCircleLine,
  RiRefreshLine, RiRocketLine, RiSearchLine, RiSettings3Line,
  RiSparkling2Line, RiTeamLine, RiTimeLine, RiUploadCloud2Line,
} from 'react-icons/ri'
import CaptureJourney from '../components/capture/CaptureJourney'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import './landings.css'

const STORAGE_KEY = 'vendrava.external-webs.v1'

const TEMPLATE_META = {
  'gym-trial-v1': { label: 'Fitness Boost', kind: 'Fitness', color: 'var(--pink)' },
  'pet-grooming-v1': { label: 'Pet Care', kind: 'Mascotas', color: 'var(--warn)' },
  'legal-consult-v1': { label: 'Lex Pro', kind: 'Servicios legales', color: 'var(--warn-soft)' },
  'generic-v1': { label: 'Clarity Pro', kind: 'General', color: 'var(--cyan)' },
}

const FALLBACK_IMAGES = [
  '/assets/landings/landing-hero.png',
  '/assets/campaigns/campaign-signal.png',
  '/assets/landings/landing-hero.png',
  '/assets/campaigns/campaign-signal.png',
]

function readExternalWebs() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.map(item => ({ ...item, leads: null, meetings: null, visits: null }))
      : []
  } catch {
    return []
  }
}

function writeExternalWebs(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function templateMeta(templateId) {
  return TEMPLATE_META[templateId] || TEMPLATE_META['generic-v1']
}

function normalizeCampaign(campaign, index) {
  const assets = campaign.adAssets && typeof campaign.adAssets === 'object' ? campaign.adAssets : {}
  const templateId = assets.landingTemplateId || 'generic-v1'
  const hasLanding = Boolean(campaign.landingSlug)
  const rawVisits = Object.prototype.hasOwnProperty.call(campaign, 'trackedVisits') ? campaign.trackedVisits : assets.visits
  const parsedVisits = rawVisits === null || rawVisits === undefined || rawVisits === '' ? null : Number(rawVisits)
  const visits = Number.isFinite(parsedVisits) && parsedVisits >= 0 ? parsedVisits : null
  const leads = Math.max(0, Number(campaign.totalLeads) || 0)
  const meetings = Math.max(0, Number(campaign.meetingsScheduled) || 0)
  const activityDate = campaign.updatedAt || campaign.createdAt
  return {
    id: campaign.id,
    sourceId: campaign.id,
    name: assets.title || campaign.name || 'Landing sin título',
    campaignName: campaign.name || 'Campaña sin nombre',
    slug: campaign.landingSlug || '',
    templateId,
    status: !hasLanding ? 'none' : campaign.status === 'active' ? 'published' : 'draft',
    leads,
    meetings,
    visits,
    updatedAt: activityDate ? new Date(activityDate).toLocaleDateString(localeCode(getLocale()), { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha',
    updatedBy: campaign.agent?.name || 'Equipo Vendrava',
    image: assets.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    offer: assets.offer || '',
    leadMagnet: assets.leadMagnet || '',
    adCopy: assets.adCopy || campaign.objective || '',
    assets,
    external: false,
  }
}

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(localeCode(getLocale())).format(Number(value))
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString(localeCode(getLocale()), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function getConversion(item) {
  return Number.isFinite(item.visits) && item.visits > 0 ? (item.leads / item.visits) * 100 : null
}

function getLink(item) {
  if (item.external) return item.url
  return item.slug ? `${window.location.origin}/l/${item.slug}` : null
}

function StatusBadge({ status }) {
  const meta = {
    published: { label: 'Publicada', color: 'var(--success)' },
    draft: { label: 'Borrador', color: 'var(--warn)' },
    none: { label: 'Sin landing', color: 'var(--dim)' },
    external: { label: 'Web externa', color: 'var(--cyan)' },
  }[status] || { label: 'Sin estado', color: 'var(--dim)' }
  return <span className="landing-status" style={{ '--status-color': meta.color }}><i />{meta.label}</span>
}

function LandingThumb({ item, featured = false }) {
  return <div className={`landing-thumb${featured ? ' featured' : ''}`} style={{ '--thumb-color': templateMeta(item.templateId).color }}>
    <img src={item.image || FALLBACK_IMAGES[0]} alt="" />
    <div className="landing-thumb-shade" />
    <span className="landing-thumb-label">{item.external ? 'SITIO WEB' : templateMeta(item.templateId).kind.toUpperCase()}</span>
    <strong>{item.name}</strong>
    <small>{item.external ? 'URL importada' : item.offer || 'Experiencia de captación'}</small>
  </div>
}

function KpiCard({ icon: Icon, label, value, detail, color }) {
  return <article className="landings-kpi" style={{ '--kpi-color': color }}>
    <span className="landings-kpi-icon"><Icon /></span>
    <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    <div className="landings-kpi-spark"><i /><i /><i /><i /><i /></div>
  </article>
}

function LandingRow({ item, onAction, onOpen }) {
  const meta = templateMeta(item.templateId)
  const conversion = getConversion(item)
  return <article className="landing-row" onClick={() => onOpen(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item) } }}>
    <LandingThumb item={item} />
    <div className="landing-row-main">
      <div className="landing-row-title"><strong>{item.name}</strong><StatusBadge status={item.external ? 'external' : item.status} /></div>
      <span className="landing-row-url">{item.external ? item.url : item.slug ? `/l/${item.slug}` : 'Crea una URL para activar esta landing'}</span>
      <div className="landing-row-meta"><span style={{ '--meta-color': meta.color }}><i />{item.external ? 'Web externa' : meta.label}</span><span><RiGlobalLine /> {item.campaignName}</span></div>
    </div>
    <div className="landing-row-date"><span>Última actualización</span><strong>{item.updatedAt}</strong><small>{item.updatedBy}</small></div>
    <div className="landing-row-leads"><strong>{formatNumber(item.leads)}</strong><span>{item.external ? 'Métricas no conectadas' : `${formatNumber(item.meetings)} reuniones de campaña`}</span></div>
    <div className="landing-row-conversion"><strong>{formatPercent(conversion)}</strong><span>{Number.isFinite(item.visits) ? `${formatNumber(item.visits)} visitas registradas` : 'Tracking no disponible'}</span></div>
    <div className="landing-row-actions">
      <button aria-label={`Abrir ${item.name}`} title="Abrir landing" onClick={event => { event.stopPropagation(); onAction('open', item) }}><RiExternalLinkLine /></button>
      <button aria-label={`Editar ${item.name}`} title="Editar landing" onClick={event => { event.stopPropagation(); onAction('edit', item) }}><RiEditLine /></button>
      <button aria-label={`Más acciones para ${item.name}`} title="Más acciones" onClick={event => { event.stopPropagation(); onAction('menu', item) }}><RiMore2Line /></button>
    </div>
  </article>
}

function PerformanceRail({ items, onNavigate }) {
  const campaignItems = items.filter(item => !item.external)
  const landingItems = campaignItems.filter(item => item.slug)
  const published = items.filter(item => item.status === 'published').length
  const trackedItems = landingItems.filter(item => Number.isFinite(item.visits))
  const leads = campaignItems.reduce((total, item) => total + item.leads, 0)
  const visits = trackedItems.reduce((total, item) => total + item.visits, 0)
  const trackedLeads = trackedItems.reduce((total, item) => total + item.leads, 0)
  const meetings = campaignItems.reduce((total, item) => total + item.meetings, 0)
  const conversion = visits > 0 ? (trackedLeads / visits) * 100 : null
  const draft = landingItems.find(item => item.status === 'draft')
  const recommendations = [
    { text: draft ? `Completa y publica “${draft.name}”.` : 'Revisa el estado de tus campañas de captación.', route: draft ? `/campanas/${draft.sourceId}` : '/campanas' },
    { text: conversion !== null ? `La conversión medida es ${formatPercent(conversion)}. Revisa el recorrido completo.` : 'Activa el tracking de visitas para poder medir conversión.', route: '/funnels' },
    { text: meetings ? `${formatNumber(meetings)} reuniones están registradas en estas campañas.` : 'Todavía no hay reuniones registradas en estas campañas.', route: '/funnels' },
  ]
  return <aside className="landings-rail">
    <section className="landings-rail-panel performance-rail-panel">
      <div className="landings-panel-heading"><div><h2>Rendimiento global</h2><span>Datos disponibles en tus campañas</span></div><RiBarChartGroupedLine /></div>
      <div className="landings-rail-score"><span>Conversión medida</span><strong>{formatPercent(conversion)}</strong><em>{published} publicadas</em></div>
      <div className="landings-tracking-state"><span>Tracking de visitas</span><strong>{trackedItems.length} de {landingItems.length}</strong><small>{landingItems.length ? 'landings con datos de visitas' : 'No hay landings publicadas o en borrador'}</small></div>
      <div className="landings-rail-metrics"><span><small>Visitas medidas</small><strong>{trackedItems.length ? formatNumber(visits) : '—'}</strong></span><span><small>Leads de campaña</small><strong>{formatNumber(leads)}</strong></span></div>
      <button className="landing-link-button" onClick={() => onNavigate('/funnels')}>Abrir Funnels <RiArrowRightLine /></button>
    </section>
    <section className="landings-rail-panel">
      <div className="landings-panel-heading"><div><h2>Acciones recomendadas</h2><span>Para mejorar la captación</span></div><RiSparkling2Line /></div>
      <div className="landing-recommendations">{recommendations.map((recommendation, index) => <button key={recommendation.text} onClick={() => onNavigate(recommendation.route)}><span className={`recommendation-icon tone-${index}`}><RiRocketLine /></span><span>{recommendation.text}</span><RiArrowRightLine /></button>)}</div>
      <button className="landing-link-button" onClick={() => onNavigate('/campanas')}>Gestionar campañas <RiArrowRightLine /></button>
    </section>
    <section className="landings-rail-panel landing-help-panel"><span className="landing-help-icon"><RiSettings3Line /></span><div><strong>De campaña a cliente</strong><p>Conecta oferta, landing y seguimiento para medir el recorrido completo.</p><button onClick={() => onNavigate('/campanas')}>Abrir campañas <RiArrowRightLine /></button></div></section>
  </aside>
}

function LandingModal({ mode, item, onClose, onSave, saving }) {
  const initial = mode === 'import'
    ? { name: item?.name || '', campaignName: item?.campaignName || '', url: item?.url || '' }
    : { name: item?.name || '', campaignName: item?.campaignName || '', slug: item?.slug || '', templateId: item?.templateId || 'generic-v1', offer: item?.offer || '', leadMagnet: item?.leadMagnet || '', adCopy: item?.adCopy || '' }
  const [form, setForm] = useState(initial)
  const isImport = mode === 'import'
  const isEdit = mode === 'edit'
  function setField(field, value) { setForm(previous => ({ ...previous, [field]: value })) }
  function submit(event) {
    event.preventDefault()
    if (!form.name.trim() || (isImport ? !form.url.trim() : !form.slug.trim())) return
    onSave({ ...form, name: form.name.trim(), campaignName: form.campaignName.trim() })
  }
  return <div className="landings-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="landings-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="landing-modal-title">
      <header className="landings-modal-head"><div><span>{isImport ? 'Añadir propiedad' : isEdit ? 'Editar experiencia' : 'Nuevo espacio de captación'}</span><h2 id="landing-modal-title">{isImport ? 'Importar sitio web' : isEdit ? 'Editar landing' : 'Crear nueva landing'}</h2><p>{isImport ? 'Añade una web externa para tenerla localizada junto a tus landings.' : 'Define la base de la experiencia y deja lista su URL pública.'}</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header>
      {isImport ? <div className="landings-form-grid"><label className="full">Nombre visible<input autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Web corporativa" /></label><label className="full">URL del sitio<input type="url" value={form.url} onChange={event => setField('url', event.target.value)} placeholder="https://tuempresa.com" /></label><label className="full">Campaña asociada <input value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Presencia de marca" /></label></div> : <div className="landings-form-grid"><label>Nombre de la landing<input autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Consulta inicial" /></label><label>Campaña asociada<input value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Servicios legales — Mayo" /></label><label>Slug público<input value={form.slug} onChange={event => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="consulta-inicial" /><small>Se verá en /l/{form.slug || 'tu-slug'}</small></label><label>Plantilla<select value={form.templateId} onChange={event => setField('templateId', event.target.value)}>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label} · {meta.kind}</option>)}</select></label><label className="full">Oferta principal<input value={form.offer} onChange={event => setField('offer', event.target.value)} placeholder="Consulta inicial gratuita" /></label><label className="full">Lead magnet <input value={form.leadMagnet} onChange={event => setField('leadMagnet', event.target.value)} placeholder="Guía, checklist o recurso gratuito" /></label><label className="full">Copy de captación<textarea rows="3" value={form.adCopy} onChange={event => setField('adCopy', event.target.value)} placeholder="Explica qué conseguirá la persona y cuál es el siguiente paso." /></label></div>}
      <footer className="landings-modal-actions"><button type="button" className="landing-button ghost" onClick={onClose}>Cancelar</button><button type="submit" className="landing-button primary" disabled={saving}>{saving ? 'Guardando…' : isImport ? 'Añadir sitio' : isEdit ? 'Guardar cambios' : 'Crear landing'} <RiArrowRightLine /></button></footer>
    </form>
  </div>
}

export default function LandingsPage() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [externalWebs, setExternalWebs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState('list')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [openMenu, setOpenMenu] = useState(null)

  useEffect(() => {
    setExternalWebs(readExternalWebs())
    loadLandings()
  }, [])

  async function loadLandings() {
    setLoading(true)
    setLoadError('')
    try {
      const [response, funnelsResponse] = await Promise.all([
        apiFetch('/api/campaigns?limit=100'),
        // Las visitas son un dato accesorio: si su petición falla no debe tumbar la lista de landings.
        apiFetch('/api/funnels/overview').catch(() => ({ ok: false })),
      ])
      if (!response.ok) throw new Error('No se pudieron cargar las campañas')
      const data = await response.json()
      if (!Array.isArray(data?.items)) throw new Error('La respuesta de campañas no tiene el formato esperado')
      const funnelsData = funnelsResponse.ok ? await funnelsResponse.json() : { funnels: [] }
      const visitsByCampaign = new Map((funnelsData.funnels || []).map(funnel => [funnel.id, funnel.visits]))
      setItems(data.items.map((campaign, index) => normalizeCampaign({
        ...campaign,
        trackedVisits: visitsByCampaign.has(campaign.id) ? visitsByCampaign.get(campaign.id) : undefined,
      }, index)))
    } catch (error) {
      setItems([])
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las campañas')
    } finally {
      setLoading(false)
    }
  }

  const allItems = useMemo(() => [...items, ...externalWebs], [externalWebs, items])
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return allItems.filter(item => {
      const matchesFilter = filter === 'all' || (filter === 'external' ? item.external : item.status === filter) || (filter === 'none' && item.status === 'none')
      const matchesTemplate = templateFilter === 'all' || item.templateId === templateFilter
      const matchesSearch = !normalizedSearch || `${item.name} ${item.campaignName} ${item.slug} ${item.url || ''}`.toLowerCase().includes(normalizedSearch)
      return matchesFilter && matchesTemplate && matchesSearch
    }).sort((a, b) => {
      if (sort === 'leads') return (b.leads ?? -1) - (a.leads ?? -1)
      if (sort === 'conversion') return (getConversion(b) ?? -1) - (getConversion(a) ?? -1)
      return a.name.localeCompare(b.name, 'es')
    })
  }, [allItems, filter, search, sort, templateFilter])

  const metrics = useMemo(() => {
    const published = allItems.filter(item => item.status === 'published').length
    const campaignItems = allItems.filter(item => !item.external)
    const trackedItems = campaignItems.filter(item => item.slug && Number.isFinite(item.visits))
    const visits = trackedItems.reduce((total, item) => total + item.visits, 0)
    const trackedLeads = trackedItems.reduce((total, item) => total + item.leads, 0)
    const leads = campaignItems.reduce((total, item) => total + item.leads, 0)
    const conversion = visits > 0 ? (trackedLeads / visits) * 100 : null
    return { published, visits, leads, conversion, trackedCount: trackedItems.length }
  }, [allItems])

  const featured = allItems.find(item => item.status === 'published') || allItems.find(item => item.slug) || allItems[0]

  function notify(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }
  function openItem(item) { if (item.external || item.slug) window.open(getLink(item), '_blank', 'noopener,noreferrer'); else setModal({ mode: 'edit', item }) }
  function action(type, item) {
    setOpenMenu(null)
    if (type === 'open') return openItem(item)
    if (type === 'edit') return setModal({ mode: item.external ? 'import' : 'edit', item })
    if (type === 'menu') return setOpenMenu(item.id)
  }
  async function copyLink(item) {
    const link = getLink(item)
    if (!link) return notify('Añade un slug para disponer de un enlace público')
    try { await navigator.clipboard.writeText(link); notify('Enlace copiado al portapapeles') } catch { notify('No se pudo copiar el enlace') }
  }
  async function saveLanding(form) {
    setSaving(true)
    try {
      if (modal.mode === 'import') {
        const next = { ...modal.item, ...form, id: modal.item?.id || `external-${Date.now()}`, external: true, status: 'external', updatedAt: 'Actualizado ahora', templateId: 'generic-v1', leads: null, visits: null, meetings: null, image: FALLBACK_IMAGES[1] }
        const nextWebs = modal.item ? externalWebs.map(item => item.id === next.id ? next : item) : [next, ...externalWebs]
        setExternalWebs(nextWebs)
        writeExternalWebs(nextWebs)
        setModal(null)
        notify(modal.item ? 'Sitio web actualizado' : 'Sitio web añadido a tu espacio')
        return
      }
      const assets = { ...(modal.item?.assets || {}), title: form.name, offer: form.offer, leadMagnet: form.leadMagnet, adCopy: form.adCopy, landingTemplateId: form.templateId }
      if (modal.mode === 'create') {
        const response = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: form.campaignName || form.name, objective: form.adCopy, landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo crear la landing')
        const campaign = await response.json()
        setItems(previous => [normalizeCampaign({ ...campaign, adAssets: assets, landingSlug: form.slug }, previous.length), ...previous])
      } else if (!modal.item.external) {
        const response = await apiFetch(`/api/campaigns/${modal.item.sourceId || modal.item.id}/landing`, { method: 'PUT', body: JSON.stringify({ landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo guardar la landing')
        setItems(previous => previous.map(item => item.id === modal.item.id ? { ...item, ...form, slug: form.slug, templateId: form.templateId, assets, updatedAt: 'Actualizado ahora' } : item))
      }
      setModal(null)
      notify(modal.mode === 'create' ? 'Landing creada como borrador' : 'Landing actualizada correctamente')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }
  async function toggleStatus(item) {
    if (item.external) return notify('Las webs externas no permiten cambiar estado desde campañas')
    const nextStatus = item.status === 'published' ? 'paused' : 'active'
    const response = await apiFetch(`/api/campaigns/${item.sourceId || item.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) })
    if (!response.ok) return notify('No se pudo actualizar el estado')
    setItems(previous => previous.map(current => current.id === item.id ? { ...current, status: nextStatus === 'active' ? 'published' : 'draft' } : current))
    notify(nextStatus === 'active' ? 'Landing publicada' : 'Landing pausada')
  }

  if (loading) return <main className="dark-scroll landings-page landings-loading"><div className="landings-loading-orb"><RiGlobalLine /></div><strong>{locale === 'en' ? 'Loading your landing pages' : 'Cargando tus landings'}</strong><span>{locale === 'en' ? 'Connecting campaigns, websites and metrics…' : 'Conectando campañas, webs y métricas…'}</span></main>

  const tabs = [{ id: 'all', label: 'Todas', count: allItems.length }, { id: 'published', label: 'Publicadas', count: allItems.filter(item => item.status === 'published').length }, { id: 'draft', label: 'Borradores', count: allItems.filter(item => item.status === 'draft').length }, { id: 'none', label: 'Sin landing', count: allItems.filter(item => item.status === 'none').length }, { id: 'external', label: 'Webs externas', count: externalWebs.length }]

  return <main className="dark-scroll landings-page" onClick={() => openMenu && setOpenMenu(null)}>
    <header className="landings-header">
      <div className="landings-heading"><span className="landings-brand-icon"><RiGlobalLine /></span><div><h1>Landings &amp; webs</h1><p>{locale === 'en' ? 'Turn campaign interest into measurable opportunities.' : 'Convierte el interés de tus campañas en oportunidades medibles.'}</p></div></div>
      <div className="landings-header-actions"><button className="landing-button ghost" onClick={() => setModal({ mode: 'import', item: null })}><RiUploadCloud2Line /> {locale === 'en' ? 'Import URL' : 'Importar URL'}</button><button className="landing-button primary" onClick={() => setModal({ mode: 'create', item: null })}><RiAddLine /> {locale === 'en' ? 'New landing page' : 'Nueva landing'} <RiArrowDownSLine /></button></div>
    </header>
    <CaptureJourney active="convert" />
    {loadError ? <div className="landings-inline-alert" role="alert"><RiRefreshLine /><span><strong>No se han podido cargar las campañas.</strong> No se muestran datos de referencia ni métricas simuladas.</span><button onClick={loadLandings}>Reintentar</button></div> : null}
    {featured ? <section className="landings-featured">
      <div className="landings-featured-copy"><div className="landings-featured-top"><StatusBadge status={featured.external ? 'external' : featured.status} /><span>Landing destacada</span></div><h2>{featured.name}</h2><p>{featured.adCopy || 'Configura la oferta y el siguiente paso de esta experiencia de captación.'}</p><div className="landings-featured-url"><RiGlobalLine /> {featured.external ? featured.url : featured.slug ? `/l/${featured.slug}` : 'URL pública pendiente'} <button onClick={() => copyLink(featured)} aria-label="Copiar enlace" disabled={!getLink(featured)}><RiFileCopyLine /></button></div><div className="landings-featured-actions"><button className="landing-button primary" onClick={() => openItem(featured)}>{getLink(featured) ? <RiExternalLinkLine /> : <RiEditLine />} {getLink(featured) ? 'Abrir landing' : 'Configurar landing'}</button><button className="landing-button ghost" onClick={() => setModal({ mode: featured.external ? 'import' : 'edit', item: featured })}><RiEditLine /> Editar</button><button className="landing-button ghost" onClick={() => copyLink(featured)} disabled={!getLink(featured)}><RiFileCopyLine /> Copiar enlace</button></div></div>
      <div className="landings-featured-media"><LandingThumb item={featured} featured /><div className="landings-featured-metric"><span>{featured.external ? 'Métricas' : 'Leads de campaña'}</span><strong>{formatNumber(featured.leads)}</strong><em>{featured.external ? 'No conectadas' : `${formatPercent(getConversion(featured))} conversión medida`}</em></div></div>
    </section> : null}
    <section className="landings-kpi-row" aria-label="Resumen de landings"><KpiCard icon={RiLayoutGridLine} label="Landings activas" value={loadError ? '—' : metrics.published} detail="publicadas ahora" color="#8b5cf6" /><KpiCard icon={RiEyeLine} label="Visitas medidas" value={loadError || !metrics.trackedCount ? '—' : formatNumber(metrics.visits)} detail={metrics.trackedCount ? `${metrics.trackedCount} con tracking` : 'tracking pendiente'} color="#22d3ee" /><KpiCard icon={RiTeamLine} label="Leads de campaña" value={loadError ? '—' : formatNumber(metrics.leads)} detail="registrados en campañas vinculadas" color="#34d399" /><KpiCard icon={RiBarChartGroupedLine} label="Conversión medida" value={loadError ? '—' : formatPercent(metrics.conversion)} detail="solo donde hay visitas" color="#ec4899" /></section>
    <section className="landings-workspace">
      <div className="landings-list-panel">
        <div className="landings-tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
        <div className="landings-toolbar"><div className="landings-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar landing, campaña o URL…" aria-label="Buscar landing" /></div><div className="landings-toolbar-actions"><label><RiFilter3Line /><select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label="Filtrar por plantilla"><option value="all">Todas las plantillas</option>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label><label><RiTimeLine /><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Ordenar landings"><option value="updated">Por nombre</option><option value="leads">Más leads</option><option value="conversion">Mejor conversión</option></select></label><div className="landings-view-switcher"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="Vista lista" aria-pressed={view === 'list'}><RiListCheck /></button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Vista cuadrícula" aria-pressed={view === 'grid'}><RiLayoutGridLine /></button></div></div></div>
        {filteredItems.length ? <div className={`landings-list${view === 'grid' ? ' grid-view' : ''}`}>{filteredItems.map(item => view === 'list' ? <LandingRow key={item.id} item={item} onOpen={openItem} onAction={action} /> : <article className="landing-grid-card" key={item.id} onClick={() => openItem(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openItem(item) } }}><LandingThumb item={item} /><div className="landing-grid-card-copy"><div><strong>{item.name}</strong><StatusBadge status={item.external ? 'external' : item.status} /></div><span>{item.campaignName}</span><div><b>{formatNumber(item.leads)}</b><small> leads de campaña</small><em>{formatPercent(getConversion(item))}</em></div></div><button className="landing-grid-edit" aria-label={`Editar ${item.name}`} onClick={event => { event.stopPropagation(); setModal({ mode: item.external ? 'import' : 'edit', item }) }}><RiEditLine /></button></article>)}</div> : <div className={`landings-empty${loadError && !allItems.length ? ' error' : ''}`} role={loadError && !allItems.length ? 'alert' : 'status'}><span>{loadError && !allItems.length ? <RiRefreshLine /> : allItems.length ? <RiSearchLine /> : <RiGlobalLine />}</span><h3>{loadError && !allItems.length ? 'No pudimos cargar tus landings' : allItems.length ? 'No hay resultados con estos filtros' : 'Aún no tienes campañas ni landings'}</h3><p>{loadError && !allItems.length ? 'Reintenta la conexión. Tus datos no se han sustituido por contenido demo.' : allItems.length ? 'Ajusta la búsqueda o limpia los filtros para volver a ver tus propiedades.' : 'Crea una landing vinculada a una campaña para empezar a captar y medir oportunidades.'}</p><div className="landings-empty-actions">{loadError && !allItems.length ? <button className="landing-button primary" onClick={loadLandings}><RiRefreshLine /> Reintentar</button> : allItems.length ? <button className="landing-button ghost" onClick={() => { setSearch(''); setFilter('all'); setTemplateFilter('all') }}>Limpiar filtros</button> : <><button className="landing-button primary" onClick={() => setModal({ mode: 'create', item: null })}><RiAddLine /> Crear landing</button><button className="landing-button ghost" onClick={() => navigate('/campanas')}>Ver campañas <RiArrowRightLine /></button></>}</div></div>}
        <footer className="landings-list-footer"><span>Mostrando <strong>{filteredItems.length}</strong> de {allItems.length} propiedades</span><span className={loadError ? 'sync-error' : externalWebs.length ? 'sync-partial' : ''}>{loadError ? <RiRefreshLine /> : <RiCheckLine />} {loadError ? 'Campañas sin sincronizar' : externalWebs.length ? 'Campañas sincronizadas · webs externas locales' : 'Datos sincronizados con campañas'}</span></footer>
      </div>
      <PerformanceRail items={allItems} onNavigate={navigate} />
    </section>
    {openMenu && <div className="landing-context-menu" onClick={event => event.stopPropagation()}><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) copyLink(item); setOpenMenu(null) }}><RiFileCopyLine /> Copiar enlace</button><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) setModal({ mode: item.external ? 'import' : 'edit', item }); setOpenMenu(null) }}><RiEditLine /> Editar landing</button><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) toggleStatus(item); setOpenMenu(null) }}><RiPauseCircleLine /> Cambiar estado</button><button className="danger" onClick={() => { setOpenMenu(null); notify('La eliminación requiere confirmación desde la configuración') }}><RiDeleteBinLine /> Eliminar</button></div>}
    {notice && <div className="landings-toast" role="status"><RiCheckLine />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div>}
    {modal && <LandingModal mode={modal.mode} item={modal.item} onClose={() => setModal(null)} onSave={saveLanding} saving={saving} />}
  </main>
}
