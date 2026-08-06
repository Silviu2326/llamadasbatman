import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowDownSLine, RiArrowRightLine, RiBarChartGroupedLine,
  RiCheckboxCircleLine, RiCloseLine, RiGroupLine, RiLayoutGridLine,
  RiMegaphoneLine, RiMore2Line, RiPauseCircleLine, RiPhoneLine,
  RiPlayCircleLine, RiSearchLine, RiWallet3Line, RiShareForwardLine,
  RiCompass3Line, RiFlowChart,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import CaptureJourney from './capture/CaptureJourney'
import './campaigns.css'
import './capture/campaign-command.css'
import { getLocale, localeCode, useI18n } from '../i18n'

// ponytail: `type` (email/social/ads/automation) no existe en el modelo
// Campaign real — el producto es una plataforma de llamadas de voz. Se
// deriva un tipo honesto a partir de campos que sí existen (adPlaybookId /
// metaCampaignId => la campaña vino de Meta Ads, si no es una campaña de
// llamadas outbound estándar).
const TYPE_META = {
  outbound: { label: 'Llamadas', Icon: RiPhoneLine, color: 'var(--violet)' },
  ads: { label: 'Publicidad', Icon: RiMegaphoneLine, color: 'var(--warn)' },
  social: { label: 'Redes sociales', Icon: RiShareForwardLine, color: 'var(--cyan)' },
  prospecting: { label: 'Prospección', Icon: RiCompass3Line, color: 'var(--success)' },
  multichannel: { label: 'Multicanal', Icon: RiFlowChart, color: 'var(--pink)' },
}

const STATUS_META = {
  active: { label: 'Activa', color: 'var(--success)' },
  paused: { label: 'En pausa', color: 'var(--warn-soft)' },
  draft: { label: 'Borrador', color: 'var(--muted)' },
  done: { label: 'Finalizada', color: 'var(--violet)' },
}

const LIMIT = 10
const STATS_LIMIT = 100

function campaignType(campaign) {
  const settings = campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)
    ? campaign.settings
    : {}
  const configured = Array.isArray(settings.captureChannels) ? settings.captureChannels : []
  const hints = new Set([settings.source, settings.channel, ...configured].filter(Boolean))
  const detected = []
  if (campaign.adPlaybookId || campaign.metaCampaignId || hints.has('meta_ads') || hints.has('ads')) detected.push('ads')
  if (hints.has('organic_social') || hints.has('social')) detected.push('social')
  if (hints.has('outbound_prospecting') || hints.has('prospecting')) detected.push('prospecting')
  if (detected.length > 1) return 'multichannel'
  return detected[0] || 'outbound'
}

function toRow(campaign) {
  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const progress = totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0
  const conversionLabel = totalLeads > 0 ? `${Math.round((meetingsScheduled / totalLeads) * 100)}%` : '—'
  return { ...campaign, type: campaignType(campaign), totalLeads, contacted, meetingsScheduled, progress, conversionLabel }
}

function formatCents(cents) {
  if (cents === null || cents === undefined) return '—'
  return `${Math.round(cents / 100).toLocaleString(localeCode(getLocale()))} €`
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft
  return <span className="campaign-status" style={{ '--status-color': meta.color }}><i />{meta.label}</span>
}

function MetricCard({ Icon, label, value, detail, color }) {
  return <article className="campaign-metric-card" style={{ '--metric-color': color }}>
    <div className="campaign-metric-head"><span className="campaign-metric-icon"><Icon /></span><span>{label}</span></div>
    <strong>{value}</strong>
    <div className="campaign-metric-foot"><span>{detail}</span></div>
  </article>
}

function Funnel({ stats }) {
  const max = stats.totalLeads || 1
  const steps = [
    { label: 'Leads', value: stats.totalLeads, width: '100%', color: 'var(--violet-deep)' },
    { label: 'Contactados', value: stats.contacted, width: `${Math.min(100, Math.round((stats.contacted / max) * 100))}%`, color: 'var(--cyan)' },
    { label: 'Reuniones agendadas', value: stats.meetingsScheduled, width: `${Math.min(100, Math.round((stats.meetingsScheduled / max) * 100))}%`, color: 'var(--pink)' },
  ]
  return <div className="campaign-funnel">
    <div className="campaign-funnel-shape">{steps.map(step => <div key={step.label} style={{ width: step.width, background: step.color }} />)}</div>
    <div className="campaign-funnel-list">{steps.map(step => <div key={step.label}><span><i style={{ background: step.color }} />{step.label}</span><strong>{step.value.toLocaleString(localeCode(getLocale()))}</strong></div>)}</div>
    <div className="campaign-funnel-total"><span>Tasa de conversión (reuniones / leads)</span><strong>{stats.conversionRate}%</strong></div>
  </div>
}

function ChannelMix({ stats }) {
  if (!stats.total) return <div className="campaign-empty"><RiLayoutGridLine /><strong>Sin campañas todavía</strong><span>La mezcla de canales aparecerá aquí.</span></div>
  const channels = [
    { id: 'ads', label: 'Publicidad', color: 'var(--warn)' },
    { id: 'social', label: 'Redes sociales', color: 'var(--cyan)' },
    { id: 'prospecting', label: 'Prospección', color: 'var(--success)' },
    { id: 'multichannel', label: 'Multicanal', color: 'var(--pink)' },
    { id: 'outbound', label: 'Llamadas outbound', color: 'var(--violet)' },
  ].map(channel => ({ ...channel, count: stats.channelCounts[channel.id] || 0 }))
    .filter(channel => channel.count > 0)
  let cursor = 0
  const segments = channels.map(channel => {
    const start = cursor
    cursor += (channel.count / stats.total) * 100
    return `${channel.color} ${start}% ${cursor}%`
  })
  return <div className="campaign-channel-mix">
    <div className="campaign-donut" style={{ background: `conic-gradient(${segments.join(', ')})` }}><span>{stats.total}<br /><small>campañas</small></span></div>
    <div className="campaign-channel-legend">
      {channels.map(channel => <div key={channel.id}><span><i style={{ background: channel.color }} />{channel.label}</span><strong>{Math.round((channel.count / stats.total) * 100)}%</strong></div>)}
    </div>
  </div>
}

function CampaignRow({ campaign, onOpen, onToggleStatus }) {
  const type = TYPE_META[campaign.type] || TYPE_META.outbound
  const Icon = type.Icon
  return <article className="campaign-row" onClick={() => onOpen(campaign.id)}>
    <div className="campaign-name-cell"><span className="campaign-row-icon" style={{ '--type-color': type.color }}><Icon /></span><div><strong>{campaign.name}</strong><span>{campaign.objective || 'Sin objetivo definido'}</span></div></div>
    <StatusBadge status={campaign.status} />
    <div className="campaign-progress-cell"><div><span>{campaign.progress}%</span><small>{campaign.progress === 100 ? 'Completada' : campaign.progress ? 'En curso' : 'Sin iniciar'}</small></div><div className="campaign-progress"><i style={{ width: `${campaign.progress}%`, background: type.color }} /></div></div>
    <strong className="campaign-number-cell">{campaign.totalLeads.toLocaleString(localeCode(getLocale()))}</strong>
    <div className="campaign-response-cell"><strong>{campaign.contacted.toLocaleString(localeCode(getLocale()))}</strong><span>{campaign.conversionLabel}</span></div>
    <span className="campaign-agent-cell">{campaign.agent?.name || 'Sin agente'}</span>
    <div className="campaign-row-actions"><button className="campaign-icon-button" title={campaign.status === 'active' ? 'Pausar campaña' : 'Activar campaña'} onClick={event => { event.stopPropagation(); onToggleStatus(campaign) }}>{campaign.status === 'active' ? <RiPauseCircleLine /> : <RiPlayCircleLine />}</button><button className="campaign-icon-button" title="Abrir campaña" onClick={event => { event.stopPropagation(); onOpen(campaign.id) }}><RiArrowRightLine /></button></div>
  </article>
}

function CreateCampaignModal({ onClose, onCreate, creating }) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [budget, setBudget] = useState('')
  const [formError, setFormError] = useState('')

  function submit(event) {
    event.preventDefault()
    if (!name.trim()) { setFormError('Ponle un nombre a la campaña para continuar.'); return }
    setFormError('')
    onCreate({
      name: name.trim(),
      objective: objective.trim() || undefined,
      budgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
    })
  }

  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="campaign-create-modal" onSubmit={submit}>
      <div className="campaign-modal-head"><div><span>Nuevo workspace</span><h2>Crear campaña</h2><p>Define los datos básicos, podrás completar el resto luego.</p></div><button type="button" className="campaign-icon-button" onClick={onClose}><RiCloseLine /></button></div>
      {formError && <p role="alert" style={{ margin: '0 0 4px', color: 'var(--danger-soft)', fontSize: 12.5 }}>{formError}</p>}
      <div className="campaign-form-grid">
        <label>Nombre de campaña<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Reactivación clientes Q2" /></label>
        <label>Objetivo<textarea value={objective} onChange={event => setObjective(event.target.value)} placeholder="¿Qué quieres conseguir?" rows="3" /></label>
        <label>Presupuesto estimado (€)<input type="number" min="0" value={budget} onChange={event => setBudget(event.target.value)} /><small>Se podrá ajustar después.</small></label>
      </div>
      <div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose}>Cancelar</button><button className="campaign-button primary" type="submit" disabled={creating}>{creating ? 'Creando…' : 'Crear campaña'} <RiArrowRightLine /></button></div>
    </form>
  </div>
}

export default function Campaigns() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [allCampaigns, setAllCampaigns] = useState([])
  // 'loading' | 'live' | 'plan' | 'error' — mientras no sea 'live' las tarjetas
  // muestran «—» en vez de ceros que parecerían actividad real.
  const [statsStatus, setStatsStatus] = useState('loading')
  const [statsMessage, setStatsMessage] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [status])

  async function loadCampaigns() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (status !== 'all') params.set('status', status)
      if (search) params.set('search', search)
      const res = await apiFetch(`/api/campaigns?${params}`)
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setItems((data.items || []).map(toRow))
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch {
      setError('No se pudieron cargar las campañas.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    setStatsStatus('loading')
    setStatsMessage('')
    try {
      const res = await apiFetch(`/api/campaigns?page=1&limit=${STATS_LIMIT}`)
      if (!res.ok) {
        const gate = await readPlanGate(res)
        setAllCampaigns([])
        setStatsStatus(gate ? 'plan' : 'error')
        setStatsMessage(gate ? planGateMessage(gate, locale) : 'No se pudo calcular el resumen de campañas.')
        return
      }
      const data = await res.json()
      setAllCampaigns((data.items || []).map(toRow))
      setStatsStatus('live')
    } catch {
      setAllCampaigns([])
      setStatsStatus('error')
      setStatsMessage('No se pudo calcular el resumen de campañas.')
    }
  }

  useEffect(() => { loadCampaigns() }, [page, status, search])
  useEffect(() => { loadStats() }, [])

  const stats = useMemo(() => {
    const totalLeads = allCampaigns.reduce((s, c) => s + c.totalLeads, 0)
    const contacted = allCampaigns.reduce((s, c) => s + c.contacted, 0)
    const meetingsScheduled = allCampaigns.reduce((s, c) => s + c.meetingsScheduled, 0)
    const budgetTotalCents = allCampaigns.reduce((s, c) => s + (c.budgetCents || 0), 0)
    const activeCount = allCampaigns.filter(c => c.status === 'active').length
    const channelCounts = allCampaigns.reduce((counts, campaign) => {
      counts[campaign.type] = (counts[campaign.type] || 0) + 1
      return counts
    }, {})
    const conversionRate = totalLeads > 0 ? Math.round((meetingsScheduled / totalLeads) * 1000) / 10 : 0
    return { totalLeads, contacted, meetingsScheduled, budgetTotalCents, activeCount, channelCounts, conversionRate, total: allCampaigns.length }
  }, [allCampaigns])

  // Mismo patrón que Automatizaciones: sin datos reales no se pinta un 0.
  const metricValue = value => (statsStatus === 'live' ? value : '—')

  function notify(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2600) }

  async function toggleStatus(campaign) {
    const isActive = campaign.status === 'active'
    const action = isActive ? 'pause' : 'start'
    try {
      const res = await apiFetch(`/api/campaigns/${campaign.id}/${action}`, { method: 'POST' })
      if (!res.ok) throw new Error()
      notify(isActive ? 'Campaña pausada' : 'Campaña activada')
      loadCampaigns()
      loadStats()
    } catch {
      notify('No se pudo actualizar el estado de la campaña')
    }
  }

  async function createCampaign(payload) {
    setCreating(true)
    try {
      const res = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setShowCreate(false)
      notify('Campaña creada como borrador')
      navigate(`/campanas/${created.id}`)
    } catch {
      notify('No se pudo crear la campaña')
    } finally {
      setCreating(false)
    }
  }

  const statusTabs = [
    { id: 'all', label: 'Todas', color: 'var(--violet)' },
    ...Object.entries(STATUS_META).map(([id, meta]) => ({ id, label: meta.label, color: meta.color })),
  ]

  return <main className="dark-scroll campaign-page">
    <header className="campaign-page-header"><div><h1>{t('modules.campaignsTitle')}</h1><p>{t('modules.campaignsSubtitle')}</p></div><div className="campaign-header-actions"><button className="campaign-button soft" onClick={() => navigate('/funnels')}>Ver funnel <RiArrowRightLine /></button><button className="campaign-button primary" onClick={() => setShowCreate(true)}><RiAddLine /> {t('modules.newCampaign')}</button></div></header>

    <CaptureJourney active="plan" />

    {statsStatus !== 'live' && statsStatus !== 'loading' && <DataStatusBanner status={statsStatus} message={statsMessage} onRetry={statsStatus === 'error' ? loadStats : undefined} />}

    <section className="campaign-metrics-row">
      <MetricCard Icon={RiGroupLine} label="Leads totales" value={metricValue(stats.totalLeads.toLocaleString(localeCode(getLocale())))} detail="en todas las campañas" color="#8b5cf6" />
      <MetricCard Icon={RiPhoneLine} label="Contactados" value={metricValue(stats.contacted.toLocaleString(localeCode(getLocale())))} detail="leads con contacto registrado" color="#22d3ee" />
      <MetricCard Icon={RiBarChartGroupedLine} label="Conversión media" value={metricValue(`${stats.conversionRate}%`)} detail="reuniones / leads" color="#ec4899" />
      <MetricCard Icon={RiWallet3Line} label="Presupuesto total" value={metricValue(formatCents(stats.budgetTotalCents))} detail="suma de presupuestos asignados" color="#34d399" />
    </section>

    <section className="campaigns-layout">
      <div className="campaigns-list-panel" id="campaign-list">
        <div className="campaign-type-tabs" role="tablist" aria-label="Filtrar por estado">{statusTabs.map(tab => <button key={tab.id} role="tab" aria-selected={status === tab.id} className={status === tab.id ? 'active' : ''} onClick={() => setStatus(tab.id)} style={{ '--tab-color': tab.color }}>{tab.label}</button>)}</div>
        <div className="campaigns-list-toolbar"><div className="campaign-search"><RiSearchLine /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar campañas..." aria-label="Buscar campañas" /></div></div>
        <div className="campaigns-list-heading"><div><h2>{t('modules.allCampaigns')}</h2><span>{items.length} visibles de {total}</span></div></div>
        <div className="campaign-table-head"><span>Campaña</span><span>Estado</span><span>Progreso</span><span>Leads</span><span>Contactados</span><span>Agente</span><span /></div>
        <div className="campaign-rows">
          {loading ? <div className="campaign-empty"><strong>Cargando campañas…</strong></div>
            : error ? <div className="campaign-empty"><strong>{error}</strong><button className="campaign-button ghost" onClick={loadCampaigns}>Reintentar</button></div>
            : items.length ? items.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} onOpen={id => navigate(`/campanas/${id}`)} onToggleStatus={toggleStatus} />)
            : <div className="campaign-empty"><RiSearchLine /><strong>{search.trim() || status !== 'all' ? 'No hemos encontrado campañas' : 'Todavía no tienes campañas'}</strong><span>{search.trim() || status !== 'all' ? 'Prueba con otro término o quita los filtros.' : 'Crea la primera para agrupar tus leads y lanzar llamadas.'}</span><button className="campaign-button primary" onClick={() => setShowCreate(true)}>Crear campaña</button></div>}
        </div>
        <div className="campaigns-list-footer">
          <span>Mostrando {items.length ? (page - 1) * LIMIT + 1 : 0} a {(page - 1) * LIMIT + items.length} de {total} campañas</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
            <button className="current">{page}</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
          </div>
          <label>{LIMIT} por página</label>
        </div>
      </div>
      <aside className="campaigns-rail">
        <section className="campaign-rail-panel performance-panel"><div className="campaign-panel-heading"><div><h2>Rendimiento</h2><span>Todas las campañas</span></div></div><div className="campaign-rail-section-title">Embudo de conversión</div><Funnel stats={stats} /><div className="campaign-divider" /><div className="campaign-rail-section-title">Mezcla de canales</div><ChannelMix stats={stats} /></section>
      </aside>
    </section>
    {notice && <div className="campaign-toast" role="status"><RiCheckboxCircleLine />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div>}
    {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} onCreate={createCampaign} creating={creating} />}
  </main>
}
