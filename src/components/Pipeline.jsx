import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  PieChart, Pie, Cell, Tooltip, CartesianGrid,
} from 'recharts'
import {
  RiMoneyDollarBoxLine, RiBriefcaseLine, RiLineChartLine,
  RiPercentLine, RiCalendar2Line, RiPhoneLine, RiCalendarLine,
  RiFilterLine, RiAddLine, RiArrowRightLine,
  RiInformationLine, RiAlertLine, RiGroupLine, RiRocketLine,
  RiLayoutGridLine, RiListCheck2, RiSearchLine, RiCloseLine,
  RiArrowLeftSLine, RiArrowRightSLine,
} from 'react-icons/ri'
import KPICard from './KPICard'
import DataTable from './DataTable'
import '../dashboard.css'
import NewOportunidadModal from '../modals/NewOportunidadModal'

// ─── shared ──────────────────────────────────────────────────────────────────
const card = { background: '#0d1117', border: '1px solid #1e2433', borderRadius: 13 }

const tooltipStyle = {
  contentStyle: { background: 'rgba(10,14,26,0.97)', border: '1px solid #1e2433', borderRadius: 10, fontSize: 12 },
  labelStyle:   { color: '#94a3b8', marginBottom: 4 },
  itemStyle:    { color: '#f1f5f9' },
}

const BG_CYCLE = ['#4f46e5','#0891b2','#7c3aed','#059669','#2563eb','#0d9488']

// ─── static display config (no live data) ────────────────────────────────────
const STAGE_CONFIG = [
  { id:'lead',        label:'Lead',        color:'#7c3aed', Icon:null },
  { id:'qualified',   label:'Calificado',  color:'#2563eb', Icon:RiPhoneLine },
  { id:'proposal',    label:'Propuesta',   color:'#d97706', Icon:null },
  { id:'negotiation', label:'Negociación', color:'#ea580c', Icon:null },
  { id:'closed_won',  label:'Ganado',      color:'#10b981', Icon:null },
  { id:'closed_lost', label:'Perdido',     color:'#6b7280', Icon:null },
]

// KPI_DECO trae solo config visual (icono/color); value y pct salen siempre
// de datos reales del backend (P0-09: sin series ni deltas decorativos).
const KPI_DECO = [
  { Icon: RiMoneyDollarBoxLine, iconBg:'#6d28d9', label:'Valor total del\npipeline',  color:'#a78bfa' },
  { Icon: RiBriefcaseLine,      iconBg:'#0e7490', label:'Oportunidades',              color:'#22d3ee' },
  { Icon: RiLineChartLine,      iconBg:'#1e40af', label:'Valor\nponderado',           color:'#60a5fa' },
  { Icon: RiPercentLine,        iconBg:'#b45309', label:'Tasa de conversión\nglobal', color:'#fbbf24' },
]

const ACTION_DECO = [
  { Icon:RiAlertLine,    color:'#f59e0b', bg:'#f59e0b0c', border:'#f59e0b25' },
  { Icon:RiRocketLine,   color:'#8b5cf6', bg:'#8b5cf60c', border:'#8b5cf625' },
  { Icon:RiCalendarLine, color:'#10b981', bg:'#10b9810c', border:'#10b98125' },
]

// ─── sub-components ───────────────────────────────────────────────────────────
function CompanyLogo({ name, bg }) {
  const w = name.split(' ')
  const initials = (w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, color: '#fff', boxShadow: `0 0 8px ${bg}40`,
    }}>{initials.toUpperCase()}</div>
  )
}

function ScoreGauge({ score, color }) {
  const r = 15, sw = 2.5, size = 36, c = size / 2
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1a2235" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f1f5f9' }}>{score}</span>
      </div>
    </div>
  )
}

function OppCard({ opp, stageColor, onClick, onDragStart, onDragEnd, isDragging }) {
  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: '#0a0e18', border: '1px solid #1e2433', borderRadius: 10,
        padding: '9px 9px', display: 'flex', flexDirection: 'column', gap: 7, cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
      }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <CompanyLogo name={opp.company} bg={opp.bg} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.company}</p>
          <p style={{ margin: 0, fontSize: 9.5, color: '#4b5563' }}>{opp.city}</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.3 }}>{opp.value}</p>
          <p style={{ margin: 0, fontSize: 8.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.3 }}>Lead Score</p>
        </div>
        {opp.score !== null && <ScoreGauge score={opp.score} color={stageColor} />}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 9.5, padding: '2px 7px', borderRadius: 20, fontWeight: 700,
          background: `${stageColor}15`, border: `1px solid ${stageColor}28`, color: stageColor,
          whiteSpace: 'nowrap',
        }}>{opp.badge}</span>
        <span style={{ fontSize: 9.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{opp.date}</span>
      </div>
    </div>
  )
}

function KanbanColumn({ stage, opps, onSelect, draggingId, onDragStartCard, onDragEndCard, onDropCard }) {
  const [expanded, setExpanded] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const allOpps = opps.filter(o => o.stage === stage.id)
  const VISIBLE = 3
  const visible = expanded ? allOpps : allOpps.slice(0, VISIBLE)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDropCard?.(stage.id, e) }}
      style={{
        minWidth: 163, width: 163, display: 'flex', flexDirection: 'column',
        background: dragOver ? '#0d1424' : '#090d18',
        border: dragOver ? `1px solid ${stage.color}` : '1px solid #1a2235',
        borderRadius: 13,
        borderTop: `3px solid ${stage.color}`, flexShrink: 0,
        transition: 'background 0.12s, border-color 0.12s',
      }}>
      <div style={{ padding: '11px 11px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{stage.label}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${stage.color}20`, color: stage.color }}>{stage.count}</span>
          {stage.Icon && <stage.Icon style={{ width: 11, height: 11, color: '#4b5563', marginLeft: 'auto' }} />}
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{stage.value}</span>
      </div>

      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {visible.map((opp, i) => (
          <OppCard
            key={opp.id ?? i}
            opp={opp}
            stageColor={stage.color}
            onClick={() => onSelect?.(opp)}
            isDragging={draggingId === opp.id}
            onDragStart={(e) => onDragStartCard?.(opp, e)}
            onDragEnd={() => onDragEndCard?.()}
          />
        ))}
      </div>

      <div style={{ padding: '8px 11px 11px', marginTop: 6, borderTop: '1px solid #1a2235' }}>
        <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', color: stage.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          {expanded ? 'Ver menos' : `+ ${Math.max(0, allOpps.length - VISIBLE)} más`}
        </button>
      </div>
    </div>
  )
}

// ─── right panel ─────────────────────────────────────────────────────────────
function ConversionFunnel({ funnelData }) {
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Conversión por etapa</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {funnelData.map(({ label, pct, count, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 88, height: 10, borderRadius: 3, background: '#1a2235', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, boxShadow: `0 0 6px ${color}40` }} />
            </div>
            <span style={{ fontSize: 9.5, color: '#94a3b8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <span style={{ fontSize: 9.5, color: '#f1f5f9', fontWeight: 600 }}>{pct}%</span>
            <span style={{ fontSize: 9.5, color: '#4b5563' }}>({count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutPanel({ donutData, totalValue }) {
  const D = 148
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Valor del pipeline por etapa</h3>
      <div style={{ position: 'relative', width: D, height: D, margin: '0 auto 8px' }}>
        <PieChart width={D} height={D}>
          <Pie data={donutData} cx={D/2} cy={D/2} innerRadius={44} outerRadius={66}
            dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
            {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle}
            formatter={(v, n, p) => [`€${(v/1000).toFixed(1)}k`, p.payload.name]} />
        </PieChart>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            {totalValue > 0 ? `€${(totalValue/1000).toFixed(0)}k` : '—'}
          </div>
          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>Total</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {donutData.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0, boxShadow: `0 0 5px ${d.color}` }} />
            <span style={{ flex: 1, fontSize: 10, color: '#94a3b8' }}>{d.name}</span>
            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>€{(d.value/1000).toFixed(1)}k</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PredictionPanel({ prediction }) {
  const totalFmt = prediction.total > 0
    ? `€${prediction.total.toLocaleString('es-ES')}`
    : '—'
  const weeks = prediction.weeks ?? []
  const maxVal = Math.max(...weeks.map(w => w.value), 1)
  const domain = [0, Math.ceil(maxVal * 1.2)]
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Predicción de cierre (próx. 30 días)</h3>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5, marginBottom: 2 }}>{totalFmt}</div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#6b7280' }}>Valor ponderado por probabilidad</span>
      </div>
      {weeks.length > 0 ? (
        <ResponsiveContainer width="100%" height={85}>
          <AreaChart data={weeks} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a2235" vertical={false} />
            <XAxis dataKey="date" tick={{ fill:'#6b7280', fontSize:8 }} axisLine={false} tickLine={false} />
            <YAxis domain={domain} tickFormatter={v => `€${v}k`}
              tick={{ fill:'#6b7280', fontSize:8 }} axisLine={false} tickLine={false} width={34} />
            <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={v => [`€${v}k`, 'Predicción']} />
            <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2.5}
              fill="url(#predGrad)" dot={{ r:3, fill:'#8b5cf6', stroke:'#080c14', strokeWidth:2 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ fontSize: 10.5, color: '#4b5563', margin: 0 }}>Añade fechas de cierre esperadas a tus oportunidades para ver la predicción.</p>
      )}
    </div>
  )
}

// OP-107: forecast real (commit / best case / pipeline ponderado), agrupado
// por moneda tal y como lo devuelve GET /api/pipeline/forecast — sin
// convertir divisas, cada bloque de moneda se muestra por separado.
function ForecastPanel({ forecast }) {
  const currencies = Object.keys(forecast)
  const fmt = (cur, v) => `${cur} ${Math.round(v).toLocaleString('es-ES')}`

  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Forecast</h3>
      {currencies.length === 0 ? (
        <p style={{ fontSize: 10.5, color: '#4b5563', margin: 0 }}>No hay oportunidades abiertas para calcular el forecast.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {currencies.map(cur => {
            const f = forecast[cur]
            const rows = [
              { label: 'Pipeline total',    value: f.pipeline,         color: '#7c3aed' },
              { label: 'Pipeline ponderado', value: f.weightedPipeline, color: '#2563eb' },
              { label: 'Best case',         value: f.bestCase,         color: '#f59e0b' },
              { label: 'Commit',            value: f.commit,           color: '#10b981' },
            ]
            return (
              <div key={cur}>
                {currencies.length > 1 && (
                  <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{cur}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rows.map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#94a3b8' }}>
                        <i style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, flexShrink: 0, boxShadow: `0 0 5px ${r.color}` }} />
                        {r.label}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#f1f5f9' }}>{fmt(cur, r.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InsightsPanel({ insights }) {
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Insights IA</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: `${ins.color}15`, border: `1px solid ${ins.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RiInformationLine style={{ width: 13, height: 13, color: ins.color }} />
            </div>
            <p style={{ margin: 0, fontSize: 10.5, color: '#94a3b8', lineHeight: 1.5 }}>{ins.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
function OppDetailPanel({ opp, onClose }) {
  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(320px,100vw)', background: '#0d1117', borderLeft: '1px solid #1e2433', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px #0009' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e2433', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Oportunidad</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: opp.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {opp.company.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{opp.company}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{opp.city}</p>
          </div>
        </div>
        {[
          { label: 'Valor', value: opp.value },
          { label: 'Etapa', value: opp.badge },
          { label: 'Fecha', value: opp.date },
          { label: 'Lead Score', value: opp.score !== null ? `${opp.score} / 100` : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #111827' }}>
            <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── OP-103: vista de lista ──────────────────────────────────────────────────
const LIST_SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Más recientes' },
  { value: 'createdAt:asc', label: 'Más antiguas' },
  { value: 'expectedCloseDate:asc', label: 'Cierre más próximo' },
  { value: 'value:desc', label: 'Valor (mayor a menor)' },
  { value: 'name:asc', label: 'Nombre (A-Z)' },
]

const STAGE_LABEL = Object.fromEntries(STAGE_CONFIG.map(s => [s.id, s.label]))
const STAGE_COLOR = Object.fromEntries(STAGE_CONFIG.map(s => [s.id, s.color]))

const LIST_GRID = '1.7fr 1fr 0.9fr 0.9fr 1fr 1fr'
const LIST_COLS = ['Oportunidad', 'Etapa', 'Valor', 'Probabilidad', 'Propietario', 'Cierre estimado']

function PipelineListView({ onSelect }) {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [closeFrom, setCloseFrom] = useState('')
  const [closeTo, setCloseTo] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [sort, setSort] = useState('createdAt:desc')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, stageFilter, ownerFilter, closeFrom, closeTo, sourceFilter, sort, limit])

  useEffect(() => {
    apiFetch('/api/leads/owners').then(r => r.ok ? r.json() : []).then(setOwners).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), limit: String(limit), sort })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (stageFilter) params.set('stage', stageFilter)
    if (ownerFilter) params.set('ownerId', ownerFilter)
    if (closeFrom) params.set('closeFrom', closeFrom)
    if (closeTo) params.set('closeTo', closeTo)
    if (sourceFilter) params.set('source', sourceFilter)
    apiFetch(`/api/pipeline/list?${params.toString()}`)
      .then(r => { if (!r.ok) throw new Error('list'); return r.json() })
      .then(data => {
        if (!active) return
        setRows(Array.isArray(data?.data) ? data.data : [])
        setMeta({ total: data.total ?? 0, totalPages: data.totalPages ?? 1 })
      })
      .catch(() => { if (active) setError('No se pudieron cargar las oportunidades.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, limit, debouncedSearch, stageFilter, ownerFilter, closeFrom, closeTo, sourceFilter, sort])

  const filterCount = (stageFilter?1:0) + (ownerFilter?1:0) + (closeFrom?1:0) + (closeTo?1:0) + (sourceFilter?1:0)

  function clearFilters() {
    setStageFilter(''); setOwnerFilter(''); setCloseFrom(''); setCloseTo(''); setSourceFilter('')
  }

  const renderRow = (opp) => {
    const stageColor = STAGE_COLOR[opp.stage] || '#6366f1'
    return [
      <div key="n" style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.name}</p>
        <p style={{ margin: 0, fontSize: 10.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.lead?.name ?? '—'}{opp.account?.name ? ` · ${opp.account.name}` : ''}</p>
      </div>,
      <span key="s" style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, background: `${stageColor}15`, border: `1px solid ${stageColor}28`, color: stageColor, whiteSpace: 'nowrap' }}>
        {STAGE_LABEL[opp.stage] ?? opp.stage}
      </span>,
      <span key="v" style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
        {opp.value != null ? `${opp.currency ?? 'EUR'} ${Number(opp.value).toLocaleString('es-ES')}` : '—'}
      </span>,
      <span key="p" style={{ fontSize: 11.5, color: '#94a3b8' }}>{opp.probability ?? 0}%</span>,
      <span key="o" style={{ fontSize: 11.5, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.assignee?.name ?? '—'}</span>,
      <span key="c" style={{ fontSize: 11.5, color: '#94a3b8' }}>
        {opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString('es-ES') : '—'}
      </span>,
    ]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '6px 11px' }}>
          <RiSearchLine style={{ width: 12, height: 12, color: '#6b7280' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar oportunidades…" style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 11.5, width: 160 }} />
        </div>
        <button onClick={() => setShowFilters(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: showFilters || filterCount ? '#8b5cf620' : '#0d1117', border: `1px solid ${showFilters || filterCount ? '#8b5cf6' : '#1e2433'}`, borderRadius: 9, padding: '7px 13px', color: showFilters || filterCount ? '#c4b5fd' : '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          <RiFilterLine style={{ width: 13, height: 13 }} /> Filtros{filterCount > 0 && ` (${filterCount})`}
        </button>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 10px', color: '#94a3b8', fontSize: 12, cursor: 'pointer', outline: 'none', marginLeft: 'auto' }}>
          {LIST_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {showFilters && (
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Etapa
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }}>
              <option value="">Cualquier etapa</option>
              {STAGE_CONFIG.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Propietario
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }}>
              <option value="">Cualquier propietario</option>
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Origen del lead
            <input value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} placeholder="Ej. meta_ads" style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none', width: 120 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Cierre desde
            <input type="date" value={closeFrom} onChange={e => setCloseFrom(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6b7280' }}>
            Cierre hasta
            <input type="date" value={closeTo} onChange={e => setCloseTo(e.target.value)} style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 7, padding: '6px 9px', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
          </label>
          {filterCount > 0 && (
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 0' }}>
              <RiCloseLine style={{ width: 13, height: 13 }} /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: '#ef444412', border: '1px solid #ef444430', borderRadius: 9, padding: '9px 13px', color: '#ef4444', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>{error}</span>
        </div>
      )}

      <DataTable
        columns={LIST_COLS}
        gridTemplate={LIST_GRID}
        rows={rows}
        rowKey="id"
        onSelect={opp => onSelect(opp.id)}
        renderRow={renderRow}
        emptyText={loading ? 'Cargando…' : 'No hay oportunidades que coincidan con los filtros.'}
        style={{ flex: 1, minHeight: 0 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{loading ? 'Cargando…' : `Mostrando ${rows.length ? (page - 1) * limit + 1 : 0} a ${Math.min((page - 1) * limit + rows.length, meta.total)} de ${meta.total} oportunidades`}</span>
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
  )
}

export default function Pipeline() {
  const navigate = useNavigate()
  const [showNewOpp, setShowNewOpp] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // OP-103: toggle Kanban / Lista — la lista usa su propio fetch server-side
  // (PipelineListView), el kanban sigue usando el agrupado por etapa de abajo.
  const [view, setView] = useState('kanban')

  const [opps, setOpps]         = useState([])
  const [stages, setStages]     = useState(STAGE_CONFIG.map(s => ({ ...s, count: 0, value: '€0' })))
  const [kpis, setKpis]         = useState(KPI_DECO.map(k => ({ ...k, value: '—', pct: null })))
  const [funnelData, setFunnel] = useState([])
  const [donutData, setDonut]   = useState([])
  const [totalValue, setTotalValue]   = useState(0)
  const [insights, setInsights]       = useState([])
  const [prediction, setPrediction]   = useState({ total: 0, weeks: [] })
  const [forecast, setForecast]       = useState({})
  const [acciones, setAcciones]       = useState([])
  const [draggingId, setDraggingId]   = useState(null)
  const [dragError, setDragError]     = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch('/api/pipeline/insights').then(r => r.json()),
      apiFetch('/api/pipeline/prediction').then(r => r.json()),
      apiFetch('/api/pipeline/actions').then(r => r.json()),
      // OP-107: forecast real (commit/best case/pipeline) — ver ForecastPanel.
      apiFetch('/api/pipeline/forecast').then(r => r.json()),
    ]).then(([ins, pred, acts, fc]) => {
      setInsights(ins)
      setPrediction(pred)
      setAcciones(acts)
      setForecast(fc && typeof fc === 'object' ? fc : {})
    }).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    apiFetch('/api/pipeline').then(r => r.json()).then(data => {
      // Build flat opps list
      const flat = STAGE_CONFIG.flatMap(({ id, label }) =>
        (data[id] ?? []).map((o, i) => ({
          id: o.id,
          stage: id,
          company: o.lead?.company ?? o.name,
          city: o.lead?.city ?? '',
          value: o.value ? `€${Number(o.value).toLocaleString('es-ES')}` : '—',
          score: o.probability ?? null,
          badge: label,
          date: new Date(o.createdAt).toLocaleDateString('es-ES'),
          bg: BG_CYCLE[i % BG_CYCLE.length],
        }))
      )
      setOpps(flat)

      // Stage counts and totals
      const builtStages = STAGE_CONFIG.map(cfg => {
        const items = data[cfg.id] ?? []
        const total = items.reduce((s, o) => s + (Number(o.value) || 0), 0)
        return { ...cfg, count: items.length, value: `€${total.toLocaleString('es-ES')}` }
      })
      setStages(builtStages)

      // KPI aggregates
      const all = STAGE_CONFIG.flatMap(({ id }) => data[id] ?? [])
      const tv = all.reduce((s, o) => s + (Number(o.value) || 0), 0)
      const wv = all.reduce((s, o) => s + (Number(o.value) || 0) * ((o.probability || 0) / 100), 0)
      const won = (data.closed_won ?? []).length
      const lost = (data.closed_lost ?? []).length
      const conv = (won + lost) > 0 ? ((won / (won + lost)) * 100).toFixed(1) : '—'
      setTotalValue(tv)
      // Sin endpoint de histórico semanal todavía: no se muestra "pct" (P0-09,
      // ningún fallback positivo). Cuando exista una fuente real, se recalcula aquí.
      setKpis([
        { ...KPI_DECO[0], value: `€${tv.toLocaleString('es-ES')}`, pct: null },
        { ...KPI_DECO[1], value: String(all.length), pct: null },
        { ...KPI_DECO[2], value: `€${Math.round(wv).toLocaleString('es-ES')}`, pct: null },
        { ...KPI_DECO[3], value: conv === '—' ? '—' : `${conv}%`, pct: null },
      ])

      // Funnel (relative to max stage count)
      const maxCount = Math.max(...STAGE_CONFIG.map(s => (data[s.id] ?? []).length), 1)
      setFunnel(STAGE_CONFIG.map(cfg => ({
        label: cfg.label,
        count: (data[cfg.id] ?? []).length,
        pct: Math.round((data[cfg.id] ?? []).length / maxCount * 1000) / 10,
        color: cfg.color,
      })))

      // Donut (active pipeline only)
      setDonut(STAGE_CONFIG
        .filter(s => s.id !== 'closed_lost')
        .map(cfg => {
          const val = (data[cfg.id] ?? []).reduce((s, o) => s + (Number(o.value) || 0), 0)
          return { name: cfg.label, value: val, color: cfg.color }
        })
        .filter(d => d.value > 0)
      )
    }).catch(() => {})
  }, [refreshKey])

  function handleDragStartCard(opp, e) {
    setDraggingId(opp.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', opp.id)
  }

  function handleDragEndCard() {
    setDraggingId(null)
  }

  async function handleDropCard(targetStageId, e) {
    const oppId = e.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    if (!oppId) return

    const opp = opps.find(o => o.id === oppId)
    if (!opp || opp.stage === targetStageId) return

    let reason
    if (targetStageId === 'closed_lost') {
      reason = window.prompt('Motivo de la pérdida (obligatorio):')
      if (!reason || !reason.trim()) return
      reason = reason.trim()
    }

    const previousStage = opp.stage
    setDragError('')
    setOpps(prev => prev.map(o => (o.id === oppId ? { ...o, stage: targetStageId } : o)))

    try {
      const res = await apiFetch(`/api/pipeline/${oppId}/move-stage`, {
        method: 'POST',
        body: JSON.stringify({ toStage: targetStageId, ...(reason ? { reason } : {}) }),
      })
      if (!res.ok) {
        let msg = 'No se pudo mover la oportunidad.'
        try { const body = await res.json(); if (body?.error) msg = body.error } catch {}
        throw new Error(msg)
      }
      setRefreshKey(k => k + 1)
    } catch (err) {
      setOpps(prev => prev.map(o => (o.id === oppId ? { ...o, stage: previousStage } : o)))
      setDragError(err.message || 'No se pudo mover la oportunidad. Intenta de nuevo.')
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#080c14', minWidth: 0, overflow: 'hidden' }}>

      {/* header */}
      <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9' }}>Pipeline</h1>
            <span style={{ color: '#8b5cf6', fontSize: 16 }}>✦</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Visualiza y gestiona tu pipeline de ventas impulsado por IA.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* OP-103: toggle Kanban / Lista */}
          <div style={{ display: 'flex', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: 2, gap: 2 }}>
            <button
              onClick={() => setView('kanban')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 7, padding: '6px 11px',
                background: view === 'kanban' ? '#4f46e5' : 'transparent', color: view === 'kanban' ? '#fff' : '#94a3b8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <RiLayoutGridLine style={{ width: 13, height: 13 }} /> Kanban
            </button>
            <button
              onClick={() => setView('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 7, padding: '6px 11px',
                background: view === 'list' ? '#4f46e5' : 'transparent', color: view === 'list' ? '#fff' : '#94a3b8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <RiListCheck2 style={{ width: 13, height: 13 }} /> Lista
            </button>
          </div>
          <button onClick={() => setShowNewOpp(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 9, padding: '7px 15px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 18px #4f46e544' }}>
            <RiAddLine style={{ width: 14, height: 14 }} /> Nueva oportunidad
          </button>
        </div>
      </div>

      {showNewOpp && <NewOportunidadModal onClose={() => setShowNewOpp(false)} onSuccess={() => { setShowNewOpp(false); setRefreshKey(k => k + 1) }} />}

      {dragError && (
        <div style={{
          margin: '0 24px', padding: '9px 14px', borderRadius: 9,
          background: '#7f1d1d20', border: '1px solid #ef444440', color: '#fca5a5',
          fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0,
        }}>
          <span>{dragError}</span>
          <button onClick={() => setDragError('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── left scrollable ── */}
        <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
            {kpis.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} />)}
          </div>

          {/* Kanban board / Lista (OP-103) */}
          {view === 'kanban' ? (
            <div className="dark-scroll" style={{ overflowX: 'auto', paddingBottom: 6 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {stages.map(stage => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    opps={opps}
                    onSelect={opp => navigate('/pipeline/' + opp.id)}
                    draggingId={draggingId}
                    onDragStartCard={handleDragStartCard}
                    onDragEndCard={handleDragEndCard}
                    onDropCard={handleDropCard}
                  />
                ))}
              </div>
            </div>
          ) : (
            <PipelineListView onSelect={id => navigate('/pipeline/' + id)} />
          )}

          {/* Acciones recomendadas */}
          {acciones.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Acciones recomendadas por IA</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                {acciones.map((a, i) => {
                  const deco = ACTION_DECO[i] ?? ACTION_DECO[0]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: deco.bg, border: `1px solid ${deco.border}`, borderRadius: 13, padding: '16px 18px' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `${deco.color}20`, border: `1px solid ${deco.color}38`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <deco.Icon style={{ width: 20, height: 20, color: deco.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{a.title}</p>
                        <p style={{ margin: '0 0 7px', fontSize: 11.5, color: '#6b7280' }}>{a.desc}</p>
                        <button onClick={() => navigate(a.url)} style={{ background: 'none', border: 'none', color: deco.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {a.cta} <RiArrowRightLine style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── right panel ── */}
        <div className="dark-scroll" style={{ width: 255, flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid #1e2433', padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ConversionFunnel funnelData={funnelData} />
          <DonutPanel donutData={donutData} totalValue={totalValue} />
          <ForecastPanel forecast={forecast} />
          <PredictionPanel prediction={prediction} />
          <InsightsPanel insights={insights} />
        </div>
      </div>
    </div>
  )
}
