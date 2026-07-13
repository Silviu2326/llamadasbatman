import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightSLine, RiBarChartBoxLine, RiCalendar2Line,
  RiCheckboxCircleLine, RiCloseLine, RiDownload2Line, RiFileDownloadLine,
  RiFireLine, RiFilterLine, RiGlobalLine, RiGroupLine, RiLayoutGridLine,
  RiMailLine, RiMapPin2Line, RiMoreLine, RiPhoneLine, RiPulseLine,
  RiRefreshLine, RiRobot2Line, RiSearchEyeLine, RiSearchLine, RiSendPlaneLine,
  RiTableLine, RiTimeLine, RiUserAddLine,
} from 'react-icons/ri'
import { HiChevronDown, HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import { apiFetch } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { mapLead } from '../lib/leadMapping'
import NewLeadModal from '../modals/NewLeadModal'
import ImportLeadsModal from '../modals/ImportLeadsModal'
import leadPulseImage from '../assets/leads/lead-pulse.png'
import '../pages/leads.css'

const STATUS_CONFIG = {
  Nuevo: { color: '#94a3b8', bg: '#94a3b815' },
  Contactado: { color: '#22d3ee', bg: '#22d3ee15' },
  Interesado: { color: '#f59e0b', bg: '#f59e0b15' },
  'En seguimiento': { color: '#818cf8', bg: '#818cf815' },
  'Reunión agendada': { color: '#34d399', bg: '#34d39915' },
  Negociación: { color: '#c084fc', bg: '#c084fc15' },
  Ganado: { color: '#34d399', bg: '#34d39915' },
  Perdido: { color: '#ef4444', bg: '#ef444415' },
}

const SCORE_COLOR = { 'Muy alto': '#34d399', Alto: '#818cf8', Medio: '#f59e0b', Bajo: '#ef4444' }
const STAGES = ['Nuevo', 'Contactado', 'Interesado', 'En seguimiento', 'Reunión agendada', 'Negociación', 'Ganado']
const FILTER_TABS = ['Todos', 'Hot', 'En seguimiento', 'Nuevos', 'Sin próxima acción']
const AUDIT_FILTERS = [
  { key: 'noWebsite', label: 'Sin web' },
  { key: 'noBooking', label: 'Sin reservas online' },
  { key: 'noAnalytics', label: 'Sin Analytics' },
  { key: 'fewReviews', label: 'Pocas reseñas' },
]

const ACTIVITY_ICON = { phone: RiPhoneLine, email: RiMailLine, calendar: RiCalendar2Line, upload: RiDownload2Line, mailopen: RiMailLine, delete: RiCloseLine }

function formatCurrency(value) {
  if (value == null || value === '' || value === '—') return '—'
  const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? `€${numeric.toLocaleString('es-ES')}` : String(value)
}

function enhanceLead(item, index) {
  const mapped = mapLead(item, index)
  return {
    ...mapped,
    value: formatCurrency(item.customFields?.value ?? item.value ?? mapped.value),
    potValue: formatCurrency(item.customFields?.value ?? item.value ?? mapped.potValue),
    nextAction: item.customFields?.nextAction ?? mapped.nextAction,
    nextActionDate: item.customFields?.nextActionDate ?? mapped.nextActionDate,
    source: item.source ?? mapped.source,
    audit: item.customFields?.digitalAudit ?? mapped.audit,
  }
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Nuevo
  return <span className="lead-status" style={{ '--status-color': config.color, '--status-bg': config.bg }}><i />{status}</span>
}

function Avatar({ lead, size = 'md' }) {
  return <div className={`lead-avatar ${size}`} style={{ '--avatar-bg': lead.bg || '#6366f1' }}>{lead.initials}</div>
}

// Sin datos = sin gráfico: no fabricar una tendencia falsa cuando la API no
// entrega una serie real para el KPI (P0-09/VE-02).
function SparkBars({ color = '#818cf8', data }) {
  if (!data?.length) return null
  const max = Math.max(...data)
  return <div className="lead-spark-bars" aria-hidden="true">{data.map((bar, index) => <i key={index} style={{ height: `${Math.max(18, (bar / max) * 100)}%`, background: color, opacity: index === data.length - 1 ? 1 : .32 + index * .06 }} />)}</div>
}

function ScoreMeter({ score }) {
  const label = score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : score >= 40 ? 'Medio' : 'Bajo'
  return <div className="lead-score"><strong>{score}</strong><span style={{ color: SCORE_COLOR[label] }}>{label}</span><div><i style={{ width: `${score}%`, background: SCORE_COLOR[label] }} /></div></div>
}

function KpiCard({ icon: Icon, label, value, detail, color, data }) {
  return <article className="leads-kpi-card" style={{ '--kpi-color': color }}><div className="leads-kpi-top"><span className="leads-kpi-icon"><Icon /></span><span className="leads-kpi-detail">{detail}</span></div><strong>{value}</strong><span className="leads-kpi-label">{label}</span><SparkBars color={color} data={data} /></article>
}

function FocusPanel({ leads, onOpenLead }) {
  const hotLeadsAll = leads.filter(lead => lead.score >= 80 && lead.status !== 'Ganado')
  const hotLeads = hotLeadsAll.slice(0, 3)
  const meetingsCount = leads.filter(lead => lead.status === 'Reunión agendada').length
  return <aside className="leads-focus-panel">
    <div className="leads-panel-heading"><div><span className="leads-heading-kicker"><RiPulseLine /> Radar comercial</span><h2>Enfoque de hoy</h2></div><button className="leads-icon-button" aria-label="Actualizar foco"><RiRefreshLine /></button></div>
    <div className="leads-priority-callout"><div className="leads-priority-glow"><RiRobot2Line /></div><div><strong>Siguiente mejor acción</strong><span>{hotLeadsAll.length} acciones recomendadas</span></div><button className="leads-link-button">Ver acciones <RiArrowRightSLine /></button></div>
    <div className="leads-focus-list">
      <button className="leads-focus-row" onClick={() => hotLeads[0] && onOpenLead(hotLeads[0].id)}><span className="leads-focus-row-icon pink"><RiFireLine /></span><span><strong>{hotLeadsAll.length} leads Hot</strong><small>Alta intención de compra</small></span><RiArrowRightSLine /></button>
      <button className="leads-focus-row"><span className="leads-focus-row-icon cyan"><RiPhoneLine /></span><span><strong>{leads.filter(lead => lead.nextAction?.toLowerCase().includes('llam')).length} llamadas pendientes</strong><small>Basado en las próximas acciones disponibles</small></span><RiArrowRightSLine /></button>
      <button className="leads-focus-row"><span className="leads-focus-row-icon amber"><RiCalendar2Line /></span><span><strong>{meetingsCount} reuniones agendadas</strong><small>Revisa el contexto antes de entrar</small></span><RiArrowRightSLine /></button>
      <button className="leads-focus-row"><span className="leads-focus-row-icon green"><RiCheckboxCircleLine /></span><span><strong>{leads.filter(lead => lead.nextAction).length} próximas acciones</strong><small>Registradas en los datos cargados</small></span><RiArrowRightSLine /></button>
    </div>
    <div className="leads-priority-summary"><div className="leads-priority-line"><i style={{ width: `${Math.max(1, hotLeadsAll.length)}%`, background: '#ec4899' }} /><i style={{ width: `${Math.max(1, leads.filter(lead => lead.status === 'En seguimiento').length)}%`, background: '#22d3ee' }} /></div><div><span><i className="pink-dot" /> Hot <b>{hotLeadsAll.length}</b></span><span><i className="cyan-dot" /> En seguimiento <b>{leads.filter(lead => lead.status === 'En seguimiento').length}</b></span></div></div>
  </aside>
}

function LeadRow({ lead, selected, onToggle, onOpen, onAction, onAudit }) {
  const ActivityIcon = ACTIVITY_ICON[lead.act?.type] || RiPulseLine
  return <div className="leads-table-row" onClick={() => onOpen(lead.id)}>
    <div className="lead-row-check" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => onToggle(lead.id)} aria-label={`Seleccionar ${lead.name}`} /></div>
    <div className="lead-person-cell"><Avatar lead={lead} /><div><strong>{lead.name}</strong><span>{lead.role || 'Contacto principal'}</span><small>{lead.tags?.slice(0, 2).join(' · ')}</small></div></div>
    <div className="lead-company-cell"><span className="company-mark" style={{ '--company-color': lead.cb || lead.bg }}>{lead.ci}</span><div><strong>{lead.company}</strong><span>{lead.city || 'España'}</span></div></div>
    <div><StatusBadge status={lead.status} /><small className="lead-source">{lead.source}</small></div>
    <ScoreMeter score={lead.score} />
    <div className="lead-activity-cell"><span className="activity-icon"><ActivityIcon /></span><div><strong>{lead.act?.date || 'Sin actividad'}</strong><span>{lead.act?.action || 'Sin actividad registrada'}</span></div></div>
    <div className="lead-value-cell"><strong>{lead.potValue || lead.value}</strong><span>{lead.closePct}% prob. cierre</span></div>
    <div className="lead-next-cell"><strong>{lead.nextAction || 'Definir acción'}</strong><span>{lead.nextActionDate || 'Sin fecha'}</span></div>
    <div className="lead-row-actions" onClick={event => event.stopPropagation()}><button title="Auditar web" onClick={() => onAudit(lead)}><RiSearchEyeLine /></button><button title="Llamar" onClick={() => onAction('call', lead)}><RiPhoneLine /></button><button title="Más acciones" onClick={() => onAction('more', lead)}><RiMoreLine /></button></div>
  </div>
}

function KanbanCard({ lead, onOpen }) {
  return <article className="lead-kanban-card" onClick={() => onOpen(lead.id)}><div className="lead-kanban-card-head"><Avatar lead={lead} size="sm" /><span className="lead-kanban-score" style={{ color: SCORE_COLOR[lead.sl] || '#818cf8' }}>{lead.score}</span></div><strong>{lead.name}</strong><span className="lead-kanban-company">{lead.company}</span><div className="lead-kanban-card-foot"><span>{lead.nextAction || 'Sin próxima acción'}</span><RiArrowRightSLine /></div></article>
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [view, setView] = useState('table')
  const [selected, setSelected] = useState(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [showNewLead, setShowNewLead] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [sortBy, setSortBy] = useState('createdAt:desc')
  const [scoreFilter, setScoreFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [auditFilters, setAuditFilters] = useState(new Set())
  const [refreshKey, setRefreshKey] = useState(0)

  // LE-101: búsqueda con debounce (300ms) para no disparar una petición por
  // tecla — solo `debouncedSearch` viaja al backend.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timeout)
  }, [search])

  // Cualquier cambio en búsqueda/fuente/orden redefine el conjunto global de
  // resultados: vuelve a la página 1 (si ya estaba en 1 esto es un no-op).
  useEffect(() => { setPage(1) }, [debouncedSearch, sourceFilter, sortBy])

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), limit: '24' })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sourceFilter !== 'all') params.set('source', sourceFilter)
    if (sortBy) params.set('sort', sortBy)
    Promise.all([
      apiFetch('/api/dashboard/stats').then(response => response.ok ? response.json() : null),
      apiFetch(`/api/leads?${params.toString()}`).then(response => { if (!response.ok) throw new Error('leads'); return response.json() }),
    ]).then(([statsValue, data]) => {
      if (!active) return
      if (statsValue) setStats(statsValue)
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
      setLeads(items.map(enhanceLead)); setMeta({ total: data.total ?? items.length, totalPages: data.totalPages ?? 1 })
    }).catch(() => { if (active) setError('No se pudieron cargar los leads. Revisa la conexión.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, refreshKey, debouncedSearch, sourceFilter, sortBy])

  useEffect(() => {
    const onKey = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('.leads-search input')?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Nota: solo lista fuentes presentes en la página cargada (no hay endpoint
  // de fuentes distintas). El filtro sí aplica de forma global vía backend
  // aunque esta lista de opciones pueda no incluir alguna fuente que solo
  // exista en otra página.
  const sources = useMemo(() => [...new Set(leads.map(lead => lead.source).filter(Boolean))], [leads])
  const filterCount = auditFilters.size + (scoreFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0)

  // search/source/sort ya se resolvieron en el backend (LE-101, ver query de
  // /api/leads más arriba). Lo que queda aquí son facetas sin columna propia
  // en el backend (score heurístico, flags de auditoría, tabs derivadas) —
  // solo pueden aplicarse sobre la página ya cargada.
  const filtered = useMemo(() => {
    return leads.filter(lead => {
      if (activeFilter === 'Hot' && lead.score < 80) return false
      if (activeFilter === 'En seguimiento' && !['En seguimiento', 'Contactado', 'Interesado'].includes(lead.status)) return false
      if (activeFilter === 'Nuevos' && lead.status !== 'Nuevo') return false
      if (activeFilter === 'Sin próxima acción' && lead.nextAction !== 'Sin próxima acción') return false
      if (scoreFilter !== 'all' && lead.score < Number(scoreFilter)) return false
      for (const key of auditFilters) if (!lead.auditFlags?.[key]) return false
      return true
    })
  }, [activeFilter, auditFilters, leads, scoreFilter])

  const totalLeads = stats?.totalLeads ?? meta.total
  const hotCount = stats?.funnel?.find(item => ['Calificados', 'Leads Hot'].includes(item.label))?.value ?? leads.filter(lead => lead.score >= 80).length
  const followupCount = stats?.funnel?.find(item => item.label === 'Contactados')?.value ?? leads.filter(lead => ['Contactado', 'En seguimiento', 'Interesado'].includes(lead.status)).length
  const meetingCount = stats?.meetingsScheduled ?? leads.filter(lead => lead.status === 'Reunión agendada').length
  const pipelineValue = stats?.pipelineValue ?? leads.reduce((total, lead) => total + Number(String(lead.potValue).replace(/[^0-9]/g, '') || 0), 0)
  const kpis = [
    { icon: RiGroupLine, label: 'Leads totales', value: totalLeads.toLocaleString('es-ES'), detail: 'Datos de la API', color: '#818cf8' },
    { icon: RiUserAddLine, label: 'Leads nuevos (7 días)', value: stats?.newLeads?.toLocaleString('es-ES') ?? '—', detail: stats ? 'Datos de la API' : 'Sin datos', color: '#22d3ee' },
    { icon: RiFireLine, label: 'Leads Hot', value: hotCount.toLocaleString('es-ES'), detail: 'Datos cargados', color: '#ec4899' },
    { icon: RiTimeLine, label: 'En seguimiento', value: followupCount.toLocaleString('es-ES'), detail: 'Datos cargados', color: '#34d399' },
    { icon: RiPulseLine, label: 'Tasa de conversión', value: stats?.conversionRate != null ? `${stats.conversionRate}%` : '—', detail: stats ? 'Datos de la API' : 'Sin datos', color: '#f59e0b' },
    { icon: RiBarChartBoxLine, label: 'Valor potencial', value: formatCurrency(stats?.pipelineValue ?? (leads.length ? pipelineValue : null)), detail: 'Datos cargados', color: '#a78bfa' },
  ]

  function toggleSelected(id) {
    setSelected(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleAll() {
    setSelected(previous => previous.size === filtered.length ? new Set() : new Set(filtered.map(lead => lead.id)))
  }

  function toggleAuditFilter(key) {
    setAuditFilters(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function runAudit(lead) {
    try {
      const response = await apiFetch(`/api/leads/${lead.id}/audit`, { method: 'POST', body: JSON.stringify({ website: lead.website || undefined, city: lead.city || undefined }) })
      if (!response.ok) setError('No se pudo ejecutar la auditoría.')
    } catch { setError('No se pudo ejecutar la auditoría.') }
  }

  function quickAction(action, lead) {
    if (action === 'call' && lead.phone) window.open(`tel:${lead.phone}`)
    else if (action === 'more') navigate(`/leads/${lead.id}`)
    else if (!lead.phone) setError('Este lead no tiene teléfono disponible.')
  }

  async function bulkAction(action) {
    const ids = [...selected]
    if (action === 'export') { downloadCsv('leads-seleccionados.csv', filtered.filter(lead => selected.has(lead.id)).map(lead => ({ nombre: lead.name, empresa: lead.company, estado: lead.status, score: lead.score, fuente: lead.source }))); return }
    const nextStatus = action === 'contact' ? 'Contactado' : action === 'followup' ? 'En seguimiento' : null
    if (!nextStatus) return
    const responses = await Promise.all(ids.map(id => apiFetch(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus === 'Contactado' ? 'contacted' : 'qualified' }) })))
    if (responses.some(response => !response.ok)) { setError('No se pudieron actualizar todos los leads.'); return }
    setLeads(previous => previous.map(lead => ids.includes(lead.id) ? { ...lead, status: nextStatus } : lead))
    setSelected(new Set())
  }

  // LE-102 (fuera de alcance de LE-101): no hay export completo del listado
  // filtrado — solo se exportan los leads visibles en la página actual, así
  // que se advierte explícitamente antes de generar el CSV.
  function handleExportCsv() {
    if (!filtered.length) return
    const confirmed = window.confirm(`Se exportarán los ${filtered.length} leads de esta página (no el listado completo de ${meta.total} leads). ¿Continuar?`)
    if (!confirmed) return
    downloadCsv('leads.csv', filtered.map(lead => ({ nombre: lead.name, empresa: lead.company, estado: lead.status, score: lead.score, telefono: lead.phone, oportunidad: lead.potValue, fuente: lead.source })))
  }

  if (loading) return <div className="dark-scroll leads-page" role="status"><div className="leads-empty-state"><RiRefreshLine /><strong>Cargando leads…</strong></div></div>

  return <div className="dark-scroll leads-page">
    <header className="leads-page-header"><div className="leads-heading"><div className="leads-brand-icon"><RiGroupLine /></div><div><h1>Leads</h1><p>Convierte señales comerciales en la siguiente conversación correcta.</p></div></div><div className="leads-header-actions"><div className="leads-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar leads, empresas, etiquetas…" /><kbd>⌘ K</kbd></div><button className="leads-button ghost" onClick={() => setRefreshKey(key => key + 1)}><RiRefreshLine /> Actualizar</button><button className="leads-button secondary" onClick={() => setShowImport(true)}><RiDownload2Line /> Importar</button><button className="leads-button primary" onClick={() => setShowNewLead(true)}><RiAddLine /> Nuevo lead</button></div></header>

    <section className="leads-hero"><div className="leads-hero-copy"><div className="leads-hero-visual"><img src={leadPulseImage} alt="Pulso de inteligencia comercial" /></div><div><h2>Prioriza lo que puede cerrar hoy</h2><p>VozIA cruza intención, momento y contexto para que el equipo enfoque su tiempo en los leads con más probabilidad de conversión.</p><div className="leads-hero-actions"><button className="leads-button primary" onClick={() => setActiveFilter('Hot')}><RiRobot2Line /> Ver recomendaciones</button></div></div></div><div className="leads-hero-insights"><span>Datos disponibles</span><p><RiFireLine /> <b>{hotCount} leads Hot</b> según el score cargado</p><p><RiBarChartBoxLine /> <b>{formatCurrency(stats?.pipelineValue ?? (leads.length ? pipelineValue : null))}</b> de valor potencial conocido</p><small><RiRefreshLine /> Sincronización completada</small></div></section>

    <section className="leads-kpi-row" aria-label="Resumen de leads">{kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}</section>

    <section className="leads-funnel-grid"><div className="leads-funnel-panel"><div className="leads-panel-heading"><div><span className="leads-heading-kicker"><RiPulseLine /> Pipeline en movimiento</span><h2>Embudo de leads</h2></div></div><div className="leads-funnel">{STAGES.slice(0, 6).map((stage, index) => { const item = stats?.funnel?.find(entry => entry.label === stage); const count = item?.value ?? leads.filter(lead => lead.status === stage).length; return <div className={`funnel-stage ${['blue', 'cyan', 'green', 'violet', 'pink', 'lime'][index]}`} key={stage}><strong>{stage}</strong><b>{Number(count).toLocaleString('es-ES')}</b><small>Datos disponibles</small></div> })}</div><div className="leads-funnel-footer"><span>Conversión total: <b>{stats?.conversionRate != null ? `${stats.conversionRate}%` : '—'}</b></span><span><i className="live-dot" /> Datos sincronizados</span></div></div><FocusPanel leads={leads} onOpenLead={id => navigate(`/leads/${id}`)} /></section>

    <section className="leads-workspace"><div className="leads-workspace-toolbar"><div className="leads-toolbar-left"><div className="leads-filter-tabs">{FILTER_TABS.map(tab => <button key={tab} className={activeFilter === tab ? 'active' : ''} onClick={() => setActiveFilter(tab)}>{tab}{tab === 'Hot' && <span>{hotCount}</span>}</button>)}</div><button className={`leads-filter-button${showFilters || filterCount ? ' active' : ''}`} onClick={() => setShowFilters(value => !value)}><RiFilterLine /> Filtros {filterCount > 0 && <span>{filterCount}</span>}</button></div><div className="leads-toolbar-right"><label className="leads-sort">Ordenar por <select value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="createdAt:desc">Más recientes</option><option value="createdAt:asc">Más antiguos</option><option value="name:asc">Nombre A-Z</option><option value="name:desc">Nombre Z-A</option></select><HiChevronDown /></label><button className="leads-button ghost compact" onClick={handleExportCsv} title="Exporta solo los leads de la página actual"><RiFileDownloadLine /> Exportar página</button><div className="leads-view-switcher"><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} aria-label="Vista tabla"><RiTableLine /></button><button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')} aria-label="Vista kanban"><RiLayoutGridLine /></button></div></div></div>

      {showFilters && <div className="leads-filter-drawer"><div><strong>Filtros avanzados</strong><span>Combina criterios para encontrar el siguiente foco.</span></div><label>Puntuación mínima<select value={scoreFilter} onChange={event => setScoreFilter(event.target.value)}><option value="all">Cualquier score</option><option value="80">80+ · Hot</option><option value="65">65+ · Alto</option><option value="40">40+ · Medio</option></select></label><label>Fuente<select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">Todas las fuentes</option>{sources.map(source => <option key={source}>{source}</option>)}</select></label><div className="leads-audit-filters">{AUDIT_FILTERS.map(filter => <label key={filter.key}><input type="checkbox" checked={auditFilters.has(filter.key)} onChange={() => toggleAuditFilter(filter.key)} />{filter.label}</label>)}</div><button className="leads-text-button" onClick={() => { setScoreFilter('all'); setSourceFilter('all'); setAuditFilters(new Set()) }}><RiCloseLine /> Limpiar filtros</button></div>}

      {selected.size > 0 && <div className="leads-bulk-bar"><span><b>{selected.size}</b> leads seleccionados</span><div><button onClick={() => bulkAction('contact')}><RiPhoneLine /> Marcar contactados</button><button onClick={() => bulkAction('followup')}><RiTimeLine /> En seguimiento</button><button onClick={() => bulkAction('export')}><RiFileDownloadLine /> Exportar selección</button><button className="close" onClick={() => setSelected(new Set())}><RiCloseLine /></button></div></div>}

      {view === 'kanban' ? <div className="leads-kanban-board">{STAGES.map(stage => { const stageLeads = filtered.filter(lead => lead.status === stage); const config = STATUS_CONFIG[stage]; return <div className="lead-kanban-column" key={stage}><div className="lead-kanban-column-head"><span><i style={{ background: config.color }} />{stage}</span><b>{stageLeads.length}</b></div><div className="lead-kanban-list">{stageLeads.length ? stageLeads.map(lead => <KanbanCard key={lead.id} lead={lead} onOpen={id => navigate(`/leads/${id}`)} />) : <div className="lead-kanban-empty">Sin leads en esta etapa</div>}</div></div> })}</div> : <div className="leads-table-panel"><div className="leads-table-meta"><div><strong>{filtered.length.toLocaleString('es-ES')} leads</strong><span>de {totalLeads.toLocaleString('es-ES')} en tu workspace</span></div><button className="leads-text-button" onClick={() => setActiveFilter('Todos')}><RiRefreshLine /> Restablecer vista</button></div><div className="leads-table-scroll"><div className="leads-table-head"><div className="lead-row-check"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} aria-label="Seleccionar todos" /></div><span>Lead</span><span>Empresa</span><span>Estado</span><span>Score</span><span>Último contacto</span><span>Valor potencial</span><span>Próxima acción</span><span>Acciones</span></div>{filtered.length ? filtered.map(lead => <LeadRow key={lead.id} lead={lead} selected={selected.has(lead.id)} onToggle={toggleSelected} onOpen={id => navigate(`/leads/${id}`)} onAction={quickAction} onAudit={runAudit} />) : <div className="leads-empty-state"><RiSearchLine /><strong>No encontramos leads con estos filtros</strong><span>Prueba a limpiar algún criterio o buscar por empresa.</span><button className="leads-button secondary" onClick={() => { setSearch(''); setActiveFilter('Todos'); setScoreFilter('all'); setSourceFilter('all'); setAuditFilters(new Set()) }}>Limpiar búsqueda</button></div>}</div><div className="leads-table-footer"><span>Mostrando {filtered.length ? (page - 1) * 24 + 1 : 0} a {Math.min((page - 1) * 24 + filtered.length, meta.total)} de {meta.total.toLocaleString('es-ES')} leads</span><div className="leads-pagination"><button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><HiChevronLeft /></button><button className="active">{page}</button><button disabled={page >= meta.totalPages} onClick={() => setPage(value => Math.min(meta.totalPages, value + 1))}>{page + 1}</button><button disabled={page >= meta.totalPages} onClick={() => setPage(value => Math.min(meta.totalPages, value + 1))}><HiChevronRight /></button></div><span className="leads-page-size">24 por página <HiChevronDown /></span></div></div>}
    </section>

    {error && <div className="leads-empty-state" role="alert"><RiCloseLine /><strong>{error}</strong><button className="leads-button secondary" onClick={() => setRefreshKey(key => key + 1)}>Reintentar</button></div>}
    {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} onSuccess={() => { setShowNewLead(false); setRefreshKey(key => key + 1) }} />}
    {showImport && <ImportLeadsModal onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); setRefreshKey(key => key + 1) }} />}
  </div>
}
