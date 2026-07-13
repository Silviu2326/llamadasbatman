import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiCalendar2Line, RiCalendarLine, RiGroupLine, RiMoneyDollarBoxLine,
  RiLineChartLine, RiFilterLine, RiDownloadLine, RiAddLine,
  RiCloseLine, RiSearchLine, RiMoreLine, RiArrowRightLine,
  RiFileTextLine, RiEditLine, RiRobot2Line, RiRocketLine,
  RiArrowLeftSLine, RiArrowRightSLine,
} from 'react-icons/ri'
import KPICard from './KPICard'
import DataTable from './DataTable'
import '../dashboard.css'
import NewReunionModal from '../modals/NewReunionModal'

const MEETING_STATUS_OPTIONS = [
  { value: '', label: 'Cualquier estado' },
  { value: 'scheduled', label: 'Confirmada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'no_show', label: 'No asistió' },
]

// ─── constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL = { scheduled:'Confirmada', completed:'Completada', cancelled:'Cancelada', no_show:'No asistió' }
const STATUS_COLOR = { scheduled:'#10b981', completed:'#6b7280', cancelled:'#ef4444', no_show:'#f59e0b' }
const ATTEND_LABEL = { scheduled:'Pendiente', completed:'Asistió', cancelled:'No asistirá', no_show:'No asistió' }
const ATTEND_COLOR = { scheduled:'#6b7280', completed:'#10b981', cancelled:'#ef4444', no_show:'#f59e0b' }
const BG_POOL = ['#2563eb','#0891b2','#7c3aed','#b45309','#be185d','#059669','#d97706','#0d9488']
const TABS = ['Todas','Hoy','Mañana','Esta semana','Próxima semana','Completadas','Canceladas','No asistieron']

// ─── data helpers ─────────────────────────────────────────────────────────────
function dayBucket(scheduledAt) {
  const d = new Date(scheduledAt)
  const todayMs = new Date(new Date().setHours(0,0,0,0)).getTime()
  const dMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (dMs === todayMs) return { label:'HOY', color:'#8b5cf6' }
  if (dMs === todayMs + 86400000) return { label:'MAÑANA', color:'#60a5fa' }
  return { label: d.toLocaleDateString('es-ES',{day:'2-digit',month:'short'}).toUpperCase(), color:'#94a3b8' }
}

function mapMeeting(m, i) {
  const d = new Date(m.scheduledAt)
  const dur = m.durationMinutes ?? 30
  const end = new Date(d.getTime() + dur * 60000)
  const now = new Date()
  const time = d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
  const endTime = end.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
  const isLive = m.status === 'scheduled' && d <= now && now <= end
  const { label: dayLabel, color: dayColor } = dayBucket(m.scheduledAt)
  return {
    id: m.id, status: m.status,
    dayLabel, dayColor, time, dur: `${dur} min`,
    lead: { name: m.lead?.name ?? '—', company: m.lead?.company ?? '—', bg: BG_POOL[i % BG_POOL.length] },
    agent: { name: m.assignee?.name ?? '—', role: '', bg: '#4f46e5' },
    date: d.toLocaleDateString('es-ES'),
    range: `${time} - ${endTime}`,
    platform: m.meetingUrl?.includes('zoom') ? 'zoom' : 'google',
    estado: STATUS_LABEL[m.status] ?? m.status,
    estadoColor: STATUS_COLOR[m.status] ?? '#10b981',
    asistencia: ATTEND_LABEL[m.status] ?? 'Pendiente',
    asistColor: ATTEND_COLOR[m.status] ?? '#6b7280',
    value: '—', priority: 'Media', prioColor: '#60a5fa',
    hasJoin: !!m.meetingUrl && m.status === 'scheduled', isLive,
    objetivo: m.title ?? '',
    title: m.title ?? '',
    leadStatus: 'Interesado', leadStatusColor: '#22d3ee',
    summary: m.notes ?? '', resources: [],
    meetingUrl: m.meetingUrl,
    scheduledAt: m.scheduledAt,
    // RE-102: se necesita el número crudo (no el "30 min" formateado) para
    // precargar el formulario de reprogramación.
    durationMinutes: dur,
  }
}

function filterByTab(meetings, tab) {
  const todayMs = new Date(new Date().setHours(0,0,0,0)).getTime()
  const DAY = 86400000
  const t = m => new Date(m.scheduledAt).getTime()
  if (tab === 'Hoy') return meetings.filter(m => { const ms = t(m); return ms >= todayMs && ms < todayMs + DAY })
  if (tab === 'Mañana') return meetings.filter(m => { const ms = t(m); return ms >= todayMs + DAY && ms < todayMs + 2*DAY })
  if (tab === 'Esta semana') return meetings.filter(m => { const ms = t(m); return ms >= todayMs && ms < todayMs + 7*DAY })
  if (tab === 'Próxima semana') return meetings.filter(m => { const ms = t(m); return ms >= todayMs + 7*DAY && ms < todayMs + 14*DAY })
  if (tab === 'Completadas') return meetings.filter(m => m.status === 'completed')
  if (tab === 'Canceladas') return meetings.filter(m => m.status === 'cancelled')
  if (tab === 'No asistieron') return meetings.filter(m => m.status === 'no_show')
  return meetings
}

// RE-103/RE-04: `raw` es la página actual devuelta por el backend (paginado
// server-side), no el listado completo — igual que en Leads.jsx, los KPIs
// aquí reflejan solo lo cargado en pantalla. `totalMeetings` (meta.total del
// backend) sí es la cifra global y se usa para el primer tile.
function buildKPIs(raw, totalMeetings) {
  const total = raw.length
  const completed = raw.filter(m => m.status === 'completed').length
  const cancelled = raw.filter(m => m.status === 'cancelled').length
  const noShow = raw.filter(m => m.status === 'no_show').length
  const denom = completed + noShow
  const attendRate = denom > 0 ? ((completed / denom) * 100).toFixed(1) : '0'
  const avgDur = total > 0 ? Math.round(raw.reduce((s, m) => s + (m.durationMinutes ?? 30), 0) / total) : 0
  // ponytail: flat data array — no historical series available from backend
  const flat = (n, len = 12) => Array(len).fill(n)
  return [
    { Icon: RiCalendar2Line, iconBg:'#6d28d9', label:'Reuniones\nagendadas',  value: String(totalMeetings ?? total), pct:0, color:'#a78bfa', data: flat(totalMeetings ?? total) },
    { Icon: RiCalendarLine,  iconBg:'#047857', label:'Reuniones\ncompletadas', value: String(completed),   pct:0, color:'#34d399', data: flat(completed) },
    { Icon: RiGroupLine,     iconBg:'#0e7490', label:'Tasa de\nasistencia',    value: `${attendRate}%`,    pct:0, color:'#22d3ee', data: flat(parseFloat(attendRate)) },
    { Icon: RiMoneyDollarBoxLine, iconBg:'#b45309', label:'Canceladas',        value: String(cancelled),   pct:0, color:'#fbbf24', data: flat(cancelled) },
    { Icon: RiLineChartLine, iconBg:'#0d9488', label:'Duración\npromedio',     value: `${avgDur} min`,     pct:0, color:'#2dd4bf', data: flat(avgDur) },
  ]
}

// ─── ui helpers ───────────────────────────────────────────────────────────────
function Avatar({ name, bg, size = 34 }) {
  const w = name.split(' ')
  const ini = (w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700, color: '#fff', boxShadow: `0 0 8px ${bg}40`,
    }}>{ini.toUpperCase()}</div>
  )
}

function PlatformBadge({ type }) {
  const cfg = {
    google: { label: 'Google Meet', color: '#4285f4' },
    zoom:   { label: 'Zoom',        color: '#2D8CFF' },
  }
  const c = cfg[type] ?? cfg.google
  return (
    <span style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 5, fontWeight: 600, background: `${c.color}15`, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function Pill({ text, color }) {
  return (
    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, background: `${color}15`, border: `1px solid ${color}28`, color, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function AttendIcon({ status, color }) {
  const symbol = status === 'Asistió' ? '✓' : status === 'No asistirá' ? '✕' : status === 'No asistió' ? '✕' : status === 'Esperando' ? '…' : '○'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${color}`, color, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{symbol}</span>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{status}</span>
    </div>
  )
}

// ─── row dropdown ─────────────────────────────────────────────────────────────
const MENU_OPTS = [
  { label: 'Ver detalle',      icon: RiArrowRightLine, action: 'detail' },
  { label: 'Reprogramar',      icon: RiCalendarLine,   action: 'reschedule' },
  { label: 'Cancelar reunión', icon: RiCloseLine,      action: 'cancel', danger: true },
]

function RowMenu({ mtg, onDetail, onReschedule, onCancel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function handle(e, action) {
    e.stopPropagation()
    setOpen(false)
    if (action === 'detail') onDetail(mtg)
    if (action === 'reschedule') onReschedule?.(mtg)
    if (action === 'cancel') onCancel?.(mtg)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: open ? '#1e2433' : 'none', border: '1px solid ' + (open ? '#2d3748' : 'transparent'), borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', transition: 'all .15s' }}
      >
        <RiMoreLine style={{ width: 14, height: 14 }} />
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '4px', minWidth: 170, boxShadow: '0 8px 32px #00000060' }}>
          {MENU_OPTS.map(opt => (
            <button
              key={opt.label}
              onClick={(e) => handle(e, opt.action)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', borderRadius: 7, color: opt.danger ? '#ef4444' : '#e2e8f0', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = opt.danger ? '#ef444412' : '#ffffff0a'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <opt.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── table config ─────────────────────────────────────────────────────────────
const GRID = '68px 1.5fr 1fr 1.2fr 1fr 0.8fr 0.8fr 64px'
const COLS = ['Reunión','Lead / Empresa','Agente IA','Fecha y hora','Estado','Asistencia','Valor potencial','Acciones']

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Reuniones() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Todas')
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [raw, setRaw] = useState([])
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // RE-103/RE-04: búsqueda/filtros/paginación server-side, mismo patrón que
  // LE-101 en Leads.jsx.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timeout)
  }, [search])

  // Cualquier cambio de búsqueda/filtro redefine el conjunto de resultados:
  // vuelve a la página 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, dateFrom, dateTo, limit])

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    apiFetch(`/api/meetings?${params.toString()}`)
      .then(r => { if (!r.ok) throw new Error('meetings'); return r.json() })
      .then(data => {
        if (!active) return
        const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
        setRaw(items)
        setMeta({ total: data.total ?? items.length, totalPages: data.totalPages ?? 1 })
      })
      .catch(() => { if (active) setError('No se pudieron cargar las reuniones.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, limit, debouncedSearch, statusFilter, dateFrom, dateTo, refreshKey])

  const mapped = useMemo(() => raw.map(mapMeeting), [raw])
  const kpis = useMemo(() => buildKPIs(raw, meta.total), [raw, meta.total])
  // TABS aplica solo sobre la página ya cargada (igual que FILTER_TABS en
  // Leads.jsx) — search/status/fecha ya se resolvieron en el backend arriba.
  const meetings = useMemo(() => filterByTab(mapped, activeTab), [mapped, activeTab])
  const filterCount = (statusFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

  async function handleCancel() {
    await apiFetch(`/api/meetings/${cancelTarget.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {})
    setRaw(prev => prev.map(m => m.id === cancelTarget.id ? { ...m, status: 'cancelled' } : m))
    setCancelTarget(null)
  }

  function clearFilters() {
    setStatusFilter(''); setDateFrom(''); setDateTo('')
  }

  function exportCSV() {
    const rows = [['ID','Lead','Empresa','Fecha','Hora','Plataforma','Estado']].concat(
      mapped.map(m => [m.id, m.lead.name, m.lead.company, m.date, m.time, m.platform, m.estado])
    )
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reuniones.csv'; a.click()
  }

  const renderMeeting = (mtg) => [
    <div key="t">
      <p style={{ margin:0, fontSize:9, fontWeight:700, color:mtg.dayColor, letterSpacing:0.5 }}>{mtg.dayLabel}</p>
      <p style={{ margin:0, fontSize:16, fontWeight:800, color:'#f1f5f9', lineHeight:1.1 }}>{mtg.time}</p>
      <p style={{ margin:0, fontSize:10, color:'#6b7280' }}>{mtg.dur}</p>
    </div>,
    <div key="l" style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
      <Avatar name={mtg.lead.name} bg={mtg.lead.bg} size={34} />
      <div style={{ minWidth:0 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mtg.lead.name}</p>
        <p style={{ margin:0, fontSize:10, color:'#4b5563' }}>{mtg.lead.company}</p>
      </div>
    </div>,
    <div key="a" style={{ display:'flex', gap:6, alignItems:'center', minWidth:0 }}>
      <Avatar name={mtg.agent.name} bg={mtg.agent.bg} size={26} />
      <div style={{ minWidth:0 }}>
        <p style={{ margin:0, fontSize:11, fontWeight:600, color:'#e2e8f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{mtg.agent.name}</p>
      </div>
    </div>,
    <div key="f">
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:600, color:'#e2e8f0' }}>{mtg.date}</p>
      <p style={{ margin:'0 0 3px', fontSize:10.5, color:'#94a3b8' }}>{mtg.range}</p>
      <PlatformBadge type={mtg.platform} />
    </div>,
    <Pill key="e" text={mtg.estado} color={mtg.estadoColor} />,
    <AttendIcon key="s" status={mtg.asistencia} color={mtg.asistColor} />,
    <div key="v">
      <p style={{ margin:'0 0 3px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{mtg.value}</p>
      <Pill text={mtg.priority} color={mtg.prioColor} />
    </div>,
    <div key="ac" style={{ display:'flex', gap:6, alignItems:'center' }}>
      {mtg.hasJoin && (
        <button
          onClick={(e) => { e.stopPropagation(); window.open(mtg.meetingUrl || 'https://meet.google.com', '_blank') }}
          style={{ fontSize:10.5, padding:'4px 9px', background:'#4f46e5', border:'none', borderRadius:7, color:'#fff', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}
        >
          Unirse
        </button>
      )}
      <RowMenu mtg={mtg} onDetail={m => navigate('/reuniones/' + m.id)} onReschedule={setRescheduleTarget} onCancel={setCancelTarget} />
    </div>,
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#080c14', minWidth: 0, overflow: 'hidden' }}>

      {/* header */}
      <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <RiCalendar2Line style={{ width: 20, height: 20, color: '#a78bfa' }} />
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9' }}>Reuniones</h1>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Gestiona todas las reuniones agendadas por tus agentes IA.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowFilters(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: showFilters || filterCount ? '#8b5cf620' : '#0d1117', border: `1px solid ${showFilters || filterCount ? '#8b5cf6' : '#1e2433'}`, borderRadius: 9, padding: '7px 13px', color: showFilters || filterCount ? '#c4b5fd' : '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiFilterLine style={{ width: 13, height: 13 }} /> Filtros{filterCount > 0 && ` (${filterCount})`}
          </button>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiDownloadLine style={{ width: 13, height: 13 }} /> Exportar
          </button>
          <button onClick={() => setShowNewMeeting(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 9, padding: '7px 15px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 18px #4f46e544' }}>
            <RiAddLine style={{ width: 14, height: 14 }} /> Nueva reunión
          </button>
        </div>
      </div>

      {showFilters && (
        <div style={{ margin: '0 24px 14px', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Estado
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }}>
              {MEETING_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Desde
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Hasta
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
          </label>
          {filterCount > 0 && (
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 0' }}>
              <RiCloseLine style={{ width: 13, height: 13 }} /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {showNewMeeting && <NewReunionModal onClose={() => setShowNewMeeting(false)} onSuccess={() => { setShowNewMeeting(false); setRefreshKey(k => k + 1) }} />}

      {rescheduleTarget && (
        <NewReunionModal
          meeting={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => { setRescheduleTarget(null); setRefreshKey(k => k + 1) }}
        />
      )}

      {cancelTarget && (
        <div onClick={() => setCancelTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '24px', width: 360, boxShadow: '0 40px 80px #0009' }}>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>¿Cancelar esta reunión?</p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>Se marcará como cancelada la reunión con {cancelTarget.lead.name}.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCancelTarget(null)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                Volver
              </button>
              <button onClick={handleCancel} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar reunión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── left column ── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
            {kpis.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} />)}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1a2235', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{
                  background: 'none', border: 'none', padding: '7px 13px',
                  fontSize: 12, fontWeight: activeTab === t ? 700 : 400,
                  color: activeTab === t ? '#f1f5f9' : '#4b5563',
                  borderBottom: `2px solid ${activeTab === t ? '#8b5cf6' : 'transparent'}`,
                  cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '6px 11px' }}>
                <RiSearchLine style={{ width: 12, height: 12, color: '#6b7280' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar reuniones…" style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 11.5, width: 130 }} />
              </div>
              <button onClick={() => setShowFilters(v => !v)} style={{ background: showFilters || filterCount ? '#8b5cf620' : '#0d1117', border: `1px solid ${showFilters || filterCount ? '#8b5cf6' : '#1e2433'}`, borderRadius: 9, padding: '6px 9px', color: showFilters || filterCount ? '#c4b5fd' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiFilterLine style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: '#ef444412', border: '1px solid #ef444430', borderRadius: 9, padding: '9px 13px', color: '#ef4444', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span>{error}</span>
              <button onClick={() => setRefreshKey(k => k + 1)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reintentar</button>
            </div>
          )}

          {/* table */}
          <DataTable
            columns={COLS}
            gridTemplate={GRID}
            rows={meetings}
            rowKey="id"
            onSelect={m => navigate('/reuniones/' + m.id)}
            renderRow={renderMeeting}
            style={{ flex: 1, minHeight: 0 }}
          />

          {/* pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{loading ? 'Cargando…' : `Mostrando ${raw.length ? (page - 1) * limit + 1 : 0} a ${Math.min((page - 1) * limit + raw.length, meta.total)} de ${meta.total} reuniones`}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 7px', color: page <= 1 ? '#374151' : '#6b7280', cursor: page <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiArrowLeftSLine style={{ width: 14, height: 14 }} />
              </button>
              <button style={{ background: '#4f46e5', border: '1px solid #4f46e5', borderRadius: 7, padding: '5px 9px', color: '#fff', cursor: 'default', fontSize: 12, fontWeight: 700 }}>{page}</button>
              <span style={{ fontSize: 11, color: '#4b5563' }}>de {meta.totalPages}</span>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 7px', color: page >= meta.totalPages ? '#374151' : '#6b7280', cursor: page >= meta.totalPages ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiArrowRightSLine style={{ width: 14, height: 14 }} />
              </button>
              <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 9px', color: '#6b7280', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                <option value={10}>10 por página</option>
                <option value={25}>25 por página</option>
                <option value={50}>50 por página</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
