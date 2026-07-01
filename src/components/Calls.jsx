import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiPhoneLine, RiTimeLine, RiPercentLine, RiCalendarLine, RiCalendar2Line,
  RiSearchLine, RiFilterLine, RiDownload2Line, RiFullscreenLine,
  RiArrowRightLine, RiSendPlaneLine, RiBarChartHorizontalLine, RiCloseLine,
} from 'react-icons/ri'
import { HiChevronDown, HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, YAxis, ReferenceLine, XAxis,
} from 'recharts'
import '../dashboard.css'
import KPICard from './KPICard'

// ─── Data ─────────────────────────────────────────────────────────────────────
const KPI_LIST = [
  { Icon: RiPhoneLine,               iconBg: '#6366f1', color: '#818cf8', label: 'Total\nllamadas',      value: '2.847',  pct: 18.6, data: [180,200,190,220,210,250,285] },
  { Icon: RiTimeLine,                iconBg: '#06b6d4', color: '#22d3ee', label: 'Duración\npromedio',    value: '6m 42s', pct: 8.3,  data: [5.8,6.0,5.9,6.2,6.4,6.5,6.7] },
  { Icon: RiPercentLine,             iconBg: '#10b981', color: '#34d399', label: 'Tasa de\nconversión',   value: '14,7%',  pct: 2.3,  data: [12,12.5,13,13.5,14,14.6,14.7] },
  { Icon: RiCalendarLine,            iconBg: '#8b5cf6', color: '#a78bfa', label: 'Reuniones\nagendadas',  value: '342',    pct: 22.1, data: [210,230,255,280,310,335,342] },
  { Icon: RiBarChartHorizontalLine,  iconBg: '#f59e0b', color: '#fbbf24', label: 'Sentimiento\npromedio', value: '+0.68',  pct: 6.7,  data: [0.52,0.55,0.60,0.62,0.65,0.67,0.68] },
  { Icon: RiSendPlaneLine,           iconBg: '#ec4899', color: '#f472b6', label: 'Llamadas\nen frío',     value: '42%',    pct: 4.8,  data: [36,38,39,40,41,42,42] },
]

const STATUS_MAP = {
  'Reunión agendada':  { color: '#10b981', bg: '#10b98115' },
  'Interesado':        { color: '#f59e0b', bg: '#f59e0b15' },
  'Seguimiento':       { color: '#3b82f6', bg: '#3b82f615' },
  'No interesado':     { color: '#ef4444', bg: '#ef444415' },
  'Propuesta enviada': { color: '#8b5cf6', bg: '#8b5cf615' },
}

export const CALLS = [
  { id:1, initials:'MR', bg:'#4f46e5', name:'María Rodríguez',    company:'TechSolutions S.L.', role:'Directora de Operaciones', time:'Hoy, 11:32',  dur:'8m 24s', status:'Reunión agendada',  score:+0.82, agent:'Sofía'  },
  { id:2, initials:'JA', bg:'#0891b2', name:'José Antonio López', company:'DataPro Iberia',     role:'Director Comercial',       time:'Hoy, 10:15',  dur:'5m 12s', status:'Interesado',        score:+0.35, agent:'Sofía'  },
  { id:3, initials:'CR', bg:'#059669', name:'Carlos Ruiz',        company:'Global Industries',  role:'CEO',                      time:'Hoy, 09:48',  dur:'7m 03s', status:'Seguimiento',       score:+0.12, agent:'Carlos' },
  { id:4, initials:'LP', bg:'#7c3aed', name:'Laura Pérez',        company:'MedCare Systems',    role:'Gerente de Ventas',        time:'Ayer, 17:21', dur:'6m 51s', status:'No interesado',     score:-0.45, agent:'Sofía'  },
  { id:5, initials:'AM', bg:'#1d4ed8', name:'Ana Martínez',       company:'Innovate Corp',      role:'CTO',                      time:'Ayer, 16:05', dur:'4m 33s', status:'Reunión agendada',  score:+0.91, agent:'María'  },
  { id:6, initials:'FB', bg:'#b45309', name:'Fernando Blasco',    company:'BuildIt Solutions',  role:'Director de Expansión',    time:'Ayer, 15:42', dur:'9m 18s', status:'Propuesta enviada', score:+0.67, agent:'Carlos' },
  { id:7, initials:'SG', bg:'#be185d', name:'Sandra García',      company:'LogiTech',           role:'VP Operaciones',           time:'Ayer, 14:11', dur:'3m 27s', status:'No interesado',     score:-0.62, agent:'Sofía'  },
  { id:8, initials:'DV', bg:'#047857', name:'David Vidal',        company:'Retail Group',       role:'Director Comercial',       time:'Ayer, 13:03', dur:'6m 02s', status:'Interesado',        score:+0.21, agent:'María'  },
]

const TRANSCRIPT = [
  { isAgent:true,  time:'00:00', text:'¡Hola María! Soy Sofía de Acme Solutions. Vi que vuestro equipo está creciendo rápido. ¿Tienes 2 minutos para ver cómo ayudamos a empresas como TechSolutions a automatizar su proceso comercial?' },
  { isAgent:false, time:'00:18', text:'Hola Sofía, sí, cuéntame brevemente.' },
  { isAgent:true,  time:'00:21', text:'Perfecto. Trabajamos con empresas SaaS como la vuestra para aumentar las reuniones cualificadas. En promedio, conseguimos un 35% más de demos agendadas en los primeros 60 días.' },
  { isAgent:false, time:'00:38', text:'Interesante. ¿Y cómo lo conseguís?' },
  { isAgent:true,  time:'00:42', text:'Usamos agentes IA que se llaman como humanos, entienden el contexto y conectan con los leads en el momento justo...' },
]

const MOMENTS = [
  { time:'02:15', color:'#10b981', text:'Mencionó dolor: "falta de seguimiento"'       },
  { time:'03:42', color:'#f59e0b', text:'Objeción: "No tenemos presupuesto ahora"'     },
  { time:'05:10', color:'#3b82f6', text:'Interés alto: "¿Y qué resultados reales tenéis?"' },
  { time:'07:33', color:'#8b5cf6', text:'Señal de compra: "Agendemos una demo"'        },
]

const SENT_DATA = [
  {t:'0:00',v:0.08},{t:'1:00',v:0.35},{t:'2:00',v:0.45},{t:'3:00',v:-0.15},
  {t:'4:00',v:0.20},{t:'5:00',v:0.58},{t:'6:00',v:0.72},{t:'7:00',v:0.68},{t:'8:24',v:0.82},
]

const WAVE = [
  3,6,9,14,8,16,11,7,15,10,13,8,17,12,9,6,11,15,8,10,14,7,12,16,
  9,11,6,15,10,8,14,17,11,9,7,13,15,10,8,14,12,16,9,7,13,10,
  15,8,11,14,9,6,16,11,8,13,10,15,7,9,12,14,8,11,
]

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Avatar({ initials, bg, size = 38 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      background: `linear-gradient(135deg, ${bg}, ${bg}bb)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700, color: '#fff',
      boxShadow: `0 0 14px ${bg}55`,
    }}>
      {initials}
    </div>
  )
}

function Badge({ status }) {
  const s = STATUS_MAP[status] || { color: '#6b7280', bg: '#6b728015' }
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      borderRadius: 99, padding: '2px 9px', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function ScoreTag({ score }) {
  const pos = score >= 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: pos ? '#4ade80' : '#f87171',
      background: pos ? '#4ade8012' : '#f8717112',
      border: `1px solid ${pos ? '#4ade8030' : '#f8717130'}`,
      borderRadius: 6, padding: '1px 6px',
    }}>
      {pos ? '+' : ''}{score.toFixed(2)}
    </span>
  )
}

// SVG donut ring for confidence %
function Ring({ pct, size = 70 }) {
  const cx = size / 2, r = size * 0.37, sw = size * 0.11
  const C = 2 * Math.PI * r, dash = (pct / 100) * C
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e2433" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#10b981" strokeWidth={sw}
          strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cx}px`, filter: 'drop-shadow(0 0 4px #10b98170)' }}
        />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: size * 0.2, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</p>
      </div>
    </div>
  )
}

// Fake audio waveform
function Waveform() {
  const playedPct = 0.12
  return (
    <div style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {WAVE.map((h, i) => {
        const frac = i / WAVE.length
        const played = frac < playedPct
        const hPct = (h / 17) * 100
        return (
          <div key={i} style={{
            flex: 1, borderRadius: 2, minHeight: 2, height: `${hPct}%`,
            background: played
              ? 'linear-gradient(180deg,#818cf8,#6366f1)'
              : frac < 0.45
              ? `hsl(${220 + i * 2}, 60%, ${15 + (h / 17) * 20}%)`
              : '#1e2433',
          }} />
        )
      })}
    </div>
  )
}

// ─── Pagination button style ───────────────────────────────────────────────────
const pgBtn = {
  width: 24, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11.5, fontWeight: 500, background: 'transparent',
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const TABS = ['Transcripción', 'Resumen IA', 'Análisis', 'Objeciones', 'Momento clave', 'Información']

const BG = ['#4f46e5','#0891b2','#059669','#7c3aed','#1d4ed8','#b45309','#be185d','#047857']
const OUTCOME_MAP = { meeting_scheduled:'Reunión agendada', interested:'Interesado', rejected:'No interesado', callback:'Seguimiento', none:'Seguimiento' }

function mapCall(c, i) {
  const durSec = c.durationSeconds ?? 0
  return {
    id: c.id,
    initials: (c.lead?.name ?? '??').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase(),
    bg: BG[i % BG.length],
    name: c.lead?.name ?? '—',
    company: c.lead?.company ?? '—',
    role: c.lead?.role ?? '',
    time: c.startedAt ? new Date(c.startedAt).toLocaleString('es-ES',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—',
    dur: durSec ? `${Math.floor(durSec/60)}m ${durSec%60}s` : '—',
    _durSec: durSec,
    status: OUTCOME_MAP[c.outcome] ?? 'Seguimiento',
    score: c.sentimentScore ?? 0,
    agent: c.agent?.name ?? '—',
  }
}

export default function CallsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [calls, setCalls] = useState([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [stats, setStats] = useState(null)

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(s => setStats(s)).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch(`/api/calls?page=${page}&limit=20`).then(r => r.json()).then(d => {
      const items = d.data ?? d
      if (!Array.isArray(items)) return
      setMeta({ total: d.total ?? items.length, totalPages: d.totalPages ?? 1 })
      setCalls(items.map(mapCall))
    }).catch(() => {})
  }, [page])

  const kpiList = useMemo(() => {
    if (!stats) return KPI_LIST.map(k => ({ ...k, value: '—', pct: null }))
    const durCalls = calls.filter(c => c._durSec > 0)
    const avgDurSec = durCalls.length ? durCalls.reduce((s, c) => s + c._durSec, 0) / durCalls.length : 0
    const avgDurStr = avgDurSec ? `${Math.floor(avgDurSec/60)}m ${Math.round(avgDurSec%60)}s` : KPI_LIST[1].value
    const scoreCalls = calls.filter(c => c.score !== 0)
    const avgScore = scoreCalls.length ? scoreCalls.reduce((s, c) => s + c.score, 0) / scoreCalls.length : null
    return KPI_LIST.map((k, i) => ({
      ...k, pct: null,
      value: [
        (stats.totalCalls ?? 0).toLocaleString('es-ES'),
        avgDurStr,
        `${stats.conversionRate ?? 0}%`,
        (stats.meetingsScheduled ?? 0).toLocaleString('es-ES'),
        avgScore != null ? (avgScore >= 0 ? `+${avgScore.toFixed(2)}` : avgScore.toFixed(2)) : k.value,
        k.value,
      ][i],
    }))
  }, [stats, calls])

  const filtered = search
    ? calls.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company.toLowerCase().includes(search.toLowerCase())
      )
    : calls

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#080c14' }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Llamadas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Consulta, analiza y gestiona todas las llamadas realizadas por tus agentes IA.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117',
            border: '1px solid #1e2433', borderRadius: 10, padding: '8px 14px',
            color: '#94a3b8', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            <RiCalendar2Line style={{ width: 14, height: 14 }} />
            12 may 2024 – 18 may 2024
            <HiChevronDown style={{ width: 11, height: 11 }} />
          </button>
          {[
            { label: 'Filtros',  Icon: RiFilterLine,   action: () => {} },
            { label: 'Exportar', Icon: RiDownload2Line, action: () => alert('Exportando llamadas...') },
          ].map(({ label, Icon, action }) => (
            <button key={label} onClick={action} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117',
              border: '1px solid #1e2433', borderRadius: 10, padding: '8px 14px',
              color: '#94a3b8', fontSize: 12.5, cursor: 'pointer',
            }}>
              <Icon style={{ width: 14, height: 14 }} />
              {label}
              {label === 'Exportar' && <HiChevronDown style={{ width: 11, height: 11 }} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI bar ── */}
      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, flexShrink: 0 }}>
        {kpiList.map((k, i) => (
          <KPICard key={i} {...k} delay={`${i * 60}ms`} compact />
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', padding: '0 24px 24px' }}>

        {/* ── Call list ── */}
        <div style={{
          flex: 1,
          flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}>
          <div style={{ padding: '16px 16px 12px', flexShrink: 0 }}>
            <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Todas las llamadas</p>
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#4b5563' }}>{meta.total.toLocaleString('es-ES')} llamadas</p>
            <div style={{ position: 'relative' }}>
              <RiSearchLine style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                width: 14, height: 14, color: '#4b5563', pointerEvents: 'none',
              }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar llamada, contacto o empresa..."
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#111827',
                  border: '1px solid #1e2433', borderRadius: 9,
                  padding: '8px 10px 8px 32px', color: '#e2e8f0', fontSize: 11.5,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <p style={{ margin: '40px 0', textAlign: 'center', fontSize: 13, color: '#4b5563' }}>
                Sin llamadas registradas
              </p>
            )}
            {filtered.map(c => {
              return (
                <div key={c.id} onClick={() => navigate('/llamadas/' + c.id)}
                  style={{
                    display: 'flex', gap: 10, padding: '11px 16px', cursor: 'pointer',
                    background: 'transparent',
                    borderLeft: '2px solid transparent',
                    borderBottom: '1px solid #111827', transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ffffff07' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Avatar initials={c.initials} bg={c.bg} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                      <p style={{
                        margin: 0, fontSize: 12.5, fontWeight: 600, color: '#f1f5f9',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.name}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 10.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{c.time}</span>
                        <Badge status={c.status} />
                      </div>
                    </div>
                    <p style={{ margin: '0 0 5px', fontSize: 11, color: '#4b5563' }}>{c.company}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10.5, color: '#6b7280' }}>{c.dur}</span>
                      <ScoreTag score={c.score} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div style={{
            padding: '10px 16px', borderTop: '1px solid #111827', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 10.5, color: '#4b5563' }}>
              Mostrando {Math.min((page-1)*20+1, meta.total)} a {Math.min(page*20, meta.total)} de {meta.total.toLocaleString('es-ES')} llamadas
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                style={{ ...pgBtn, color: page === 1 ? '#1e2433' : '#4b5563' }}>
                <HiChevronLeft style={{ width: 12, height: 12 }} />
              </button>
              {[page-1, page, page+1].filter(n => n >= 1 && n <= meta.totalPages).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  style={{ ...pgBtn, background: n === page ? '#6366f1' : 'transparent', color: n === page ? '#fff' : '#6b7280' }}>
                  {n}
                </button>
              ))}
              {page + 1 < meta.totalPages && (
                <>
                  <span style={{ fontSize: 11, color: '#4b5563', padding: '0 2px' }}>…</span>
                  <button onClick={() => setPage(meta.totalPages)}
                    style={{ ...pgBtn, color: '#6b7280' }}>{meta.totalPages}</button>
                </>
              )}
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p+1))} disabled={page === meta.totalPages}
                style={{ ...pgBtn, color: page === meta.totalPages ? '#1e2433' : '#4b5563' }}>
                <HiChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Call detail ── */}
        {false && <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
          background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, overflow: 'hidden',
        }}>

          {/* Contact header */}
          <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #111827', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar initials={selected.initials} bg={selected.bg} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 3px', fontSize: 17, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.name}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                  {selected.company} · {selected.role}
                </p>
              </div>

              {/* Sentiment + Confidence */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 28, fontWeight: 800, color: '#4ade80', lineHeight: 1, textShadow: '0 0 20px #4ade8055' }}>
                    {selected.score >= 0 ? '+' : ''}{selected.score.toFixed(2)}
                  </p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#6b7280' }}>Sentimiento</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Ring pct={92} size={68} />
                  <p style={{ margin: 0, fontSize: 10, color: '#6b7280', textAlign: 'center', lineHeight: 1.3 }}>Confianza en<br />resultado</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 5, background: '#111827',
                  border: '1px solid #1e2433', borderRadius: 9, padding: '8px 13px',
                  color: '#94a3b8', fontSize: 12.5, cursor: 'pointer',
                }}>
                  Acciones <HiChevronDown style={{ width: 12, height: 12 }} />
                </button>
                <button onClick={() => setSelected(null)} style={{
                  width: 34, height: 34, borderRadius: 9, border: '1px solid #1e2433',
                  background: '#111827', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#6b7280', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef444420'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#ef444440' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#111827'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#1e2433' }}
                >
                  <RiCloseLine style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge status={selected.status} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#111827', border: '1px solid #1e2433', borderRadius: 99, padding: '3px 10px',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7.5, fontWeight: 800, color: '#fff',
                }}>
                  {selected.agent.slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Agente: {selected.agent}</span>
              </div>
              {[
                { icon: RiCalendar2Line, text: selected.time },
                { icon: RiTimeLine,       text: selected.dur  },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#111827', border: '1px solid #1e2433', borderRadius: 99, padding: '3px 10px',
                }}>
                  <Icon style={{ width: 12, height: 12, color: '#6b7280' }} />
                  <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Audio player */}
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid #111827', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10, background: '#080c14',
          }}>
            <button style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 14px #6366f155',
            }} onClick={() => setPlaying(v => !v)}>
              {playing ? (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="white">
                  <rect x="2" y="1.5" width="3" height="9" rx="1" />
                  <rect x="7" y="1.5" width="3" height="9" rx="1" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="white">
                  <path d="M3 1.5 L10 6 L3 10.5 Z" />
                </svg>
              )}
            </button>
            <span style={{ fontSize: 11.5, color: '#6b7280', flexShrink: 0 }}>00:00</span>
            <Waveform />
            <span style={{ fontSize: 11.5, color: '#6b7280', flexShrink: 0 }}>
              {selected.dur.replace('m ', ':').replace('s', '')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span onClick={() => setSpeed(s => { const i = SPEEDS.indexOf(s); return SPEEDS[(i + 1) % SPEEDS.length] })} style={{
                fontSize: 11, color: '#6b7280', background: '#111827',
                border: '1px solid #1e2433', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
              }}>{speed}x</span>
              <RiDownload2Line style={{ width: 16, height: 16, color: '#4b5563', cursor: 'pointer' }} />
              <RiFullscreenLine style={{ width: 16, height: 16, color: '#4b5563', cursor: 'pointer' }} />
            </div>
          </div>

          {/* Tabs + content */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Tab + transcript area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #111827', padding: '0 20px', flexShrink: 0 }}>
                {TABS.map(t => {
                  const key = t.toLowerCase().replace(/\s/g, '')
                  const active = tab === key
                  return (
                    <button key={t} onClick={() => setTab(key)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '11px 12px', fontSize: 12.5, whiteSpace: 'nowrap',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#818cf8' : '#6b7280',
                      borderBottom: `2px solid ${active ? '#6366f1' : 'transparent'}`,
                      marginBottom: -1,
                    }}>
                      {t}
                    </button>
                  )
                })}
              </div>

              <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {tab !== 'transcripción' && (
                  <p style={{ textAlign: 'center', padding: '40px 16px', color: '#374151', fontSize: 13 }}>
                    Próximamente en <strong style={{ color: '#818cf8' }}>{TABS.find(t => t.toLowerCase().replace(/\s/g, '') === tab)}</strong>
                  </p>
                )}
                {tab === 'transcripción' && TRANSCRIPT.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: m.isAgent
                        ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
                        : `linear-gradient(135deg,${selected.bg},${selected.bg}cc)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#fff',
                      boxShadow: m.isAgent ? '0 0 10px #6366f155' : 'none',
                    }}>
                      {m.isAgent ? selected.agent.slice(0, 2).toUpperCase() : selected.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: m.isAgent ? '#818cf8' : '#f1f5f9' }}>
                          {m.isAgent ? `${selected.agent} (Agente IA)` : selected.name}
                        </span>
                        <span style={{
                          fontSize: 10.5, color: '#374151', background: '#111827',
                          borderRadius: 4, padding: '1px 6px',
                        }}>
                          {m.time}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.65 }}>{m.text}</p>
                    </div>
                  </div>
                ))}
                {tab === 'transcripción' && <button style={{
                  display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                  cursor: 'pointer', color: '#6366f1', fontSize: 12.5, fontWeight: 600, padding: 0,
                }}>
                  Ver transcripción completa <HiChevronDown style={{ width: 13, height: 13 }} />
                </button>}
              </div>
            </div>

            {/* Sentiment sidebar */}
            <div className="dark-scroll" style={{
              width: 216, flexShrink: 0, borderLeft: '1px solid #111827',
              overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 18,
            }}>

              {/* Sentiment chart */}
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Análisis de sentimiento</p>
                <div style={{ height: 80, marginBottom: 4 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={SENT_DATA} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <YAxis domain={[-1, 1]} hide />
                      <XAxis dataKey="t" hide />
                      <ReferenceLine y={0} stroke="#1e2433" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5}
                        dot={false} animationDuration={1200} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {['1.0', '0', '-1.0'].map(l => (
                    <span key={l} style={{ fontSize: 9.5, color: '#374151' }}>{l}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  {['0:00', '2:00', '4:00', '6:00', '8:24'].map(l => (
                    <span key={l} style={{ fontSize: 9, color: '#374151' }}>{l}</span>
                  ))}
                </div>
              </div>

              {/* Distribution */}
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                  Distribución del sentimiento
                </p>
                {[
                  { label: 'Positivo', pct: 74, color: '#10b981' },
                  { label: 'Neutral',  pct: 18, color: '#f59e0b' },
                  { label: 'Negativo', pct: 8,  color: '#ef4444' },
                ].map(d => (
                  <div key={d.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{d.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e2e8f0' }}>{d.pct}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: '#111827' }}>
                      <div style={{
                        width: `${d.pct}%`, height: '100%', borderRadius: 99,
                        background: d.color, boxShadow: `0 0 6px ${d.color}60`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Key moments */}
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Momentos clave</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {MOMENTS.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', background: m.color,
                        flexShrink: 0, marginTop: 4, boxShadow: `0 0 5px ${m.color}80`,
                      }} />
                      <div>
                        <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600 }}>{m.time}</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{m.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: 'pointer', color: '#6366f1', fontSize: 11.5, fontWeight: 600,
                  padding: '10px 0 0', marginTop: 2,
                }}>
                  Ver todos los momentos
                </button>
              </div>
            </div>
          </div>
        </div>}
      </div>
    </div>
  )
}
