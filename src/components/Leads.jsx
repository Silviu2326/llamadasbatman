import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { mapLead } from '../lib/leadMapping'
import {
  RiGroupLine, RiStarLine, RiTimeLine, RiCalendarLine, RiCalendar2Line,
  RiMoneyDollarBoxLine, RiSearchLine, RiFilterLine, RiAddLine,
  RiMoreLine, RiPhoneLine, RiMailLine, RiMailOpenLine, RiFileTextLine,
  RiCloseLine, RiLightbulbLine, RiSendPlaneLine, RiEyeLine,
  RiUpload2Line, RiEditLine, RiDeleteBinLine, RiBarChartBoxLine,
  RiSearchEyeLine, RiGlobalLine, RiMapPin2Line, RiLayoutGridLine,
  RiTableLine, RiFileDownloadLine,
} from 'react-icons/ri'
import { HiChevronDown, HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import '../dashboard.css'
import KPICard from './KPICard'
import DataTable from './DataTable'
import NewLeadModal from '../modals/NewLeadModal'
import ImportLeadsModal from '../modals/ImportLeadsModal'
import NewReunionModal from '../modals/NewReunionModal'

const TIER_COLOR = { HOT: '#ef4444', WARM: '#f59e0b', COLD: '#3b82f6' }
const AUDIT_FILTERS = [
  { key: 'noWebsite',   label: 'Sin web' },
  { key: 'noBooking',   label: 'Sin reservas online' },
  { key: 'noAnalytics', label: 'Sin Analytics' },
  { key: 'fewReviews',  label: 'Pocas reseñas (<10)' },
]

// ─── Data ─────────────────────────────────────────────────────────────────────
const KPI_LIST = [
  { Icon: RiGroupLine,           iconBg: '#6366f1', color: '#818cf8', label: 'Total\nleads',        value: '2.584',    pct: 18.6, data: [180,200,220,240,250,260,258] },
  { Icon: RiStarLine,            iconBg: '#f59e0b', color: '#fbbf24', label: 'Leads\ncalientes',    value: '612',      pct: 24.2, data: [420,450,490,530,560,590,612] },
  { Icon: RiTimeLine,            iconBg: '#06b6d4', color: '#22d3ee', label: 'En\nseguimiento',     value: '1.248',    pct: 12.8, data: [1000,1050,1100,1150,1200,1230,1248] },
  { Icon: RiCalendarLine,        iconBg: '#10b981', color: '#34d399', label: 'Reuniones\nagendadas', value: '342',      pct: 22.1, data: [210,230,255,280,310,335,342] },
  { Icon: RiMoneyDollarBoxLine,  iconBg: '#8b5cf6', color: '#a78bfa', label: 'Valor\npipeline',     value: '€1.245.8', pct: 28.4, data: [800,900,970,1050,1130,1200,1246] },
]

const STATUS_MAP = {
  'Interesado':       { color: '#f59e0b', bg: '#f59e0b15' },
  'En seguimiento':   { color: '#3b82f6', bg: '#3b82f615' },
  'Reunión agendada': { color: '#10b981', bg: '#10b98115' },
  'Nuevo':            { color: '#94a3b8', bg: '#94a3b815' },
  'Negociación':      { color: '#8b5cf6', bg: '#8b5cf615' },
  'Contactado':       { color: '#06b6d4', bg: '#06b6d415' },
  'Perdido':          { color: '#ef4444', bg: '#ef444415' },
  'Ganado':           { color: '#10b981', bg: '#10b98115' },
}

const SCORE_COLOR = { 'Muy alto': '#10b981', 'Alto': '#3b82f6', 'Medio': '#f59e0b', 'Bajo': '#ef4444' }

const ACT_ICONS = {
  phone:    { Icon: RiPhoneLine,    color: '#3b82f6' },
  email:    { Icon: RiMailLine,     color: '#8b5cf6' },
  mailopen: { Icon: RiMailOpenLine, color: '#06b6d4' },
  calendar: { Icon: RiCalendarLine, color: '#10b981' },
  upload:   { Icon: RiUpload2Line,  color: '#94a3b8' },
  send:     { Icon: RiSendPlaneLine,color: '#f59e0b' },
  eye:      { Icon: RiEyeLine,      color: '#06b6d4' },
  delete:   { Icon: RiDeleteBinLine,color: '#ef4444' },
}

export const LEADS = [
  { id:1, initials:'CM', bg:'#4f46e5', name:'Carlos Méndez',    role:'CTO',               company:'TechSolutions S.L.',  ci:'TS', cb:'#0891b2', status:'Interesado',       score:82, sl:'Muy alto', act:{ type:'phone',    date:'Hoy, 11:32',       action:'Llamada realizada'   }, value:'€45.000', agent:{i:'SM',bg:'#4f46e5'}, closePct:82, closeLevel:'Muy alta',  potValue:'€45.000', source:'Importación CRM', painPoints:['Integraciones complejas','Falta de visibilidad','Procesos manuales','Escalabilidad'], tags:['SaaS','+50 empleados','España','Tecnología'] },
  { id:2, initials:'LF', bg:'#7c3aed', name:'Laura Fernández',  role:'Directora de Ops',  company:'DataPro Iberia',       ci:'DP', cb:'#1d4ed8', status:'En seguimiento',   score:71, sl:'Alto',     act:{ type:'email',    date:'Ayer, 16:45',      action:'Email enviado'       }, value:'€32.000', agent:{i:'CG',bg:'#059669'}, closePct:65, closeLevel:'Alta',     potValue:'€32.000', source:'LinkedIn',       painPoints:['Gestión de datos','Automatización'],                                              tags:['B2B','Madrid']         },
  { id:3, initials:'JR', bg:'#059669', name:'Javier Ruiz',      role:'Head of Sales',     company:'Global Industries',    ci:'GI', cb:'#047857', status:'Reunión agendada', score:68, sl:'Alto',     act:{ type:'calendar', date:'Ayer, 09:15',      action:'Reunión agendada'    }, value:'€28.000', agent:{i:'SM',bg:'#4f46e5'}, closePct:60, closeLevel:'Alta',     potValue:'€28.000', source:'Referido',       painPoints:['Pipeline visibility','Lead tracking'],                                            tags:['Enterprise','Ventas']  },
  { id:4, initials:'AB', bg:'#0891b2', name:'Ana Beltrán',      role:'Marketing Manager', company:'Innovate Corp',        ci:'IC', cb:'#6366f1', status:'Nuevo',            score:45, sl:'Medio',    act:{ type:'upload',   date:'24 may, 14:22',   action:'Lead importado'      }, value:'€18.000', agent:{i:'ML',bg:'#b45309'}, closePct:35, closeLevel:'Media',    potValue:'€18.000', source:'Web form',       painPoints:['ROI marketing'],                                                                  tags:['Startup','Barcelona']  },
  { id:5, initials:'MS', bg:'#b45309', name:'Miguel Ángel Soto',role:'CEO',               company:'BuildIt Solutions',    ci:'BS', cb:'#92400e', status:'Negociación',      score:88, sl:'Muy alto', act:{ type:'send',     date:'23 may, 11:05',   action:'Propuesta enviada'   }, value:'€65.000', agent:{i:'SM',bg:'#4f46e5'}, closePct:78, closeLevel:'Muy alta',  potValue:'€65.000', source:'Evento',         painPoints:['Escalabilidad','Costes operativos'],                                              tags:['Construcción','Enterprise'] },
  { id:6, initials:'SV', bg:'#be185d', name:'Sofía Vargas',     role:'IT Manager',        company:'MedCare Systems',      ci:'MC', cb:'#9d174d', status:'Contactado',       score:53, sl:'Medio',    act:{ type:'phone',    date:'23 may, 10:12',   action:'Llamada realizada'   }, value:'€21.000', agent:{i:'CG',bg:'#059669'}, closePct:40, closeLevel:'Media',    potValue:'€21.000', source:'Cold email',     painPoints:['Compliance','Seguridad datos'],                                                   tags:['Salud','Regulado']     },
  { id:7, initials:'DN', bg:'#374151', name:'Diego Navarro',    role:'COO',               company:'LogiTech',             ci:'LT', cb:'#374151', status:'Perdido',          score:20, sl:'Bajo',     act:{ type:'delete',   date:'22 may, 17:30',   action:'Lead descartado'     }, value:'€0',      agent:{i:'ML',bg:'#b45309'}, closePct:5,  closeLevel:'Baja',     potValue:'€0',      source:'Web',            painPoints:[],                                                                                 tags:['Logística']            },
  { id:8, initials:'EG', bg:'#047857', name:'Elena Gómez',      role:'Finance Director',  company:'Retail Group',         ci:'RG', cb:'#1d4ed8', status:'Interesado',       score:74, sl:'Alto',     act:{ type:'mailopen', date:'22 may, 15:48',   action:'Email abierto'       }, value:'€38.000', agent:{i:'SM',bg:'#4f46e5'}, closePct:62, closeLevel:'Alta',     potValue:'€38.000', source:'LinkedIn',       painPoints:['Reporting','Visibilidad financiera'],                                             tags:['Retail','Madrid']      },
  { id:9, initials:'RT', bg:'#1d4ed8', name:'Ramón Torres',     role:'Product Manager',   company:'NextGen Tech',         ci:'NG', cb:'#6366f1', status:'En seguimiento',   score:61, sl:'Alto',     act:{ type:'phone',    date:'21 may, 13:22',   action:'Llamada realizada'   }, value:'€24.000', agent:{i:'CG',bg:'#059669'}, closePct:55, closeLevel:'Media',    potValue:'€24.000', source:'Referido',       painPoints:['Time to market','Procesos ágiles'],                                               tags:['Tech','SaaS']          },
]

const FILTER_TABS = ['Todos','Nuevos','Contactados','Interesados','Reunión','Negociación','Ganados','Perdidos']
const DETAIL_TABS = ['Resumen','Actividad','Información','Notas','Archivos']
const COLS = '40px 1fr 145px 105px 120px 84px 150px 90px 46px 160px'
const TABLE_HEADERS = ['Lead','Empresa','Estado','Oportunidad','Puntaje ⓘ','Última actividad','Valor potencial','Agente','Acciones']
const WAVE_MINI = [3,5,9,14,8,16,11,7,15,10,13,17,12,9,6,14,8,11,15,7,10,13]

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Avatar({ initials, bg, size = 36, round = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: round ? '50%' : Math.round(size * 0.28),
      background: `linear-gradient(135deg,${bg},${bg}bb)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700, color: '#fff', flexShrink: 0,
      boxShadow: `0 0 12px ${bg}55`,
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

function ActivityCell({ act }) {
  const cfg = ACT_ICONS[act.type] || ACT_ICONS.phone
  const Icon = cfg.Icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 12, height: 12, color: cfg.color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {act.date}
        </p>
        <p style={{ margin: 0, fontSize: 10.5, color: '#4b5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {act.action}
        </p>
      </div>
    </div>
  )
}

function OpportunityBadge({ audit }) {
  if (!audit) {
    return <span style={{ fontSize: 10.5, color: '#4b5563', background: '#111827', border: '1px solid #1e2433', borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>Sin auditar</span>
  }
  const color = TIER_COLOR[audit.tier] || '#6b7280'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>
        {audit.tier}
      </span>
      <span style={{ fontSize: 11, color: '#6b7280' }}>{audit.leadOpportunityScore}</span>
    </div>
  )
}

function QuickActions({ lead, onAudited }) {
  const [busy, setBusy] = useState(null)

  async function runAudit(e) {
    e.stopPropagation()
    setBusy('audit')
    try {
      const res = await apiFetch(`/api/leads/${lead.id}/audit`, { method: 'POST', body: JSON.stringify({}) })
      if (res.ok) onAudited?.()
    } finally {
      setBusy(null)
    }
  }

  async function callNow(e) {
    e.stopPropagation()
    setBusy('call')
    try {
      await apiFetch(`/api/leads/${lead.id}/call-now`, { method: 'POST' })
    } finally {
      setBusy(null)
    }
  }

  const btnStyle = (disabled) => ({
    width: 26, height: 26, borderRadius: 7, border: '1px solid #1e2433', background: '#111827',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, color: '#94a3b8',
  })

  return (
    <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
      <button title="Auditar" onClick={runAudit} disabled={busy === 'audit'} style={btnStyle(busy === 'audit')}>
        <RiSearchEyeLine style={{ width: 12, height: 12 }} />
      </button>
      <button title="Abrir web" onClick={e => { e.stopPropagation(); lead.website && window.open(lead.website, '_blank') }} disabled={!lead.website} style={btnStyle(!lead.website)}>
        <RiGlobalLine style={{ width: 12, height: 12 }} />
      </button>
      <button title="Abrir Maps" onClick={e => { e.stopPropagation(); lead.mapsUri && window.open(lead.mapsUri, '_blank') }} disabled={!lead.mapsUri} style={btnStyle(!lead.mapsUri)}>
        <RiMapPin2Line style={{ width: 12, height: 12 }} />
      </button>
      <button title="Llamar ahora" onClick={callNow} disabled={busy === 'call'} style={btnStyle(busy === 'call')}>
        <RiPhoneLine style={{ width: 12, height: 12 }} />
      </button>
    </div>
  )
}

// SVG ring for close probability
function Ring({ pct, color = '#10b981', size = 68 }) {
  const cx = size / 2, r = size * 0.37, sw = size * 0.11
  const C = 2 * Math.PI * r, dash = (pct / 100) * C
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e2433" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cx}px`, filter: `drop-shadow(0 0 4px ${color}70)` }}
        />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: size * 0.2, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</p>
      </div>
    </div>
  )
}

// Mini waveform for last activity
function MiniWave() {
  return (
    <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {WAVE_MINI.map((h, i) => (
        <div key={i} style={{
          flex: 1, borderRadius: 1, minHeight: 2,
          height: `${(h / 17) * 100}%`,
          background: i < 9 ? 'linear-gradient(180deg,#818cf8,#6366f1)' : '#1e2433',
        }} />
      ))}
    </div>
  )
}

// Table header cell
function TH({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', userSelect: 'none', ...style }}>
      {children}
    </div>
  )
}

// ─── Right panel ─────────────────────────────────────────────────────────────
function LeadDetail({ lead, onClose, onSchedule }) {
  const [tab, setTab] = useState('Resumen')
  const [showNote, setShowNote] = useState(false)
  const [showAllPains, setShowAllPains] = useState(false)
  const closeColor = SCORE_COLOR[lead.sl] || '#10b981'

  return (
    <div className="panel-desktop" style={{
      width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <Avatar initials={lead.initials} bg={lead.bg} size={54} round />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.name}
              </p>
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#fff', flexShrink: 0,
                background: '#374151', borderRadius: 6, padding: '1px 7px',
              }}>
                {lead.score}
              </span>
            </div>
            <p style={{ margin: '0 0 7px', fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.role} en {lead.company}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981', flexShrink: 0 }} />
              <Badge status={lead.status} />
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid #1e2433',
            background: '#111827', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ef444420'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#111827'; e.currentTarget.style.color = '#6b7280' }}
          >
            <RiCloseLine style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', borderTop: '1px solid #111827', paddingTop: 10, paddingBottom: 10, gap: 0 }}>
          {[
            { Icon: RiPhoneLine,    label: 'Llamar',  action: () => window.open(`tel:+34600000000`) },
            { Icon: RiMailLine,     label: 'Email',   action: () => window.open(`mailto:?subject=Seguimiento - ${lead.name}`) },
            { Icon: RiCalendar2Line,label: 'Agendar', action: onSchedule },
            { Icon: RiFileTextLine, label: 'Nota',    action: () => setShowNote(v => !v) },
            { Icon: RiMoreLine,     label: 'Más',     action: () => {} },
          ].map(({ Icon, label, action }) => (
            <button key={label} onClick={action} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px',
              borderRadius: 8, transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Icon style={{ width: 16, height: 16, color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
            </button>
          ))}
        </div>
        {showNote && (
          <div style={{ padding: '0 14px 12px', borderBottom: '1px solid #111827' }}>
            <textarea
              placeholder="Escribe una nota..."
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 68, background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '8px 10px', color: '#94a3b8', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
        )}

        {/* Detail tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid #111827', marginLeft: -14, marginRight: -14, paddingLeft: 14 }}>
          {DETAIL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '9px 8px', fontSize: 11.5, whiteSpace: 'nowrap',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#818cf8' : '#6b7280',
              borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`,
              marginBottom: -1,
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

        {tab !== 'Resumen' && (
          <p style={{ textAlign: 'center', padding: '40px 16px', color: '#374151', fontSize: 13 }}>
            Próximamente en <strong style={{ color: '#818cf8' }}>{tab}</strong>
          </p>
        )}

        {tab === 'Resumen' && (<>

        {/* Probabilidad de cierre */}
        <div style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#fff' }}>Probabilidad de cierre</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Ring pct={lead.closePct} color={closeColor} size={64} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: closeColor }}>{lead.closeLevel}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, color: '#4b5563' }}>Valor potencial</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>{lead.potValue}</span>
              </div>
              <p style={{ margin: '0 0 2px', fontSize: 10, color: '#4b5563' }}>Basado en IA ⓘ</p>
              <p style={{ margin: 0, fontSize: 10, color: '#4b5563' }}>Fuente: <span style={{ color: '#6b7280' }}>{lead.source}</span></p>
            </div>
          </div>
        </div>

        {/* Pain points */}
        {lead.painPoints.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>Pain points detectados</p>
              <button onClick={() => setShowAllPains(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, fontWeight: 600, padding: 0 }}>
                {showAllPains ? 'Ver menos' : 'Ver todos'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(showAllPains ? lead.painPoints : lead.painPoints.slice(0, 3)).map(p => (
                <span key={p} style={{
                  fontSize: 10.5, color: '#94a3b8', background: '#111827',
                  border: '1px solid #1e2433', borderRadius: 6, padding: '3px 8px',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Última actividad */}
        <div style={{ background: '#080c14', border: '1px solid #1e2433', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#fff' }}>Última actividad</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: '#6366f120',
              border: '1px solid #6366f130', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RiPhoneLine style={{ width: 13, height: 13, color: '#818cf8' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11.5, color: '#e2e8f0', fontWeight: 500 }}>
                Llamada realizada por Sofía (Agente IA)
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#4b5563' }}>
                {lead.act.date} · {lead.act.type === 'phone' ? '8m 24s' : '—'}
              </p>
            </div>
            <button style={{
              width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
                <path d="M2 1L8.5 5L2 9Z" />
              </svg>
            </button>
          </div>
          <MiniWave />
        </div>

        {/* Próxima acción IA */}
        <div style={{ background: '#0a0e1a', border: '1px solid #6366f130', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#fff' }}>Próxima acción sugerida por IA</p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: '#f59e0b20',
              border: '1px solid #f59e0b30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <RiLightbulbLine style={{ width: 13, height: 13, color: '#fbbf24' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
                Recomendar agendar demo técnica
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                El lead mostró interés en la solución y tiene un pain point claro.
              </p>
            </div>
          </div>
          <button onClick={onSchedule} style={{
            width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#4f46e5,#6366f1)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            boxShadow: '0 0 12px #6366f155',
          }}>
            Agendar demo
          </button>
        </div>

        {/* Etiquetas */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>Etiquetas</p>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, fontWeight: 600, padding: 0 }}>
              Editar
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {lead.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10.5, fontWeight: 500, padding: '3px 9px', borderRadius: 99,
                background: '#111827', border: '1px solid #1e2433', color: '#94a3b8',
              }}>
                {tag}
              </span>
            ))}
            <button style={{
              fontSize: 13, padding: '0px 8px', borderRadius: 99, border: '1px dashed #1e2433',
              background: 'none', color: '#4b5563', cursor: 'pointer',
            }}>+</button>
          </div>
        </div>

        </>)}
      </div>
    </div>
  )
}

// ─── Kanban por oportunidad ───────────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { key: 'HOT', label: 'HOT', color: TIER_COLOR.HOT },
  { key: 'WARM', label: 'WARM', color: TIER_COLOR.WARM },
  { key: 'COLD', label: 'COLD', color: TIER_COLOR.COLD },
  { key: 'SIN_AUDITAR', label: 'Sin auditar', color: '#4b5563' },
]

function KanbanBoard({ leads, onOpen }) {
  const groups = useMemo(() => {
    const g = { HOT: [], WARM: [], COLD: [], SIN_AUDITAR: [] }
    leads.forEach(l => { g[l.audit?.tier ?? 'SIN_AUDITAR'].push(l) })
    return g
  }, [leads])

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, overflow: 'hidden', padding: 16 }}>
      {KANBAN_COLUMNS.map(col => (
        <div key={col.key} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#080c14', border: '1px solid #1e2433', borderRadius: 12 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #111827', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, boxShadow: `0 0 6px ${col.color}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{col.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4b5563' }}>{groups[col.key].length}</span>
          </div>
          <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups[col.key].map(l => (
              <div key={l.id} onClick={() => onOpen(l.id)} style={{
                background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Avatar initials={l.initials} bg={l.bg} size={24} round />
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#f1f5f9', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
                  {l.audit && <span style={{ fontSize: 10.5, color: '#6b7280', flexShrink: 0 }}>{l.audit.leadOpportunityScore}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.company}</p>
              </div>
            ))}
            {groups[col.key].length === 0 && (
              <p style={{ textAlign: 'center', color: '#374151', fontSize: 11.5, padding: '20px 0' }}>Sin leads</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState(new Set([1]))
  const [showNewLead, setShowNewLead] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [leads, setLeads] = useState([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 })
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [view, setView] = useState('table')
  const [auditFilters, setAuditFilters] = useState(new Set())

  function toggleAuditFilter(key) {
    setAuditFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch(`/api/leads?page=${page}&limit=20`)
      .then(r => r.json())
      .then(d => {
        const items = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : []
        setMeta({ total: d.total ?? items.length, totalPages: d.totalPages ?? 1 })
        setLeads(items.map(mapLead))
      })
      .catch(() => {})
  }, [page, refreshKey])

  const kpiList = useMemo(() => {
    if (!stats) return KPI_LIST.map(k => ({ ...k, value: '—', pct: null }))
    const funnel = stats.funnel ?? []
    const hot = (funnel.find(f => f.label === 'Calificados')?.value ?? 0)
    const inProg = (funnel.find(f => f.label === 'Contactados')?.value ?? 0)
    return [
      { ...KPI_LIST[0], value: (stats.totalLeads ?? 0).toLocaleString('es-ES'), pct: stats.kpiPcts?.leads ?? null },
      { ...KPI_LIST[1], value: hot.toLocaleString('es-ES'), pct: null },
      { ...KPI_LIST[2], value: inProg.toLocaleString('es-ES'), pct: null },
      { ...KPI_LIST[3], value: (stats.meetingsScheduled ?? 0).toLocaleString('es-ES'), pct: stats.kpiPcts?.meetings ?? null },
      { ...KPI_LIST[4], value: `€${Math.round(stats.pipelineValue ?? 0).toLocaleString('es-ES')}`, pct: stats.kpiPcts?.pipeline ?? null },
    ]
  }, [stats])

  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.company.toLowerCase().includes(search.toLowerCase())) return false
    const map = { Nuevos: 'Nuevo', Contactados: 'Contactado', Interesados: 'Interesado', Reunión: 'Reunión agendada', Negociación: 'Negociación', Ganados: 'Ganado', Perdidos: 'Perdido' }
    if (activeFilter !== 'Todos' && l.status !== map[activeFilter]) return false
    for (const key of auditFilters) {
      if (!l.auditFlags?.[key]) return false
    }
    return true
  })

  function handleExportCsv() {
    downloadCsv('leads.csv', filtered.map(l => ({
      nombre: l.name, empresa: l.company, estado: l.status, telefono: l.phone,
      oportunidad: l.audit ? `${l.audit.tier} (${l.audit.leadOpportunityScore})` : 'Sin auditar',
      fuente: l.source,
    })))
  }

  const toggleCheck = id => setChecked(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const renderLead = (l) => {
    const isChecked = checked.has(l.id)
    return [
      <div key="cb" onClick={e => { e.stopPropagation(); toggleCheck(l.id) }}>
        <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ width: 14, height: 14, accentColor: '#6366f1', cursor: 'pointer' }} />
      </div>,
      <div key="le" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <Avatar initials={l.initials} bg={l.bg} size={34} round />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{l.role}</p>
        </div>
      </div>,
      <div key="em" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: `linear-gradient(135deg,${l.cb},${l.cb}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{l.ci}</div>
        <span style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.company}</span>
      </div>,
      <Badge key="st" status={l.status} />,
      <OpportunityBadge key="opp" audit={l.audit} />,
      <div key="sc">
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>{l.score}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: SCORE_COLOR[l.sl] || '#6b7280' }}>{l.sl}</p>
      </div>,
      <ActivityCell key="ac" act={l.act} />,
      <p key="vl" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: l.value === '€0' ? '#374151' : '#f1f5f9' }}>{l.value}</p>,
      <Avatar key="ag" initials={l.agent.i} bg={l.agent.bg} size={28} round />,
      <QuickActions key="actions" lead={l} onAudited={() => setRefreshKey(k => k + 1)} />,
    ]
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#080c14' }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Leads</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Gestiona, segmenta y da seguimiento a todos tus leads.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <RiSearchLine style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#4b5563', pointerEvents: 'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar leads..."
              style={{
                background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10,
                padding: '8px 10px 8px 32px', color: '#e2e8f0', fontSize: 12.5,
                outline: 'none', fontFamily: 'inherit', width: 200,
              }}
            />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#374151' }}>⌘K</span>
          </div>
          <button style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:10, padding:'8px 14px', color:'#94a3b8', fontSize:12.5, cursor:'pointer' }}>
            <RiFilterLine style={{ width: 14, height: 14 }} />
            Filtros
            <span style={{ background: '#6366f1', color: '#fff', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>2</span>
          </button>
          <button onClick={() => setShowImport(true)} style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:10, padding:'8px 14px', color:'#94a3b8', fontSize:12.5, cursor:'pointer' }}>
            Importar
          </button>
          <button onClick={handleExportCsv} style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:10, padding:'8px 14px', color:'#94a3b8', fontSize:12.5, cursor:'pointer' }}>
            <RiFileDownloadLine style={{ width: 14, height: 14 }} />
            Exportar CSV
          </button>
          <div style={{ display: 'flex', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setView('table')} title="Vista tabla" style={{
              display: 'flex', alignItems: 'center', padding: '6px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: view === 'table' ? '#6366f1' : 'transparent', color: view === 'table' ? '#fff' : '#6b7280',
            }}>
              <RiTableLine style={{ width: 14, height: 14 }} />
            </button>
            <button onClick={() => setView('kanban')} title="Vista Kanban" style={{
              display: 'flex', alignItems: 'center', padding: '6px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: view === 'kanban' ? '#6366f1' : 'transparent', color: view === 'kanban' ? '#fff' : '#6b7280',
            }}>
              <RiLayoutGridLine style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <button onClick={() => setShowNewLead(true)} style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', borderRadius:10, padding:'8px 16px', color:'#fff', fontSize:12.5, cursor:'pointer', fontWeight:600, boxShadow:'0 0 16px #6366f155' }}>
            <RiAddLine style={{ width: 15, height: 15 }} />
            Nuevo lead
          </button>
        </div>
      </div>

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} onSuccess={() => { setShowNewLead(false); setRefreshKey(k => k + 1) }} />}
      {showImport && <ImportLeadsModal onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); setRefreshKey(k => k + 1) }} />}

      {/* ── Filtros de auditoría ── */}
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
        {AUDIT_FILTERS.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={auditFilters.has(f.key)} onChange={() => toggleAuditFilter(f.key)} style={{ accentColor: '#6366f1' }} />
            {f.label}
          </label>
        ))}
      </div>

      {/* ── Body: left + right panel ── */}
      <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden', padding: '16px 24px 24px' }}>

        {/* Left column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* KPI bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 16, flexShrink: 0 }}>
            {kpiList.map((k, i) => (
              <KPICard key={i} {...k} delay={`${i * 60}ms`} compact />
            ))}
          </div>

          {/* Table / Kanban card */}
          {view === 'kanban' ? (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14 }}>
              <KanbanBoard leads={filtered} onOpen={id => navigate('/leads/' + id)} />
            </div>
          ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14,
          }}>

            {/* Filter tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #111827', flexShrink: 0 }}>
              <div style={{ display: 'flex' }}>
                {FILTER_TABS.map(t => (
                  <button key={t} onClick={() => setActiveFilter(t)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '12px 14px', fontSize: 12.5, whiteSpace: 'nowrap',
                    fontWeight: activeFilter === t ? 600 : 400,
                    color: activeFilter === t ? '#818cf8' : '#6b7280',
                    borderBottom: `2px solid ${activeFilter === t ? '#6366f1' : 'transparent'}`,
                    marginBottom: -1,
                  }}>
                    {t}
                  </button>
                ))}
              </div>
              <button style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:12.5, padding:'8px 0' }}>
                <RiBarChartBoxLine style={{ width: 14, height: 14 }} />
                Segmentar
              </button>
            </div>

            <DataTable
              headerContent={
                <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 16px', borderBottom: '1px solid #111827', flexShrink: 0, gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" style={{ width: 14, height: 14, accentColor: '#6366f1', cursor: 'pointer' }} />
                  </div>
                  {TABLE_HEADERS.map(h => (
                    <span key={h} style={{ fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</span>
                  ))}
                </div>
              }
              gridTemplate={COLS}
              rows={filtered}
              rowKey="id"
              onSelect={l => navigate('/leads/' + l.id)}
              renderRow={renderLead}
              accent="#6366f1"
              emptyText="Sin leads registrados"
              style={{ background: 'transparent', border: 'none', borderRadius: 0, flex: 1, minHeight: 0 }}
            />

            {/* Pagination */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid #111827', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#4b5563' }}>
                Mostrando {meta.total === 0 ? 0 : Math.min((page-1)*20+1, meta.total)} a {Math.min(page*20, meta.total)} de {meta.total.toLocaleString('es-ES')} leads
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <PgBtn onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
                  <HiChevronLeft style={{ width: 12, height: 12 }} />
                </PgBtn>
                {[page-1, page, page+1].filter(n => n >= 1 && n <= meta.totalPages).map(n => (
                  <PgBtn key={n} active={n === page} onClick={() => setPage(n)}>{n}</PgBtn>
                ))}
                {page + 1 < meta.totalPages && (
                  <>
                    <span style={{ fontSize: 11, color: '#4b5563', padding: '0 2px' }}>…</span>
                    <PgBtn onClick={() => setPage(meta.totalPages)}>{meta.totalPages}</PgBtn>
                  </>
                )}
                <PgBtn onClick={() => setPage(p => Math.min(meta.totalPages, p+1))} disabled={page === meta.totalPages}>
                  <HiChevronRight style={{ width: 12, height: 12 }} />
                </PgBtn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#4b5563' }}>20 por página</span>
                <HiChevronDown style={{ width: 12, height: 12, color: '#4b5563' }} />
              </div>
            </div>
          </div>
          )}
        </div>

      </div>
    </div>
  )
}

function PgBtn({ children, active, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 26, height: 26, borderRadius: 6, border: 'none',
      cursor: disabled ? 'default' : 'pointer',
      padding: '0 5px',
      background: active ? '#6366f1' : 'transparent',
      color: active ? '#fff' : disabled ? '#1e2433' : '#6b7280',
      fontSize: 11.5, fontWeight: active ? 600 : 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </button>
  )
}
