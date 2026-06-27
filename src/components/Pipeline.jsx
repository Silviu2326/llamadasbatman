import React, { useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  PieChart, Pie, Cell, Tooltip, CartesianGrid,
} from 'recharts'
import {
  RiMoneyDollarBoxLine, RiBriefcaseLine, RiLineChartLine,
  RiPercentLine, RiCalendar2Line, RiPhoneLine, RiCalendarLine,
  RiFilterLine, RiAddLine, RiMoreLine, RiArrowRightLine,
  RiInformationLine, RiAlertLine, RiGroupLine, RiRocketLine,
} from 'react-icons/ri'
import KPICard from './KPICard'
import '../dashboard.css'
import NewOportunidadModal from '../modals/NewOportunidadModal'

// ─── shared ──────────────────────────────────────────────────────────────────
const card = { background: '#0d1117', border: '1px solid #1e2433', borderRadius: 13 }

const tooltipStyle = {
  contentStyle: { background: 'rgba(10,14,26,0.97)', border: '1px solid #1e2433', borderRadius: 10, fontSize: 12 },
  labelStyle:   { color: '#94a3b8', marginBottom: 4 },
  itemStyle:    { color: '#f1f5f9' },
}

// ─── data ─────────────────────────────────────────────────────────────────────
const PIPELINE_KPI = [
  { Icon: RiMoneyDollarBoxLine, iconBg:'#6d28d9', label:'Valor total del\npipeline',    value:'€1.245.800', pct:28.4, color:'#a78bfa',
    data:[880,920,950,1000,1050,1080,1100,1120,1140,1160,1170,1180,1190,1200,1210,1220,1230,1235,1240,1245] },
  { Icon: RiBriefcaseLine,      iconBg:'#0e7490', label:'Oportunidades',                value:'342',        pct:22.1, color:'#22d3ee',
    data:[200,215,222,230,240,248,255,262,268,275,280,285,290,298,305,312,318,325,334,342] },
  { Icon: RiLineChartLine,      iconBg:'#1e40af', label:'Valor\nponderado',             value:'€562.450',   pct:26.7, color:'#60a5fa',
    data:[380,395,405,418,430,442,452,465,476,488,498,508,518,527,535,542,548,553,558,562] },
  { Icon: RiPercentLine,        iconBg:'#b45309', label:'Tasa de conversión\nglobal',   value:'14,7%',      pct:2.3,  color:'#fbbf24',
    data:[11,11.5,11.8,12,12.3,12.6,12.9,13.1,13.4,13.6,13.8,14,14.1,14.2,14.3,14.4,14.5,14.6,14.65,14.7] },
  { Icon: RiCalendar2Line,      iconBg:'#0d9488', label:'Ciclo\npromedio',              value:'23 días',    pct:14.8, color:'#2dd4bf',
    data:[27,27,26,26,26,25,25,25,25,24,24,24,24,24,23,23,23,23,23,23] },
]

const STAGES = [
  { id:'lead',        label:'Lead',            count:87, value:'€86.400',  color:'#7c3aed', mas:84, Icon:null },
  { id:'contactado',  label:'Contactado',       count:64, value:'€124.300', color:'#2563eb', mas:61, Icon:RiPhoneLine },
  { id:'interesado',  label:'Interesado',       count:52, value:'€203.100', color:'#0891b2', mas:49, Icon:null },
  { id:'reunion',     label:'Reunión agendada', count:31, value:'€289.600', color:'#059669', mas:28, Icon:RiCalendarLine },
  { id:'propuesta',   label:'Propuesta',        count:18, value:'€342.800', color:'#d97706', mas:15, Icon:null },
  { id:'negociacion', label:'Negociación',      count:10, value:'€199.600', color:'#ea580c', mas:7,  Icon:null },
  { id:'ganado',      label:'Ganado',           count:8,  value:'€245.800', color:'#10b981', mas:5,  Icon:null },
]

const OPPS = [
  { stage:'lead',        company:'Innovate Corp',      city:'Barcelona', value:'€12.000', score:65, badge:'Nuevo',            date:'Hoy, 09:15',    bg:'#4f46e5' },
  { stage:'lead',        company:'DataPro Iberia',     city:'Madrid',    value:'€8.500',  score:58, badge:'Nuevo',            date:'Hoy, 02:18',    bg:'#0891b2' },
  { stage:'lead',        company:'Global Industries',  city:'Barcelona', value:'€15.000', score:72, badge:'Nuevo',            date:'Ayer, 19:45',   bg:'#7c3aed' },
  { stage:'contactado',  company:'TechSolutions S.L.', city:'Madrid',    value:'€18.500', score:71, badge:'Contactado',       date:'Hoy, 14:30',    bg:'#2563eb' },
  { stage:'contactado',  company:'Buildit Solutions',  city:'Bilbao',    value:'€7.200',  score:62, badge:'Contactado',       date:'Ayer',          bg:'#0d9488' },
  { stage:'contactado',  company:'LogiTech',           city:'Zaragoza',  value:'€9.800',  score:55, badge:'Contactado',       date:'Ayer, 10:05',   bg:'#7c3aed' },
  { stage:'interesado',  company:'MedCare Systems',    city:'Barcelona', value:'€24.000', score:78, badge:'Interesado',       date:'23 may',        bg:'#0891b2' },
  { stage:'interesado',  company:'NextGen Tech',       city:'Madrid',    value:'€21.500', score:83, badge:'Interesado',       date:'21 may',        bg:'#4f46e5' },
  { stage:'interesado',  company:'Retail Group',       city:'Sevilla',   value:'€14.600', score:68, badge:'Interesado',       date:'22 may, 12:18', bg:'#059669' },
  { stage:'reunion',     company:'EducaOnline',        city:'Barcelona', value:'€31.000', score:85, badge:'Reunión',          date:'23 may, 11:00', bg:'#059669' },
  { stage:'reunion',     company:'FinanzIA',           city:'Madrid',    value:'€17.800', score:79, badge:'Reunión',          date:'Hoy, 13:30',    bg:'#2563eb' },
  { stage:'reunion',     company:'HealthPlus',         city:'Valencia',  value:'€22.000', score:74, badge:'Reunión',          date:'27 may, 10:00', bg:'#0891b2' },
  { stage:'propuesta',   company:'Smart Factory',      city:'Bilbao',    value:'€42.500', score:86, badge:'Propuesta enviada',date:'Hoy, 16:20',    bg:'#7c3aed' },
  { stage:'propuesta',   company:'CloudScale',         city:'Madrid',    value:'€36.000', score:82, badge:'Propuesta enviada',date:'30 may, 13:10', bg:'#ea580c' },
  { stage:'propuesta',   company:'Vision AI',          city:'Barcelona', value:'€28.300', score:77, badge:'Propuesta enviada',date:'18 may',        bg:'#0d9488' },
  { stage:'negociacion', company:'Alpha Solutions',    city:'Bilbao',    value:'€58.000', score:88, badge:'Negociación',      date:'Hoy, 12:15',    bg:'#7c3aed' },
  { stage:'negociacion', company:'BigData Corp',       city:'Barcelona', value:'€47.600', score:84, badge:'Negociación',      date:'Ayer, 16:00',   bg:'#2563eb' },
  { stage:'negociacion', company:'SecureOps',          city:'Valencia',  value:'€34.000', score:78, badge:'Negociación',      date:'20 may, 11:30', bg:'#ea580c' },
  { stage:'ganado',      company:'TechSolutions S.L.', city:'Madrid',    value:'€45.000', score:null,badge:'Ganado',         date:'Hoy, 09:30',    bg:'#2563eb' },
  { stage:'ganado',      company:'MedCare Systems',    city:'Barcelona', value:'€38.000', score:null,badge:'Ganado',         date:'Ayer, 14:22',   bg:'#0891b2' },
  { stage:'ganado',      company:'EducaOnline',        city:'Barcelona', value:'€29.800', score:null,badge:'Ganado',         date:'18 may, 10:15', bg:'#059669' },
]

const FUNNEL_DATA = [
  { label:'Lead',        pct:100,  count:87, color:'#7c3aed' },
  { label:'Contactado',  pct:73.6, count:64, color:'#2563eb' },
  { label:'Interesado',  pct:59.8, count:52, color:'#0891b2' },
  { label:'Reunión',     pct:35.6, count:31, color:'#059669' },
  { label:'Propuesta',   pct:20.7, count:18, color:'#d97706' },
  { label:'Negociación', pct:11.5, count:10, color:'#ea580c' },
  { label:'Ganado',      pct:9.2,  count:8,  color:'#10b981' },
]

const DONUT_DATA = [
  { name:'Lead',        value:86400,  pct:6.9,  color:'#7c3aed' },
  { name:'Contactado',  value:124300, pct:10.0, color:'#2563eb' },
  { name:'Interesado',  value:203100, pct:16.3, color:'#0891b2' },
  { name:'Reunión',     value:289600, pct:23.2, color:'#059669' },
  { name:'Propuesta',   value:342800, pct:27.5, color:'#d97706' },
  { name:'Negociación', value:199600, pct:16.0, color:'#ea580c' },
]

const PREDICTION_DATA = [
  { date:'20 abr', value:280 },
  { date:'27 abr', value:298 },
  { date:'4 may',  value:322 },
  { date:'11 may', value:358 },
  { date:'18 may', value:386 },
]

const INSIGHTS = [
  { color:'#7c3aed', text:'Las oportunidades en negociación tienen un 67% de probabilidad de cierre.' },
  { color:'#2563eb', text:'El mejor día para agendar reuniones es los martes.' },
  { color:'#059669', text:'El sector tecnológico tiene la mayor tasa de conversión (18.7%).' },
]

const ACCIONES = [
  { Icon:RiAlertLine,   color:'#f59e0b', bg:'#f59e0b0c', border:'#f59e0b25', title:'3 oportunidades necesitan seguimiento',  desc:'Podrías perder €68.500',                    cta:'Ver oportunidades' },
  { Icon:RiRocketLine,  color:'#8b5cf6', bg:'#8b5cf60c', border:'#8b5cf625', title:'2 propuestas sin respuesta > 3 días',   desc:'Enviar recordatorio puede aumentar 32%',    cta:'Ver propuestas' },
  { Icon:RiCalendarLine,color:'#10b981', bg:'#10b9810c', border:'#10b98125', title:'Mejor momento para contactar',           desc:'Mañana 10:00 - 12:00',                      cta:'Ver calendario' },
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

function OppCard({ opp, stageColor }) {
  return (
    <div style={{
      background: '#0a0e18', border: '1px solid #1e2433', borderRadius: 10,
      padding: '9px 9px', display: 'flex', flexDirection: 'column', gap: 7, cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <CompanyLogo name={opp.company} bg={opp.bg} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.company}</p>
          <p style={{ margin: 0, fontSize: 9.5, color: '#4b5563' }}>{opp.city}, ES</p>
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

function KanbanColumn({ stage }) {
  const opps = OPPS.filter(o => o.stage === stage.id)
  return (
    <div style={{
      minWidth: 163, width: 163, display: 'flex', flexDirection: 'column',
      background: '#090d18', border: '1px solid #1a2235', borderRadius: 13,
      borderTop: `3px solid ${stage.color}`, flexShrink: 0,
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
        {opps.map((opp, i) => <OppCard key={i} opp={opp} stageColor={stage.color} />)}
      </div>

      <div style={{ padding: '8px 11px 11px', marginTop: 6, borderTop: '1px solid #1a2235' }}>
        <button style={{ background: 'none', border: 'none', color: stage.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          + {stage.mas} más
        </button>
      </div>
    </div>
  )
}

// ─── right panel ─────────────────────────────────────────────────────────────
function ConversionFunnel() {
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Conversión por etapa</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {FUNNEL_DATA.map(({ label, pct, count, color }) => (
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

function DonutPanel() {
  const D = 148
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Valor del pipeline por etapa</h3>
      <div style={{ position: 'relative', width: D, height: D, margin: '0 auto 8px' }}>
        <PieChart width={D} height={D}>
          <Pie data={DONUT_DATA} cx={D/2} cy={D/2} innerRadius={44} outerRadius={66}
            dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
            {DONUT_DATA.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle}
            formatter={(v, n, p) => [`€${(v/1000).toFixed(1)}k`, p.payload.name]} />
        </PieChart>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>€1.245.800</div>
          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>Total</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DONUT_DATA.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0, boxShadow: `0 0 5px ${d.color}` }} />
            <span style={{ flex: 1, fontSize: 10, color: '#94a3b8' }}>{d.name}</span>
            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>€{(d.value/1000).toFixed(1)}k</span>
            <span style={{ fontSize: 9.5, color: '#4b5563' }}>({d.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PredictionPanel() {
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Predicción de cierre (próx. 30 días)</h3>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5, marginBottom: 2 }}>€386.200</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>↑24.3%</span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>vs. periodo anterior</span>
      </div>
      <ResponsiveContainer width="100%" height={85}>
        <AreaChart data={PREDICTION_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a2235" vertical={false} />
          <XAxis dataKey="date" tick={{ fill:'#6b7280', fontSize:8 }} axisLine={false} tickLine={false} />
          <YAxis domain={[250,420]} ticks={[300,400]}
            tickFormatter={v => `€${v}k`}
            tick={{ fill:'#6b7280', fontSize:8 }} axisLine={false} tickLine={false} width={34} />
          <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={v => [`€${v}k`, 'Predicción']} />
          <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={8} strokeOpacity={0.18} fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2.5}
            fill="url(#predGrad)" dot={{ r:3, fill:'#8b5cf6', stroke:'#080c14', strokeWidth:2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function InsightsPanel() {
  return (
    <div style={{ ...card, padding: '13px 14px' }} className="fade-up">
      <h3 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Insights IA</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {INSIGHTS.map((ins, i) => (
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
export default function Pipeline() {
  const [showNewOpp, setShowNewOpp] = useState(false)

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
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiCalendarLine style={{ width: 13, height: 13 }} /> 12 may 2024 - 18 may 2024
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiFilterLine style={{ width: 13, height: 13 }} /> Filtros
          </button>
          <button style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 10px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <RiMoreLine style={{ width: 14, height: 14 }} />
          </button>
          <button onClick={() => setShowNewOpp(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 9, padding: '7px 15px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 18px #4f46e544' }}>
            <RiAddLine style={{ width: 14, height: 14 }} /> Nueva oportunidad
          </button>
        </div>
      </div>

      {showNewOpp && <NewOportunidadModal onClose={() => setShowNewOpp(false)} />}

      {/* body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── left scrollable ── */}
        <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* KPI row */}
          <div style={{ display: 'flex', gap: 10 }}>
            {PIPELINE_KPI.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} />)}
          </div>

          {/* Kanban board */}
          <div className="dark-scroll" style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {STAGES.map(stage => <KanbanColumn key={stage.id} stage={stage} />)}
            </div>
          </div>

          {/* Acciones recomendadas */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Acciones recomendadas por IA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {ACCIONES.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: a.bg, border: `1px solid ${a.border}`, borderRadius: 13, padding: '16px 18px' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `${a.color}20`, border: `1px solid ${a.color}38`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <a.Icon style={{ width: 20, height: 20, color: a.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{a.title}</p>
                    <p style={{ margin: '0 0 7px', fontSize: 11.5, color: '#6b7280' }}>{a.desc}</p>
                    <button style={{ background: 'none', border: 'none', color: a.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {a.cta} <RiArrowRightLine style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── right panel ── */}
        <div className="dark-scroll" style={{ width: 255, flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid #1e2433', padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ConversionFunnel />
          <DonutPanel />
          <PredictionPanel />
          <InsightsPanel />
        </div>
      </div>
    </div>
  )
}
