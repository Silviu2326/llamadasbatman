import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
// ponytail: recharts PieChart removed — pure SVG donuts below
import {
  RiAddLine, RiSearchLine, RiFilterLine, RiCalendar2Line,
  RiRobot2Line, RiShoppingCart2Line, RiGroupLine, RiBriefcaseLine,
  RiBook2Line, RiBarChartLine, RiSendPlaneLine, RiArrowRightLine,
  RiPhoneLine, RiCalendarLine, RiPercentLine, RiMoneyDollarBoxLine,
  RiCloseLine, RiCheckLine, RiDatabase2Line, RiTimeLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import DataTable from './DataTable'

// ─── Data ─────────────────────────────────────────────────────────────────────
const USE_DEMO = true // Cambia a false para usar datos reales del backend

const DEMO_CAMPAIGNS = [
  {
    id: 'demo-1', nombre: 'Demo SaaS Empresas', sub: 'Software empresarial B2B',
    Icon: RiRobot2Line, status: 'activa',
    kpis: {
      llamadas:   { fmt: '842',   delta: null, up: true },
      leads:      { fmt: '356',   delta: null, up: true },
      reuniones:  { fmt: '98',    delta: null, up: true },
      conversion: { fmt: '11,6%', delta: null, up: true, v: 11.6 },
      ingresos:   { fmt: '€45.230', delta: null, up: true },
    },
  },
  {
    id: 'demo-2', nombre: 'E-commerce Q2', sub: 'Tiendas online',
    Icon: RiShoppingCart2Line, status: 'activa',
    kpis: {
      llamadas:   { fmt: '621',   delta: null, up: true },
      leads:      { fmt: '289',   delta: null, up: true },
      reuniones:  { fmt: '76',    delta: null, up: true },
      conversion: { fmt: '12,2%', delta: null, up: true, v: 12.2 },
      ingresos:   { fmt: '€28.470', delta: null, up: true },
    },
  },
  {
    id: 'demo-3', nombre: 'Salud & Clínicas', sub: 'Sector salud',
    Icon: RiGroupLine, status: 'pausada',
    kpis: {
      llamadas:   { fmt: '312',   delta: null, up: false },
      leads:      { fmt: '128',   delta: null, up: false },
      reuniones:  { fmt: '32',    delta: null, up: false },
      conversion: { fmt: '10,3%', delta: null, up: false, v: 10.3 },
      ingresos:   { fmt: '€12.680', delta: null, up: false },
    },
  },
  {
    id: 'demo-4', nombre: 'Servicios Financieros', sub: 'Banca y seguros',
    Icon: RiBriefcaseLine, status: 'activa',
    kpis: {
      llamadas:   { fmt: '489',   delta: null, up: true },
      leads:      { fmt: '203',   delta: null, up: true },
      reuniones:  { fmt: '54',    delta: null, up: true },
      conversion: { fmt: '11,0%', delta: null, up: true, v: 11.0 },
      ingresos:   { fmt: '€18.950', delta: null, up: true },
    },
  },
  {
    id: 'demo-5', nombre: 'Educación Online', sub: 'Plataformas educativas',
    Icon: RiBook2Line, status: 'borrador',
    kpis: {
      llamadas:   { fmt: '0',  delta: null, up: true },
      leads:      { fmt: '0',  delta: null, up: true },
      reuniones:  { fmt: '0',  delta: null, up: true },
      conversion: { fmt: '0%', delta: null, up: true, v: 0 },
      ingresos:   { fmt: '€0', delta: null, up: true },
    },
  },
  {
    id: 'demo-6', nombre: 'Industria & Manufactura', sub: 'Manufactura B2B',
    Icon: RiBarChartLine, status: 'activa',
    kpis: {
      llamadas:   { fmt: '583',   delta: null, up: true },
      leads:      { fmt: '245',   delta: null, up: true },
      reuniones:  { fmt: '62',    delta: null, up: true },
      conversion: { fmt: '10,6%', delta: null, up: true, v: 10.6 },
      ingresos:   { fmt: '€16.420', delta: null, up: true },
    },
  },
  {
    id: 'demo-7', nombre: 'SaaS Startup', sub: 'Startups y scaleups',
    Icon: RiSendPlaneLine, status: 'completada',
    kpis: {
      llamadas:   { fmt: '256',  delta: null, up: true },
      leads:      { fmt: '94',   delta: null, up: true },
      reuniones:  { fmt: '20',   delta: null, up: true },
      conversion: { fmt: '7,8%', delta: null, up: false, v: 7.8 },
      ingresos:   { fmt: '€5.670', delta: null, up: true },
    },
  },
]

const STATUS_STYLE = {
  activa:     { text: '#10b981', dot: '#10b981', label: 'Activa'     },
  pausada:    { text: '#f59e0b', dot: '#f59e0b', label: 'Pausada'    },
  borrador:   { text: '#60a5fa', dot: '#60a5fa', label: 'Borrador'   },
  completada: { text: '#a78bfa', dot: '#a78bfa', label: 'Completada' },
}

const STATUS_MAP = { active:'activa', paused:'pausada', done:'completada', draft:'borrador' }
const AGENT_BG   = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#be185d']

const OBJECTIVE_STYLE = {
  'Recuperación de leads':   { grad:['#3b82f6','#2563eb'], Icon: RiGroupLine      },
  'Agendado de demos':       { grad:['#10b981','#059669'], Icon: RiCalendarLine   },
  'Reconfirmación de citas': { grad:['#8b5cf6','#7c3aed'], Icon: RiCalendar2Line  },
  'Renovaciones':            { grad:['#f59e0b','#d97706'], Icon: RiBarChartLine   },
  'Reactivación':            { grad:['#06b6d4','#0891b2'], Icon: RiSendPlaneLine  },
}

const CATEGORY_COLOR = {
  'Recuperación de leads':   '#3b82f6',
  'Agendado de demos':       '#10b981',
  'Reconfirmación de citas': '#8b5cf6',
  'Renovaciones':            '#f59e0b',
  'Reactivación':            '#06b6d4',
}


// ─── Status badge (flat pill) ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.borrador
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 99,
      background: `${s.dot}15`,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: s.text }}>{s.label}</span>
    </div>
  )
}

// ─── Cell metric (value + optional delta) ─────────────────────────────────────
function CellMetric({ value, delta, up }) {
  const isZero = value === '0' || value === '0%' || value === '€0' || value === '-'
  const showDelta = delta && delta !== '—'
  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isZero ? '#374151' : '#e2e8f0', letterSpacing: -0.2 }}>
        {isZero ? '-' : value}
      </p>
      {showDelta && (
        <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 500, color: up ? '#10b981' : '#ef4444' }}>
          {delta}
        </p>
      )}
    </div>
  )
}

// ─── Conversion cell with small progress bar ──────────────────────────────────
function ConversionCell({ value, bar, up }) {
  const isZero = value === '0%' || value === '-'
  const pct = Math.min(bar ?? 0, 100)
  const color = up ? '#10b981' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isZero ? '#374151' : '#e2e8f0', letterSpacing: -0.2 }}>
        {isZero ? '-' : value}
      </p>
      {!isZero && (
        <div style={{ width: 48, height: 3, borderRadius: 99, background: '#1a2235', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 99,
            background: color,
          }} />
        </div>
      )}
    </div>
  )
}

// ─── Flat KPI card ────────────────────────────────────────────────────────────
function SimpleKPICard({ Icon, iconBg, label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: `${iconBg}20`, border: `1px solid ${iconBg}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 16, height: 16, color: iconBg }} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</p>
        <p style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: -0.5 }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Table skeleton ───────────────────────────────────────────────────────────
function TableSkeleton({ gridTemplate }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: gridTemplate, gap: 0,
          padding: '8px 16px', alignItems: 'center',
          boxShadow: i < 4 ? 'inset 0 -1px 0 #111827' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1a2235' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ width: 140, height: 10, borderRadius: 4, background: '#1a2235' }} />
              <div style={{ width: 80, height: 8, borderRadius: 4, background: '#111827' }} />
            </div>
          </div>
          {Array.from({ length: 6 }).map((__, j) => (
            <div key={j} style={{ display: 'flex', justifyContent: j >= 1 ? 'flex-end' : 'flex-start' }}>
              <div style={{ width: j === 0 ? 64 : 48, height: 10, borderRadius: 4, background: '#1a2235' }} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 52, height: 24, borderRadius: 6, background: '#1a2235' }} />
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
const COLS = '0.95fr 100px 100px 90px 90px 150px 110px 80px'
const CAM_COLS = [
  'Campaña', 'Estado',
  { label: 'Llamadas',  align: 'right', color: '#94a3b8' },
  { label: 'Leads',     align: 'right', color: '#94a3b8' },
  { label: 'Reuniones', align: 'right', color: '#94a3b8' },
  { label: 'Conversión', align: 'right', color: '#94a3b8' },
  { label: 'Ingresos',  align: 'right', color: '#94a3b8' },
  { label: 'Acciones',  align: 'right', color: '#94a3b8' },
]

function renderCampaign(c, handlers) {
  const catColor = CATEGORY_COLOR[c.sub] ?? '#4f46e5'
  return [
    <div key="n" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `${catColor}15`, border: `1px solid ${catColor}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <c.Icon style={{ width: 17, height: 17, color: catColor }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</p>
      </div>
    </div>,
    <StatusBadge key="s" status={c.status} />,
    <CellMetric key="ll" value={c.kpis.llamadas.fmt}   delta={c.kpis.llamadas.delta}   up={c.kpis.llamadas.up} />,
    <CellMetric key="le" value={c.kpis.leads.fmt}      delta={c.kpis.leads.delta}      up={c.kpis.leads.up} />,
    <CellMetric key="r"  value={c.kpis.reuniones.fmt}  delta={c.kpis.reuniones.delta}  up={c.kpis.reuniones.up} />,
    <ConversionCell key="cv" value={c.kpis.conversion.fmt} bar={c.kpis.conversion.v} up={c.kpis.conversion.up} />,
    <CellMetric key="in" value={c.kpis.ingresos.fmt}   delta={c.kpis.ingresos.delta}   up={c.kpis.ingresos.up} />,
    <div key="ac" style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={() => handlers?.onView?.(c.id)} style={{
        padding: '5px 12px', borderRadius: 6,
        border: '1px solid #1e2433', background: 'transparent',
        color: '#94a3b8', fontSize: 11.5, cursor: 'pointer', fontWeight: 600,
      }}>
        Ver
      </button>
    </div>,
  ]
}

// ─── Simple SVG donut (no glow) ───────────────────────────────────────────────
function SimpleDonut({ data, size = 120, centerValue, centerLabel }) {
  const cx = size / 2, cy = size / 2
  const r = size * 0.375
  const sw = size * 0.125
  const C = 2 * Math.PI * r
  const GAP = (2 / 360) * C
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
              style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${cx}px ${cy}px` }}
            />
          )
        })}
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
        <p style={{ margin: 0, fontSize: size * 0.14, fontWeight: 800, color: '#e2e8f0', lineHeight: 1, letterSpacing: -0.5 }}>{centerValue}</p>
        <p style={{ margin: '3px 0 0', fontSize: size * 0.072, color: '#6b7280' }}>{centerLabel}</p>
      </div>
    </div>
  )
}

// ─── Simple SVG half-gauge (no glow) ──────────────────────────────────────────
function SimpleHalfGauge({ data, size = 110, centerValue, centerLabel }) {
  const cx = size / 2, cy = size / 2
  const r = (size / 2) * 0.80
  const sw = size * 0.125
  const GAP_DEG = 3
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
          <path key={i} d={arc(s.p0, s.p1)} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
        ))}
      </svg>
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <p style={{ margin: 0, fontSize: size * 0.16, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>{centerValue}</p>
        <p style={{ margin: '2px 0 0', fontSize: size * 0.08, color: '#6b7280' }}>{centerLabel}</p>
      </div>
    </div>
  )
}

// ─── Right panel: Rendimiento por canal ───────────────────────────────────────
const DEMO_CANAL_DATA = [
  { name: 'Llamadas en frío', pct: 42, value: 1194, color: '#3b82f6' },
  { name: 'LinkedIn',          pct: 28, value: 797,  color: '#10b981' },
  { name: 'Email',             pct: 17, value: 484,  color: '#8b5cf6' },
  { name: 'Referidos',         pct: 8,  value: 228,  color: '#f59e0b' },
  { name: 'Otros',             pct: 5,  value: 144,  color: '#06b6d4' },
]

function CanalDonut({ data }) {
  const list = data ?? DEMO_CANAL_DATA
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Rendimiento por canal</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <SimpleDonut data={list} size={108}
          centerValue={list.reduce((s, d) => s + d.value, 0).toLocaleString('es-ES')}
          centerLabel="Llamadas" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          {list.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p>
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
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Estado de campañas</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <SimpleHalfGauge data={gaugeData} size={100} centerValue={counts.activa} centerLabel="Activas" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Activas',     count: counts.activa,     color: '#10b981' },
            { label: 'Pausadas',    count: counts.pausada,    color: '#f59e0b' },
            { label: 'Borrador',    count: counts.borrador,   color: '#94a3b8' },
            { label: 'Completadas', count: counts.completada, color: '#8b5cf6' },
          ].map(d => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1 }}>{d.count} {d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Right panel: Top por conversión ──────────────────────────────────────────
function TopConversion({ campaigns }) {
  const navigate = useNavigate()
  const sorted = [...campaigns]
    .filter(c => c.status !== 'borrador' && c.kpis.conversion.v > 0)
    .sort((a, b) => b.kpis.conversion.v - a.kpis.conversion.v)
    .slice(0, 5)
  const maxV = Math.max(...sorted.map(c => c.kpis.conversion.v)) || 1
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Top campañas por conversión</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {sorted.map((c, i) => {
          const pct = (c.kpis.conversion.v / maxV) * 100
          return (
            <div key={c.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: i < 3 ? '#1e2433' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: i < 3 ? '#e2e8f0' : '#4b5563' }}>{i + 1}</span>
                </div>
                <span style={{ fontSize: 11.5, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.nombre}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#e2e8f0', flexShrink: 0 }}>{c.kpis.conversion.fmt}</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: '#111827', overflow: 'hidden', marginLeft: 26 }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: i === 0 ? '#10b981' : '#4f46e5' }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid #111827', marginTop: 14, paddingTop: 10 }}>
        <button onClick={() => navigate('/insights')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', fontSize: 12, fontWeight: 600, padding: 0 }}>
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
  const [apiAgents, setApiAgents] = useState([])
  const [saving, setSaving] = useState(false)
  const STEPS = ['Objetivo', 'Configuración', 'Horarios', 'Targets']
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setApiAgents(d.map((a, i) => ({
        id: a.id, name: a.name,
        initials: a.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
        bg: AGENT_BG[i % AGENT_BG.length],
      })))
    }).catch(() => {})
  }, [])

  const agentsList = apiAgents.length ? apiAgents : AGENTS_LIST

  async function launch() {
    setSaving(true)
    const objLabel = form.objective !== null ? OBJECTIVES[form.objective].label : undefined
    const body = {
      name: form.nombre || 'Nueva campaña',
      objective: objLabel,
      agentId: form.agente !== null ? agentsList[form.agente]?.id : undefined,
    }
    try {
      const res = await apiFetch('/api/campaigns', { method:'POST', body: JSON.stringify(body) })
      const created = await res.json()
      const style = OBJECTIVE_STYLE[objLabel] ?? { grad:['#4f46e5','#7c3aed'], Icon: RiSendPlaneLine }
      onAdd({
        id: created.id,
        nombre: created.name,
        sub: objLabel || '',
        grad: style.grad,
        Icon: style.Icon,
        status: 'borrador',
        kpis: {
          llamadas:   { fmt:'0', delta:'—', up:true, spark:[0,0,0,0,0,0,0] },
          leads:      { fmt:'0', delta:'—', up:true, spark:[0,0,0,0,0,0,0] },
          reuniones:  { fmt:'0', delta:'—', up:true, spark:[0,0,0,0,0,0,0] },
          conversion: { fmt:'0%', delta:'—', up:true, spark:[0,0,0,0,0,0,0], v:0 },
          ingresos:   { fmt:'€0', delta:'—', up:true, spark:[0,0,0,0,0,0,0] },
        },
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.88)', backdropFilter: 'blur(10px)',
    }} onClick={onClose}>
      <div style={{
        width: 'min(520px,96vw)', maxHeight: '86vh', background: '#0d1117',
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
                  {agentsList.map((a, i) => {
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
          <button onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : launch()} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 9, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
            color: 'white', fontSize: 13, fontWeight: 700, boxShadow: '0 0 18px #4f46e540',
            opacity: saving ? 0.6 : 1,
          }}>
            {step < STEPS.length - 1 ? 'Siguiente →' : saving ? 'Guardando…' : 'Lanzar campaña'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['Todos', 'activa', 'pausada', 'borrador']

export default function Campaigns() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [closedWon, setClosedWon] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (USE_DEMO) return
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(s => {
      setClosedWon(s.closedWonValue ?? 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (USE_DEMO) {
      setCampaigns(DEMO_CAMPAIGNS)
      setClosedWon(98750)
      setLoading(false)
      return
    }
    setLoading(true)
    apiFetch('/api/campaigns').then(r => r.json()).then(data => {
      if (!Array.isArray(data)) return
      setCampaigns(data.map(c => {
        const style = OBJECTIVE_STYLE[c.objective] ?? { grad:['#4f46e5','#7c3aed'], Icon: RiSendPlaneLine }
        const conv = c.totalLeads > 0 ? +((c.meetingsScheduled / c.totalLeads) * 100).toFixed(1) : 0
        return {
          id: c.id, nombre: c.name, sub: c.objective || '',
          grad: style.grad, Icon: style.Icon,
          status: STATUS_MAP[c.status] || 'borrador',
          kpis: {
            llamadas:   { fmt: String(c.contacted ?? 0),        delta: null, up: true },
            leads:      { fmt: String(c.totalLeads ?? 0),        delta: null, up: true },
            reuniones:  { fmt: String(c.meetingsScheduled ?? 0), delta: null, up: true },
            conversion: { fmt:`${conv}%`, delta: null, up: conv > 0, v: conv },
            ingresos:   { fmt:'€0', delta: null, up: true },
          },
        }
      }))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const kpiTop = useMemo(() => {
    const tll = campaigns.reduce((s, c) => s + (parseInt(c.kpis.llamadas.fmt) || 0), 0)
    const tle = campaigns.reduce((s, c) => s + (parseInt(c.kpis.leads.fmt)    || 0), 0)
    const tre = campaigns.reduce((s, c) => s + (parseInt(c.kpis.reuniones.fmt)|| 0), 0)
    return [
      { Icon: RiPhoneLine, iconBg: '#4f46e5', label: 'Llamadas realizadas', value: tll.toLocaleString('es-ES') },
      { Icon: RiGroupLine, iconBg: '#10b981', label: 'Leads generados',     value: tle.toLocaleString('es-ES') },
      { Icon: RiMoneyDollarBoxLine, iconBg: '#0891b2', label: 'Ingresos atribuidos', value: `€${Math.round(closedWon).toLocaleString('es-ES')}` },
    ]
  }, [campaigns, closedWon])

  async function handleStart(id) {
    await apiFetch(`/api/campaigns/${id}/start`, { method:'POST' })
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status:'activa' } : c))
  }

  async function handlePause(id) {
    await apiFetch(`/api/campaigns/${id}/pause`, { method:'POST' })
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status:'pausada' } : c))
  }
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [showStatusDrop, setShowStatusDrop] = useState(false)

  const filtered = campaigns.filter(c =>
    (!search || c.nombre.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'Todos' || c.status === statusFilter)
  )

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: '#080c14', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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
            background: '#4f46e5', border: 'none', borderRadius: 9, padding: '7px 15px',
            color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            <RiAddLine style={{ width: 14, height: 14 }} />
            Nueva campaña
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {kpiTop.map((k, i) => <SimpleKPICard key={i} {...k} />)}
      </div>

      {/* Content row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>

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
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowStatusDrop(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#080c14', border: '1px solid #1a2235', borderRadius: 8, padding: '5px 11px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                  Estado: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} <HiChevronDown style={{ width: 11, height: 11 }} />
                </button>
                {showStatusDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '4px', marginTop: 4, minWidth: 130 }}>
                    {STATUS_OPTIONS.map(s => (
                      <button key={s} onClick={() => { setStatusFilter(s); setShowStatusDrop(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: s === statusFilter ? '#1a2235' : 'transparent', border: 'none', color: s === statusFilter ? '#818cf8' : '#94a3b8', fontSize: 12, cursor: 'pointer', borderRadius: 6 }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <TableSkeleton gridTemplate={COLS} />
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>
                No hay campañas
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#4b5563' }}>
                Crea tu primera campaña para empezar a generar llamadas.
              </p>
              <button onClick={() => setShowModal(true)} style={{
                marginTop: 16, padding: '8px 16px', borderRadius: 8,
                background: '#4f46e5', border: 'none', color: 'white',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                Nueva campaña
              </button>
            </div>
          ) : (
            <DataTable
              columns={CAM_COLS}
              gridTemplate={COLS}
              rows={filtered}
              rowKey="id"
              compact
              renderRow={(c) => renderCampaign(c, {
                onView: id => navigate('/campanas/' + id),
                onStart: handleStart,
                onPause: handlePause,
              })}
              scrollable={false}
              style={{ background: 'transparent', border: 'none', borderRadius: 0 }}
            />
          )}

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #111827' }}>
            <span style={{ fontSize: 11.5, color: '#374151' }}>
              {loading ? 'Cargando campañas…' : `Mostrando 1 a ${filtered.length} de ${filtered.length} campañas`}
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
        <div className="panel-desktop" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CanalDonut data={USE_DEMO ? null : null} />
          <EstadoGauge campaigns={campaigns} />
          <TopConversion campaigns={campaigns} />
        </div>
      </div>

      {showModal && <NewCampaignModal onClose={() => setShowModal(false)} onAdd={c => setCampaigns(prev => [...prev, c])} />}
    </div>
  )
}
