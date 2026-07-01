import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from 'recharts'
import {
  RiBarChartLine, RiCalendarLine, RiFilterLine, RiDownloadLine,
  RiMoneyDollarBoxLine, RiGroupLine, RiLineChartLine, RiRocketLine,
  RiPhoneLine, RiTimeLine, RiRobot2Line, RiArrowRightLine,
  RiSparklingLine, RiCalendar2Line, RiPercentLine,
} from 'react-icons/ri'
import KPICard from './KPICard'
import DataTable from './DataTable'
import { apiFetch } from '../lib/api'
import '../dashboard.css'

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
function Empty({ msg = 'Sin datos' }) {
  return <p style={{ textAlign:'center', color:'#374151', fontSize:12, padding:'24px 0', margin:0 }}>{msg}</p>
}

// ─── charts ───────────────────────────────────────────────────────────────────
function TimeChart({ data, period, onPeriod }) {
  if (!data.length) return <Empty msg="Sin datos de llamadas aún" />
  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Actividad a lo largo del tiempo</p>
        <select value={period} onChange={e=>onPeriod(e.target.value)} style={{ background:'#111827', border:'1px solid #1e2433', borderRadius:7, padding:'4px 10px', color:'#94a3b8', fontSize:11.5, cursor:'pointer', outline:'none' }}>
          {['Diario','Semanal','Mensual'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ display:'flex', gap:14, marginBottom:10 }}>
        {[{color:'#22d3ee',label:'Llamadas'},{color:'#34d399',label:'Reuniones'}].map(l => (
          <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:l.color }} />
            <span style={{ fontSize:10.5, color:'#6b7280' }}>{l.label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top:8, right:8, bottom:0, left:4 }}>
          <XAxis dataKey="date" tick={{ fontSize:10, fill:'#4b5563' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize:9, fill:'#4b5563' }} axisLine={false} tickLine={false} width={24} />
          <Tooltip {...tt} />
          <Bar dataKey="llamadas" fill="#22d3ee" fillOpacity={0.7} radius={[3,3,0,0]} />
          <Line type="monotone" dataKey="reuniones" stroke="#34d399" strokeWidth={2} dot={{ r:3, fill:'#34d399' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

function CampaignDonut({ data }) {
  if (!data.length) return <Empty msg="Sin campañas con llamadas aún" />
  const COLORS = ['#6366f1','#0891b2','#2563eb','#f59e0b','#6b7280','#7c3aed','#059669']
  const total = data.reduce((s, c) => s + c.value, 0)
  return (
    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
      <div style={{ position:'relative', width:130, height:130, flexShrink:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <p style={{ margin:0, fontSize:14, fontWeight:800, color:'#f1f5f9' }}>{total}</p>
          <p style={{ margin:0, fontSize:9, color:'#6b7280' }}>Total llamadas</p>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7, flex:1, minWidth:0 }}>
        {data.slice(0, 5).map((c, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:COLORS[i % COLORS.length], flexShrink:0 }} />
              <span style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <span style={{ fontSize:11.5, fontWeight:700, color:'#f1f5f9' }}>{c.value}</span>
              <span style={{ fontSize:10, color:'#4b5563', marginLeft:4 }}>({c.pct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CampaignBar({ data }) {
  if (!data.length) return <Empty msg="Sin campañas aún" />
  const COLORS = ['#6366f1','#0891b2','#2563eb','#f59e0b','#6b7280','#7c3aed','#059669']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {data.slice(0, 5).map((c, i) => (
        <div key={i}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:11.5, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'60%' }}>{c.name}</span>
            <div style={{ display:'flex', gap:8 }}>
              <span style={{ fontSize:11.5, fontWeight:700, color:'#f1f5f9' }}>{c.value} llamadas</span>
              <span style={{ fontSize:11, color:'#6b7280', width:28 }}>{c.pct}%</span>
            </div>
          </div>
          <div style={{ height:6, borderRadius:99, background:'#1a2235' }}>
            <div style={{ height:'100%', borderRadius:99, width:`${c.pct}%`, background:`linear-gradient(90deg,${COLORS[i % COLORS.length]},${COLORS[i % COLORS.length]}99)`, boxShadow:`0 0 6px ${COLORS[i % COLORS.length]}60` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PipelineFunnelChart({ data }) {
  if (!data.length) return <Empty msg="Sin datos de pipeline" />
  const COLORS = ['#6366f1','#4f46e5','#0891b2','#0d9488','#059669','#10b981']
  const max = data[0]?.value || 1
  const W = 130, H = 30, GAP = 2
  const totalH = data.length * H + (data.length - 1) * GAP
  return (
    <div style={{ display:'flex', gap:12 }}>
      <svg width={W} height={totalH} style={{ flexShrink:0 }}>
        {data.map((s, i) => {
          const topW = (s.value / max) * W
          const nextW = data[i+1] ? (data[i+1].value / max) * W : topW * 0.65
          const tl = (W - topW) / 2, tr = (W + topW) / 2
          const bl = (W - nextW) / 2, br = (W + nextW) / 2
          const y = i * (H + GAP)
          return (
            <polygon key={i} points={`${tl},${y} ${tr},${y} ${br},${y+H} ${bl},${y+H}`}
              fill={COLORS[i % COLORS.length]} opacity={0.88} />
          )
        })}
      </svg>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:GAP }}>
        {data.map((s, i) => (
          <div key={i} style={{ height:H, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{s.label}</span>
            <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentsTable({ data }) {
  if (!data.length) return <Empty msg="Sin llamadas de agentes aún" />
  const BG = ['#4f46e5','#059669','#be185d','#d97706','#7c3aed','#0891b2','#065f46','#312e81']
  const renderRow = (a, i) => [
    <div key="n" style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:BG[i % BG.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
        {a.name.slice(0, 2).toUpperCase()}
      </div>
      <span style={{ fontSize:12, color:'#f1f5f9', fontWeight:500 }}>{a.name}</span>
    </div>,
    <span key="c" style={{ fontSize:13, color:'#e2e8f0', fontWeight:600 }}>{a.calls}</span>,
  ]
  return (
    <DataTable
      columns={['Agente','Llamadas totales']}
      gridTemplate="1fr 100px"
      rows={data.map((a, i) => ({ ...a, id: i }))}
      rowKey="id"
      renderRow={renderRow}
      scrollable={false}
      style={{ background:'transparent', border:'none', borderRadius:0 }}
    />
  )
}

function SentimentDonut({ sentiment }) {
  const data = [
    { name:'Positivo', value: sentiment.positive, color:'#10b981' },
    { name:'Neutral',  value: sentiment.neutral,  color:'#f59e0b' },
    { name:'Negativo', value: sentiment.negative, color:'#ef4444' },
  ]
  const hasData = data.some(d => d.value > 0)
  return (
    <div style={{ display:'flex', gap:14, alignItems:'center' }}>
      <div style={{ position:'relative', width:90, height:90, flexShrink:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={hasData ? data : [{ name:'Sin datos', value:1, color:'#1a2235' }]} cx="50%" cy="50%" innerRadius={30} outerRadius={44} dataKey="value" strokeWidth={0}>
              {(hasData ? data : [{ color:'#1a2235' }]).map((s,i) => <Cell key={i} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#10b981' }}>{sentiment.positive || '—'}%</p>
          <p style={{ margin:0, fontSize:8, color:'#6b7280' }}>Positivo</p>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {data.map((s,i) => (
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

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Insights() {
  const [period, setPeriod] = useState('Diario')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const kpis = stats ? [
    { Icon:RiMoneyDollarBoxLine, iconBg:'#6d28d9', label:'Pipeline\ncerrado',           value: stats.closedWonValue ? `€${Math.round(stats.closedWonValue).toLocaleString()}` : '€0',  pct: stats.kpiPcts?.pipeline ?? 0, color:'#a78bfa', data:[] },
    { Icon:RiCalendarLine,       iconBg:'#0e7490', label:'Reuniones\nagendadas',         value: String(stats.meetingsScheduled ?? 0), pct: stats.kpiPcts?.meetings ?? 0, color:'#22d3ee', data:[] },
    { Icon:RiPercentLine,        iconBg:'#047857', label:'Tasa de conversión\nglobal',   value: `${stats.conversionRate ?? 0}%`,      pct: 0, color:'#34d399', data:[] },
    { Icon:RiPhoneLine,          iconBg:'#b45309', label:'Llamadas\ntotales',            value: String(stats.totalCalls ?? 0),        pct: stats.kpiPcts?.calls ?? 0, color:'#fbbf24', data:[] },
    { Icon:RiGroupLine,          iconBg:'#4f46e5', label:'Leads\ntotales',               value: String(stats.totalLeads ?? 0),        pct: stats.kpiPcts?.leads ?? 0, color:'#818cf8', data:[] },
  ] : []

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
          <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Descubre patrones, mide el rendimiento y obtén recomendaciones para impulsar tus resultados.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
            <RiFilterLine style={{ width:13, height:13 }} /> Filtros
          </button>
        </div>
      </div>

      {/* body */}
      <div style={{ flex:1, display:'flex', gap:14, overflow:'hidden', padding:'0 24px 0' }}>

        {/* ── left main ── */}
        <div className="dark-scroll" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, paddingBottom:16, minWidth:0 }}>

          {loading ? (
            <p style={{ textAlign:'center', color:'#4b5563', fontSize:13, padding:'60px 0' }}>Cargando insights…</p>
          ) : (
            <>
              {/* KPI row */}
              <div style={{ display:'flex', gap:10 }}>
                {kpis.map((k,i) => <KPICard key={i} {...k} delay={`${i*50}ms`} />)}
              </div>

              {/* row 2: time chart + campaign donut */}
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ ...C, flex:2, minWidth:0 }}>
                  <TimeChart data={stats?.timeSeries ?? []} period={period} onPeriod={setPeriod} />
                </div>
                <div style={{ ...C, flex:1, minWidth:220 }}>
                  <STitle>Llamadas por campaña</STitle>
                  <CampaignDonut data={stats?.callsByCampaign ?? []} />
                </div>
              </div>

              {/* row 3: campaign bar + funnel + agents */}
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ ...C, flex:1, minWidth:0 }}>
                  <STitle>Distribución por campaña</STitle>
                  <CampaignBar data={stats?.callsByCampaign ?? []} />
                </div>
                <div style={{ ...C, flex:1, minWidth:0 }}>
                  <STitle>Embudo de conversión</STitle>
                  <PipelineFunnelChart data={stats?.funnel ?? []} />
                </div>
                <div style={{ ...C, flex:1, minWidth:0 }}>
                  <STitle>Llamadas por agente IA</STitle>
                  <AgentsTable data={stats?.agentLeaderboard ?? []} />
                </div>
              </div>

              {/* row 4: sentiment */}
              <div style={{ ...C }}>
                <STitle>Análisis de sentimiento en llamadas</STitle>
                {stats?.sentiment ? (
                  <div style={{ display:'flex', gap:16 }}>
                    <SentimentDonut sentiment={stats.sentiment} />
                    <div style={{ width:1, background:'#1e2433', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center' }}>
                      <div>
                        <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:600, color:'#94a3b8' }}>Distribución de sentimiento</p>
                        <p style={{ margin:0, fontSize:11.5, color:'#6b7280', lineHeight:1.6 }}>
                          Los datos de sentimiento se generan automáticamente a partir de las transcripciones de llamadas procesadas por el servicio de voz.
                        </p>
                        {!stats.sentiment.positive && !stats.sentiment.neutral && !stats.sentiment.negative && (
                          <p style={{ margin:'10px 0 0', fontSize:11.5, color:'#4b5563' }}>Sin llamadas procesadas aún.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Empty msg="Sin datos de sentimiento aún" />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── right sidebar ── */}
        <div className="dark-scroll" style={{ width:280, flexShrink:0, overflowY:'auto', paddingBottom:16, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ ...C, padding:'14px 16px' }}>
            <STitle>Resumen global</STitle>
            {loading ? (
              <p style={{ fontSize:12, color:'#4b5563', margin:0 }}>Cargando…</p>
            ) : stats ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { label:'Campañas activas', value: stats.activeCampaigns ?? 0 },
                  { label:'Pipeline total', value: stats.pipelineValue ? `€${Math.round(stats.pipelineValue).toLocaleString()}` : '€0' },
                  { label:'Pipeline cerrado', value: stats.closedWonValue ? `€${Math.round(stats.closedWonValue).toLocaleString()}` : '€0' },
                  { label:'Tasa de conv.', value: `${stats.conversionRate ?? 0}%` },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 11px', background:'#111827', borderRadius:9, border:'1px solid #1a2235' }}>
                    <span style={{ fontSize:11.5, color:'#94a3b8' }}>{s.label}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>{String(s.value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty msg="Sin datos" />
            )}
          </div>

          <div style={{ ...C, padding:'14px 16px' }}>
            <STitle>Pipeline por día (últimos 7 días)</STitle>
            {loading ? (
              <p style={{ fontSize:12, color:'#4b5563', margin:0 }}>Cargando…</p>
            ) : (stats?.pipelineByDay?.length ? (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {stats.pipelineByDay.map((d, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'#6b7280' }}>{d.date}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>
                      {d.value ? `€${Math.round(d.value).toLocaleString()}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty msg="Sin oportunidades esta semana" />
            ))}
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div style={{ padding:'9px 24px', borderTop:'1px solid #111827', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#4b5563' }}>Los datos se actualizan en tiempo real desde tu cuenta.</span>
      </div>
    </div>
  )
}
