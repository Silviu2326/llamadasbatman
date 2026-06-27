import React, { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from 'recharts'
import {
  RiBarChartLine, RiCalendarLine, RiFilterLine, RiDownloadLine,
  RiMoneyDollarBoxLine, RiGroupLine, RiLineChartLine, RiRocketLine,
  RiPhoneLine, RiTimeLine, RiRobot2Line, RiArrowRightLine,
  RiSparklingLine, RiCalendar2Line,
} from 'react-icons/ri'
import KPICard from './KPICard'
import DataTable from './DataTable'
import '../dashboard.css'

// ─── data ─────────────────────────────────────────────────────────────────────
const KPI_DATA = [
  { Icon:RiMoneyDollarBoxLine, iconBg:'#6d28d9', label:'Ingresos\ngenerados',        value:'€245.800', pct:28.1, color:'#a78bfa', data:[168,180,192,205,215,225,232,238,242,245] },
  { Icon:RiCalendarLine,       iconBg:'#0e7490', label:'Reuniones\ncalificadas',      value:'342',      pct:22.3, color:'#22d3ee', data:[220,240,258,272,284,294,305,315,320,325] },
  { Icon:RiLineChartLine,      iconBg:'#047857', label:'Tasa de conversión\nglobal',  value:'14,7%',    pct:2.3,  color:'#34d399', data:[130,133,135,138,140,143,145,147,147,148] },
  { Icon:RiMoneyDollarBoxLine, iconBg:'#b45309', label:'Coste por\nreunión',          value:'€28.6',    pct:8.4,  color:'#fbbf24', data:[38,36,35,34,33,32,31,30,29,28.6] },
  { Icon:RiRocketLine,         iconBg:'#4f46e5', label:'ROI',                         value:'562%',     pct:35.7, color:'#818cf8', data:[350,378,405,428,450,470,490,510,528,542] },
]

const TIME_DATA = [
  { day:'12 may', ingresos:38000, reuniones:45, conv:12.5 },
  { day:'13 may', ingresos:42000, reuniones:52, conv:13.1 },
  { day:'14 may', ingresos:35000, reuniones:41, conv:11.8 },
  { day:'15 may', ingresos:55000, reuniones:68, conv:15.2 },
  { day:'16 may', ingresos:48000, reuniones:58, conv:14.1 },
  { day:'17 may', ingresos:61000, reuniones:74, conv:16.8 },
  { day:'18 may', ingresos:44000, reuniones:62, conv:14.7 },
]

const CHANNELS = [
  { name:'Llamadas en frío', value:98450, pct:40, color:'#6366f1' },
  { name:'Campañas email',   value:67230, pct:27, color:'#0891b2' },
  { name:'Referidos',        value:45890, pct:19, color:'#2563eb' },
  { name:'Ads',              value:22230, pct:9,  color:'#f59e0b' },
  { name:'Otros',            value:12000, pct:5,  color:'#6b7280' },
]

const PIPELINE = [
  { stage:'Leads',             n:1248, delta:null,    up:null  },
  { stage:'Contactado',        n:842,  delta:'4.3%',  up:false },
  { stage:'Interesado',        n:342,  delta:'8.7%',  up:true  },
  { stage:'Reunión agendada',  n:156,  delta:'12.1%', up:true  },
  { stage:'Propuesta enviada', n:78,   delta:'5.4%',  up:true  },
  { stage:'Ganado',            n:34,   delta:'13.3%', up:true  },
]
const FUNNEL_COLS = ['#6366f1','#4f46e5','#0891b2','#0d9488','#059669','#10b981']

const AGENTS_PERF = [
  { id:1, name:'Sofía',     ini:'SO', bg:'#4f46e5', meetings:128, conv:18.2 },
  { id:2, name:'Mateo',     ini:'MA', bg:'#059669', meetings:96,  conv:14.6 },
  { id:3, name:'Valentina', ini:'VA', bg:'#be185d', meetings:72,  conv:13.1 },
  { id:4, name:'Javier',    ini:'JA', bg:'#d97706', meetings:46,  conv:11.2 },
  { id:5, name:'Luna',      ini:'LU', bg:'#7c3aed', meetings:32,  conv:9.8  },
]

const SENTIMENT = [
  { name:'Positivo', value:78, color:'#10b981' },
  { name:'Neutral',  value:15, color:'#f59e0b' },
  { name:'Negativo', value:7,  color:'#ef4444' },
]
const TOPICS = [
  { name:'Precio',          pct:23, color:'#818cf8' },
  { name:'Integración',     pct:18, color:'#22d3ee' },
  { name:'Funcionalidades', pct:16, color:'#34d399' },
  { name:'Onboarding',      pct:14, color:'#a78bfa' },
  { name:'Seguridad',       pct:11, color:'#60a5fa' },
  { name:'Soporte',         pct:8,  color:'#4ade80'  },
]
const KEYWORDS = ['Solución','Automatizar','Ahorro','Resultados','Rápido','Fácil']

const INSIGHT_CARDS = [
  { Icon:RiLineChartLine, color:'#a78bfa', bg:'#6d28d9',
    title:'Tu tasa de conversión aumentó 2.3pp esta semana.',
    desc:'¡Buen trabajo! Sigue optimizando tus scripts ganadores.' },
  { Icon:RiPhoneLine,     color:'#22d3ee', bg:'#0e7490',
    title:'Las llamadas entre 10:00 - 12:00 tienen 28% más tasa de éxito.',
    desc:'Recomendamos enfocar más volumen en ese horario.' },
  { Icon:RiTimeLine,      color:'#fbbf24', bg:'#b45309',
    title:'El tiempo promedio de llamada bajó 12% esta semana.',
    desc:'Las llamadas más cortas están generando más reuniones calificadas.' },
  { Icon:RiRobot2Line,    color:'#34d399', bg:'#047857',
    title:'Sofía (agente IA) es tu mejor performer con 18.2% de tasa de conversión.',
    desc:'Considera replicar su configuración en otros agentes.' },
]
const OPPS = [
  { title:'Aumentar llamadas en horario pico', badge:'Alta', badgeColor:'#f59e0b',
    desc:'Si aumentas un 20% el volumen de llamadas entre 10:00 - 12:00, podrías generar:',
    stats:[{ v:'+23', sub:'reuniones/semana' },{ v:'+€18.600', sub:'ingresos potenciales' }] },
  { title:'Optimizar follow-ups', badge:'Media', badgeColor:'#60a5fa',
    desc:'Tienes 64 leads sin seguimiento. Podrías recuperar hasta 12 reuniones.',
    stats:[] },
]

// ─── style tokens ─────────────────────────────────────────────────────────────
const C = { background:'#0d1117', border:'1px solid #1e2433', borderRadius:13, padding:'16px 18px' }
const tt = { contentStyle:{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, fontSize:11 }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#e2e8f0' } }

function STitle({ children }) {
  return <p style={{ margin:'0 0 12px', fontSize:14, fontWeight:700, color:'#f1f5f9' }}>{children}</p>
}
function LinkBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background:'none', border:'none', padding:0, color:'#818cf8', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4, marginTop:10 }}>
      {children} <RiArrowRightLine style={{ width:12, height:12 }} />
    </button>
  )
}
function ConvDot({ conv }) {
  const color = conv >= 14 ? '#10b981' : conv >= 10 ? '#f59e0b' : '#ef4444'
  return <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block', boxShadow:`0 0 5px ${color}` }} />
}

// ─── charts ───────────────────────────────────────────────────────────────────
function TimeChart() {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={TIME_DATA} margin={{ top:8, right:36, bottom:0, left:4 }}>
        <defs>
          <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" tick={{ fontSize:10, fill:'#4b5563' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="ing"  tick={{ fontSize:9, fill:'#4b5563' }} tickFormatter={v=>`€${v/1000}K`} axisLine={false} tickLine={false} width={38} domain={[0,70000]} ticks={[0,15000,30000,45000,60000]} />
        <YAxis yAxisId="pct"  orientation="right" tick={{ fontSize:9, fill:'#4b5563' }} tickFormatter={v=>`${v}%`} axisLine={false} tickLine={false} width={28} domain={[0,22]} ticks={[0,5,10,15,20]} />
        <YAxis yAxisId="mtgs" orientation="right" hide domain={[0,90]} />
        <Tooltip {...tt} formatter={(v, name) => name === 'ingresos' ? `€${v.toLocaleString()}` : name === 'reuniones' ? `${v} reuniones` : `${v}%`} />
        <Area   yAxisId="ing"  type="monotone" dataKey="ingresos"  stroke="#7c3aed" strokeWidth={2} fill="url(#ig)" dot={false} />
        <Line   yAxisId="mtgs" type="monotone" dataKey="reuniones" stroke="#22d3ee" strokeWidth={2} dot={{ r:3, fill:'#22d3ee' }} />
        <Line   yAxisId="pct"  type="monotone" dataKey="conv"      stroke="#34d399" strokeWidth={2} dot={{ r:3, fill:'#34d399' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ChannelDonut() {
  return (
    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
      <div style={{ position:'relative', width:148, height:148, flexShrink:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={CHANNELS} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="value" strokeWidth={0}>
              {CHANNELS.map((c,i) => <Cell key={i} fill={c.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <p style={{ margin:0, fontSize:14, fontWeight:800, color:'#f1f5f9' }}>€245.800</p>
          <p style={{ margin:0, fontSize:9, color:'#6b7280' }}>Total ingresos</p>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7, flex:1, minWidth:0 }}>
        {CHANNELS.map((c,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:c.color, flexShrink:0 }} />
              <span style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>{c.name}</span>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <span style={{ fontSize:11.5, fontWeight:700, color:'#f1f5f9' }}>€{c.value.toLocaleString()}</span>
              <span style={{ fontSize:10, color:'#4b5563', marginLeft:4 }}>({c.pct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FuentesBar() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {CHANNELS.map((c,i) => (
        <div key={i}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:11.5, color:'#e2e8f0' }}>{c.name}</span>
            <div style={{ display:'flex', gap:8 }}>
              <span style={{ fontSize:11.5, fontWeight:700, color:'#f1f5f9' }}>€{c.value.toLocaleString()}</span>
              <span style={{ fontSize:11, color:'#6b7280', width:28 }}>{c.pct}%</span>
            </div>
          </div>
          <div style={{ height:6, borderRadius:99, background:'#1a2235' }}>
            <div style={{ height:'100%', borderRadius:99, width:`${c.pct * 2.5}%`, background:`linear-gradient(90deg,${c.color},${c.color}99)`, boxShadow:`0 0 6px ${c.color}60` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PipelineFunnelChart() {
  const max = PIPELINE[0].n
  const W = 130, H = 30, GAP = 2
  const totalH = PIPELINE.length * H + (PIPELINE.length - 1) * GAP
  return (
    <div style={{ display:'flex', gap:12 }}>
      <svg width={W} height={totalH} style={{ flexShrink:0 }}>
        {PIPELINE.map((s, i) => {
          const topW = (s.n / max) * W
          const nextW = PIPELINE[i+1] ? (PIPELINE[i+1].n / max) * W : topW * 0.65
          const tl = (W - topW) / 2, tr = (W + topW) / 2
          const bl = (W - nextW) / 2, br = (W + nextW) / 2
          const y = i * (H + GAP)
          return (
            <polygon key={i} points={`${tl},${y} ${tr},${y} ${br},${y+H} ${bl},${y+H}`}
              fill={FUNNEL_COLS[i]} opacity={0.88} />
          )
        })}
      </svg>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:GAP }}>
        {PIPELINE.map((s, i) => (
          <div key={i} style={{ height:H, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{s.stage}</span>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>{s.n.toLocaleString()}</span>
              {s.delta ? (
                <span style={{ fontSize:10, color: s.up ? '#34d399' : '#f87171', fontWeight:600 }}>
                  {s.up ? '↑' : '↓'}{s.delta}
                </span>
              ) : <span style={{ fontSize:10, color:'#4b5563' }}>—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentsTable() {
  const renderAgent = (a) => [
    <div key="n" style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', boxShadow:`0 0 8px ${a.bg}80`, flexShrink:0 }}>{a.ini}</div>
      <span style={{ fontSize:12, color:'#f1f5f9', fontWeight:500 }}>{a.name}</span>
    </div>,
    <span key="m" style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{a.meetings}</span>,
    <div key="c" style={{ display:'flex', alignItems:'center', gap:7 }}>
      <div style={{ flex:1, height:4, borderRadius:99, background:'#1a2235' }}>
        <div style={{ width:`${(a.conv/20)*100}%`, height:'100%', borderRadius:99, background: a.conv>=14?'linear-gradient(90deg,#10b981,#34d399)':a.conv>=10?'linear-gradient(90deg,#f59e0b,#fbbf24)':'linear-gradient(90deg,#ef4444,#f87171)' }} />
      </div>
      <span style={{ fontSize:11.5, color:'#e2e8f0', fontWeight:600, width:36, flexShrink:0 }}>{a.conv}%</span>
      <ConvDot conv={a.conv} />
    </div>,
  ]
  return (
    <DataTable
      columns={['Agente','Reuniones','Tasa de conversión']}
      gridTemplate="1fr 70px 145px"
      rows={AGENTS_PERF}
      rowKey="id"
      renderRow={renderAgent}
      scrollable={false}
      style={{ background:'transparent', border:'none', borderRadius:0 }}
    />
  )
}

function SentimentDonut() {
  return (
    <div style={{ display:'flex', gap:14, alignItems:'center' }}>
      <div style={{ position:'relative', width:90, height:90, flexShrink:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={SENTIMENT} cx="50%" cy="50%" innerRadius={30} outerRadius={44} dataKey="value" strokeWidth={0}>
              {SENTIMENT.map((s,i) => <Cell key={i} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#10b981' }}>78%</p>
          <p style={{ margin:0, fontSize:8, color:'#6b7280' }}>Positivo</p>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {SENTIMENT.map((s,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }} />
            <span style={{ fontSize:11, color:'#94a3b8', width:56 }}>{s.name}</span>
            <div style={{ width:60, height:4, borderRadius:99, background:'#1a2235' }}>
              <div style={{ width:`${s.value}%`, height:'100%', borderRadius:99, background:s.color }} />
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#e2e8f0' }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── right sidebar ─────────────────────────────────────────────────────────────
function InsightCard({ card }) {
  const { Icon, color, bg, title, desc } = card
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 0', borderBottom:'1px solid #111827' }}>
      <div style={{ width:30, height:30, borderRadius:8, background:`${bg}30`, border:`1px solid ${bg}40`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon style={{ width:14, height:14, color }} />
      </div>
      <div>
        <p style={{ margin:'0 0 3px', fontSize:11.5, fontWeight:600, color:'#f1f5f9', lineHeight:1.4 }}>{title}</p>
        <p style={{ margin:0, fontSize:10.5, color:'#6b7280', lineHeight:1.4 }}>{desc}</p>
      </div>
    </div>
  )
}

function OppCard({ opp }) {
  return (
    <div style={{ background:'#111827', border:'1px solid #1e2433', borderRadius:10, padding:'12px 13px', marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#f1f5f9', flex:1, marginRight:8 }}>{opp.title}</p>
        <span style={{ fontSize:9.5, padding:'2px 7px', borderRadius:20, background:`${opp.badgeColor}18`, border:`1px solid ${opp.badgeColor}30`, color:opp.badgeColor, fontWeight:700, whiteSpace:'nowrap' }}>{opp.badge}</span>
      </div>
      <p style={{ margin:'0 0 8px', fontSize:11, color:'#6b7280', lineHeight:1.4 }}>{opp.desc}</p>
      {opp.stats.length > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:8 }}>
          {opp.stats.map((s,i) => (
            <div key={i} style={{ flex:1, background:'#0d1117', border:'1px solid #1a2235', borderRadius:8, padding:'7px 10px', textAlign:'center' }}>
              <p style={{ margin:0, fontSize:16, fontWeight:800, color:'#f1f5f9' }}>{s.v}</p>
              <p style={{ margin:0, fontSize:9.5, color:'#6b7280' }}>{s.sub}</p>
            </div>
          ))}
        </div>
      )}
      <button style={{ background:'none', border:'none', padding:0, color:'#818cf8', fontSize:11.5, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
        Ver recomendación <RiArrowRightLine style={{ width:11, height:11 }} />
      </button>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Insights() {
  const [period, setPeriod] = useState('Diario')

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#080c14', overflow:'hidden' }}>

      {/* header */}
      <div style={{ padding:'18px 24px 14px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <RiBarChartLine style={{ width:20, height:20, color:'#a78bfa' }} />
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>Insights</h1>
            <RiSparklingLine style={{ width:16, height:16, color:'#a78bfa' }} />
          </div>
          <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Descubre patrones, mide el rendimiento y obtén recomendaciones para impulsar tus ingresos.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button style={{ display:'flex', alignItems:'center', gap:7, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
            <RiCalendar2Line style={{ width:13, height:13 }} /> 12 may 2024 - 18 may 2024
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
            <RiFilterLine style={{ width:13, height:13 }} /> Filtros
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
            <RiDownloadLine style={{ width:13, height:13 }} /> Exportar
          </button>
        </div>
      </div>

      {/* body */}
      <div style={{ flex:1, display:'flex', gap:14, overflow:'hidden', padding:'0 24px 0' }}>

        {/* ── left main ── */}
        <div className="dark-scroll" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, paddingBottom:16, minWidth:0 }}>

          {/* KPI row */}
          <div style={{ display:'flex', gap:10 }}>
            {KPI_DATA.map((k,i) => <KPICard key={i} {...k} delay={`${i*50}ms`} />)}
          </div>

          {/* row 2: time chart + channel donut */}
          <div style={{ display:'flex', gap:12 }}>
            {/* time chart */}
            <div style={{ ...C, flex:2, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Rendimiento a lo largo del tiempo</p>
                <select value={period} onChange={e=>setPeriod(e.target.value)} style={{ background:'#111827', border:'1px solid #1e2433', borderRadius:7, padding:'4px 10px', color:'#94a3b8', fontSize:11.5, cursor:'pointer', outline:'none' }}>
                  {['Diario','Semanal','Mensual'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:14, marginBottom:10 }}>
                {[{color:'#7c3aed',label:'Ingresos (€)'},{color:'#22d3ee',label:'Reuniones'},{color:'#34d399',label:'Tasa de conversión (%)'}].map(l => (
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:l.color }} />
                    <span style={{ fontSize:10.5, color:'#6b7280' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <TimeChart />
            </div>
            {/* channel donut */}
            <div style={{ ...C, flex:1, minWidth:220 }}>
              <STitle>Rendimiento por canal</STitle>
              <ChannelDonut />
              <LinkBtn>Ver detalle por canal</LinkBtn>
            </div>
          </div>

          {/* row 3: fuentes + funnel + agents */}
          <div style={{ display:'flex', gap:12 }}>
            {/* fuentes */}
            <div style={{ ...C, flex:1, minWidth:0 }}>
              <STitle>Fuentes de ingresos</STitle>
              <FuentesBar />
              <LinkBtn>Ver reporte completo</LinkBtn>
            </div>
            {/* funnel */}
            <div style={{ ...C, flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Conversión por etapa</p>
                <div style={{ display:'flex', gap:16 }}>
                  <span style={{ fontSize:10, color:'#4b5563', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4 }}>Conversión</span>
                  <span style={{ fontSize:10, color:'#4b5563', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4 }}>Vs. anterior</span>
                </div>
              </div>
              <PipelineFunnelChart />
              <LinkBtn>Ver análisis completo</LinkBtn>
            </div>
            {/* agents */}
            <div style={{ ...C, flex:1, minWidth:0 }}>
              <STitle>Rendimiento de agentes IA</STitle>
              <AgentsTable />
              <LinkBtn>Ver todos los agentes</LinkBtn>
            </div>
          </div>

          {/* row 4: sentiment */}
          <div style={{ ...C }}>
            <STitle>Análisis de sentimiento en llamadas</STitle>
            <div style={{ display:'flex', gap:16 }}>
              {/* donut */}
              <div style={{ flexShrink:0 }}>
                <SentimentDonut />
              </div>
              {/* divider */}
              <div style={{ width:1, background:'#1e2433', flexShrink:0 }} />
              {/* topics */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:600, color:'#94a3b8' }}>Temas más frecuentes</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {TOPICS.map(t => (
                    <span key={t.name} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:`${t.color}15`, border:`1px solid ${t.color}28`, color:t.color, fontWeight:600 }}>
                      {t.name} <span style={{ fontWeight:400, opacity:0.7 }}>{t.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* divider */}
              <div style={{ width:1, background:'#1e2433', flexShrink:0 }} />
              {/* key moment */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:600, color:'#94a3b8' }}>Momento clave de mayor éxito</p>
                <p style={{ margin:'0 0 12px', fontSize:11, color:'#94a3b8', lineHeight:1.5 }}>
                  Los agentes obtienen mejores resultados en los primeros 90 segundos de la llamada.
                </p>
                <div style={{ position:'relative' }}>
                  <div style={{ height:5, borderRadius:99, background:'#1a2235' }}>
                    <div style={{ width:'25%', height:'100%', borderRadius:99, background:'linear-gradient(90deg,#7c3aed,#22d3ee)' }} />
                  </div>
                  <div style={{ position:'absolute', left:'25%', top:-5, width:2, height:15, background:'#22d3ee', borderRadius:1 }} />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                    {['0s','90s','180s','270s','360s'].map(l => <span key={l} style={{ fontSize:9.5, color:'#4b5563' }}>{l}</span>)}
                  </div>
                </div>
              </div>
              {/* divider */}
              <div style={{ width:1, background:'#1e2433', flexShrink:0 }} />
              {/* keywords */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:600, color:'#94a3b8' }}>Palabras que más convierten</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {KEYWORDS.map(k => (
                    <span key={k} style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'#1a2235', border:'1px solid #2d3748', color:'#e2e8f0', fontWeight:500 }}>{k}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── right sidebar ── */}
        <div className="dark-scroll" style={{ width:295, flexShrink:0, overflowY:'auto', paddingBottom:16, display:'flex', flexDirection:'column', gap:12 }}>

          {/* insights clave */}
          <div style={{ ...C, padding:'14px 16px' }}>
            <STitle>Insights clave</STitle>
            <div>
              {INSIGHT_CARDS.map((ic,i) => <InsightCard key={i} card={ic} />)}
            </div>
            <LinkBtn>Ver todos los insights</LinkBtn>
          </div>

          {/* oportunidades */}
          <div style={{ ...C, padding:'14px 16px' }}>
            <p style={{ margin:'0 0 12px', fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Oportunidades detectadas por IA</p>
            {OPPS.map((o,i) => <OppCard key={i} opp={o} />)}
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div style={{ padding:'9px 24px', borderTop:'1px solid #111827', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#4b5563' }}>Los insights se actualizan cada 24 horas con los datos más recientes de tu cuenta.</span>
        <span style={{ fontSize:11, color:'#4b5563' }}>Última actualización: Hoy, 09:30</span>
      </div>
    </div>
  )
}
