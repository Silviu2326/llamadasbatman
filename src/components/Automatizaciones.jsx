import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts'
import {
  RiFlowChart, RiRobot2Line, RiPhoneLine, RiCalendarLine,
  RiGroupLine, RiShoppingCart2Line, RiBarChartLine,
  RiMailLine, RiTimeLine, RiAddLine, RiMoreLine,
  RiCloseLine, RiEditLine, RiSearchLine, RiFilterLine,
  RiStarLine, RiMoneyDollarBoxLine, RiSendPlaneLine,
  RiUserAddLine, RiLightbulbFlashLine,
} from 'react-icons/ri'
import { HiChevronDown, HiArrowUp, HiArrowDown } from 'react-icons/hi'
import '../dashboard.css'
import NewAutomatizacionModal from '../modals/NewAutomatizacionModal'

// ── Data ──────────────────────────────────────────────────────────────────────
const KPIS = [
  { Icon: RiFlowChart,          iconBg: '#6366f1', color: '#818cf8', label: 'Total automatizaciones', value: '28',        sub: '16 activas',         subColor: '#4ade80', isCount: true },
  { Icon: RiSendPlaneLine,      iconBg: '#f97316', color: '#fb923c', label: 'Ejecuciones (este mes)', value: '12.458',    pct: '24.7', note: 'vs. mes anterior' },
  { Icon: RiStarLine,           iconBg: '#8b5cf6', color: '#a78bfa', label: 'Conversiones generadas', value: '1.248',     pct: '18.3', note: 'vs. mes anterior' },
  { Icon: RiMoneyDollarBoxLine, iconBg: '#f59e0b', color: '#fbbf24', label: 'Ingresos atribuidos',    value: '€245.800',  pct: '27.6', note: 'vs. mes anterior' },
  { Icon: RiTimeLine,           iconBg: '#06b6d4', color: '#22d3ee', label: 'Ahorro de tiempo',        value: '342h',      pct: '31.2', note: 'vs. mes ant' },
]

export const AUTOMATIONS = [
  {
    id: 1,
    Icon: RiPhoneLine,          iconBg: '#6366f1', iconColor: '#818cf8',
    name: 'Seguimiento post llamada',
    desc: 'Envía un SMS + Email automático después de cada llamada para agendar reunión.',
    tags: ['Llamadas', 'Reuniones'],
    status: 'activa',
    TriggerIcon: RiPhoneLine,   trigger: 'Llamada\ncompletada',
    execs: '1.823', execDelta: '+18.2%', execUp: true,
    convs: '234',   convRate: '12.8%',
    rev: '€45.600', revDelta: '+24.1%', revUp: true,
    last: 'Hoy, 09:32',
  },
  {
    id: 2,
    Icon: RiMailLine,           iconBg: '#8b5cf6', iconColor: '#a78bfa',
    name: 'Nurturing de leads fríos',
    desc: 'Secuencia multicanal de 5 toques para reactivar leads sin actividad.',
    tags: ['Leads', 'Email'],
    status: 'activa',
    TriggerIcon: RiGroupLine,   trigger: 'Lead sin actividad\n> 7 días',
    execs: '2.341', execDelta: '+32.4%', execUp: true,
    convs: '156',   convRate: '6.7%',
    rev: '€28.900', revDelta: '+15.3%', revUp: true,
    last: 'Hoy, 08:15',
  },
  {
    id: 3,
    Icon: RiCalendarLine,       iconBg: '#10b981', iconColor: '#34d399',
    name: 'Recordatorio de reunión',
    desc: 'Envía recordatorios automáticos antes de la reunión para reducir no-shows.',
    tags: ['Reuniones', 'Recordatorios'],
    status: 'activa',
    TriggerIcon: RiCalendarLine, trigger: 'Reunión agendada\n24h antes',
    execs: '3.128', execDelta: '+21.1%', execUp: true,
    convs: '412',   convRate: '15.2%',
    rev: '€67.800', revDelta: '+19.8%', revUp: true,
    last: 'Hoy, 07:45',
  },
  {
    id: 4,
    Icon: RiShoppingCart2Line,  iconBg: '#f97316', iconColor: '#fb923c',
    name: 'Cierre de oportunidades',
    desc: 'Secuencia de seguimiento inteligente para mover oportunidades al cierre.',
    tags: ['Pipeline', 'Ventas'],
    status: 'activa',
    TriggerIcon: RiTimeLine,    trigger: 'Oportunidad en etapa\n"Propuesta" > 3 días',
    execs: '892',   execDelta: '+16.7%', execUp: true,
    convs: '89',    convRate: '10.0%',
    rev: '€38.200', revDelta: '+22.5%', revUp: true,
    last: 'Ayer, 18:22',
  },
  {
    id: 5,
    Icon: RiRobot2Line,         iconBg: '#8b5cf6', iconColor: '#a78bfa',
    name: 'Calificación automática',
    desc: 'Agente IA llama y califica nuevos leads entrantes automáticamente.',
    tags: ['Leads', 'AI Agent'],
    status: 'activa',
    TriggerIcon: RiUserAddLine, trigger: 'Nuevo lead\ncreado',
    execs: '4.567', execDelta: '+28.9%', execUp: true,
    convs: '567',   convRate: '12.4%',
    rev: '€34.700', revDelta: '+26.2%', revUp: true,
    last: 'Ayer, 16:50',
  },
  {
    id: 6,
    Icon: RiBarChartLine,       iconBg: '#fb7185', iconColor: '#fda4af',
    name: 'Reactivación de inactivos',
    desc: 'Detecta leads inactivos y lanza campaña personalizada de reactivación.',
    tags: ['Leads', 'Reactivación'],
    status: 'pausada',
    TriggerIcon: RiGroupLine,   trigger: 'Lead sin actividad\n> 30 días',
    execs: '654',   execDelta: '-4.2%', execUp: false,
    convs: '45',    convRate: '6.9%',
    rev: '€12.600', revDelta: '-3.1%', revUp: false,
    last: '12 may, 14:32',
  },
]

const CHART_DATA = [
  { day: '12 may', v: 380 },
  { day: '13 may', v: 490 },
  { day: '14 may', v: 420 },
  { day: '15 may', v: 590 },
  { day: '16 may', v: 540 },
  { day: '17 may', v: 800 },
  { day: '18 may', v: 990 },
]

const ACCIONES = [
  { Icon: RiMailLine,    iconBg: '#6366f1', iconColor: '#818cf8', title: 'Enviar SMS inmediato',   sub: 'Plantilla: Seguimiento post llamada' },
  { Icon: RiTimeLine,   iconBg: '#f97316', iconColor: '#fb923c', title: 'Esperar 1 hora',          sub: 'Retraso' },
  { Icon: RiMailLine,   iconBg: '#10b981', iconColor: '#34d399', title: 'Enviar Email',            sub: 'Plantilla: Agendar reunión' },
  { Icon: RiCalendarLine, iconBg: '#6366f1', iconColor: '#818cf8', title: 'Crear tarea',           sub: 'Asignar seguimiento al equipo' },
]

// ─── Backend mapping ───────────────────────────────────────────────────────────
const AUTO_ICONS  = [RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine]
const AUTO_BG     = ['#6366f1','#8b5cf6','#10b981','#f97316','#8b5cf6','#fb7185']
const AUTO_COLOR  = ['#818cf8','#a78bfa','#34d399','#fb923c','#a78bfa','#fda4af']

function mapAutomation(a, i) {
  const t = a.trigger && typeof a.trigger === 'object' ? a.trigger : {}
  const triggerLabel = t.event ?? t.type ?? String(a.trigger ?? '—')
  return {
    id: a.id,
    Icon: AUTO_ICONS[i % AUTO_ICONS.length],
    iconBg: AUTO_BG[i % AUTO_BG.length],
    iconColor: AUTO_COLOR[i % AUTO_COLOR.length],
    name: a.name,
    desc: a.description ?? '',
    tags: Array.isArray(a.tags) ? a.tags : [],
    status: a.isActive ? 'activa' : 'pausada',
    TriggerIcon: RiFlowChart,
    trigger: triggerLabel,
    _runsCount: a.runsCount ?? 0,
    execs: (a.runsCount ?? 0).toLocaleString('es-ES'),
    execDelta: '—', execUp: true,
    convs: '—', convRate: '—',
    rev: '—', revDelta: '—', revUp: true,
    last: a.lastRunAt
      ? new Date(a.lastRunAt).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—',
  }
}

const FILTER_TABS = ['Todas', 'Activas', 'Pausadas', 'Borradores']
const DETAIL_TABS = ['Resumen', 'Flujo', 'Historial', 'Configuración']

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ Icon, iconBg, color, label, value, pct, note, sub, subColor, isCount }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 0', minWidth: 0, padding: '14px 16px',
        background: hov ? '#0f1520' : '#0d1117',
        border: `1px solid ${hov ? iconBg + '60' : '#1e2433'}`,
        borderRadius: 14, cursor: 'default',
        boxShadow: hov ? `0 0 28px ${iconBg}20` : 'none',
        transition: 'all .22s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(145deg, ${iconBg}55 0%, ${iconBg}25 100%)`,
          border: `1px solid ${iconBg}55`,
          boxShadow: `0 0 14px ${iconBg}40, inset 0 1px 0 ${iconBg}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 14, height: 14, color }} />
        </div>
        <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
      </div>
      <p style={{ margin: '0 0 5px', fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>{value}</p>
      {isCount
        ? <span style={{ fontSize: 10.5, color: subColor, fontWeight: 700 }}>{sub}</span>
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <HiArrowUp style={{ width: 10, height: 10, color: '#4ade80' }} />
            <span style={{ fontSize: 10.5, color: '#4ade80', fontWeight: 700 }}>{pct}%</span>
            <span style={{ fontSize: 9.5, color: '#4b5563' }}>{note}</span>
          </div>
        )
      }
    </div>
  )
}

function Toggle({ active }) {
  return (
    <div style={{ width: 36, height: 20, borderRadius: 10, background: active ? '#10b981' : '#374151', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: active ? 18 : 2, transition: 'left .2s', boxShadow: '0 1px 3px #0004' }} />
    </div>
  )
}

function Delta({ v, up }) {
  const c = up ? '#4ade80' : '#f87171'
  const Arr = up ? HiArrowUp : HiArrowDown
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Arr style={{ width: 9, height: 9, color: c }} />
      <span style={{ fontSize: 10, color: c, fontWeight: 700 }}>{v.replace(/^[+-]/, '')}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Automatizaciones() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('Todas')
  const [page, setPage] = useState(1)
  const [showNewAutomation, setShowNewAutomation] = useState(false)
  const [automations, setAutomations] = useState([])
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/automations')
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : []
        setAutomations(arr.map(mapAutomation))
      })
      .catch(() => {})
  }, [refreshKey])

  const kpiList = useMemo(() => {
    const total = automations.length
    const active = automations.filter(a => a.status === 'activa').length
    const totalRuns = automations.reduce((s, a) => s + (a._runsCount ?? 0), 0)
    return [
      { ...KPIS[0], value: String(total), sub: `${active} activas` },
      { ...KPIS[1], value: totalRuns.toLocaleString('es-ES'), sub: 'total acumulado', subColor: '#94a3b8', isCount: true },
      { ...KPIS[2], value: stats ? (stats.meetingsScheduled ?? 0).toLocaleString('es-ES') : '—', pct: stats?.kpiPcts?.meetings ?? 0, note: 'vs. mes anterior' },
      { ...KPIS[3], value: stats ? `€${Math.round(stats.closedWonValue ?? 0).toLocaleString('es-ES')}` : '—', pct: stats?.kpiPcts?.pipeline ?? 0, note: 'vs. mes anterior' },
      { ...KPIS[4], value: '—', sub: 'Sin datos', subColor: '#4b5563', isCount: true },
    ]
  }, [automations, stats])

  const toggleStatus = (id) => {
    apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' }).catch(() => {})
    setAutomations(prev => prev.map(x => x.id === id ? { ...x, status: x.status === 'activa' ? 'pausada' : 'activa' } : x))
  }

  const filtered = automations.filter(a => {
    if (filter === 'Activas')    return a.status === 'activa'
    if (filter === 'Pausadas')   return a.status === 'pausada'
    if (filter === 'Borradores') return false
    return true
  })
  const PER_PAGE = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              Automatizaciones <span style={{ color: '#8b5cf6', fontSize: 20 }}>✦</span>
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>Crea flujos inteligentes que trabajan 24/7 para impulsar conversaciones y cerrar más ventas.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <RiSearchLine style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4b5563', width: 14, height: 14 }} />
              <input
                placeholder="Buscar automatizaciones..."
                style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '8px 12px 8px 32px', color: '#9ca3af', fontSize: 13, outline: 'none', width: 220 }}
              />
            </div>
            {/* Filtros */}
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '8px 14px', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
              <RiFilterLine style={{ width: 14, height: 14 }} />
              Filtros
            </button>
            {/* Nueva */}
            <button onClick={() => setShowNewAutomation(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', borderRadius: 10, padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f145' }}>
              <RiAddLine style={{ width: 16, height: 16 }} />
              Nueva automatización
              <HiChevronDown style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {showNewAutomation && <NewAutomatizacionModal onClose={() => setShowNewAutomation(false)} onSuccess={() => { setShowNewAutomation(false); setRefreshKey(k => k + 1) }} />}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, padding: '0 24px 20px', flexShrink: 0 }}>
          {kpiList.map((k, i) => <StatCard key={i} {...k} />)}
        </div>

        {/* Filter tabs + sort */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTER_TABS.map(f => {
              const active = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 500,
                    background: active ? 'linear-gradient(135deg, #6366f122, #8b5cf622)' : 'transparent',
                    color: active ? '#a78bfa' : '#6b7280',
                    boxShadow: active ? 'inset 0 0 0 1px #8b5cf640' : 'none',
                    transition: 'all .15s',
                  }}
                >{f}</button>
              )
            })}
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 12px', color: '#6b7280', fontSize: 12.5, cursor: 'pointer' }}>
            Ordenar por: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Más recientes</span>
            <HiChevronDown style={{ width: 13, height: 13 }} />
          </button>
        </div>

        {/* Table */}
        <div className="dark-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 28px 0' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 100px 160px 110px 100px 110px 120px 36px', gap: 0, padding: '8px 16px', borderBottom: '1px solid #1e2433' }}>
            {['Automatización', 'Estado', 'Disparador', 'Ejecuciones', 'Conversiones', 'Ingresos', 'Última ejecución', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 11, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
            ))}
          </div>

          {/* Empty state */}
          {paginated.length === 0 && (
            <p style={{ padding: '40px 0', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
              Sin automatizaciones{filter !== 'Todas' ? ` ${filter.toLowerCase()}` : ''}
            </p>
          )}

          {/* Rows */}
          {paginated.map((a, idx) => {
            const isActive = a.status === 'activa'
            return (
              <div
                key={idx}
                onClick={() => navigate('/automatizaciones/' + a.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.4fr 100px 160px 110px 100px 110px 120px 36px',
                  gap: 0, padding: '14px 16px',
                  borderBottom: '1px solid #1e2433',
                  background: 'transparent',
                  borderLeft: '3px solid transparent',
                  cursor: 'pointer', transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0a0f1a')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Col 1: Name + desc + tags */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `linear-gradient(145deg, ${a.iconBg}55, ${a.iconBg}25)`, border: `1px solid ${a.iconBg}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px ${a.iconBg}35` }}>
                    <a.Icon style={{ width: 17, height: 17, color: a.iconColor }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: '#f1f5f9' }}>{a.name}</p>
                    <p style={{ margin: '0 0 6px', fontSize: 11.5, color: '#4b5563', lineHeight: 1.4 }}>{a.desc}</p>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {a.tags.map(t => (
                        <span key={t} style={{ fontSize: 10.5, color: '#6b7280', background: '#1e2433', border: '1px solid #2a3245', borderRadius: 5, padding: '1px 7px', fontWeight: 500 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Col 2: Status */}
                <div onClick={e => { e.stopPropagation(); toggleStatus(a.id) }} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  {a.status === 'activa' ? (
                    <>
                      <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Activa</span>
                      <Toggle active />
                    </>
                  ) : (
                    <>
                      <Toggle active={false} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#f59e0b', fontWeight: 600, background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 6, padding: '3px 8px' }}>
                        Pausada
                        <span style={{ background: '#f59e0b', color: '#000', borderRadius: 4, padding: '0 3px', fontSize: 9.5, fontWeight: 800 }}>!!</span>
                      </span>
                    </>
                  )}
                </div>

                {/* Col 3: Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <a.TriggerIcon style={{ width: 13, height: 13, color: '#6b7280' }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: '#9ca3af', lineHeight: 1.35, whiteSpace: 'pre-line' }}>{a.trigger}</span>
                </div>

                {/* Col 4: Ejecuciones */}
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{a.execs}</p>
                  <Delta v={a.execDelta} up={a.execUp} />
                </div>

                {/* Col 5: Conversiones */}
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{a.convs}</p>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{a.convRate}</span>
                </div>

                {/* Col 6: Ingresos */}
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{a.rev}</p>
                  <Delta v={a.revDelta} up={a.revUp} />
                </div>

                {/* Col 7: Última ejecución */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{a.last}</span>
                </div>

                {/* Col 8: More */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, borderRadius: 6 }} onClick={e => e.stopPropagation()}>
                    <RiMoreLine style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px 20px', borderTop: '1px solid #1e2433', flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: '#4b5563' }}>
            Mostrando {filtered.length === 0 ? 0 : Math.min((page-1)*PER_PAGE+1, filtered.length)} a {Math.min(page*PER_PAGE, filtered.length)} de {filtered.length} automatizaciones
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={pageBtn(false)}>
              <HiChevronDown style={{ width: 13, height: 13, transform: 'rotate(90deg)' }} />
            </button>
            {[page-1, page, page+1].filter(n => n >= 1 && n <= totalPages).map(n => (
              <button key={n} onClick={() => setPage(n)} style={pageBtn(n === page)}>{n}</button>
            ))}
            {page + 1 < totalPages && (
              <>
                <button style={pageBtn(false)}>…</button>
                <button onClick={() => setPage(totalPages)} style={pageBtn(false)}>{totalPages}</button>
              </>
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={pageBtn(false)}>
              <HiChevronDown style={{ width: 13, height: 13, transform: 'rotate(-90deg)' }} />
            </button>
          </div>
          <span style={{ fontSize: 12.5, color: '#4b5563' }}>{PER_PAGE} por página</span>
        </div>
      </div>

      {/* ── Right Panel ── */}
      {false && (
        <div style={{ width: 340, flexShrink: 0, background: '#0d1117', borderLeft: '1px solid #1e2433', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel Header */}
          <div style={{ padding: '18px 18px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#f1f5f9' }}>{auto.name}</span>
                <span style={{ fontSize: 11, background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>Activa</span>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4 }}>
                <RiCloseLine style={{ width: 18, height: 18 }} />
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e2433' }}>
              {DETAIL_TABS.map(t => {
                const active = detailTab === t
                return (
                  <button key={t} onClick={() => setDetailTab(t)} style={{ background: 'transparent', border: 'none', borderBottom: active ? '2px solid #8b5cf6' : '2px solid transparent', padding: '8px 12px', fontSize: 12.5, color: active ? '#a78bfa' : '#4b5563', cursor: 'pointer', fontWeight: active ? 600 : 500, marginBottom: -1, transition: 'all .15s' }}>{t}</button>
                )
              })}
            </div>
          </div>

          {/* Panel Body */}
          <div className="dark-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>{auto.desc}</p>

            {/* Rendimiento */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#e2e8f0' }}>Rendimiento</span>
                <button style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: '1px solid #1e2433', borderRadius: 6, padding: '3px 8px', color: '#6b7280', fontSize: 11.5, cursor: 'pointer' }}>
                  Este mes <HiChevronDown style={{ width: 11, height: 11 }} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Ejecuciones',       value: '1.823',   delta: '+18.2%', up: true },
                  { label: 'Conversiones',       value: '234',     delta: '+12.8%', up: true },
                  { label: 'Tasa de conversión', value: '12.8%',   delta: '+2.1pp', up: true },
                  { label: 'Ingresos atribuidos',value: '€45.600', delta: '+24.1%', up: true },
                ].map((m, i) => (
                  <div key={i} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{ margin: '0 0 3px', fontSize: 10.5, color: '#4b5563' }}>{m.label}</p>
                    <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{m.value}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <HiArrowUp style={{ width: 9, height: 9, color: '#4ade80' }} />
                      <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>{m.delta.replace('+', '')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div style={{ height: 120, marginBottom: 18, background: '#080c14', border: '1px solid #1e2433', borderRadius: 10, padding: '10px 8px 4px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CHART_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#374151' }} axisLine={false} tickLine={false} />
                  <YAxis ticks={[0, 250, 500, 750, 1000]} tick={{ fontSize: 9, fill: '#374151' }} axisLine={false} tickLine={false} tickFormatter={v => v === 1000 ? '1k' : v === 0 ? '0' : v} />
                  <Area type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={2} fill="url(#pg)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Disparador */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Disparador</p>
              <div style={{ display: 'flex', gap: 10, background: '#080c14', border: '1px solid #1e2433', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: '#6366f125', border: '1px solid #6366f145', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RiPhoneLine style={{ width: 15, height: 15, color: '#818cf8' }} />
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Llamada completada</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Se ejecuta cuando una llamada tiene estado "Completada".</p>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Acciones (4)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ACCIONES.map((ac, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, background: '#080c14', border: '1px solid #1e2433', borderRadius: 10, padding: '10px 12px', alignItems: 'center' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${ac.iconBg}25`, border: `1px solid ${ac.iconBg}45`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ac.Icon style={{ width: 14, height: 14, color: ac.iconColor }} />
                    </div>
                    <div>
                      <p style={{ margin: '0 0 1px', fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{ac.title}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{ac.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Panel Footer */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #1e2433', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowNewAutomation(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f140' }}>
              <RiEditLine style={{ width: 14, height: 14 }} />
              Editar automatización
            </button>
            <button style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '10px 12px', color: '#6b7280', cursor: 'pointer' }}>
              <RiMoreLine style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function pageBtn(active) {
  return {
    width: 30, height: 30, borderRadius: 7, border: active ? '1px solid #8b5cf6' : '1px solid #1e2433',
    background: active ? '#8b5cf620' : 'transparent', color: active ? '#a78bfa' : '#6b7280',
    fontSize: 12.5, fontWeight: active ? 700 : 400, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
