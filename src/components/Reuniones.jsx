import React, { useState, useRef, useEffect } from 'react'
import {
  RiCalendar2Line, RiCalendarLine, RiGroupLine, RiMoneyDollarBoxLine,
  RiLineChartLine, RiFilterLine, RiDownloadLine, RiAddLine,
  RiCloseLine, RiSearchLine, RiMoreLine, RiArrowRightLine,
  RiFileTextLine, RiEditLine, RiRobot2Line, RiRocketLine,
  RiArrowLeftSLine, RiArrowRightSLine,
} from 'react-icons/ri'
import KPICard from './KPICard'
import DataTable from './DataTable'
import '../dashboard.css'
import NewReunionModal from '../modals/NewReunionModal'

// ─── data ─────────────────────────────────────────────────────────────────────
const REUNIONES_KPI = [
  { Icon: RiCalendar2Line,      iconBg:'#6d28d9', label:'Reuniones\nagendadas',       value:'342',      pct:22.1, color:'#a78bfa',
    data:[220,240,255,268,278,287,296,305,312,319,325,330,334,337,339,340,341,342,342,342] },
  { Icon: RiCalendarLine,       iconBg:'#047857', label:'Reuniones\ncompletadas',      value:'237',      pct:18.7, color:'#34d399',
    data:[150,162,172,180,186,192,199,206,212,217,221,225,228,231,233,235,236,237,237,237] },
  { Icon: RiGroupLine,          iconBg:'#0e7490', label:'Tasa de\nasistencia',         value:'76,3%',    pct:6.5,  color:'#22d3ee',
    data:[68,70,71,72,72.5,73,73.5,74,74.5,75,75.2,75.5,75.7,75.9,76,76.1,76.2,76.3,76.3,76.3] },
  { Icon: RiMoneyDollarBoxLine, iconBg:'#b45309', label:'Valor pipeline\ngenerado',    value:'€562.450', pct:28.7, color:'#fbbf24',
    data:[380,400,420,440,455,468,480,490,500,510,520,528,535,542,548,554,558,561,562,562.45] },
  { Icon: RiLineChartLine,      iconBg:'#0d9488', label:'Duración\npromedio',          value:'42 min',   pct:6.7,  color:'#2dd4bf',
    data:[48,47,47,46,46,46,45,45,44,44,44,43,43,43,43,42,42,42,42,42] },
]

const MEETINGS = [
  {
    id:1, dayLabel:'HOY',    dayColor:'#8b5cf6', time:'11:00', dur:'30 min',
    lead:{ name:'Carlos Méndez',     role:'CTO',               company:'TechSolutions S.L.', bg:'#2563eb' },
    agent:{ name:'Sofía',   role:'SDR - Demos',    bg:'#4f46e5' },
    date:'12 may 2024', range:'11:00 - 11:30', platform:'google',
    estado:'En curso',   estadoColor:'#22d3ee',
    asistencia:'Esperando',  asistColor:'#f59e0b',
    value:'€45.000', priority:'Alta', prioColor:'#f59e0b',
    hasJoin:true, isLive:true,
    objetivo:'Agendar demo de producto',
    leadStatus:'Interesado', leadStatusColor:'#22d3ee',
    summary:'Carlos mostró mucho interés en la solución durante la llamada inicial. Principal dolor: optimización de procesos internos y reporting en tiempo real.',
    resources:[{ name:'Presentación Producto VozIA.pdf', when:'Compartido ayer, 16:45' }],
  },
  {
    id:2, dayLabel:'HOY',    dayColor:'#8b5cf6', time:'15:30', dur:'45 min',
    lead:{ name:'Laura Fernández',   role:'Directora de Ops',  company:'DataPro Iberia',     bg:'#0891b2' },
    agent:{ name:'Mateo',  role:'Closer - Ventas',bg:'#059669' },
    date:'12 may 2024', range:'15:30 - 16:15', platform:'google',
    estado:'Confirmada', estadoColor:'#10b981',
    asistencia:'Asistirá',   asistColor:'#10b981',
    value:'€32.000', priority:'Media', prioColor:'#60a5fa',
    hasJoin:false, isLive:false,
    objetivo:'Presentación de propuesta comercial',
    leadStatus:'Reunión', leadStatusColor:'#059669',
    summary:'Laura solicitó una propuesta detallada. Interesada principalmente en las integraciones con su CRM actual.',
    resources:[],
  },
  {
    id:3, dayLabel:'MAÑANA', dayColor:'#60a5fa', time:'10:00', dur:'30 min',
    lead:{ name:'Javier Ruiz',       role:'Head of Sales',     company:'Global Industries',   bg:'#7c3aed' },
    agent:{ name:'Valentina',role:'SDR - Qualify', bg:'#be185d' },
    date:'13 may 2024', range:'10:00 - 10:30', platform:'zoom',
    estado:'Confirmada', estadoColor:'#10b981',
    asistencia:'Pendiente',  asistColor:'#6b7280',
    value:'€28.000', priority:'Alta', prioColor:'#f59e0b',
    hasJoin:false, isLive:false,
    objetivo:'Cualificación y detección de necesidades',
    leadStatus:'Interesado', leadStatusColor:'#22d3ee',
    summary:'Javier tiene equipo de 30 personas en ventas. Necesita automatización de seguimiento de leads.',
    resources:[],
  },
  {
    id:4, dayLabel:'MAÑANA', dayColor:'#60a5fa', time:'14:00', dur:'60 min',
    lead:{ name:'Ana Beltrán',       role:'Marketing Manager', company:'Innovate Corp',        bg:'#b45309' },
    agent:{ name:'Diego',  role:'Closer - Ventas',bg:'#b45309' },
    date:'13 may 2024', range:'14:00 - 15:00', platform:'google',
    estado:'Confirmada', estadoColor:'#10b981',
    asistencia:'Asistirá',   asistColor:'#10b981',
    value:'€18.000', priority:'Media', prioColor:'#60a5fa',
    hasJoin:false, isLive:false,
    objetivo:'Demo de producto y cierre',
    leadStatus:'Propuesta', leadStatusColor:'#d97706',
    summary:'Ana quiere ver la demo completa antes de decidir. Presupuesto aprobado para Q2.',
    resources:[],
  },
  {
    id:5, dayLabel:'14 MAY', dayColor:'#94a3b8', time:'09:30', dur:'30 min',
    lead:{ name:'Miguel Ángel Soto', role:'CEO',               company:'Buildit Solutions',   bg:'#0d9488' },
    agent:{ name:'Luna',   role:'SDR - Demos',    bg:'#8b5cf6' },
    date:'14 may 2024', range:'09:30 - 10:00', platform:'google',
    estado:'Confirmada', estadoColor:'#10b981',
    asistencia:'Pendiente',  asistColor:'#6b7280',
    value:'€65.000', priority:'Alta', prioColor:'#f59e0b',
    hasJoin:false, isLive:false,
    objetivo:'Primera reunión de discovery',
    leadStatus:'Contactado', leadStatusColor:'#2563eb',
    summary:'CEO con visión clara de transformación digital. Alto potencial de cierre en primera reunión.',
    resources:[],
  },
  {
    id:6, dayLabel:'14 MAY', dayColor:'#94a3b8', time:'16:00', dur:'45 min',
    lead:{ name:'Elena Gómez',       role:'Finance Director',  company:'Retail Group',        bg:'#ea580c' },
    agent:{ name:'Tomás',  role:'Closer - Ventas',bg:'#312e81' },
    date:'14 may 2024', range:'16:00 - 16:45', platform:'zoom',
    estado:'Confirmada', estadoColor:'#10b981',
    asistencia:'Pendiente',  asistColor:'#6b7280',
    value:'€38.000', priority:'Media', prioColor:'#60a5fa',
    hasJoin:false, isLive:false,
    objetivo:'Negociación de contrato anual',
    leadStatus:'Negociación', leadStatusColor:'#ea580c',
    summary:'Elena quiere condiciones especiales para pago anual. Tiene autoridad para firmar.',
    resources:[],
  },
  {
    id:7, dayLabel:'15 MAY', dayColor:'#94a3b8', time:'11:30', dur:'30 min',
    lead:{ name:'Ramon Torres',      role:'Product Manager',   company:'NextGen Tech',         bg:'#047857' },
    agent:{ name:'Sofía',   role:'SDR - Demos',    bg:'#4f46e5' },
    date:'15 may 2024', range:'11:30 - 12:00', platform:'google',
    estado:'Cancelada',  estadoColor:'#ef4444',
    asistencia:'No asistirá', asistColor:'#ef4444',
    value:'€24.000', priority:'Baja', prioColor:'#6b7280',
    hasJoin:false, isLive:false,
    objetivo:'Seguimiento post-demo',
    leadStatus:'Interesado', leadStatusColor:'#22d3ee',
    summary:'Canceló por conflicto de agenda. Reprogramar para la próxima semana.',
    resources:[],
  },
]

const TABS = ['Todas','Hoy','Mañana','Esta semana','Próxima semana','Completadas','Canceladas','No asistieron']

// ─── helpers ──────────────────────────────────────────────────────────────────
function Avatar({ name, bg, size = 34 }) {
  const w = name.split(' ')
  const ini = (w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700, color: '#fff', boxShadow: `0 0 8px ${bg}40`,
    }}>{ini.toUpperCase()}</div>
  )
}

function PlatformBadge({ type }) {
  const cfg = {
    google: { label: 'Google Meet', color: '#4285f4' },
    zoom:   { label: 'Zoom',        color: '#2D8CFF' },
  }
  const c = cfg[type] ?? cfg.google
  return (
    <span style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 5, fontWeight: 600, background: `${c.color}15`, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function Pill({ text, color }) {
  return (
    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, background: `${color}15`, border: `1px solid ${color}28`, color, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function AttendIcon({ status, color }) {
  const symbol = status === 'Asistirá' ? '✓' : status === 'No asistirá' ? '✕' : status === 'Esperando' ? '…' : '○'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${color}`, color, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{symbol}</span>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{status}</span>
    </div>
  )
}

// ─── row dropdown ─────────────────────────────────────────────────────────────
const MENU_OPTS = [
  { label: 'Ver detalle',      icon: RiArrowRightLine, action: 'detail' },
  { label: 'Reprogramar',      icon: RiCalendarLine,   action: 'reschedule' },
  { label: 'Cancelar reunión', icon: RiCloseLine,      action: 'cancel', danger: true },
]

function RowMenu({ mtg, onDetail }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function handle(e, action) {
    e.stopPropagation()
    setOpen(false)
    if (action === 'detail') onDetail(mtg)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: open ? '#1e2433' : 'none', border: '1px solid ' + (open ? '#2d3748' : 'transparent'), borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', transition: 'all .15s' }}
      >
        <RiMoreLine style={{ width: 14, height: 14 }} />
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '4px', minWidth: 170, boxShadow: '0 8px 32px #00000060' }}>
          {MENU_OPTS.map(opt => (
            <button
              key={opt.label}
              onClick={(e) => handle(e, opt.action)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', borderRadius: 7, color: opt.danger ? '#ef4444' : '#e2e8f0', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = opt.danger ? '#ef444412' : '#ffffff0a'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <opt.icon style={{ width: 13, height: 13, flexShrink: 0 }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── table ────────────────────────────────────────────────────────────────────
const GRID = '68px 1.5fr 1fr 1.2fr 1fr 0.8fr 0.8fr 64px'
const COLS = ['Reunión','Lead / Empresa','Agente IA','Fecha y hora','Estado','Asistencia','Valor potencial','Acciones']

// ─── detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ mtg, onClose }) {
  return (
    <div className="dark-scroll" style={{
      width: 288, flexShrink: 0, background: '#090d18', borderLeft: '1px solid #1e2433',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* header */}
      <div style={{ padding: '13px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {mtg.isLive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee', flexShrink: 0 }} />}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9' }}>
            {mtg.isLive ? 'Reunión en curso' : 'Detalle de reunión'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: '#131b2b', border: '1px solid #1e2433', borderRadius: 7, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer' }}>
          <RiCloseLine style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div style={{ padding: '12px 14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* contact hero */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar name={mtg.lead.name} bg={mtg.lead.bg} size={52} />
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 800, color: '#f1f5f9' }}>{mtg.lead.name}</p>
            <p style={{ margin: '0 0 5px', fontSize: 11, color: '#94a3b8' }}>{mtg.lead.role} en {mtg.lead.company}</p>
            {mtg.isLive && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#10b98115', border: '1px solid #10b98130', color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} /> En línea
              </span>
            )}
          </div>
        </div>

        {/* join link */}
        {mtg.isLive && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111827', borderRadius: 10, padding: '9px 12px', border: '1px solid #1e2433' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#4285f4' }}>Google Meet</span>
            </div>
            <button style={{ background: 'none', border: 'none', color: '#22d3ee', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Unirse a la reunión <RiArrowRightLine style={{ width: 12, height: 12 }} />
            </button>
          </div>
        )}

        {/* info grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { Icon: RiCalendarLine,       color: '#a78bfa', label: 'Fecha',         val: `Hoy, ${mtg.date}` },
            { Icon: RiCalendar2Line,      color: '#60a5fa', label: 'Hora',          val: `${mtg.range} (${mtg.dur})` },
            { Icon: RiRobot2Line,         color: '#22d3ee', label: 'Agente IA',     val: `${mtg.agent.name} / ${mtg.agent.role}` },
            { Icon: RiRocketLine,         color: '#34d399', label: 'Objetivo',      val: mtg.objetivo },
          ].map(({ Icon, color, label, val }) => (
            <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${color}18`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <Icon style={{ width: 12, height: 12, color }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 9.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{label}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: '#e2e8f0', fontWeight: 500 }}>{val}</p>
              </div>
            </div>
          ))}

          {/* valor + priority */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#fbbf2418', border: '1px solid #fbbf2425', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <RiMoneyDollarBoxLine style={{ width: 12, height: 12, color: '#fbbf24' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 9.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Valor potencial</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                <span style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 700 }}>{mtg.value}</span>
                <Pill text={`${mtg.priority} prioridad`} color={mtg.prioColor} />
              </div>
            </div>
          </div>

          {/* lead status */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#818cf818', border: '1px solid #818cf825', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <RiLineChartLine style={{ width: 12, height: 12, color: '#818cf8' }} />
            </div>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 9.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Estado del lead</p>
              <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <Pill text={mtg.leadStatus} color={mtg.leadStatusColor} />
                <RiArrowRightLine style={{ width: 11, height: 11, color: mtg.leadStatusColor }} />
              </button>
            </div>
          </div>
        </div>

        {/* divider */}
        <div style={{ height: 1, background: '#1e2433' }} />

        {/* lead summary */}
        <div>
          <p style={{ margin: '0 0 7px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Resumen del lead</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8', lineHeight: 1.55 }}>{mtg.summary}</p>
          <button style={{ background: 'none', border: 'none', padding: 0, color: '#818cf8', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            Ver detalle del lead <RiArrowRightLine style={{ width: 12, height: 12 }} />
          </button>
        </div>

        {/* divider */}
        <div style={{ height: 1, background: '#1e2433' }} />

        {/* notes */}
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Notas de la reunión</p>
          <div style={{ position: 'relative' }}>
            <textarea placeholder="Añadir notas..." style={{
              width: '100%', minHeight: 68, background: '#111827', border: '1px solid #1e2433',
              borderRadius: 9, padding: '9px 10px', color: '#94a3b8', fontSize: 11.5,
              resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
            }} />
            <RiEditLine style={{ position: 'absolute', bottom: 8, right: 8, width: 12, height: 12, color: '#4b5563' }} />
          </div>
        </div>

        {/* resources */}
        {mtg.resources.length > 0 && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Recursos compartidos</p>
            {mtg.resources.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '9px 11px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: '#ef444418', border: '1px solid #ef444425', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RiFileTextLine style={{ width: 16, height: 16, color: '#ef4444' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#4b5563' }}>{r.when}</p>
                </div>
                <RiDownloadLine style={{ width: 14, height: 14, color: '#6b7280', flexShrink: 0, cursor: 'pointer' }} />
              </div>
            ))}
          </div>
        )}

        {/* footer actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button style={{ padding: '9px 0', background: 'none', border: '1px solid #1e2433', borderRadius: 9, color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <RiCalendarLine style={{ width: 13, height: 13 }} /> Reprogramar
          </button>
          <button style={{ padding: '9px 0', background: '#ef444410', border: '1px solid #ef444430', borderRadius: 9, color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar reunión
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Reuniones() {
  const [activeTab, setActiveTab] = useState('Todas')
  const [selected,  setSelected]  = useState(MEETINGS[0])
  const [showNewMeeting, setShowNewMeeting] = useState(false)

  const renderMeeting = (mtg) => [
    <div key="t">
      <p style={{ margin:0, fontSize:9, fontWeight:700, color:mtg.dayColor, letterSpacing:0.5 }}>{mtg.dayLabel}</p>
      <p style={{ margin:0, fontSize:16, fontWeight:800, color:'#f1f5f9', lineHeight:1.1 }}>{mtg.time}</p>
      <p style={{ margin:0, fontSize:10, color:'#6b7280' }}>{mtg.dur}</p>
    </div>,
    <div key="l" style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
      <Avatar name={mtg.lead.name} bg={mtg.lead.bg} size={34} />
      <div style={{ minWidth:0 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mtg.lead.name}</p>
        <p style={{ margin:0, fontSize:10, color:'#6b7280' }}>{mtg.lead.role}</p>
        <p style={{ margin:0, fontSize:10, color:'#4b5563' }}>{mtg.lead.company}</p>
      </div>
    </div>,
    <div key="a" style={{ display:'flex', gap:6, alignItems:'center', minWidth:0 }}>
      <Avatar name={mtg.agent.name} bg={mtg.agent.bg} size={26} />
      <div style={{ minWidth:0 }}>
        <p style={{ margin:0, fontSize:11, fontWeight:600, color:'#e2e8f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{mtg.agent.name}</p>
        <p style={{ margin:0, fontSize:10, color:'#6b7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{mtg.agent.role}</p>
      </div>
    </div>,
    <div key="f">
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:600, color:'#e2e8f0' }}>{mtg.date}</p>
      <p style={{ margin:'0 0 3px', fontSize:10.5, color:'#94a3b8' }}>{mtg.range}</p>
      <PlatformBadge type={mtg.platform} />
    </div>,
    <Pill key="e" text={mtg.estado} color={mtg.estadoColor} />,
    <AttendIcon key="s" status={mtg.asistencia} color={mtg.asistColor} />,
    <div key="v">
      <p style={{ margin:'0 0 3px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{mtg.value}</p>
      <Pill text={mtg.priority} color={mtg.prioColor} />
    </div>,
    <div key="ac" style={{ display:'flex', gap:6, alignItems:'center' }}>
      {mtg.hasJoin && (
        <button
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize:10.5, padding:'4px 9px', background:'#4f46e5', border:'none', borderRadius:7, color:'#fff', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}
        >
          Unirse
        </button>
      )}
      <RowMenu mtg={mtg} onDetail={setSelected} />
    </div>,
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#080c14', minWidth: 0, overflow: 'hidden' }}>

      {/* header */}
      <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <RiCalendar2Line style={{ width: 20, height: 20, color: '#a78bfa' }} />
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9' }}>Reuniones</h1>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Gestiona todas las reuniones agendadas por tus agentes IA.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiCalendarLine style={{ width: 13, height: 13 }} /> 12 may 2024 - 18 may 2024
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiFilterLine style={{ width: 13, height: 13 }} /> Filtros
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <RiDownloadLine style={{ width: 13, height: 13 }} /> Exportar
          </button>
          <button onClick={() => setShowNewMeeting(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 9, padding: '7px 15px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 18px #4f46e544' }}>
            <RiAddLine style={{ width: 14, height: 14 }} /> Nueva reunión
          </button>
        </div>
      </div>

      {showNewMeeting && <NewReunionModal onClose={() => setShowNewMeeting(false)} />}

      {/* body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── left column ── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* KPI row */}
          <div style={{ display: 'flex', gap: 10 }}>
            {REUNIONES_KPI.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} />)}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1a2235' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{
                  background: 'none', border: 'none', padding: '7px 13px',
                  fontSize: 12, fontWeight: activeTab === t ? 700 : 400,
                  color: activeTab === t ? '#f1f5f9' : '#4b5563',
                  borderBottom: `2px solid ${activeTab === t ? '#8b5cf6' : 'transparent'}`,
                  cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
                }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '6px 11px' }}>
                <RiSearchLine style={{ width: 12, height: 12, color: '#6b7280' }} />
                <input placeholder="Buscar reuniones…" style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 11.5, width: 130 }} />
              </div>
              <button style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '6px 9px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiFilterLine style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {/* table */}
          <DataTable
            columns={COLS}
            gridTemplate={GRID}
            rows={MEETINGS}
            rowKey="id"
            selected={selected?.id}
            onSelect={setSelected}
            renderRow={renderMeeting}
            style={{ flex: 1, minHeight: 0 }}
          />

          {/* pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Mostrando 1 a 7 de 342 reuniones</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 7px', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiArrowLeftSLine style={{ width: 14, height: 14 }} />
              </button>
              {[1,2,3,4,'…',49].map((p, i) => (
                <button key={i} style={{
                  background: p === 1 ? '#4f46e5' : '#0d1117',
                  border: `1px solid ${p === 1 ? '#4f46e5' : '#1e2433'}`,
                  borderRadius: 7, padding: '5px 9px', color: p === 1 ? '#fff' : '#6b7280',
                  cursor: 'pointer', fontSize: 12, fontWeight: p === 1 ? 700 : 400,
                }}>{p}</button>
              ))}
              <button style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 7px', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <RiArrowRightSLine style={{ width: 14, height: 14 }} />
              </button>
              <select style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 9px', color: '#6b7280', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                <option>10 por página</option>
                <option>25 por página</option>
                <option>50 por página</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── right panel ── */}
        {selected && <DetailPanel mtg={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
