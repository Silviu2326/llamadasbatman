import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, hasMeaningfulPayload, statusMessage } from '../lib/dataStatus'
import DataStatusBanner from './ui/DataStatusBanner'
import {
  RiAddLine, RiArrowDownSLine, RiArrowRightSLine, RiBarChartHorizontalLine, RiBookmark3Line,
  RiCalendar2Line, RiCheckboxCircleLine, RiCheckLine, RiCloseLine, RiCommandLine,
  RiDownload2Line, RiFilter3Line, RiFlashlightLine, RiMore2Line, RiPhoneLine,
  RiPlayCircleLine, RiRefreshLine, RiSearchLine, RiSendPlaneLine, RiSparkling2Line, RiTimeLine,
} from 'react-icons/ri'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import '../dashboard.css'
import './calls.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import { CALL_OUTCOME, FILTERABLE_OUTCOMES, OUTCOME_COLOR, OUTCOME_ICON, outcomeLabel } from '../lib/callOutcome'

// El desglose y los filtros se derivan del vocabulario canónico. Antes eran
// dos mapas escritos a mano: "Seguimiento" enviaba `outcome=callback` y
// "No interesado" enviaba `rejected`, valores que el backend no escribe nunca,
// así que ambos filtros devolvían siempre cero llamadas.
const STATUS_META = Object.fromEntries(
  FILTERABLE_OUTCOMES.concat(CALL_OUTCOME.NONE).map(outcome => [
    outcomeLabel(outcome),
    { color: OUTCOME_COLOR[outcome], icon: OUTCOME_ICON[outcome] },
  ])
)

const OUTCOME_BY_LABEL = Object.fromEntries(
  FILTERABLE_OUTCOMES.map(outcome => [outcomeLabel(outcome), outcome])
)

const KPI_META = [
  { label: 'Llamadas totales', color: 'var(--accent-soft)', Icon: RiPhoneLine },
  { label: 'Duración promedio', color: 'var(--cyan)', Icon: RiTimeLine },
  { label: 'Tasa de conversión', color: 'var(--success)', Icon: RiFlashlightLine },
  { label: 'Reuniones agendadas', color: 'var(--violet)', Icon: RiCalendar2Line },
]

function mapCall(call, index) {
  const seconds = call.durationSeconds ?? 0
  return {
    id: call.id,
    initials: (call.lead?.name ?? '??').split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase(),
    bg: ['var(--accent)', 'var(--cyan-deep)', 'var(--success)', 'var(--violet)', 'var(--pink)'][index % 5],
    name: call.lead?.name ?? 'Sin contacto',
    company: call.lead?.company ?? 'Sin empresa',
    role: call.lead?.role ?? '',
    time: call.startedAt ? new Date(call.startedAt).toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha',
    dur: seconds ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : '—',
    status: outcomeLabel(call.outcome),
    score: call.sentimentScore ?? null,
    agent: call.agent?.name ?? 'Sin agente',
    recordingUrl: call.recordingUrl,
    startedAt: call.startedAt,
  }
}

function Avatar({ call, size = 38 }) {
  return <div className="calls-avatar" style={{ '--avatar': call.bg, width: size, height: size, fontSize: size * .31 }}>{call.initials}</div>
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { color: 'var(--muted)', icon: '•' }
  return <span className="calls-status" style={{ '--status': meta.color }}><i>{meta.icon}</i>{status}</span>
}

function MetricCard({ item, value }) {
  const Icon = item.Icon
  return <article className="calls-metric" style={{ '--metric': item.color }}><div className="calls-metric-icon"><Icon /></div><div><span>{item.label}</span><strong>{value ?? '—'}</strong><small>{value == null ? 'Sin datos todavía' : 'Actividad de tu organización'}</small></div></article>
}

function WaveBars({ animated = false }) {
  const bars = [12, 20, 30, 17, 38, 24, 44, 30, 58, 42, 28, 52, 34, 64, 42, 25, 48, 72, 46, 31, 53, 27, 60, 38, 22, 49, 69, 42, 28, 57, 35, 47, 25, 54, 38, 65, 29, 45, 32, 58, 43, 22, 49, 63, 35, 52, 31, 45, 28, 54, 42, 22, 50, 35, 58, 44, 26, 48, 35, 62, 40, 28, 55, 33, 47, 24, 52, 38, 58, 31, 46, 26, 54, 36, 48]
  return <div className={`calls-wave ${animated ? 'is-animated' : ''}`} aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 18}ms` }} />)}</div>
}

export default function CallsPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [calls, setCalls] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [agentFilter, setAgentFilter] = useState('Todos')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataStatus, setDataStatus] = useState('loading')
  const [statsStatus, setStatsStatus] = useState('loading')
  const [statsError, setStatsError] = useState('')
  const [quickView, setQuickView] = useState('Todas')
  const [selectedIds, setSelectedIds] = useState([])
  const [agentOptions, setAgentOptions] = useState([])
  const [showCommand, setShowCommand] = useState(false)
  const [showNewCall, setShowNewCall] = useState(false)
  const [callableLeads, setCallableLeads] = useState(null)
  const [newCallLeadId, setNewCallLeadId] = useState('')
  const [newCallState, setNewCallState] = useState('idle')
  const [newCallError, setNewCallError] = useState('')

  const openNewCall = () => {
    setShowNewCall(true)
    setNewCallState('idle')
    setNewCallError('')
    if (callableLeads === null) {
      apiFetch('/api/leads?limit=50').then(response => response.ok ? response.json() : null).then(data => {
        const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
        setCallableLeads(items)
        if (items.length) setNewCallLeadId(items[0].id)
      }).catch(() => setCallableLeads([]))
    }
  }

  const startNewCall = async () => {
    setNewCallState('calling')
    setNewCallError('')
    try {
      const response = await apiFetch(`/api/leads/${newCallLeadId}/call-now`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      // HTTP 200 no basta: queued=false significa que la llamada NO se encoló.
      if (!response.ok || body.queued !== true) {
        const code = body.error || 'call_not_queued'
        const known = { lead_without_campaign: t('calls.leadWithoutCampaign'), lead_without_phone: t('calls.leadWithoutPhone'), call_queue_unavailable: t('calls.queueUnavailable'), call_not_queued: t('calls.notQueued') }
        throw new Error(known[code] || code)
      }
      setNewCallState('done')
      setTimeout(() => { setShowNewCall(false); loadCalls() }, 1600)
    } catch (err) {
      setNewCallState('idle')
      setNewCallError(err.message)
    }
  }
  const [commandQuery, setCommandQuery] = useState('')

  const loadCalls = () => {
    setLoading(true); setError(''); setDataStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (OUTCOME_BY_LABEL[statusFilter]) params.set('outcome', OUTCOME_BY_LABEL[statusFilter])
    if (agentFilter !== 'Todos') params.set('agentId', agentFilter)
    return apiFetch(`/api/calls?${params}`).then(response => { if (!response.ok) throw new Error(`calls_${response.status}`); return response.json() }).then(data => {
      const items = data?.data ?? data
      const next = Array.isArray(items) ? items.map(mapCall) : []
      setCalls(next)
      setMeta({ total: data?.total ?? next.length, totalPages: data?.totalPages ?? 1 })
      setDataStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    }).catch(error => {
      const status = classifyFetchError(error)
      setDataStatus(status)
      setError(statusMessage(status, { error: 'No se pudieron cargar las llamadas.' }))
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadCalls() }, [page, statusFilter, agentFilter])
  useEffect(() => {
    apiFetch('/api/agents').then(response => response.ok ? response.json() : []).then(data => {
      const items = Array.isArray(data) ? data : data?.data ?? []
      setAgentOptions(items.map(agent => ({ id: agent.id, name: agent.name })))
    }).catch(() => {})
  }, [])
  useEffect(() => {
    let active = true
    setStatsStatus('loading')
    setStatsError('')
    apiFetch('/api/dashboard/stats')
      .then(response => { if (!response.ok) throw new Error(`stats_${response.status}`); return response.json() })
      .then(data => {
        if (!active) return
        setStats(data)
        setStatsStatus(DEMO_MODE ? 'demo' : hasMeaningfulPayload(data, { numericKeys: ['totalCalls', 'averageCallDuration', 'conversionRate', 'meetingsScheduled'] }) ? 'live' : 'empty')
      })
      .catch(error => {
        if (!active) return
        const status = classifyFetchError(error)
        setStatsStatus(status)
        setStatsError(statusMessage(status, { error: 'No se pudieron cargar las métricas de llamadas.' }))
        setStats(null)
      })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const onKeyDown = event => {
      const tag = event.target?.tagName?.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setShowCommand(value => !value); setCommandQuery('') }
      if (event.key === 'Escape') setShowCommand(false)
      if (event.key === '/' && !['input', 'textarea', 'select'].includes(tag)) { event.preventDefault(); document.querySelector('.calls-search input')?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filtered = useMemo(() => calls.filter(call => {
    const query = search.trim().toLowerCase()
    return !query || `${call.name} ${call.company} ${call.role}`.toLowerCase().includes(query)
  }), [calls, search])
  const viewedCalls = useMemo(() => filtered.filter(call => {
    if (quickView === 'Alta intención') return ['Interesado', 'Reunión agendada', 'Propuesta enviada'].includes(call.status)
    if (quickView === 'Para hoy') return call.startedAt && new Date(call.startedAt).toDateString() === new Date().toDateString()
    return true
  }), [filtered, quickView])
  const highIntentCount = calls.filter(call => ['Interesado', 'Reunión agendada', 'Propuesta enviada'].includes(call.status)).length
  const allVisibleSelected = viewedCalls.length > 0 && viewedCalls.every(call => selectedIds.includes(call.id))
  const total = statsStatus === 'live' ? stats?.totalCalls : dataStatus === 'live' ? meta.total : null
  const metrics = [total == null ? undefined : Number(total).toLocaleString(localeCode(getLocale())), statsStatus === 'live' ? stats?.averageCallDuration : undefined, statsStatus === 'live' && stats?.conversionRate != null ? `${stats.conversionRate}%` : undefined, statsStatus === 'live' && stats?.meetingsScheduled != null ? Number(stats.meetingsScheduled).toLocaleString(localeCode(getLocale())) : undefined]
  const localizedKpiMeta = KPI_META.map((item, index) => ({ ...item, label: t(['calls.totalCalls', 'calls.averageDuration', 'calls.conversionRate', 'calls.meetingsBooked'][index]) }))

  const exportCalls = () => {
    const csv = ['Contacto,Empresa,Resultado,Duración,Sentimiento,Agente', ...viewedCalls.map(call => [call.name, call.company, call.status, call.dur, call.score, call.agent].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'llamadas-vendrava.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  const toggleSelection = id => setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
  const toggleAllVisible = () => setSelectedIds(allVisibleSelected ? [] : viewedCalls.map(call => call.id))
  const bulkAction = async (action, label) => {
    const ids = selectedIds
    const response = await apiFetch('/api/calls/bulk-actions', { method: 'POST', body: JSON.stringify({ ids, action }) }).catch(() => null)
    const body = response?.ok ? await response.json().catch(() => null) : null
    if (!body) setError(`No se pudo completar: ${label}`)
    else setSelectedIds([])
  }
  const runCommand = action => {
    setShowCommand(false); setCommandQuery('')
    if (action === 'search') document.querySelector('.calls-search input')?.focus()
    if (action === 'filters') setShowFilters(true)
    if (action === 'export') exportCalls()
    if (action === 'priority') setQuickView('Alta intención')
    if (action === 'new') openNewCall()
  }

  if (loading) return <main className="calls-page dark-scroll"><div className="calls-empty" role="status"><RiRefreshLine /><strong>{t('common.loading')} {t('calls.title').toLowerCase()}…</strong></div><DataStatusBanner status="loading" message={t('calls.liveMetrics')} /></main>

  return <main className="calls-page dark-scroll">
    <header className="calls-header"><div className="calls-title"><div className="calls-title-icon"><RiPhoneLine /></div><div><h1>{t('calls.title')}</h1><p>{t('calls.subtitle')}</p></div></div><div className="calls-header-actions"><button className="calls-command-trigger" onClick={() => setShowCommand(true)}><RiCommandLine /><span>{t('calls.commands')}</span><kbd>⌘ K</kbd></button><button className="calls-button ghost" onClick={loadCalls}><RiRefreshLine /> {t('calls.refresh')}</button><button className="calls-button ghost" onClick={() => setShowFilters(value => !value)}><RiFilter3Line /> {t('calls.filters')}</button><button className="calls-button secondary" onClick={exportCalls}><RiDownload2Line /> {t('calls.export')}</button><button className="calls-button primary" onClick={openNewCall}><RiPhoneLine /> {t('calls.newCall')}</button></div></header>

    <DataStatusBanner
      status={dataStatus}
      message={error || statusMessage(dataStatus, { live: 'Llamadas reales sincronizadas con tu organización.', empty: 'La conexión está disponible, pero todavía no hay llamadas registradas.', demo: 'Modo demo explícito: no se muestran conversaciones ficticias.' })}
      onRetry={dataStatus === 'error' || dataStatus === 'disconnected' ? loadCalls : undefined}
      onAction={dataStatus === 'empty' || dataStatus === 'demo' ? openNewCall : dataStatus === 'disconnected' ? () => navigate('/configuracion') : undefined}
      actionLabel={dataStatus === 'disconnected' ? 'Configurar conexión' : 'Nueva llamada'}
    />

    <section className="calls-hero" aria-labelledby="calls-hero-title"><div className="calls-hero-copy"><span className="calls-overline"><RiFlashlightLine /> {t('calls.intelligence')}</span><h2 id="calls-hero-title">{t('calls.heroTitle')}<br /><b>{t('calls.heroAccent')}</b></h2><p>{t('calls.heroDescription')}</p><div className="calls-hero-actions"><button className="calls-button primary" onClick={() => document.querySelector('.calls-workspace')?.scrollIntoView({ behavior: 'smooth' })}><RiPlayCircleLine /> {t('calls.recentCalls')}</button><button className="calls-button hero-ghost" onClick={() => setShowCommand(true)}><RiSparkling2Line /> {t('calls.copilot')}</button></div></div><div className="calls-hero-visual"><img src="/assets/calls-aurora-wave.png" alt="" /><div className="calls-hero-orbit orbit-a" /><div className="calls-hero-orbit orbit-b" /><WaveBars animated /></div></section>

    <section className="calls-metrics" aria-label={t('calls.summary')}>{localizedKpiMeta.map((item, index) => <MetricCard key={item.label} item={item} value={metrics[index]} />)}</section>
    {error && <div className="calls-empty" role="alert"><RiCloseLine /><strong>{error}</strong><button className="calls-button secondary" onClick={loadCalls}>Reintentar</button></div>}

    {showFilters && <section className="calls-filter-panel" aria-label="Filtros de llamadas"><div><span className="calls-filter-label">Resultado</span><div className="calls-filter-chips">{['Todos', ...Object.keys(OUTCOME_BY_LABEL)].map(value => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => { setStatusFilter(value); setPage(1) }}>{value}</button>)}</div></div><div><span className="calls-filter-label">Agente</span><select value={agentFilter} onChange={event => { setAgentFilter(event.target.value); setPage(1) }}><option value="Todos">Todos</option>{agentOptions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></div><button className="calls-icon-button" aria-label="Cerrar filtros" onClick={() => setShowFilters(false)}><RiCloseLine /></button></section>}

    <section className="calls-workspace"><div className="calls-list-panel"><div className="calls-panel-heading"><div><h2>Llamadas recientes</h2><p>{viewedCalls.length} conversaciones en esta vista</p></div><span className="calls-live"><i /> {dataStatus === 'live' ? 'Datos reales' : dataStatus === 'demo' ? 'Modo demo' : 'Sin sincronización'}</span></div><div className="calls-list-toolbar"><div className="calls-view-switcher">{['Todas', 'Alta intención', 'Para hoy'].map(value => <button key={value} className={quickView === value ? 'active' : ''} onClick={() => setQuickView(value)}>{value}{value === 'Alta intención' && <i>{highIntentCount}</i>}</button>)}</div><button className="calls-toolbar-more" onClick={() => setShowFilters(value => !value)}><RiFilter3Line /> Personalizar vista <RiArrowDownSLine /></button></div><div className="calls-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contacto, empresa o cargo..." aria-label="Buscar llamadas" />{search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><RiCloseLine /></button>}<kbd>/</kbd></div>{selectedIds.length > 0 && <div className="calls-bulk-bar"><span><RiCheckboxCircleLine /> {selectedIds.length} seleccionadas</span><button onClick={() => bulkAction('follow_up', 'Seguimiento creado')}><RiSendPlaneLine /> Crear seguimiento</button><button onClick={() => bulkAction('priority', 'Marcadas como prioritarias')}><RiBookmark3Line /> Priorizar</button><button onClick={exportCalls}><RiDownload2Line /> Exportar</button><button aria-label="Limpiar selección" onClick={() => setSelectedIds([])}><RiCloseLine /></button></div>}<div className="calls-table-head"><span className="calls-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Seleccionar todas las llamadas visibles" /></span><span>Contacto</span><span>Empresa</span><span>Fecha</span><span>Resultado</span><span /></div><div className="calls-list dark-scroll">{viewedCalls.length ? viewedCalls.map(call => <div className={`calls-row ${selectedIds.includes(call.id) ? 'is-selected' : ''}`} key={call.id} role="button" tabIndex="0" onClick={() => navigate(`/llamadas/${call.id}${window.location.search}`)} onKeyDown={event => { if (event.key === 'Enter') navigate(`/llamadas/${call.id}${window.location.search}`) }}><span className="calls-check-cell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(call.id)} onChange={() => toggleSelection(call.id)} aria-label={`Seleccionar ${call.name}`} /></span><div className="calls-person" data-i18n-skip><Avatar call={call} /><span><strong>{call.name}</strong><small>{call.role}</small></span></div><div className="calls-company" data-i18n-skip><i style={{ background: call.bg }}>{call.initials[0]}</i>{call.company}</div><span className="calls-date">{call.time}</span><StatusBadge status={call.status} /><div className="calls-row-action"><RiPlayCircleLine /><RiArrowRightSLine /></div></div>) : <div className="calls-empty"><RiSearchLine /><strong>{dataStatus === 'empty' ? 'Aún no hay llamadas' : 'No encontramos llamadas'}</strong><span>{dataStatus === 'empty' ? 'Inicia una llamada para registrar la primera conversación.' : 'Prueba con otro contacto, empresa o resultado.'}</span>{dataStatus === 'empty' && <button className="calls-button secondary" onClick={openNewCall}>Nueva llamada</button>}</div>}</div><div className="calls-list-footer"><span>Mostrando {viewedCalls.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, total ?? 0)} de {total == null ? '—' : total.toLocaleString(localeCode(getLocale()))}</span><div><button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Página anterior"><HiChevronLeft /></button><b>{page}</b><button disabled={page >= meta.totalPages} onClick={() => setPage(value => Math.min(meta.totalPages, page + 1))} aria-label="Página siguiente"><HiChevronRight /></button></div></div></div>
      <aside className="calls-insight-panel"><div className="calls-panel-heading"><div><h2>Resultados de esta vista</h2><p>{statsStatus === 'live' ? 'Métricas sincronizadas' : statsStatus === 'demo' ? 'Modo demo explícito' : 'Sin métricas disponibles'}</p></div><RiBarChartHorizontalLine className="calls-heading-icon" /></div><DataStatusBanner compact status={statsStatus} message={statsError || statusMessage(statsStatus, { live: 'Métricas reales disponibles.', empty: 'No hay métricas de rendimiento todavía.', demo: 'Las métricas demo están identificadas y no representan actividad real.' })} onRetry={statsStatus === 'error' || statsStatus === 'disconnected' ? () => window.location.reload() : undefined} />{calls.length ? <div className="calls-outcome-breakdown">{Object.keys(STATUS_META).map(label => { const count = calls.filter(call => call.status === label).length; const pct = calls.length ? Math.round((count / calls.length) * 100) : 0; return <div key={label} className="calls-outcome-row"><span style={{ color: STATUS_META[label].color }}>{label}</span><b>{count}</b><i><span style={{ width: `${pct}%`, background: STATUS_META[label].color }} /></i></div> })}<small>Sobre las {calls.length} llamadas de esta vista.</small></div> : <div className="calls-empty"><RiBarChartHorizontalLine /><strong>Aún no hay llamadas que analizar</strong></div>}</aside></section>
    {showCommand && <div className="calls-command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowCommand(false) }}><section className="calls-command" role="dialog" aria-modal="true" aria-label="Comandos rápidos"><div className="calls-command-input"><RiCommandLine /><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Busca una acción o escribe para navegar…" /><kbd>ESC</kbd></div>{[{ label: 'Buscar llamadas', hint: 'Enfoca el buscador', icon: RiSearchLine, action: 'search' }, { label: 'Filtrar alta intención', hint: 'Ver oportunidades calientes', icon: RiSparkling2Line, action: 'priority' }, { label: 'Personalizar filtros', hint: 'Estado y agente', icon: RiFilter3Line, action: 'filters' }, { label: 'Exportar vista actual', hint: 'Descargar CSV', icon: RiDownload2Line, action: 'export' }, { label: 'Nueva llamada', hint: 'Llamar a un lead ahora', icon: RiPhoneLine, action: 'new' }].filter(item => !commandQuery || `${item.label} ${item.hint}`.toLowerCase().includes(commandQuery.toLowerCase())).map(item => <button className="calls-command-item" key={item.action} onClick={() => runCommand(item.action)}><span><item.icon /></span><strong>{item.label}<small>{item.hint}</small></strong><RiArrowRightSLine /></button>)}</section></div>}
    {showNewCall && <div className="app-modal-backdrop" onClick={() => newCallState !== 'calling' && setShowNewCall(false)} style={{ zIndex: 100, background: 'var(--scrim)' }}>
      <div className="app-modal-card dark-scroll" onClick={event => event.stopPropagation()} style={{ '--modal-width': '420px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '24px', boxShadow: 'var(--shadow-2)' }}>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>Nueva llamada</p>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)' }}>Elige a quién llamar. El agente asignado a su campaña hará la llamada ahora.</p>
        {callableLeads === null ? <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--dim)' }}>Cargando leads…</p>
          : callableLeads.length === 0 ? <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Todavía no tienes leads. <button onClick={() => navigate('/leads')} style={{ background: 'none', border: 'none', color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Importa o crea el primero</button> y vuelve aquí.</p>
          : <select value={newCallLeadId} onChange={event => setNewCallLeadId(event.target.value)} disabled={newCallState === 'calling'} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 14 }}>
            {callableLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name || 'Sin nombre'}{lead.company ? ` — ${lead.company}` : ''}{lead.phone ? ` (${lead.phone})` : ''}</option>)}
          </select>}
        {newCallError && <p style={{ margin: '0 0 12px', color: 'var(--danger-soft)', fontSize: 12 }} role="alert">{newCallError}</p>}
        {newCallState === 'done' && <p style={{ margin: '0 0 12px', color: 'var(--success)', fontSize: 13, fontWeight: 600 }} role="status"><RiCheckboxCircleLine style={{ verticalAlign: 'middle', marginRight: 4 }} /> Llamada iniciada. Aparecerá en la lista en unos segundos.</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setShowNewCall(false)} disabled={newCallState === 'calling'} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={startNewCall} disabled={!newCallLeadId || newCallState !== 'idle' || !callableLeads?.length} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !newCallLeadId || newCallState !== 'idle' ? 'not-allowed' : 'pointer', opacity: !newCallLeadId || newCallState !== 'idle' ? 0.6 : 1 }}>{newCallState === 'calling' ? 'Llamando…' : newCallState === 'done' ? 'Llamada iniciada' : 'Llamar ahora'}</button>
        </div>
      </div>
    </div>}
  </main>
}
