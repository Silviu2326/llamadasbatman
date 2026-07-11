import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiFlowChart, RiStarLine,
  RiMailLine, RiAddLine, RiMoreLine,
  RiCloseLine, RiEditLine, RiSearchLine,
  RiMoneyDollarBoxLine, RiSendPlaneLine, RiDeleteBinLine,
} from 'react-icons/ri'
import { HiChevronDown, HiArrowUp, HiArrowDown } from 'react-icons/hi'
import '../dashboard.css'
import NewAutomatizacionModal from '../modals/NewAutomatizacionModal'
import { mapAutomation } from '../lib/automationMapping'
import useClickOutside from '../hooks/useClickOutside'

// ── Data ──────────────────────────────────────────────────────────────────────
// "Conversiones generadas" e "Ingresos atribuidos" se sacaron: no existe ningún
// modelo que vincule una automatización con la conversión/ingreso que produjo,
// mostrar esas etiquetas con datos globales de la org era engañoso (ver
// AUDITORIA_PAGINAS_INCOMPLETAS.md). Quedan solo métricas que sí se pueden medir.
const KPIS = [
  { Icon: RiFlowChart,     iconBg: '#6366f1', color: '#818cf8', label: 'Total automatizaciones', value: '0', sub: '0 activas', subColor: '#4ade80', isCount: true },
  { Icon: RiSendPlaneLine, iconBg: '#f97316', color: '#fb923c', label: 'Ejecuciones totales',    value: '0', sub: 'total acumulado', subColor: '#94a3b8', isCount: true },
  { Icon: RiStarLine,           iconBg: '#8b5cf6', color: '#a78bfa', label: 'Reuniones agendadas (org)', value: '—', sub: 'todas las fuentes, no solo automatizaciones', subColor: '#6b7280', isCount: true },
  { Icon: RiMoneyDollarBoxLine, iconBg: '#f59e0b', color: '#fbbf24', label: 'Pipeline ganado (org)',     value: '—', sub: 'todas las fuentes, no solo automatizaciones', subColor: '#6b7280', isCount: true },
]

const FILTER_TABS = ['Todas', 'Activas', 'Pausadas']
const SORT_OPTIONS = [
  { key: 'recientes',   label: 'Más recientes' },
  { key: 'ejecuciones', label: 'Más ejecuciones' },
  { key: 'nombre',      label: 'Nombre (A-Z)' },
]

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

// ── Main Component ────────────────────────────────────────────────────────────
export default function Automatizaciones() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('Todas')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recientes')
  const [openSort, setOpenSort] = useState(false)
  const sortRef = useRef(null)
  useClickOutside([sortRef], () => setOpenSort(false))
  const [openMenuId, setOpenMenuId] = useState(null)
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
    const totalRuns = automations.reduce((s, a) => s + (a.runsCount ?? 0), 0)
    return [
      { ...KPIS[0], value: String(total), sub: `${active} activas` },
      { ...KPIS[1], value: totalRuns.toLocaleString('es-ES'), sub: 'total acumulado' },
      { ...KPIS[2], value: stats ? (stats.meetingsScheduled ?? 0).toLocaleString('es-ES') : '—' },
      { ...KPIS[3], value: stats ? `€${Math.round(stats.closedWonValue ?? 0).toLocaleString('es-ES')}` : '—' },
    ]
  }, [automations, stats])

  const toggleStatus = (id) => {
    apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' }).catch(() => {})
    setAutomations(prev => prev.map(x => x.id === id ? { ...x, status: x.status === 'activa' ? 'pausada' : 'activa' } : x))
  }

  async function deleteAutomation(id) {
    setOpenMenuId(null)
    if (!window.confirm('¿Eliminar esta automatización? No se puede deshacer.')) return
    const res = await apiFetch(`/api/automations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) setAutomations(prev => prev.filter(x => x.id !== id))
  }

  const filtered = automations
    .filter(a => {
      if (filter === 'Activas')  return a.status === 'activa'
      if (filter === 'Pausadas') return a.status === 'pausada'
      return true
    })
    .filter(a => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    })

  const sorted = [...filtered]
  if (sortBy === 'nombre') sorted.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy === 'ejecuciones') sorted.sort((a, b) => (b.runsCount ?? 0) - (a.runsCount ?? 0))
  // 'recientes' deja el orden que ya devuelve la API (createdAt desc)

  const PER_PAGE = 10
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const paginated = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const sortLabel = SORT_OPTIONS.find(o => o.key === sortBy)?.label

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
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar automatizaciones..."
                style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '8px 12px 8px 32px', color: '#e2e8f0', fontSize: 13, outline: 'none', width: 220 }}
              />
            </div>
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
          <div ref={sortRef} style={{ position: 'relative' }}>
            <button onClick={() => setOpenSort(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 12px', color: '#6b7280', fontSize: 12.5, cursor: 'pointer' }}>
              Ordenar por: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{sortLabel}</span>
              <HiChevronDown style={{ width: 13, height: 13, transform: openSort ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {openSort && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: 6, minWidth: 170, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    onClick={() => { setSortBy(o.key); setOpenSort(false) }}
                    style={{
                      background: sortBy === o.key ? '#1e2433' : 'transparent', border: 'none', borderRadius: 6,
                      padding: '7px 10px', color: sortBy === o.key ? '#fff' : '#cbd5e1', fontSize: 12,
                      fontWeight: sortBy === o.key ? 600 : 400, textAlign: 'left', cursor: 'pointer',
                    }}
                  >{o.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="dark-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 28px 0' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 100px 160px 110px 120px 36px', gap: 0, padding: '8px 16px', borderBottom: '1px solid #1e2433' }}>
            {['Automatización', 'Estado', 'Disparador', 'Ejecuciones', 'Última ejecución', ''].map((h, i) => (
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
                  gridTemplateColumns: '2.4fr 100px 160px 110px 120px 36px',
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
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{a.execs}</p>
                </div>

                {/* Col 5: Última ejecución */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{a.last}</span>
                </div>

                {/* Col 6: More */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenMenuId(v => v === a.id ? null : a.id) }}
                    style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, borderRadius: 6 }}
                  >
                    <RiMoreLine style={{ width: 16, height: 16 }} />
                  </button>
                  {openMenuId === a.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{ position: 'absolute', top: '100%', right: 0, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: 6, minWidth: 140, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 20 }}
                    >
                      <button
                        onClick={() => deleteAutomation(a.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', borderRadius: 6, padding: '7px 10px', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <RiDeleteBinLine style={{ width: 13, height: 13 }} /> Eliminar
                      </button>
                    </div>
                  )}
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
