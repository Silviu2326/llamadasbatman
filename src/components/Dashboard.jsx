import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Line,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  RiPhoneLine, RiGroupLine, RiCalendarLine, RiPercentLine,
  RiMoneyDollarBoxLine, RiBriefcaseLine, RiLineChartLine,
  RiArrowRightLine,
  RiAlertLine, RiRocketLine, RiInformationLine,
} from 'react-icons/ri'
import { HiChevronDown, HiArrowUp, HiArrowDown } from 'react-icons/hi'
import '../dashboard.css'
import KPICard from './KPICard'
import DateRangePicker from './ui/DateRangePicker'
import ExportDropdown from './ui/ExportDropdown'
import useClickOutside from '../hooks/useClickOutside'
import { formatDisplayDate } from '../utils/dateHelpers'

// ─── data ────────────────────────────────────────────────────────────────────
const KPI = [
  { Icon: RiPhoneLine,          iconBg:'#4338ca', label:'Llamadas\nrealizadas',    value:'1.248',    pct:18.6, color:'#818cf8',
    data:[55,62,48,70,65,78,60,82,74,90,85,88,80,95,92,100,88,105,112,120] },
  { Icon: RiGroupLine,          iconBg:'#047857', label:'Leads\ncontactados',       value:'842',      pct:15.3, color:'#34d399',
    data:[40,50,45,58,52,62,55,68,60,72,65,75,70,78,72,82,76,85,80,90] },
  { Icon: RiCalendarLine,       iconBg:'#6d28d9', label:'Reuniones\nagendadas',     value:'124',      pct:22.1, color:'#a78bfa',
    data:[20,28,22,35,28,40,32,45,38,50,42,55,48,52,50,58,54,62,56,65] },
  { Icon: RiPercentLine,        iconBg:'#b45309', label:'Tasa de\nconversión',      value:'14,7%',    pct:2.3,  color:'#fbbf24',
    data:[60,55,68,62,72,66,75,68,78,72,76,80,74,82,78,85,80,83,80,87] },
  { Icon: RiMoneyDollarBoxLine, iconBg:'#0e7490', label:'Pipeline\ngenerado',       value:'€245.800', pct:28.4, color:'#22d3ee',
    data:[45,55,48,65,58,72,62,78,68,82,74,88,78,92,84,96,88,100,92,105] },
  { Icon: RiBriefcaseLine,      iconBg:'#0f766e', label:'Ingresos\natribuidos',     value:'€98.750',  pct:32.2, color:'#2dd4bf',
    data:[30,40,35,48,42,55,48,62,54,68,58,74,64,78,68,84,72,88,78,95] },
  { Icon: RiLineChartLine,      iconBg:'#15803d', label:'ROI del\nsistema',         value:'312%',     pct:45.6, color:'#4ade80',
    data:[200,220,210,240,225,255,238,268,250,278,262,285,270,292,278,300,286,305,295,312] },
]

const LC_DATA = [
  { date:'12 may', llamadas:1100, contactados:650,  reuniones:220, conversion:12   },
  { date:'13 may', llamadas:1050, contactados:700,  reuniones:200, conversion:11   },
  { date:'14 may', llamadas:1150, contactados:750,  reuniones:230, conversion:13   },
  { date:'15 may', llamadas:1250, contactados:880,  reuniones:270, conversion:14   },
  { date:'16 may', llamadas:1300, contactados:870,  reuniones:250, conversion:14.5 },
  { date:'17 may', llamadas:1350, contactados:900,  reuniones:280, conversion:15   },
  { date:'18 may', llamadas:1400, contactados:900,  reuniones:320, conversion:14.7 },
]

const LC_DATA_WEEKLY = [
  { date:'Sem 14', llamadas:7200,  contactados:4800, reuniones:1500, conversion:11.2 },
  { date:'Sem 15', llamadas:8100,  contactados:5300, reuniones:1680, conversion:12.5 },
  { date:'Sem 16', llamadas:8900,  contactados:5900, reuniones:1850, conversion:13.8 },
  { date:'Sem 17', llamadas:9400,  contactados:6200, reuniones:1980, conversion:14.6 },
  { date:'Sem 18', llamadas:9800,  contactados:6500, reuniones:2100, conversion:14.9 },
  { date:'Sem 19', llamadas:10500, contactados:7000, reuniones:2280, conversion:15.4 },
]

const LC_DATA_MONTHLY = [
  { date:'Ene', llamadas:32000, contactados:21000, reuniones:6800, conversion:10.8 },
  { date:'Feb', llamadas:34000, contactados:22500, reuniones:7200, conversion:11.4 },
  { date:'Mar', llamadas:36500, contactados:24200, reuniones:7800, conversion:12.1 },
  { date:'Abr', llamadas:39000, contactados:25800, reuniones:8300, conversion:12.9 },
  { date:'May', llamadas:42000, contactados:28000, reuniones:9100, conversion:13.6 },
  { date:'Jun', llamadas:44500, contactados:29800, reuniones:9600, conversion:14.2 },
]

const VIEW_OPTIONS_DEFAULT = {
  day:   { label:'Por día',    data: LC_DATA },
  week:  { label:'Por semana', data: LC_DATA_WEEKLY },
  month: { label:'Por mes',    data: LC_DATA_MONTHLY },
}

const BAR_DATA = [
  { date:'12 may', value:12000 }, { date:'13 may', value:18000 },
  { date:'14 may', value:22000 }, { date:'15 may', value:19000 },
  { date:'16 may', value:24000 }, { date:'17 may', value:23000 },
  { date:'18 may', value:30000 },
]

const DONUT = [
  { name:'Recuperación de leads',   pct:42, value:524, color:'#3b82f6' },
  { name:'Agendado de demos',        pct:28, value:349, color:'#10b981' },
  { name:'Reconfirmación de citas',  pct:15, value:187, color:'#8b5cf6' },
  { name:'Renovaciones',             pct:10, value:125, color:'#f59e0b' },
  { name:'Reactivación',             pct:5,  value:63,  color:'#06b6d4' },
]

const FUNNEL = [
  { label:'Leads',                value:'842',         color:'#60a5fa' },
  { label:'Contactados',          value:'842 (100%)',  color:'#22d3ee' },
  { label:'Interesados',          value:'263 (31.2%)', color:'#4ade80' },
  { label:'Reuniones agendadas',  value:'124 (14.7%)', color:'#fbbf24' },
  { label:'Propuestas enviadas',  value:'67 (8.0%)',   color:'#a78bfa' },
  { label:'Clientes',             value:'29 (3.4%)',   color:'#e879f9' },
]

const AGENTS = [
  { name:'Sofía Martínez',  initials:'SM', mtgs:45, conv:18.7, bar:0.87, bg:'#4f46e5' },
  { name:'Carlos Gómez',    initials:'CG', mtgs:32, conv:16.3, bar:0.73, bg:'#0891b2' },
  { name:'María López',     initials:'ML', mtgs:25, conv:14.1, bar:0.63, bg:'#7c3aed' },
  { name:'Javier Ruiz',     initials:'JR', mtgs:22, conv:12.8, bar:0.57, bg:'#0d9488' },
  { name:'Lucía Fernández', initials:'LF', mtgs:18, conv:11.2, bar:0.50, bg:'#be185d' },
]

const ALERTS = [
  { Icon:RiAlertLine,       color:'#f59e0b', bg:'#78350f18', border:'#f59e0b30', text:'El sector inmobiliario está convirtiendo 42% peor esta semana comparado con la anterior.' },
  { Icon:RiAlertLine,       color:'#f59e0b', bg:'#78350f18', border:'#f59e0b30', text:'El agente "Demo SaaS" está teniendo una tasa de objeciones alta (28%).' },
  { Icon:RiRocketLine,      color:'#10b981', bg:'#06402018', border:'#10b98130', text:'Las empresas de más de 50 empleados convierten 3x mejor.' },
  { Icon:RiInformationLine, color:'#3b82f6', bg:'#1e3a5f18', border:'#3b82f630', text:'Las llamadas de 6-8 minutos tienen la mejor tasa de conversión (21%).' },
]

// ─── shared ──────────────────────────────────────────────────────────────────
const card = { background:'#0d1117', border:'1px solid #1e2433', borderRadius:14, padding:'18px 20px' }

const tooltipStyle = {
  contentStyle: { background:'rgba(10,14,26,0.97)', border:'1px solid #1e2433', borderRadius:10, fontSize:12, boxShadow:'0 8px 32px rgba(0,0,0,0.6)' },
  labelStyle:   { color:'#94a3b8', marginBottom:6, fontWeight:600 },
  itemStyle:    { color:'#f1f5f9' },
  cursor:       { stroke:'#1e2433', strokeWidth:1, strokeDasharray:'4 4' },
}

const dot = (fill) => ({ r:3.5, fill, stroke:'#080c14', strokeWidth:2 })
const activeDot = (fill) => ({ r:5.5, fill, stroke:'#080c14', strokeWidth:2 })


// ─── Rendimiento General ─────────────────────────────────────────────────────
const REND_SERIES = [
  { key:'llamadas',    name:'Llamadas',      color:'#60a5fa', yId:'L', grad:'gradL' },
  { key:'contactados', name:'Contactados',   color:'#34d399', yId:'L', grad:'gradC' },
  { key:'reuniones',   name:'Reuniones',     color:'#a78bfa', yId:'L', grad:'gradR' },
]

function getChartDomain(data) {
  const leftMax = Math.max(...data.flatMap(d => [d.llamadas, d.contactados, d.reuniones]))
  const rightMax = Math.max(...data.map(d => d.conversion))
  const nice = n => {
    const p = Math.pow(10, Math.floor(Math.log10(n)))
    return Math.ceil(n / p) * p
  }
  return { leftMax: nice(leftMax * 1.1), rightMax: Math.ceil(rightMax * 1.2) }
}

function RendimientoChart({ dayData }) {
  const [view, setView] = useState('day')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  const VIEW_OPTIONS = {
    ...VIEW_OPTIONS_DEFAULT,
    day: { label:'Por día', data: dayData?.length ? dayData : LC_DATA },
  }
  const current = VIEW_OPTIONS[view]
  const { leftMax, rightMax } = getChartDomain(current.data)

  const dropdownStyle = {
    position:'absolute', top:'calc(100% + 6px)', right:0,
    background:'#0d1117', border:'1px solid #1e2433', borderRadius:10,
    padding:6, minWidth:140, boxShadow:'0 10px 30px rgba(0,0,0,0.5)',
    zIndex:20, display:'flex', flexDirection:'column', gap:2,
  }
  const itemStyle = {
    background:'transparent', border:'none', borderRadius:6,
    padding:'7px 10px', color:'#cbd5e1', fontSize:12,
    textAlign:'left', cursor:'pointer',
  }
  const activeItemStyle = { ...itemStyle, background:'#1e2433', color:'#ffffff', fontWeight:600 }

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:12 }} className="fade-up">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>Rendimiento general</h3>
        <div ref={ref} style={{ position:'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:5, background:'#131b2b', border:'1px solid #1e2433', borderRadius:8, padding:'5px 10px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}
          >
            {current.label} <HiChevronDown style={{ width:12, height:12, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
          </button>
          {open && (
            <div style={dropdownStyle}>
              {Object.entries(VIEW_OPTIONS).map(([key, o]) => (
                <button
                  key={key}
                  style={view === key ? activeItemStyle : itemStyle}
                  onClick={() => { setView(key); setOpen(false) }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
        {[['#60a5fa','Llamadas'],['#34d399','Contactados'],['#a78bfa','Reuniones'],['#fb923c','Conversión (%)']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }} />
            <span style={{ fontSize:11.5, color:'#cbd5e1' }}>{l}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={current.data} margin={{ top:5, right:38, left:0, bottom:0 }}>
          <defs>
            {REND_SERIES.map(({ grad, color }) => (
              <linearGradient key={grad} id={grad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#1a2235" vertical={false} />
          <XAxis dataKey="date" tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" domain={[0, leftMax]}
            tickFormatter={v => v>=1000 ? `${v/1000}K` : `${v}`}
            tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={38} />
          <YAxis yAxisId="R" orientation="right" domain={[0, rightMax]}
            tickFormatter={v => `${v}%`}
            tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={30} />
          <Tooltip {...tooltipStyle} />

          {/* Glow layers */}
          {REND_SERIES.map(({ key, color, yId }) => (
            <Area key={`glow-${key}`} yAxisId={yId} type="monotone" dataKey={key}
              stroke={color} strokeWidth={10} strokeOpacity={0.25}
              fill="none" dot={false} isAnimationActive={false} legendType="none" />
          ))}

          {/* Líneas nítidas sin fill */}
          {REND_SERIES.map(({ key, name, color, yId }) => (
            <Area key={key} yAxisId={yId} type="monotone" dataKey={key} name={name}
              stroke={color} fill="none" strokeWidth={2.5}
              dot={dot(color)} activeDot={activeDot(color)} />
          ))}

          {/* Conversión — glow + línea */}
          <Line yAxisId="R" type="monotone" dataKey="conversion" stroke="#fb923c"
            strokeWidth={10} strokeOpacity={0.25} dot={false} isAnimationActive={false} legendType="none" />
          <Line yAxisId="R" type="monotone" dataKey="conversion" name="Conversión %"
            stroke="#fb923c" strokeWidth={2.5} dot={dot('#fb923c')} activeDot={activeDot('#fb923c')} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Embudo ───────────────────────────────────────────────────────────────────
const FUNNEL_COLORS = ['#60a5fa','#22d3ee','#4ade80','#fbbf24','#e879f9']

function EmbudoChart({ funnel: funnelProp }) {
  const FUNNEL_DATA = funnelProp?.length
    ? funnelProp.map((f, i) => ({ ...f, value: String(f.value), color: FUNNEL_COLORS[i] ?? '#94a3b8' }))
    : FUNNEL
  const W = 190, stepH = 46, gap = 5, n = FUNNEL_DATA.length
  const maxW = 186, minW = 86
  const widths = FUNNEL_DATA.map((_, i) => maxW - (maxW - minW) * (i / (n - 1)))
  const svgH = n * (stepH + gap)

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:14 }} className="fade-up">
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Embudo de conversiones
      </h3>
      <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
        <svg viewBox={`0 0 ${W} ${svgH}`} width={W} height={svgH} style={{ flexShrink:0, overflow:'visible' }}>
          <defs>
            {FUNNEL_DATA.map((step, i) => (
              <filter key={i} id={`fg${i}`} x="-25%" y="-40%" width="150%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {FUNNEL_DATA.map((step, i) => {
            const y0 = i * (stepH + gap), y1 = y0 + stepH
            const tw = widths[i], bw = widths[i + 1] ?? widths[i] * 0.84
            const tm = (W - tw) / 2, bm = (W - bw) / 2
            const pts = `${tm},${y0} ${tm+tw},${y0} ${bm+bw},${y1} ${bm},${y1}`
            return (
              <g key={i}>
                <polygon points={pts} fill="none"
                  stroke={step.color} strokeWidth={4} opacity={0.7}
                  filter={`url(#fg${i})`} />
                <polygon points={pts}
                  fill={step.color + '55'}
                  stroke={step.color} strokeWidth={1.5} />
                <text x={W / 2} y={y0 + stepH / 2 + 4} textAnchor="middle"
                  fill="white" fontSize="10.5" fontWeight="600"
                  style={{ filter:'drop-shadow(0 0 4px rgba(255,255,255,0.4))' }}>
                  {step.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Valores */}
        <div style={{ display:'flex', flexDirection:'column' }}>
          {FUNNEL_DATA.map((step, i) => (
            <div key={i} style={{ height: stepH + gap, display:'flex', alignItems:'center' }}>
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace:'nowrap',
                color: step.color,
                textShadow: `0 0 8px ${step.color}80`,
              }}>
                {step.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Donut ────────────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4']

function DonutChart({ callsByCampaign, totalCalls }) {
  const SIZE = 190
  const donutData = callsByCampaign?.length
    ? callsByCampaign.map((c, i) => ({ ...c, name: c.name, pct: c.pct, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    : DONUT
  const centerCount = totalCalls ?? (callsByCampaign ? 0 : 1248)

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10, height:'100%' }} className="fade-up">
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Llamadas por campaña
      </h3>

      <div style={{ position:'relative', width:SIZE, height:SIZE, margin:'0 auto' }}>
        <PieChart width={SIZE} height={SIZE}>
          <Pie data={donutData} cx={SIZE/2} cy={SIZE/2}
            innerRadius={58} outerRadius={84}
            dataKey="pct" paddingAngle={3} startAngle={90} endAngle={-270}>
            {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle}
            formatter={(v, name, props) => [`${v}% (${props.payload.value})`, props.payload.name]} />
        </PieChart>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#ffffff', lineHeight:1, textShadow:'0 0 16px rgba(255,255,255,0.3)' }}>{centerCount.toLocaleString('es-ES')}</div>
          <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>Llamadas</div>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1, justifyContent:'center' }}>
        {donutData.length === 0
          ? <p style={{ margin:0, fontSize:12, color:'#4b5563', textAlign:'center' }}>Sin datos de campañas</p>
          : donutData.map(d => (
            <div key={d.name} style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:d.color, flexShrink:0, boxShadow:`0 0 6px ${d.color}` }} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:12, color:'#e2e8f0', fontWeight:600, lineHeight:1.2 }}>{d.name}</p>
                <p style={{ margin:0, fontSize:11, color:'#6b7280' }}>{d.pct}% ({d.value})</p>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Ingresos (Bar) ───────────────────────────────────────────────────────────
function IngresosChart({ pipelineByDay, pipelinePct }) {
  const barData = pipelineByDay?.length ? pipelineByDay : BAR_DATA
  const weekTotal = barData.reduce((s, d) => s + d.value, 0)
  const maxVal = Math.max(...barData.map(d => d.value), 1)
  const yMax = Math.ceil(maxVal * 1.25 / 1000) * 1000 || 10000
  const yTicks = [0, Math.round(yMax / 3 / 1000) * 1000, Math.round(yMax * 2 / 3 / 1000) * 1000, yMax]
  const isReal = !!pipelineByDay?.length

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:12 }} className="fade-up">
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Pipeline esta semana
      </h3>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:28, fontWeight:800, color:'#ffffff', letterSpacing:-1, textShadow:'0 0 20px rgba(255,255,255,0.25)' }}>
          €{Math.round(weekTotal).toLocaleString('es-ES')}
        </span>
        {isReal && pipelinePct != null && (
          <>
            {pipelinePct >= 0
              ? <HiArrowUp style={{ width:13, height:13, color:'#4ade80' }} />
              : <HiArrowDown style={{ width:13, height:13, color:'#f87171' }} />
            }
            <span style={{ fontSize:12, color: pipelinePct >= 0 ? '#4ade80' : '#f87171', fontWeight:700 }}>{Math.abs(pipelinePct)}%</span>
            <span style={{ fontSize:11, color:'#94a3b8' }}>vs. semana anterior</span>
          </>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={barData} margin={{ top:8, right:0, left:0, bottom:0 }} barCategoryGap="35%">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#c084fc" stopOpacity={1} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a2235" vertical={false} />
          <XAxis dataKey="date" tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, yMax]} ticks={yTicks}
            tickFormatter={v => v === 0 ? '0' : `${(v/1000).toFixed(0)}k`}
            tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={30} />
          <Tooltip {...tooltipStyle} formatter={v => [`€${v.toLocaleString('es-ES')}`, 'Pipeline']} />
          <Bar dataKey="value" fill="#a855f7" fillOpacity={0.25} radius={[5,5,0,0]} isAnimationActive={false} />
          <Bar dataKey="value" fill="url(#barGrad)" radius={[5,5,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Agentes ─────────────────────────────────────────────────────────────────
const AGENT_BG = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#be185d']

function AgentesTable({ agents: agentsProp }) {
  const navigate = useNavigate()
  const displayAgents = agentsProp
    ? agentsProp.map((a, i) => ({
        name: a.name,
        initials: a.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        mtgs: a.calls,
        conv: null,
        bar: agentsProp[0]?.calls > 0 ? a.calls / agentsProp[0].calls : 0,
        bg: AGENT_BG[i % AGENT_BG.length],
      }))
    : null
  return (
    <div style={{ ...card, display:'flex', flexDirection:'column' }} className="fade-up">
      <h3 style={{ margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Top agentes por rendimiento
      </h3>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 64px 100px', gap:8, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
        {['Agente','Llamadas','Conversión'].map(h => (
          <span key={h} style={{ fontSize:10.5, color:'#6b7280', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
        ))}
      </div>
      {!displayAgents || displayAgents.length === 0
        ? <p style={{ margin:'12px 0', fontSize:12, color:'#4b5563', textAlign:'center' }}>Sin datos de llamadas por agente</p>
        : displayAgents.map((a, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 64px 100px', gap:8, alignItems:'center', padding:'10px 0', borderBottom: i<displayAgents.length-1 ? '1px solid #111827' : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'white', flexShrink:0, boxShadow:`0 0 10px ${a.bg}80` }}>
                {a.initials}
              </div>
              <span style={{ fontSize:12.5, color:'#ffffff', fontWeight:500 }}>{a.name}</span>
            </div>
            <span style={{ fontSize:13, color:'#e2e8f0', textAlign:'center', fontWeight:600 }}>{a.mtgs}</span>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ flex:1, height:5, borderRadius:99, background:'#1a2235' }}>
                <div style={{ width:`${a.bar*100}%`, height:'100%', borderRadius:99,
                  background:'linear-gradient(90deg,#10b981,#34d399)',
                  boxShadow:'0 0 8px #10b98180' }} />
              </div>
              {a.conv != null && <span style={{ fontSize:11.5, color:'#4ade80', width:34, flexShrink:0, fontWeight:600 }}>{a.conv}%</span>}
            </div>
          </div>
        ))
      }
      <div style={{ borderTop:'1px solid #1a2235', marginTop:6, paddingTop:10 }}>
        <button onClick={() => navigate('/agentes')} style={{ display:'flex', width:'100%', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, textShadow:'0 0 8px #818cf880' }}>
          <span>Ver todos los agentes</span>
          <RiArrowRightLine style={{ width:15, height:15 }} />
        </button>
      </div>
    </div>
  )
}

// ─── Actividad Reciente ───────────────────────────────────────────────────────
function AlertasIA() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    apiFetch('/api/dashboard/activity?limit=4').then(r => r.json()).then(data => {
      setItems(data)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const display = items.map(item => {
    const isCall = item.type === 'call'
    return {
      Icon: isCall ? RiPhoneLine : RiCalendarLine,
      color: isCall ? '#3b82f6' : '#10b981',
      text: isCall
        ? `Llamada con ${item.data.lead?.name ?? 'Lead'} — ${item.data.durationSeconds ? `${Math.round(item.data.durationSeconds / 60)} min` : item.data.status}`
        : `Reunión: ${item.data.title} con ${item.data.lead?.name ?? 'Lead'}`,
    }
  })

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10 }} className="fade-up">
      <h3 style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Actividad reciente
      </h3>
      {!loaded
        ? <p style={{ margin:'8px 0', fontSize:12, color:'#4b5563' }}>Cargando…</p>
        : display.length === 0
          ? <p style={{ margin:'8px 0', fontSize:12, color:'#4b5563' }}>Sin actividad reciente</p>
          : display.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:10,
              background: a.color + '0d',
              border:`1px solid ${a.color}40`,
              borderRadius:10, padding:'10px 11px',
              boxShadow:`0 0 14px ${a.color}15`,
            }}>
              <div style={{
                width:28, height:28, borderRadius:8,
                background: a.color + '25',
                border:`1px solid ${a.color}50`,
                boxShadow:`0 0 10px ${a.color}40`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <a.Icon style={{ width:14, height:14, color:a.color }} />
              </div>
              <p style={{ margin:0, fontSize:11.5, color:'#cbd5e1', lineHeight:1.55, flex:1 }}>{a.text}</p>
            </div>
          ))
      }
      <div style={{ borderTop:'1px solid #1a2235', paddingTop:10, marginTop:2 }}>
        <button onClick={() => navigate('/llamadas')} style={{ display:'flex', width:'100%', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, textShadow:'0 0 8px #818cf880' }}>
          <span>Ver toda la actividad</span>
          <RiArrowRightLine style={{ width:15, height:15 }} />
        </button>
      </div>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const COMPARE_OPTIONS = [
  { key:'none',        label:'Sin comparación' },
  { key:'prev_week',   label:'Semana anterior' },
  { key:'prev_month',  label:'Mes anterior' },
  { key:'prev_year',   label:'Año anterior' },
]

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [compare, setCompare]     = useState('prev_week')
  const [openCompare, setOpenCompare] = useState(false)
  const compareRef = useRef(null)
  useClickOutside([compareRef], () => setOpenCompare(false))

  const [kpi, setKpi] = useState(KPI)
  const [stats, setStats] = useState(null)
  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(s => {
      setStats(s)
      const fmt = n => n ? `€${Math.round(n).toLocaleString('es-ES')}` : null
      const p = s.kpiPcts ?? {}
      const overrides = [
        { value: String(s.totalCalls),                          pct: p.calls    ?? null },
        { value: String(s.totalLeads),                          pct: p.leads    ?? null },
        { value: String(s.meetingsScheduled),                   pct: p.meetings ?? null },
        { value: `${s.conversionRate ?? 0}%`,                   pct: null },
        { value: `€${Math.round(s.pipelineValue ?? 0).toLocaleString('es-ES')}`, pct: p.pipeline ?? null },
        { value: fmt(s.closedWonValue) ?? '—',                  pct: null },
        { value: 'N/D',                                          pct: null },
      ]
      setKpi(prev => prev.map((k, i) => {
        const o = overrides[i]
        return { ...k, ...(o.value != null ? { value: o.value } : {}), pct: o.pct }
      }))
    }).catch(() => {})
  }, [])

  const compareLabel = COMPARE_OPTIONS.find(o => o.key === compare)?.label

  const dropdownStyle = {
    position:'absolute', top:'calc(100% + 6px)', right:0,
    background:'#0d1117', border:'1px solid #1e2433', borderRadius:10,
    padding:6, minWidth:180, boxShadow:'0 10px 30px rgba(0,0,0,0.5)',
    zIndex:20, display:'flex', flexDirection:'column', gap:2,
  }
  const dropdownItemStyle = {
    background:'transparent', border:'none', borderRadius:6,
    padding:'7px 10px', color:'#cbd5e1', fontSize:12,
    textAlign:'left', cursor:'pointer',
  }
  const activeItemStyle = { ...dropdownItemStyle, background:'#1e2433', color:'#ffffff', fontWeight:600 }

  const displayRange = startDate && endDate
    ? `${formatDisplayDate(new Date(startDate+'T00:00:00'))} - ${formatDisplayDate(new Date(endDate+'T00:00:00'))}`
    : ''

  return (
    <div className="dark-scroll db-pad" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column', gap:16, minWidth:0 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'#f1f5f9' }}>Hola, Equipo Comercial 👋</h1>
          <p style={{ margin:'3px 0 0', fontSize:12.5, color:'#4b5563' }}>Aquí tienes el resumen de tu actividad de hoy.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

          {/* Date picker */}
          <DateRangePicker onChange={({ start, end }) => { setStartDate(start); setEndDate(end) }} />

          {/* Compare dropdown */}
          <div ref={compareRef} style={{ position:'relative' }}>
            <button
              onClick={() => setOpenCompare(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}
            >
              {compareLabel} <HiChevronDown style={{ width:12, height:12, transform: openCompare ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
            </button>
            {openCompare && (
              <div style={dropdownStyle}>
                {COMPARE_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    style={compare === o.key ? activeItemStyle : dropdownItemStyle}
                    onClick={() => { setCompare(o.key); setOpenCompare(false) }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export dropdown */}
          <ExportDropdown
            filename={`dashboard_${startDate || 'hoy'}_${endDate || 'hoy'}.csv`}
            data={kpi}
            columns={[
              { header:'Métrica', getValue:k => k.label.replace('\n',' ') },
              { header:'Valor',   getValue:k => k.value },
              { header:'Cambio %', getValue:k => k.pct },
            ]}
          />

        </div>
      </div>

      {/* KPI row */}
      <div className="db-kpi-row">
        {kpi.map((k, i) => <KPICard key={k.label} {...k} delay={`${i*55}ms`} large />)}
      </div>

      {/* Middle row */}
      <div className="db-mid">
        <RendimientoChart dayData={stats?.timeSeries} />
        <EmbudoChart funnel={stats?.funnel} />
        <DonutChart callsByCampaign={stats?.callsByCampaign} totalCalls={stats?.totalCalls} />
      </div>

      {/* Bottom row */}
      <div className="db-bot">
        <IngresosChart pipelineByDay={stats?.pipelineByDay} pipelinePct={stats?.kpiPcts?.pipeline} />
        <AgentesTable agents={stats?.agentLeaderboard} />
        <AlertasIA />
      </div>
    </div>
  )
}
