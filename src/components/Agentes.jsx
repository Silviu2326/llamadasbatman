import React, { useState } from 'react'
import {
  RiRobot2Line, RiSearchLine, RiFilterLine, RiAddLine,
  RiPhoneLine, RiCalendarLine, RiPercentLine, RiGroupLine,
  RiMoreLine, RiStarLine, RiArrowRightLine, RiPlayLine,
  RiEditLine, RiBookOpenLine, RiFileCopyLine, RiFileTextLine,
  RiCloseLine, RiSettings3Line, RiMoneyDollarBoxLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import KPICard from './KPICard'
import '../dashboard.css'
import NewAgenteModal from '../modals/NewAgenteModal'

// ─── shared ──────────────────────────────────────────────────────────────────
const STATUS = {
  Activo:    { color: '#10b981', bg: '#10b98112', border: '#10b98130' },
  Pausado:   { color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30' },
  Borrador:  { color: '#94a3b8', bg: '#94a3b812', border: '#94a3b830' },
  Archivado: { color: '#6b7280', bg: '#6b728012', border: '#6b728030' },
}

// ─── data ────────────────────────────────────────────────────────────────────
const AGENT_KPI = [
  { Icon: RiRobot2Line,         iconBg:'#6d28d9', label:'Total\nagentes',          value:'12',    pct:16.7, color:'#a78bfa',
    data:[8,9,9,10,10,10,11,11,11,12,12,12,12,12,12,12,12,12,12,12] },
  { Icon: RiGroupLine,          iconBg:'#0e7490', label:'Agentes\nactivos',         value:'9',     pct:12.5, color:'#22d3ee',
    data:[6,7,7,7,7,8,8,8,8,8,8,9,9,9,9,9,9,9,9,9] },
  { Icon: RiPhoneLine,          iconBg:'#047857', label:'Llamadas esta\nsemana',   value:'2.847', pct:18.6, color:'#34d399',
    data:[1800,1900,2000,1850,2100,2200,2050,2300,2150,2400,2300,2500,2400,2600,2500,2700,2600,2750,2800,2847] },
  { Icon: RiPercentLine,        iconBg:'#b45309', label:'Tasa de éxito\npromedio', value:'14,7%', pct:2.3,  color:'#fbbf24',
    data:[11,12,11,13,12,13,12,14,13,14,13,15,14,14,14,15,14,15,14,14.7] },
  { Icon: RiCalendarLine,       iconBg:'#1e40af', label:'Reuniones\nagendadas',    value:'342',   pct:22.1, color:'#60a5fa',
    data:[180,200,190,220,210,240,225,255,240,270,255,285,268,295,278,308,290,318,330,342] },
]

const AGENTS = [
  {
    id:1, name:'Sofía',    verified:true,  role:'Ventas SaaS',           subrole:'Agendado de demos',
    desc:'Agendado de demos y cualificación de leads entrantes',
    status:'Activo',    calls:842, callsPct:18.2, success:16.3,
    bg:'#4f46e5', color:'#818cf8',
    stats:[{label:'Llamadas',value:'842',pct:'↑18.2%'},{label:'Tasa de éxito',value:'16,3%',pct:'↑2.3pp'},{label:'Reuniones',value:'142',pct:'↑21.4%'},{label:'Pipe generado',value:'€45.230',pct:'↑28.4%'}],
    tags:['Empática','Consultiva','Profesional','Cercana'], energia:7, humor:3,
    objetivo:'Agendar demos calificadas con decisores de empresas SaaS de 10-500 empleados.',
    docs:['FAQ SaaS.pdf','Producto.pdf','Casos de éxito'], extraDocs:4,
  },
  {
    id:2, name:'Carlos',   verified:true,  role:'Recuperación de leads',  subrole:'Reactivación',
    desc:'Reactivación de leads fríos y seguimiento',
    status:'Activo',    calls:621, callsPct:12.7, success:13.8,
    bg:'#0891b2', color:'#22d3ee',
    stats:[{label:'Llamadas',value:'621',pct:'↑12.7%'},{label:'Tasa de éxito',value:'13,8%',pct:'↑1.8pp'},{label:'Reuniones',value:'98',pct:'↑18.2%'},{label:'Pipe generado',value:'€31.450',pct:'↑22.1%'}],
    tags:['Persistente','Empático','Analítico'], energia:8, humor:2,
    objetivo:'Recuperar leads inactivos y convertirlos en oportunidades activas.',
    docs:['Guía leads.pdf','Scripts.pdf','Objeciones.pdf'], extraDocs:2,
  },
  {
    id:3, name:'Emma',     verified:true,  role:'Renovaciones',           subrole:'Upselling',
    desc:'Renovaciones y upselling de clientes actuales',
    status:'Activo',    calls:423, callsPct:9.1,  success:19.2,
    bg:'#047857', color:'#34d399',
    stats:[{label:'Llamadas',value:'423',pct:'↑9.1%'},{label:'Tasa de éxito',value:'19,2%',pct:'↑3.1pp'},{label:'Reuniones',value:'87',pct:'↑15.6%'},{label:'Pipe generado',value:'€28.900',pct:'↑19.4%'}],
    tags:['Cercana','Consultiva','Profesional'], energia:6, humor:5,
    objetivo:'Maximizar el valor de clientes actuales mediante renovaciones y expansión.',
    docs:['Producto.pdf','Precios.pdf'], extraDocs:3,
  },
  {
    id:4, name:'Diego',    verified:true,  role:'Cierre agresivo',        subrole:'Negociación',
    desc:'Cierre de oportunidades calificadas y negociación',
    status:'Activo',    calls:358, callsPct:24.5, success:21.7,
    bg:'#b45309', color:'#fbbf24',
    stats:[{label:'Llamadas',value:'358',pct:'↑24.5%'},{label:'Tasa de éxito',value:'21,7%',pct:'↑4.2pp'},{label:'Reuniones',value:'62',pct:'↑28.1%'},{label:'Pipe generado',value:'€52.800',pct:'↑35.2%'}],
    tags:['Directo','Persuasivo','Analítico'], energia:9, humor:1,
    objetivo:'Cerrar oportunidades calificadas en primera o segunda llamada.',
    docs:['Cierre.pdf','Objeciones.pdf','Casos.pdf'], extraDocs:1,
  },
  {
    id:5, name:'Lucía',    verified:false, role:'Soporte preventa',       subrole:'Precalificación',
    desc:'Resuelve dudas técnicas y precalifica necesidades',
    status:'Pausado',   calls:0,   callsPct:0,    success:null,
    bg:'#be185d', color:'#f472b6',
    stats:[{label:'Llamadas',value:'0',pct:'—'},{label:'Tasa de éxito',value:'—',pct:'—'},{label:'Reuniones',value:'0',pct:'—'},{label:'Pipe generado',value:'—',pct:'—'}],
    tags:['Técnica','Empática','Detallista'], energia:5, humor:4,
    objetivo:'Precalificar leads técnicos y resolver objeciones de producto.',
    docs:['Docs técnica.pdf'], extraDocs:2,
  },
  {
    id:6, name:'Mateo',    verified:true,  role:'Cross-selling',          subrole:'Venta cruzada',
    desc:'Identifica oportunidades de venta cruzada',
    status:'Activo',    calls:312, callsPct:15.3, success:15.1,
    bg:'#92400e', color:'#fb923c',
    stats:[{label:'Llamadas',value:'312',pct:'↑15.3%'},{label:'Tasa de éxito',value:'15,1%',pct:'↑2.0pp'},{label:'Reuniones',value:'54',pct:'↑19.8%'},{label:'Pipe generado',value:'€22.100',pct:'↑24.3%'}],
    tags:['Consultivo','Cercano','Metódico'], energia:7, humor:3,
    objetivo:'Identificar y convertir oportunidades de expansión en clientes activos.',
    docs:['Catálogo.pdf','Cross-sell.pdf'], extraDocs:1,
  },
  {
    id:7, name:'Isabella', verified:true,  role:'Welcome calls',          subrole:'Onboarding',
    desc:'Llamadas de bienvenida a nuevos clientes',
    status:'Borrador',  calls:0,   callsPct:0,    success:null,
    bg:'#065f46', color:'#10b981',
    stats:[{label:'Llamadas',value:'0',pct:'—'},{label:'Tasa de éxito',value:'—',pct:'—'},{label:'Reuniones',value:'0',pct:'—'},{label:'Pipe generado',value:'—',pct:'—'}],
    tags:['Amigable','Empática','Cercana'], energia:8, humor:6,
    objetivo:'Garantizar una experiencia de onboarding positiva para nuevos clientes.',
    docs:['Onboarding.pdf'], extraDocs:0,
  },
  {
    id:8, name:'Tomás',    verified:false, role:'Encuestas NPS',          subrole:'Feedback',
    desc:'Encuestas de satisfacción y feedback',
    status:'Archivado', calls:0,   callsPct:0,    success:null,
    bg:'#312e81', color:'#818cf8',
    stats:[{label:'Llamadas',value:'0',pct:'—'},{label:'Tasa de éxito',value:'—',pct:'—'},{label:'Reuniones',value:'0',pct:'—'},{label:'Pipe generado',value:'—',pct:'—'}],
    tags:['Neutral','Directo','Metódico'], energia:4, humor:2,
    objetivo:'Recoger feedback de satisfacción de clientes de forma estructurada.',
    docs:['NPS script.pdf'], extraDocs:0,
  },
]

const TABS = ['Todos','Activos','Pausados','Borradores','Archivados']
const DETAIL_TABS = ['Resumen','Configuración','Conocimiento','Rendimiento','Actividad']

// ─── sub-components ───────────────────────────────────────────────────────────
function AgentAvatar({ name, color, bg, size = 72 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 35% 30%, ${color}50, ${bg}cc)`,
      border: `2px solid ${color}60`,
      boxShadow: `0 0 0 4px ${color}12, 0 0 22px ${color}28`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: '#fff',
      textShadow: `0 0 14px ${color}`,
    }}>
      {name[0]}
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.Activo
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {status === 'Activo' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block' }} />}
      {status}
    </span>
  )
}

function AgentCard({ agent, selected, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="fade-up"
      style={{
        background: selected ? '#0f1423' : hov ? '#0e1220' : '#0d1117',
        border: `1px solid ${selected ? agent.color + '55' : '#1e2433'}`,
        borderRadius: 14, padding: '14px 14px 12px', cursor: 'pointer',
        boxShadow: selected ? `0 0 0 1px ${agent.color}30, 0 0 28px ${agent.color}18` : 'none',
        transition: 'all .2s ease', display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RiStarLine style={{ width: 14, height: 14, color: '#374151', cursor: 'pointer' }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <StatusBadge status={agent.status} />
          <RiMoreLine style={{ width: 14, height: 14, color: '#374151', cursor: 'pointer' }} />
        </div>
      </div>

      {/* avatar */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <AgentAvatar name={agent.name} color={agent.color} bg={agent.bg} size={72} />
      </div>

      {/* name + role + desc */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{agent.name}</span>
          {agent.verified && (
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: agent.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✓</span>
          )}
        </div>
        <p style={{ margin: '0 0 5px', fontSize: 11.5, color: agent.color, fontWeight: 600 }}>{agent.role}</p>
        <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.45 }}>{agent.desc}</p>
      </div>

      {/* stats */}
      <div style={{ borderTop: '1px solid #1a2235', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 9.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.3 }}>Llamadas esta semana</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{agent.calls || '0'}</span>
            {agent.callsPct > 0 && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>↑{agent.callsPct}%</span>}
          </div>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 9.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.3 }}>Tasa de éxito</p>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{agent.success !== null ? `${agent.success}%` : '—'}</span>
        </div>
      </div>

      {/* bottom icons */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[RiPhoneLine, RiCalendarLine, RiGroupLine].map((Icon, i) => (
          <div key={i} style={{ width: 26, height: 26, borderRadius: 7, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon style={{ width: 12, height: 12, color: '#4b5563' }} />
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <RiMoreLine style={{ width: 13, height: 13, color: '#4b5563' }} />
        </div>
      </div>
    </div>
  )
}

function AgentDetail({ agent, onClose }) {
  const [tab, setTab] = useState('Resumen')

  return (
    <div className="dark-scroll" style={{
      width: 292, flexShrink: 0,
      background: '#090d18', borderLeft: '1px solid #1e2433',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* close */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0', gap: 6 }}>
        <button onClick={onClose} style={{ background: '#131b2b', border: '1px solid #1e2433', borderRadius: 7, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer' }}>
          <RiCloseLine style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div style={{ padding: '10px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* avatar + status + info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <AgentAvatar name={agent.name} color={agent.color} bg={agent.bg} size={80} />

          {/* status + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={agent.status} />
            <div style={{ width: 34, height: 18, borderRadius: 99, background: agent.status === 'Activo' ? '#10b981' : '#374151', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: agent.status === 'Activo' ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>

          {/* name */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{agent.name}</span>
              {agent.verified && (
                <span style={{ width: 17, height: 17, borderRadius: '50%', background: agent.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800 }}>✓</span>
              )}
            </div>
            <p style={{ margin: '0 0 3px', fontSize: 11.5, color: '#94a3b8' }}>{agent.role} • {agent.subrole}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: '#4b5563' }}>Última actividad: Hoy, 11:32</p>
          </div>

          {/* probar button */}
          <button style={{
            display: 'flex', alignItems: 'center', gap: 7, width: '100%', justifyContent: 'center',
            background: `linear-gradient(90deg, ${agent.bg}, ${agent.color}90)`,
            border: 'none', borderRadius: 9, padding: '9px 16px',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            boxShadow: `0 0 18px ${agent.color}25`,
          }}>
            <RiPlayLine style={{ width: 14, height: 14 }} /> Probar agente
          </button>
        </div>

        {/* detail tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e2433' }}>
          {DETAIL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, background: 'none', border: 'none', padding: '7px 0',
              fontSize: 10, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? agent.color : '#4b5563',
              borderBottom: `2px solid ${tab === t ? agent.color : 'transparent'}`,
              cursor: 'pointer', transition: 'all .15s',
            }}>{t}</button>
          ))}
        </div>

        {/* resumen content */}
        {tab === 'Resumen' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* mini stats 2x2 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Rendimiento esta semana</span>
                <span style={{ fontSize: 10, color: agent.color, cursor: 'pointer' }}>Ver reporte completo</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {agent.stats.map(s => (
                  <div key={s.label} style={{ background: '#111827', borderRadius: 10, padding: '10px 11px', border: '1px solid #1a2235' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', marginBottom: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 10.5, color: '#4ade80', fontWeight: 600 }}>{s.pct}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* personalidad */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Personalidad y tono</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {agent.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 20,
                    background: `${agent.color}14`, border: `1px solid ${agent.color}28`,
                    color: agent.color, fontWeight: 600,
                  }}>{tag}</span>
                ))}
              </div>
              <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['Nivel de energía', agent.energia], ['Uso de humor', agent.humor]].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
                      <span style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 600 }}>{val}/10</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: '#1a2235' }}>
                      <div style={{ width: `${val * 10}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${agent.bg}, ${agent.color})`, boxShadow: `0 0 8px ${agent.color}40` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* objetivo */}
            <div style={{ background: '#111827', borderRadius: 10, padding: '11px 12px', border: '1px solid #1a2235' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: `${agent.color}18`, border: `1px solid ${agent.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RiSettings3Line style={{ width: 14, height: 14, color: agent.color }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Objetivo principal</span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>{agent.objetivo}</p>
            </div>

            {/* conocimiento */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Conocimiento conectado</span>
                <span style={{ fontSize: 10.5, color: '#4b5563' }}>{agent.docs.length + agent.extraDocs} fuentes activas</span>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {agent.docs.map(doc => (
                  <div key={doc} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 9, padding: '8px 9px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 68, maxWidth: 80 }}>
                    <RiFileTextLine style={{ width: 18, height: 18, color: '#ef4444' }} />
                    <span style={{ fontSize: 9.5, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>{doc}</span>
                  </div>
                ))}
                {agent.extraDocs > 0 && (
                  <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 9, padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 52 }}>
                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>+{agent.extraDocs} más</span>
                  </div>
                )}
              </div>
            </div>

            {/* acciones rápidas */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Acciones rápidas</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {[
                  [RiEditLine,    'Editar configuración'],
                  [RiBookOpenLine,'Entrenar con documentos'],
                  [RiFileTextLine,'Ver playbook'],
                  [RiFileCopyLine,'Clonar agente'],
                ].map(([Icon, label]) => (
                  <button key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px',
                    background: '#111827', border: '1px solid #1a2235', borderRadius: 9,
                    color: '#94a3b8', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color .15s',
                  }}>
                    <Icon style={{ width: 13, height: 13, flexShrink: 0 }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab !== 'Resumen' && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#374151', fontSize: 13 }}>
            Próximamente
          </div>
        )}
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function Agentes() {
  const [activeTab, setActiveTab]       = useState('Todos')
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0])
  const [showNewAgent, setShowNewAgent] = useState(false)

  const filtered = activeTab === 'Todos'      ? AGENTS
    : activeTab === 'Activos'                 ? AGENTS.filter(a => a.status === 'Activo')
    : activeTab === 'Pausados'                ? AGENTS.filter(a => a.status === 'Pausado')
    : activeTab === 'Borradores'              ? AGENTS.filter(a => a.status === 'Borrador')
    : AGENTS.filter(a => a.status === 'Archivado')

  return (
    <div style={{ flex: 1, display: 'flex', background: '#080c14', minWidth: 0, overflow: 'hidden' }}>

      {/* ── scrollable left ── */}
      <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9' }}>Agentes IA</h1>
              <RiRobot2Line style={{ width: 19, height: 19, color: '#a78bfa' }} />
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Crea, configura y gestiona tus agentes de voz inteligentes.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 12px' }}>
              <RiSearchLine style={{ width: 13, height: 13, color: '#6b7280' }} />
              <input placeholder="Buscar agente…" style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 12, width: 140 }} />
              <span style={{ fontSize: 10, color: '#374151', background: '#111827', border: '1px solid #1a2235', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, padding: '7px 13px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              <RiFilterLine style={{ width: 13, height: 13 }} /> Filtros
            </button>
            <button onClick={() => setShowNewAgent(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 9, padding: '7px 15px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 18px #4f46e544' }}>
              <RiAddLine style={{ width: 14, height: 14 }} /> Nuevo agente
            </button>
          </div>
        </div>

        {showNewAgent && <NewAgenteModal onClose={() => setShowNewAgent(false)} />}

        {/* kpi row */}
        <div style={{ display: 'flex', gap: 10 }}>
          {AGENT_KPI.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} compact />)}
        </div>

        {/* tabs + controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a2235' }}>
          <div style={{ display: 'flex' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{
                background: 'none', border: 'none', padding: '9px 16px',
                fontSize: 13, fontWeight: activeTab === t ? 700 : 400,
                color: activeTab === t ? '#f1f5f9' : '#4b5563',
                borderBottom: `2px solid ${activeTab === t ? '#8b5cf6' : 'transparent'}`,
                cursor: 'pointer', transition: 'all .15s',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: '#4b5563' }}>Vista:</span>
            <div style={{ display: 'flex', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, overflow: 'hidden' }}>
              <button style={{ padding: '4px 9px', background: '#1a2235', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>⊞</button>
              <button style={{ padding: '4px 9px', background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 13 }}>☰</button>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 10px', color: '#94a3b8', fontSize: 11.5, cursor: 'pointer' }}>
              Ordenar por: Más recientes <HiChevronDown style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>

        {/* agent grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${selectedAgent ? '190px' : '215px'}, 1fr))`,
          gap: 12,
        }}>
          {filtered.map(a => (
            <AgentCard key={a.id} agent={a}
              selected={selectedAgent?.id === a.id}
              onClick={() => setSelectedAgent(selectedAgent?.id === a.id ? null : a)}
            />
          ))}

          {/* create new */}
          <div onClick={() => setShowNewAgent(true)} className="fade-up" style={{
            background: 'transparent', border: '1px dashed #2a3244', borderRadius: 14,
            padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 200,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 99, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px #4f46e540' }}>
              <RiAddLine style={{ width: 18, height: 18, color: '#fff' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#818cf8' }}>Crear nuevo agente</p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4b5563' }}>Diseña tu agente IA desde cero</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── right detail panel ── */}
      {selectedAgent && (
        <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  )
}
