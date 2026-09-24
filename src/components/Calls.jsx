import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { readSalesCollection } from '../lib/salesWorkspace'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, hasMeaningfulPayload, statusMessage } from '../lib/dataStatus'
import DataStatusBanner from './ui/DataStatusBanner'
import {
  RiArrowRightSLine, RiBarChartHorizontalLine, RiBookmark3Line,
  RiCheckboxCircleLine, RiCheckLine, RiCloseLine, RiCommandLine,
  RiDownload2Line, RiFilter3Line, RiFlashlightLine, RiMore2Line, RiPhoneLine,
  RiRefreshLine, RiSearchLine, RiSendPlaneLine, RiSparkling2Line, RiTimeLine,
  RiBookOpenLine, RiBuilding2Line, RiRobot2Line,
  RiPulseLine,
} from 'react-icons/ri'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import '../dashboard.css'
import './calls.css'
import PageLoadingState from './ui/PageLoadingState'
import ProductPageHeader from './ui/ProductPageHeader'
import { getLocale, localeCode, useI18n } from '../i18n'
import { CALL_OUTCOME, FILTERABLE_OUTCOMES, OUTCOME_COLOR, OUTCOME_ICON, displayOutcome, outcomeLabel } from '../lib/callOutcome'
import FishLatencyDemo from './FishLatencyDemo'

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
    status: outcomeLabel(displayOutcome(call)),
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

export default function CallsPage() {
  const navigate = useNavigate()
  const { user } = useAuth() || {}
  const orgId = user?.orgId
  const hasLoaded = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const contactFilter = searchParams.get('leadId') || ''
  const requestRef = useRef(null)
  const leadRequestRef = useRef(null)
  const { t } = useI18n()
  const [calls, setCalls] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [agentFilter, setAgentFilter] = useState(() => searchParams.get('agentId') || 'Todos')
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
  const [sourceReadiness, setSourceReadiness] = useState(null)
  const [showCommand, setShowCommand] = useState(false)
  const [showNewCall, setShowNewCall] = useState(false)
  const [showLatencyDemo, setShowLatencyDemo] = useState(false)
  const [callableLeads, setCallableLeads] = useState(null)
  const [newCallLeadId, setNewCallLeadId] = useState('')
  const [newCallState, setNewCallState] = useState('idle')
  const [newCallError, setNewCallError] = useState('')

  const openNewCall = () => {
    setShowNewCall(true)
    setNewCallState('idle')
    setNewCallError('')
    if (callableLeads === null) {
      leadRequestRef.current?.abort(); const controller = new AbortController(); leadRequestRef.current = controller
      readSalesCollection(apiFetch, '/api/leads', { signal: controller.signal }).then(items => {
        if (controller.signal.aborted) return
        setCallableLeads(items)
        if (items.length) setNewCallLeadId(items[0].id)
      }).catch(() => { if (controller.signal.aborted) return; setCallableLeads(null); setNewCallError('No se pudieron cargar los contactos. Cierra y vuelve a intentarlo.') })
    }
  }

  const startNewCall = async () => {
    if (newCallState === 'calling' || !newCallLeadId) return
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
    requestRef.current?.abort()
    const controller = new AbortController(); requestRef.current = controller
    setLoading(true); setError(''); setDataStatus('loading')
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (contactFilter) params.set('leadId', contactFilter)
    if (search.trim()) params.set('search', search.trim())
    if (quickView === 'Alta intención') params.set('highIntent', 'true')
    if (quickView === 'De hoy') { const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); params.set('dateFrom', start.toISOString()); params.set('dateTo', new Date(end.getTime() - 1).toISOString()) }
    if (OUTCOME_BY_LABEL[statusFilter]) params.set('outcome', OUTCOME_BY_LABEL[statusFilter])
    if (agentFilter !== 'Todos') params.set('agentId', agentFilter)
    return apiFetch(`/api/calls?${params}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(`calls_${response.status}`); return response.json() }).then(data => {
      if (controller.signal.aborted) return
      const items = data?.data ?? data
      const next = Array.isArray(items) ? items.map(mapCall) : []
      setCalls(next)
      setMeta({ total: data?.total ?? next.length, totalPages: data?.totalPages ?? 1 })
      setDataStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    }).catch(error => {
      if (controller.signal.aborted) return
      setCalls([]); setMeta({ total: 0, totalPages: 1 })
      const status = classifyFetchError(error)
      setDataStatus(status)
      setError(statusMessage(status, { error: 'No se pudieron cargar las llamadas.' }))
    }).finally(() => { if (!controller.signal.aborted) { hasLoaded.current = true; setLoading(false) } })
  }

  useEffect(() => { requestRef.current?.abort(); const timer = setTimeout(loadCalls, search.trim() ? 250 : 0); return () => { clearTimeout(timer); requestRef.current?.abort() } }, [page, statusFilter, agentFilter, search, quickView, contactFilter, orgId])
  useEffect(() => { leadRequestRef.current?.abort(); setCalls([]); setCallableLeads(null); setNewCallLeadId(''); setShowNewCall(false); return () => leadRequestRef.current?.abort() }, [orgId])
  useEffect(() => { setPage(1); setSelectedIds([]) }, [statusFilter, agentFilter, search, quickView, contactFilter])
  useEffect(() => {
    const controller = new AbortController(); setAgentOptions([]); setSourceReadiness(null)
    apiFetch('/api/agents', { signal: controller.signal }).then(response => response.ok ? response.json() : []).then(data => {
      const items = Array.isArray(data) ? data : data?.data ?? []
      if (controller.signal.aborted) return
      setAgentOptions(items.map(agent => ({ id: agent.id, name: agent.name, agentType: agent.agentType, callDirection: agent.callDirection, settings: agent.settings || {} })))
    }).catch(() => {})
    apiFetch('/api/settings/business-profile', { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (!controller.signal.aborted) setSourceReadiness(data?.readiness ?? null) }).catch(() => {})
    return () => controller.abort()
  }, [orgId])
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
  }, [orgId])
  useEffect(() => {
    const onKeyDown = event => {
      const tag = event.target?.tagName?.toLowerCase()
      if (event.key === 'Escape') setShowCommand(false)
      if (event.key === '/' && !['input', 'textarea', 'select'].includes(tag)) { event.preventDefault(); document.querySelector('.calls-search input')?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const viewedCalls = calls
  const hasCallFilters = Boolean(contactFilter || search.trim() || quickView !== 'Todas' || statusFilter !== 'Todos' || agentFilter !== 'Todos')
  const trulyEmpty = dataStatus === 'empty' && !hasCallFilters
  const allVisibleSelected = viewedCalls.length > 0 && viewedCalls.every(call => selectedIds.includes(call.id))
  const total = statsStatus === 'live' ? stats?.totalCalls : dataStatus === 'live' ? meta.total : null
  const metrics = [total == null ? undefined : Number(total).toLocaleString(localeCode(getLocale())), statsStatus === 'live' ? stats?.averageCallDuration : undefined, statsStatus === 'live' && stats?.conversionRate != null ? `${stats.conversionRate}%` : undefined]
  const localizedKpiMeta = KPI_META.map((item, index) => ({ ...item, label: t(['calls.totalCalls', 'calls.averageDuration', 'calls.conversionRate'][index]) }))

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
    if (action === 'latency') setShowLatencyDemo(true)
  }

  if (loading && !hasLoaded.current) return <PageLoadingState label={`${t('common.loading')} ${t('calls.title').toLowerCase()}`} />

  return <main className="calls-page dark-scroll">
    {contactFilter && <p role="status">Llamadas del contacto seleccionado. <button onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete('leadId'); return next })}>Ver todos los contactos</button></p>}
    <ProductPageHeader Icon={RiPhoneLine} title={t('calls.title')} description={t('calls.subtitle')} actions={<div className="calls-header-actions"><button className="calls-button ghost" onClick={exportCalls}><RiDownload2Line /> {t('calls.export')}</button><button className="calls-icon-button" aria-label="Más acciones" onClick={() => setShowCommand(true)}><RiMore2Line /></button><button className="calls-button primary" onClick={openNewCall}><RiPhoneLine /> {t('calls.newCall')}</button></div>} />
    {dataStatus !== 'live' ? <DataStatusBanner status={dataStatus} message={error || statusMessage(dataStatus, { empty: hasCallFilters ? 'No hay llamadas que coincidan con estos filtros.' : 'La conexión está disponible, pero todavía no hay llamadas registradas.', demo: 'Modo demo explícito: no se muestran conversaciones ficticias.' })} onRetry={dataStatus === 'error' || dataStatus === 'disconnected' ? loadCalls : undefined} onAction={dataStatus === 'empty' || dataStatus === 'demo' ? openNewCall : dataStatus === 'disconnected' ? () => navigate('/configuracion') : undefined} actionLabel={dataStatus === 'disconnected' ? 'Configurar conexión' : 'Nueva llamada'} /> : null}
    <section className="calls-metrics calls-metrics--minimal" aria-label={t('calls.summary')}>{localizedKpiMeta.map((item, index) => <MetricCard key={item.label} item={item} value={metrics[index]} />)}</section>
    {showFilters ? <section className="calls-filter-panel" aria-label="Filtros de llamadas"><div><span className="calls-filter-label">Resultado</span><div className="calls-filter-chips">{['Todos', ...Object.keys(OUTCOME_BY_LABEL)].map(value => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => { setStatusFilter(value); setPage(1) }}>{value}</button>)}</div></div><label><span className="calls-filter-label">Agente</span><select value={agentFilter} onChange={event => { setAgentFilter(event.target.value); setPage(1) }}><option value="Todos">Todos los agentes</option>{agentOptions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><button className="calls-icon-button" aria-label="Cerrar filtros" onClick={() => setShowFilters(false)}><RiCloseLine /></button></section> : null}
    <section className="calls-workspace"><div className="calls-list-panel"><div className="calls-panel-heading"><div><h2>Llamadas recientes</h2><p>{viewedCalls.length} conversaciones en esta vista</p></div><span className="calls-live"><i /> {dataStatus === 'live' ? 'Datos reales' : 'Sin sincronización'}</span></div><div className="calls-list-toolbar"><div className="calls-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contacto, empresa, teléfono o email" aria-label="Buscar llamadas" />{search ? <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><RiCloseLine /></button> : null}<kbd>/</kbd></div><div className="calls-view-switcher">{['Todas', 'Alta intención', 'De hoy'].map(value => <button key={value} className={quickView === value ? 'active' : ''} onClick={() => setQuickView(value)}>{value}</button>)}</div><button className="calls-toolbar-more" onClick={() => setShowFilters(value => !value)}><RiFilter3Line /> Filtrar</button></div>{selectedIds.length > 0 ? <div className="calls-bulk-bar"><span><RiCheckboxCircleLine /> {selectedIds.length} seleccionadas</span><button onClick={() => bulkAction('follow_up', 'Seguimiento creado')}><RiSendPlaneLine /> Crear seguimiento</button><button onClick={() => bulkAction('priority', 'Marcadas como prioritarias')}><RiBookmark3Line /> Priorizar</button><button onClick={exportCalls}><RiDownload2Line /> Exportar</button><button aria-label="Limpiar selección" onClick={() => setSelectedIds([])}><RiCloseLine /></button></div> : null}<div className="calls-table-head"><span className="calls-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Seleccionar todas las llamadas visibles" /></span><span>Contacto</span><span>Empresa</span><span>Fecha</span><span>Resultado</span><span>Agente</span><span /></div><div className="calls-list dark-scroll">{loading ? <p role="status">Cargando llamadas…</p> : viewedCalls.length ? viewedCalls.map(call => <div className={`calls-row ${selectedIds.includes(call.id) ? 'is-selected' : ''}`} key={call.id} role="button" tabIndex="0" onClick={() => navigate(`/llamadas/${call.id}${window.location.search}`)} onKeyDown={event => { if (event.key === 'Enter') navigate(`/llamadas/${call.id}${window.location.search}`) }}><span className="calls-check-cell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(call.id)} onChange={() => toggleSelection(call.id)} aria-label={`Seleccionar ${call.name}`} /></span><div className="calls-person" data-i18n-skip><Avatar call={call} /><span><strong>{call.name}</strong><small>{call.role || call.dur}</small></span></div><div className="calls-company" data-i18n-skip><i style={{ background: call.bg }}>{call.initials[0]}</i>{call.company}</div><span className="calls-date">{call.time}</span><StatusBadge status={call.status} /><span className="calls-agent">{call.agent}</span><div className="calls-row-action"><RiArrowRightSLine /></div></div>) : <div className="calls-empty"><RiSearchLine /><strong>{trulyEmpty ? 'Aún no hay llamadas' : 'No encontramos llamadas'}</strong><span>{trulyEmpty ? 'Inicia una llamada para registrar la primera conversación.' : 'Prueba con otro contacto, empresa o resultado.'}</span>{trulyEmpty ? <button className="calls-button secondary" onClick={openNewCall}>Nueva llamada</button> : null}</div>}</div><div className="calls-list-footer"><span>Mostrando {viewedCalls.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, meta.total ?? 0)} de {meta.total == null ? '—' : meta.total.toLocaleString(localeCode(getLocale()))}</span><div><button disabled={loading || page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Página anterior"><HiChevronLeft /></button><b>{page}</b><button disabled={loading || page >= meta.totalPages} onClick={() => setPage(value => Math.min(meta.totalPages, page + 1))} aria-label="Página siguiente"><HiChevronRight /></button></div></div></div>
      <aside className="calls-insight-panel"><div className="calls-panel-heading"><div><h2>Resumen de resultados</h2><p>Sobre las llamadas de esta página</p></div></div>{statsError ? <p className="calls-summary-note">{statsError}</p> : null}{calls.length ? <div className="calls-outcome-breakdown">{Object.keys(STATUS_META).map(label => ({ label, count: calls.filter(call => call.status === label).length })).filter(item => item.count > 0).slice(0, 3).map(item => <div key={item.label} className="calls-outcome-row"><span style={{ color: STATUS_META[item.label].color }}>{item.label}</span><b>{item.count}</b></div>)}<small>Actualizado con la vista actual.</small></div> : <div className="calls-empty"><RiBarChartHorizontalLine /><strong>Aún no hay llamadas que analizar</strong></div>}</aside></section>
    {showCommand && <div className="calls-command-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowCommand(false) }}><section className="calls-command" role="dialog" aria-modal="true" aria-label="Comandos rápidos"><div className="calls-command-input"><RiCommandLine /><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Busca una acción o escribe para navegar…" /><kbd>ESC</kbd></div>{[{ label: 'Buscar llamadas', hint: 'Enfoca el buscador', icon: RiSearchLine, action: 'search' }, { label: 'Medir latencia TTS', hint: 'Benchmark real de Fish Audio', icon: RiPulseLine, action: 'latency' }, { label: 'Filtrar alta intención', hint: 'Ver oportunidades calientes', icon: RiSparkling2Line, action: 'priority' }, { label: 'Personalizar filtros', hint: 'Estado y agente', icon: RiFilter3Line, action: 'filters' }, { label: 'Exportar vista actual', hint: 'Descargar CSV', icon: RiDownload2Line, action: 'export' }, { label: 'Nueva llamada', hint: 'Llamar a un lead ahora', icon: RiPhoneLine, action: 'new' }].filter(item => !commandQuery || `${item.label} ${item.hint}`.toLowerCase().includes(commandQuery.toLowerCase())).map(item => <button className="calls-command-item" key={item.action} onClick={() => runCommand(item.action)}><span><item.icon /></span><strong>{item.label}<small>{item.hint}</small></strong><RiArrowRightSLine /></button>)}</section></div>}
    {showLatencyDemo && <FishLatencyDemo onClose={() => setShowLatencyDemo(false)} />}
    {showNewCall && <div className="app-modal-backdrop" onClick={() => newCallState !== 'calling' && setShowNewCall(false)} style={{ zIndex: 100, background: 'var(--scrim)' }}>
      <div className="app-modal-card dark-scroll" onClick={event => event.stopPropagation()} style={{ '--modal-width': '420px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '24px', boxShadow: 'var(--shadow-2)' }}>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>Nueva llamada</p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)' }}>Elige a quién llamar. El agente asignado a su campaña hará la llamada ahora.</p>
        <div className="calls-new-source-summary"><span className={agentOptions.length ? 'is-ready' : ''}><RiRobot2Line /> Agente + estrategia</span><span className={sourceReadiness?.profileReady ? 'is-ready' : ''}><RiBuilding2Line /> Empresa y precios</span><span className={sourceReadiness?.knowledgeCount > 0 ? 'is-ready' : ''}><RiBookOpenLine /> Documentos</span></div>
        {callableLeads === null ? <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--dim)' }}>{newCallError ? 'Contactos no disponibles.' : 'Cargando contactos…'}</p>
          : callableLeads.length === 0 ? <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Todavía no tienes contactos. <button onClick={() => navigate('/leads')} style={{ background: 'none', border: 'none', color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Importa o crea el primero</button> y vuelve aquí.</p>
          : <select value={newCallLeadId} onChange={event => setNewCallLeadId(event.target.value)} disabled={newCallState === 'calling'} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 14 }}>
            {callableLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name || 'Sin nombre'}{lead.company ? ` — ${lead.company}` : ''}{lead.phone ? ` (${lead.phone})` : ''}</option>)}
          </select>}
        {newCallError && <p style={{ margin: '0 0 12px', color: 'var(--danger-soft)', fontSize: 12 }} role="alert">{newCallError}</p>}
        {newCallState === 'done' && <p style={{ margin: '0 0 12px', color: 'var(--success)', fontSize: 13, fontWeight: 600 }} role="status"><RiCheckboxCircleLine style={{ verticalAlign: 'middle', marginRight: 4 }} /> Llamada en cola. Aparecerá en la lista en unos segundos.</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setShowNewCall(false)} disabled={newCallState === 'calling'} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={startNewCall} disabled={!newCallLeadId || newCallState !== 'idle' || !callableLeads?.length} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !newCallLeadId || newCallState !== 'idle' ? 'not-allowed' : 'pointer', opacity: !newCallLeadId || newCallState !== 'idle' ? 0.6 : 1 }}>{newCallState === 'calling' ? 'Llamando…' : newCallState === 'done' ? 'Llamada en cola' : 'Llamar ahora'}</button>
        </div>
      </div>
    </div>}
  </main>
}
