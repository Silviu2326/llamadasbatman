import React, { useState } from 'react'
// ponytail: recharts PieChart removed — pure SVG donuts below
import {
  RiAddLine, RiSearchLine, RiFilterLine, RiCalendar2Line,
  RiRobot2Line, RiShoppingCart2Line, RiGroupLine, RiBriefcaseLine,
  RiBook2Line, RiBarChartLine, RiSendPlaneLine, RiArrowRightLine,
  RiPhoneLine, RiCalendarLine, RiPercentLine, RiMoneyDollarBoxLine,
  RiMoreLine, RiCloseLine, RiCheckLine, RiDatabase2Line, RiTimeLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import KPICard from './KPICard'
import DataTable from './DataTable'

// ─── Data ─────────────────────────────────────────────────────────────────────
const CAMPAIGNS = [
  {
    id: 1, nombre: 'Demo SaaS Empresas', sub: 'Software empresarial B2B',
    grad: ['#4f46e5', '#7c3aed'], Icon: RiRobot2Line, status: 'activa',
    kpis: {
      llamadas:   { fmt: '842',      delta: '+12.3%', up: true,  spark: [60,65,62,70,68,78,84] },
      leads:      { fmt: '356',      delta: '+15.7%', up: true,  spark: [22,28,25,32,30,38,35] },
      reuniones:  { fmt: '98',       delta: '+18.3%', up: true,  spark: [7,9,8,10,9,12,11]    },
      conversion: { fmt: '11,6%',    delta: '+2.1pp', up: true,  spark: [9.5,10,10.2,10.8,11,11.4,11.6], v: 11.6 },
      ingresos:   { fmt: '€45.230',  delta: '+28.4%', up: true,  spark: [30,35,33,40,38,44,42] },
    },
  },
  {
    id: 2, nombre: 'E-commerce Q2', sub: 'Tiendas online',
    grad: ['#ea580c', '#f97316'], Icon: RiShoppingCart2Line, status: 'activa',
    kpis: {
      llamadas:   { fmt: '621',     delta: '+8.1%',  up: true,  spark: [50,54,52,58,55,62,60] },
      leads:      { fmt: '289',     delta: '+10.2%', up: true,  spark: [22,24,23,26,25,28,27] },
      reuniones:  { fmt: '76',      delta: '+15.1%', up: true,  spark: [6,7,6,7,7,8,7]       },
      conversion: { fmt: '12,2%',   delta: '+1.8pp', up: true,  spark: [10.5,11,10.8,11.5,11.8,12,12.2], v: 12.2 },
      ingresos:   { fmt: '€28.470', delta: '+24.7%', up: true,  spark: [20,22,21,24,23,27,26] },
    },
  },
  {
    id: 3, nombre: 'Salud & Clínicas', sub: 'Sector salud',
    grad: ['#d97706', '#f59e0b'], Icon: RiGroupLine, status: 'pausada',
    kpis: {
      llamadas:   { fmt: '312',     delta: '-4.3%',  up: false, spark: [38,36,34,33,32,31,30] },
      leads:      { fmt: '128',     delta: '-2.1%',  up: false, spark: [14,13,13,13,12,12,12] },
      reuniones:  { fmt: '32',      delta: '-6.2%',  up: false, spark: [4,4,3,4,3,3,3]       },
      conversion: { fmt: '10,3%',   delta: '-0.8pp', up: false, spark: [11.2,11,10.8,10.6,10.5,10.4,10.3], v: 10.3 },
      ingresos:   { fmt: '€12.680', delta: '-8.1%',  up: false, spark: [16,15,14,14,13,13,12] },
    },
  },
  {
    id: 4, nombre: 'Servicios Financieros', sub: 'Banca y seguros',
    grad: ['#1d4ed8', '#3b82f6'], Icon: RiBriefcaseLine, status: 'activa',
    kpis: {
      llamadas:   { fmt: '489',     delta: '+15.6%', up: true,  spark: [38,42,40,46,44,50,48] },
      leads:      { fmt: '203',     delta: '+18.8%', up: true,  spark: [15,17,16,19,18,21,20] },
      reuniones:  { fmt: '54',      delta: '+20.4%', up: true,  spark: [4,5,4,5,5,6,5]       },
      conversion: { fmt: '11,0%',   delta: '+2.3pp', up: true,  spark: [8.8,9.2,9,9.8,10.2,10.8,11], v: 11.0 },
      ingresos:   { fmt: '€18.950', delta: '+26.3%', up: true,  spark: [14,15,15,17,17,19,18] },
    },
  },
  {
    id: 5, nombre: 'Educación Online', sub: 'Plataformas educativas',
    grad: ['#7c3aed', '#a855f7'], Icon: RiBook2Line, status: 'borrador',
    kpis: {
      llamadas:   { fmt: '0',  delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
      leads:      { fmt: '0',  delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
      reuniones:  { fmt: '0',  delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
      conversion: { fmt: '0%', delta: '—', up: true, spark: [0,0,0,0,0,0,0], v: 0 },
      ingresos:   { fmt: '€0', delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
    },
  },
  {
    id: 6, nombre: 'Industria & Manufactura', sub: 'Manufactura B2B',
    grad: ['#0284c7', '#0ea5e9'], Icon: RiBarChartLine, status: 'activa',
    kpis: {
      llamadas:   { fmt: '583',     delta: '+9.7%',  up: true,  spark: [48,52,50,56,54,58,57] },
      leads:      { fmt: '245',     delta: '+12.9%', up: true,  spark: [19,21,20,23,22,24,24] },
      reuniones:  { fmt: '62',      delta: '+16.2%', up: true,  spark: [5,5,5,6,6,6,6]       },
      conversion: { fmt: '10,6%',   delta: '+1.6pp', up: true,  spark: [9,9.4,9.2,10,9.8,10.4,10.6], v: 10.6 },
      ingresos:   { fmt: '€16.420', delta: '+21.1%', up: true,  spark: [12,13,13,14,14,16,15] },
    },
  },
  {
    id: 7, nombre: 'SaaS Startup', sub: 'Startups y scaleups',
    grad: ['#dc2626', '#ec4899'], Icon: RiSendPlaneLine, status: 'completada',
    kpis: {
      llamadas:   { fmt: '256',    delta: '+3.2%',  up: true,  spark: [22,23,23,24,24,25,25] },
      leads:      { fmt: '94',     delta: '+4.5%',  up: true,  spark: [8,9,8,9,9,9,9]       },
      reuniones:  { fmt: '20',     delta: '+2.1%',  up: true,  spark: [2,2,2,2,2,2,2]       },
      conversion: { fmt: '7,8%',   delta: '-0.3pp', up: false, spark: [8.2,8,7.9,7.8,7.8,7.9,7.8], v: 7.8 },
      ingresos:   { fmt: '€5.670', delta: '+5.3%',  up: true,  spark: [5,5,5,5,5,5,5]       },
    },
  },
]

const KPI_TOP = [
  { Icon: RiPhoneLine,          iconBg: '#4338ca', label: 'Llamadas realizadas', value: '2.847',   pct: 18.6, color: '#818cf8',
    data: [55,62,48,70,65,78,60,82,74,90,85,88,80,95,92,100,88,105,112,120] },
  { Icon: RiGroupLine,          iconBg: '#047857', label: 'Leads generados',      value: '1.248',   pct: 15.3, color: '#34d399',
    data: [40,50,45,58,52,62,55,68,60,72,65,75,70,78,72,82,76,85,80,90] },
  { Icon: RiCalendarLine,       iconBg: '#6d28d9', label: 'Reuniones agendadas',  value: '342',     pct: 22.1, color: '#a78bfa',
    data: [20,28,22,35,28,40,32,45,38,50,42,55,48,52,50,58,54,62,56,65] },
  { Icon: RiPercentLine,        iconBg: '#b45309', label: 'Tasa de conversión',   value: '12,0%',   pct: 3.2,  color: '#fbbf24',
    data: [60,55,68,62,72,66,75,68,78,72,76,80,74,82,78,85,80,83,80,87] },
  { Icon: RiMoneyDollarBoxLine, iconBg: '#0e7490', label: 'Ingresos atribuidos',  value: '€98.750', pct: 32.2, color: '#22d3ee',
    data: [45,55,48,65,58,72,62,78,68,82,74,88,78,92,84,96,88,100,92,105] },
]

const CANAL_DATA = [
  { name: 'Llamadas en frío', pct: 42, value: 1194, color: '#3b82f6' },
  { name: 'LinkedIn',          pct: 28, value: 797,  color: '#10b981' },
  { name: 'Email',             pct: 17, value: 484,  color: '#8b5cf6' },
  { name: 'Referidos',         pct: 8,  value: 228,  color: '#f59e0b' },
  { name: 'Otros',             pct: 5,  value: 144,  color: '#06b6d4' },
]

const STATUS_STYLE = {
  activa:     { text: '#10b981', dot: '#10b981', label: 'Activa'     },
  pausada:    { text: '#f59e0b', dot: '#f59e0b', label: 'Pausada'    },
  borrador:   { text: '#60a5fa', dot: '#60a5fa', label: 'Borrador'   },
  completada: { text: '#a78bfa', dot: '#a78bfa', label: 'Completada' },
}


// ─── Tiny SVG sparkline ───────────────────────────────────────────────────────
function TinySpark({ data, color }) {
  const w = 54, h = 14
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  if (data.every(v => v === 0)) return <div style={{ height: 14 }} />
  return (
    <svg width={w} height={h} style={{ display: 'block', marginTop: 3 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={4} strokeOpacity={0.15}
        strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.borrador
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, boxShadow: `0 0 6px ${s.dot}80`, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: s.text }}>{s.label}</span>
    </div>
  )
}

// ─── Cell metric (value + delta + spark) ─────────────────────────────────────
function CellMetric({ kpi, color }) {
  const isZero = kpi.fmt === '0' || kpi.fmt === '0%' || kpi.fmt === '€0'
  const isDash = kpi.delta === '—'
  return (
    <div>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: isZero ? '#374151' : '#ffffff', letterSpacing: -0.2 }}>
        {kpi.fmt}
      </p>
      <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 600,
        color: isDash ? '#374151' : kpi.up ? '#4ade80' : '#f87171' }}>
        {kpi.delta}
      </p>
      {!isZero && <TinySpark data={kpi.spark} color={color} />}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
const COLS = '1fr 90px 100px 88px 88px 96px 102px 82px'
const CAM_COLS = [
  'Campaña', 'Estado',
  { label: '↑ Llamadas', color: '#818cf8' },
  'Leads', 'Reuniones',
  { label: '↑ Conversión', color: '#818cf8' },
  'Ingresos', 'Acciones',
]

function renderCampaign(c) {
  return [
    <div key="n" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${c.grad[0]}, ${c.grad[1]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 12px ${c.grad[0]}35`,
      }}>
        <c.Icon style={{ width: 17, height: 17, color: 'rgba(255,255,255,0.9)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</p>
      </div>
    </div>,
    <StatusBadge key="s" status={c.status} />,
    <CellMetric key="ll" kpi={c.kpis.llamadas}   color="#60a5fa" />,
    <CellMetric key="le" kpi={c.kpis.leads}      color="#34d399" />,
    <CellMetric key="r"  kpi={c.kpis.reuniones}  color="#a78bfa" />,
    <CellMetric key="cv" kpi={c.kpis.conversion} color="#fbbf24" />,
    <CellMetric key="in" kpi={c.kpis.ingresos}   color="#22d3ee" />,
    <div key="ac" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <button style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #1e2433', background: '#111827', color: c.status === 'borrador' ? '#94a3b8' : '#f1f5f9', fontSize: 11.5, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {c.status === 'borrador' ? 'Editar' : 'Ver'}
      </button>
      <button style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #1e2433', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
        <RiMoreLine style={{ width: 13, height: 13 }} />
      </button>
    </div>,
  ]
}

// ─── SVG donut — pure, no recharts ───────────────────────────────────────────
function NeonDonut({ data, size = 128, centerValue, centerLabel }) {
  const cx = size / 2, cy = size / 2
  const r = size * 0.375
  const sw = size * 0.135
  const C = 2 * Math.PI * r
  const GAP = (3 / 360) * C
  let cumAngle = -90
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2433" strokeWidth={sw} />
        {data.map((d, i) => {
          const dash = Math.max(0, (d.pct / 100) * C - GAP)
          const rot = cumAngle
          cumAngle += (d.pct / 100) * 360
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={sw - 1}
              strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
              style={{
                transform: `rotate(${rot}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                filter: `drop-shadow(0 0 6px ${d.color}90)`,
              }}
            />
          )
        })}
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none',
      }}>
        <p style={{ margin: 0, fontSize: size * 0.135, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -0.5 }}>
          {centerValue}
        </p>
        <p style={{ margin: '3px 0 0', fontSize: size * 0.072, color: '#6b7280' }}>{centerLabel}</p>
      </div>
    </div>
  )
}

// ─── SVG half-gauge — pure, no recharts ──────────────────────────────────────
function HalfGauge({ data, size = 128, centerValue, centerLabel }) {
  const cx = size / 2, cy = size / 2
  const r = (size / 2) * 0.80
  const sw = size * 0.135
  const GAP_DEG = 4
  const total = data.reduce((s, d) => s + d.value, 0)

  function pt(p) {
    const rad = (180 + p * 180) * Math.PI / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  function arc(p0, p1) {
    const [x0, y0] = pt(p0), [x1, y1] = pt(p1)
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }

  const gapFrac = GAP_DEG / 180
  let cumP = 0
  const segments = data.map((d, i) => {
    const segP = d.value / total
    const p0 = cumP + (i === 0 ? 0 : gapFrac / 2)
    const p1 = Math.min(cumP + segP - (i === data.length - 1 ? 0 : gapFrac / 2), 1)
    cumP += segP
    return { ...d, p0, p1: Math.max(p1, p0 + 0.001) }
  })

  const [tx0, ty0] = pt(0), [tx1, ty1] = pt(1)
  const trackD = `M ${tx0.toFixed(2)} ${ty0.toFixed(2)} A ${r} ${r} 0 0 1 ${tx1.toFixed(2)} ${ty1.toFixed(2)}`

  return (
    <div style={{ position: 'relative', width: size, height: size * 0.54 + sw, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <path d={trackD} fill="none" stroke="#1e2433" strokeWidth={sw} strokeLinecap="round" />
        {segments.map((s, i) => (
          <path key={i} d={arc(s.p0, s.p1)} fill="none" stroke={s.color} strokeWidth={sw}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${s.color}90)` }}
          />
        ))}
      </svg>
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        <p style={{ margin: 0, fontSize: size * 0.16, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{centerValue}</p>
        <p style={{ margin: '2px 0 0', fontSize: size * 0.08, color: '#6b7280' }}>{centerLabel}</p>
      </div>
    </div>
  )
}

// ─── Right panel: Rendimiento por canal ──────────────────────────────────────
function CanalDonut() {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Rendimiento por canal</h3>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          background: '#111827', border: '1px solid #1e2433', borderRadius: 7,
          padding: '4px 8px', color: '#6b7280', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          Por llamadas <HiChevronDown style={{ width: 10, height: 10 }} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NeonDonut data={CANAL_DATA} size={124} centerValue="2.847" centerLabel="Llamadas" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {CANAL_DATA.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0, boxShadow: `0 0 5px ${d.color}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p>
                <p style={{ margin: 0, fontSize: 10, color: '#4b5563' }}>{d.pct}% ({d.value.toLocaleString('es-ES')})</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Right panel: Estado gauge ────────────────────────────────────────────────
function EstadoGauge({ campaigns }) {
  const counts = {
    activa:     campaigns.filter(c => c.status === 'activa').length,
    pausada:    campaigns.filter(c => c.status === 'pausada').length,
    borrador:   campaigns.filter(c => c.status === 'borrador').length,
    completada: campaigns.filter(c => c.status === 'completada').length,
  }
  const gaugeData = [
    { name: 'Activas',     value: counts.activa     || 0.01, color: '#10b981' },
    { name: 'Pausadas',    value: counts.pausada    || 0.01, color: '#f59e0b' },
    { name: 'Borrador',    value: counts.borrador   || 0.01, color: '#94a3b8' },
    { name: 'Completadas', value: counts.completada || 0.01, color: '#8b5cf6' },
  ]
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px 15px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#fff' }}>Estado de campañas</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <HalfGauge data={gaugeData} size={118} centerValue={counts.activa} centerLabel="Activas" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[
            { label: 'Activas',     count: counts.activa,     color: '#10b981' },
            { label: 'Pausadas',    count: counts.pausada,    color: '#f59e0b' },
            { label: 'Borrador',    count: counts.borrador,   color: '#94a3b8' },
            { label: 'Completadas', count: counts.completada, color: '#8b5cf6' },
          ].map(d => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0, boxShadow: `0 0 5px ${d.color}80` }} />
              <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1 }}>{d.count} {d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Right panel: Top por conversión ─────────────────────────────────────────
const MEDALS = [
  { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', glow: '#f59e0b70', text: '#fff' },
  { bg: 'linear-gradient(135deg,#94a3b8,#64748b)', glow: '#94a3b870', text: '#fff' },
  { bg: 'linear-gradient(135deg,#cd7c2f,#92400e)', glow: '#cd7c2f70', text: '#fff' },
]

function TopConversion({ campaigns }) {
  const sorted = [...campaigns]
    .filter(c => c.status !== 'borrador' && c.kpis.conversion.v > 0)
    .sort((a, b) => b.kpis.conversion.v - a.kpis.conversion.v)
    .slice(0, 5)
  const maxV = Math.max(...sorted.map(c => c.kpis.conversion.v)) || 1

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Top campañas por conversión</h3>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
          background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap',
        }}>
          Conversión <HiChevronDown style={{ width: 10, height: 10 }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((c, i) => {
          const medal = MEDALS[i]
          const barColor = c.grad[0]
          const pct = (c.kpis.conversion.v / maxV) * 100
          const isTop = i === 0

          return (
            <div key={c.id} style={{
              background: isTop ? `${c.grad[0]}0a` : 'transparent',
              border: isTop ? `1px solid ${c.grad[0]}25` : '1px solid transparent',
              borderRadius: 10, padding: isTop ? '8px 10px' : '0',
            }}>
              {/* Row: medal + name + sparkline + value */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                {/* Medal / rank badge */}
                {medal ? (
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: medal.bg, boxShadow: `0 0 8px ${medal.glow}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>{i + 1}</span>
                  </div>
                ) : (
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: '#111827',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#4b5563' }}>{i + 1}</span>
                  </div>
                )}

                {/* Campaign name */}
                <span style={{
                  fontSize: isTop ? 12 : 11, fontWeight: isTop ? 600 : 400,
                  color: isTop ? '#f1f5f9' : '#94a3b8',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                }}>
                  {c.nombre}
                </span>

                {/* Mini trend sparkline */}
                <TinySpark data={c.kpis.conversion.spark} color={barColor} />

                {/* Conversion value */}
                <span style={{
                  fontSize: isTop ? 13 : 11.5, fontWeight: 700,
                  color: isTop ? '#4ade80' : '#6b7280',
                  flexShrink: 0, minWidth: 36, textAlign: 'right',
                }}>
                  {c.kpis.conversion.fmt}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                height: isTop ? 6 : 4, borderRadius: 99,
                background: '#111827', overflow: 'hidden',
                marginLeft: 28,
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%', borderRadius: 99,
                  background: `linear-gradient(90deg, ${c.grad[0]}, ${c.grad[1]})`,
                  boxShadow: isTop ? `0 0 8px ${barColor}70` : 'none',
                }} />
              </div>

              {/* Delta label — solo para #1 */}
              {isTop && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>
                    {c.kpis.conversion.delta}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid #111827', marginTop: 14, paddingTop: 10 }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
          cursor: 'pointer', color: '#818cf8', fontSize: 12, fontWeight: 600, padding: 0,
        }}>
          Ver reporte completo <RiArrowRightLine style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  )
}

// ─── Nueva campaña modal ──────────────────────────────────────────────────────
const OBJECTIVES = [
  { label: 'Recuperación de leads',   color: '#3b82f6', Icon: RiGroupLine      },
  { label: 'Agendado de demos',        color: '#10b981', Icon: RiCalendarLine   },
  { label: 'Reconfirmación de citas',  color: '#8b5cf6', Icon: RiCalendar2Line  },
  { label: 'Renovaciones',             color: '#f59e0b', Icon: RiBarChartLine   },
  { label: 'Reactivación',             color: '#06b6d4', Icon: RiSendPlaneLine  },
]
const AGENTS_LIST = [
  { name: 'Sofía Martínez', initials: 'SM', bg: '#4f46e5' },
  { name: 'Carlos Gómez',   initials: 'CG', bg: '#0891b2' },
  { name: 'María López',    initials: 'ML', bg: '#7c3aed' },
  { name: 'Javier Ruiz',    initials: 'JR', bg: '#0d9488' },
]

function NewCampaignModal({ onClose, onAdd }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ nombre: '', objective: null, agente: null, dias: ['L','M','X','J','V'], inicio: '09:00', fin: '18:00' })
  const STEPS = ['Objetivo', 'Configuración', 'Horarios', 'Targets']
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function launch() {
    onAdd({
      id: Date.now(),
      nombre: form.nombre || 'Nueva campaña',
      sub: form.objective !== null ? OBJECTIVES[form.objective].label : 'Sin objetivo',
      grad: form.objective !== null ? [OBJECTIVES[form.objective].color, OBJECTIVES[form.objective].color + 'cc'] : ['#4b5563', '#374151'],
      Icon: form.objective !== null ? OBJECTIVES[form.objective].Icon : RiSendPlaneLine,
      status: 'borrador',
      kpis: {
        llamadas:   { fmt: '0', delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
        leads:      { fmt: '0', delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
        reuniones:  { fmt: '0', delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
        conversion: { fmt: '0%', delta: '—', up: true, spark: [0,0,0,0,0,0,0], v: 0 },
        ingresos:   { fmt: '€0', delta: '—', up: true, spark: [0,0,0,0,0,0,0] },
      },
    })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.88)', backdropFilter: 'blur(10px)',
    }} onClick={onClose}>
      <div style={{
        width: 520, maxHeight: '86vh', background: '#0d1117',
        border: '1px solid #1e2433', borderRadius: 18, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,0.85)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #1a2235' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f1f5f9' }}>Nueva campaña</h2>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#374151' }}>Configura tu campaña de llamadas IA</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #1e2433', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            <RiCloseLine style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 24px', borderBottom: '1px solid #111827' }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <button onClick={() => setStep(i)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: step === i ? '#1e2433' : 'transparent',
                color: step === i ? '#818cf8' : step > i ? '#34d399' : '#4b5563',
                fontSize: 12, fontWeight: step === i ? 700 : 500, transition: 'all .15s',
              }}>
                <span style={{
                  width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                  background: step === i ? '#4f46e5' : step > i ? '#10b981' : '#1a2235', color: 'white',
                }}>{step > i ? '✓' : i + 1}</span>
                {s}
              </button>
              {i < STEPS.length - 1 && <div style={{ width: 18, height: 1, background: '#1a2235' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {step === 0 && (
            <div>
              <input placeholder="Nombre de la campaña" value={form.nombre} onChange={e => upd('nombre', e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: '#080c14', border: '1px solid #1e2433', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#4b5563' }}>Selecciona el objetivo</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {OBJECTIVES.map((obj, i) => {
                  const sel = form.objective === i
                  return (
                    <button key={i} onClick={() => upd('objective', i)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      background: sel ? obj.color + '12' : '#080c14', border: `1px solid ${sel ? obj.color + '45' : '#1e2433'}`,
                      boxShadow: sel ? `0 0 16px ${obj.color}18` : 'none', transition: 'all .15s', width: '100%', textAlign: 'left',
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: obj.color + '20', border: `1px solid ${obj.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <obj.Icon style={{ width: 16, height: 16, color: obj.color }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? '#f1f5f9' : '#6b7280', flex: 1 }}>{obj.label}</span>
                      {sel && <RiCheckLine style={{ width: 14, height: 14, color: obj.color }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Agente IA</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {AGENTS_LIST.map((a, i) => {
                    const sel = form.agente === i
                    return (
                      <button key={i} onClick={() => upd('agente', i)} style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                        background: sel ? a.bg + '12' : '#080c14', border: `1px solid ${sel ? a.bg + '45' : '#1e2433'}`, transition: 'all .15s',
                      }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: 'white', boxShadow: sel ? `0 0 10px ${a.bg}55` : 'none' }}>{a.initials}</div>
                        <span style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? '#f1f5f9' : '#6b7280' }}>{a.name}</span>
                        {sel && <RiCheckLine style={{ width: 12, height: 12, color: '#10b981', marginLeft: 'auto' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Base de datos</p>
                <div style={{ border: '2px dashed #1a2235', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#080c14' }}>
                  <RiDatabase2Line style={{ width: 22, height: 22, color: '#374151', margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>Subir CSV de leads</p>
                  <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#374151' }}>o conectar CRM existente</p>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                  {['Salesforce', 'HubSpot', 'Pipedrive'].map(crm => (
                    <button key={crm} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #1e2433', background: '#080c14', color: '#4b5563', fontSize: 11, cursor: 'pointer' }}>{crm}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Días de llamada</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['L','M','X','J','V','S','D'].map(d => {
                    const sel = form.dias.includes(d)
                    return (
                      <button key={d} onClick={() => upd('dias', sel ? form.dias.filter(x => x !== d) : [...form.dias, d])} style={{
                        width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                        background: sel ? '#4f46e5' : '#080c14', border: `1px solid ${sel ? '#4f46e5' : '#1e2433'}`,
                        color: sel ? 'white' : '#4b5563', fontSize: 12, fontWeight: 600,
                        boxShadow: sel ? '0 0 12px #4f46e550' : 'none', transition: 'all .15s',
                      }}>{d}</button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['inicio','Hora inicio'],['fin','Hora fin']].map(([k, label]) => (
                  <div key={k}>
                    <p style={{ margin: '0 0 7px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{label}</p>
                    <input type="time" value={form[k]} onChange={e => upd(k, e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: '#080c14', border: '1px solid #1e2433', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#4f46e510', border: '1px solid #4f46e528' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#818cf8', fontWeight: 600 }}>Zona horaria: Madrid (CET/CEST) · Normativa LSSI</p>
                <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#374151' }}>Los reintentos automáticos respetan el horario configurado.</p>
              </div>
            </div>
          )}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#4b5563' }}>Define objetivos para monitorear el rendimiento en tiempo real.</p>
              {[['targetLlamadas','Target de llamadas','#60a5fa','Ej: 500'],['targetConversion','Conversión objetivo (%)','#fbbf24','Ej: 15'],['targetPipeline','Pipeline objetivo (€)','#22d3ee','Ej: 50000']].map(([k, label, color, ph]) => (
                <div key={k}>
                  <p style={{ margin: '0 0 7px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{label}</p>
                  <input placeholder={ph} value={form[k] ?? ''} onChange={e => upd(k, e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 9, background: '#080c14', border: `1px solid ${color}28`, color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid #1a2235', background: '#080c14' }}>
          <button onClick={() => step > 0 ? setStep(s => s - 1) : onClose()} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#6b7280', fontSize: 12.5, cursor: 'pointer' }}>
            {step > 0 ? '← Anterior' : 'Cancelar'}
          </button>
          <button onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : launch()} style={{
            padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
            color: 'white', fontSize: 13, fontWeight: 700, boxShadow: '0 0 18px #4f46e540',
          }}>
            {step < STEPS.length - 1 ? 'Siguiente →' : 'Lanzar campaña'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(CAMPAIGNS)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = campaigns.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: '#080c14', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>Campañas</h1>
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
              <path d="M1 8h3l2-6 4 12 2-8 1 3h6" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#4b5563' }}>
            Gestiona y monitorea el rendimiento de todas tus campañas activas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 14px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            12 may 2024 – 18 may 2024 <HiChevronDown style={{ width: 12, height: 12 }} />
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiFilterLine style={{ width: 13, height: 13 }} />
            Filtros
          </button>
          <button onClick={() => setShowModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
            border: 'none', borderRadius: 9, padding: '7px 15px',
            color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 18px #4f46e540',
          }}>
            <RiAddLine style={{ width: 14, height: 14 }} />
            Nueva campaña
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <div style={{ display: 'flex', gap: 12 }}>
        {KPI_TOP.map((k, i) => <KPICard key={i} {...k} />)}
      </div>

      {/* Content row */}
      <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>

        {/* Main table */}
        <div style={{ flex: 1, minWidth: 0, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, overflow: 'hidden' }}>

          {/* Table toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1a2235' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Todas las campañas</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#080c14', border: '1px solid #1a2235', borderRadius: 8, padding: '5px 11px' }}>
                <RiSearchLine style={{ width: 12, height: 12, color: '#374151', flexShrink: 0 }} />
                <input placeholder="Buscar campaña..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 12, width: 130 }} />
              </div>
              <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#080c14', border: '1px solid #1a2235', borderRadius: 8, padding: '5px 11px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                Estado: Todos <HiChevronDown style={{ width: 11, height: 11 }} />
              </button>
            </div>
          </div>

          <DataTable
            columns={CAM_COLS}
            gridTemplate={COLS}
            rows={filtered}
            rowKey="id"
            renderRow={renderCampaign}
            scrollable={false}
            style={{ background: 'transparent', border: 'none', borderRadius: 0 }}
          />

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #111827' }}>
            <span style={{ fontSize: 11.5, color: '#374151' }}>
              Mostrando 1 a {filtered.length} de {filtered.length} campañas
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['‹', '1', '›', '»'].map((p, i) => (
                <button key={i} style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: p === '1' ? '#4f46e5' : 'transparent',
                  border: p === '1' ? 'none' : '1px solid #1a2235',
                  color: p === '1' ? 'white' : '#4b5563',
                  fontSize: 12, cursor: 'pointer', fontWeight: p === '1' ? 700 : 400,
                }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CanalDonut />
          <EstadoGauge campaigns={campaigns} />
          <TopConversion campaigns={campaigns} />
        </div>
      </div>

      {showModal && <NewCampaignModal onClose={() => setShowModal(false)} onAdd={c => setCampaigns(prev => [...prev, c])} />}
    </div>
  )
}
