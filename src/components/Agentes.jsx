import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
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

const BG  = ['#4f46e5','#0891b2','#047857','#b45309','#be185d','#7c3aed','#065f46','#312e81']
const CLR = ['#818cf8','#22d3ee','#34d399','#fbbf24','#f472b6','#a78bfa','#10b981','#6366f1']

function mapAgent(a, i) {
  return {
    id: a.id,
    name: a.name,
    verified: true,
    role: a.role ?? 'Agente IA',
    subrole: '',
    desc: a.systemPrompt?.slice(0, 80) ?? '',
    status: a.isActive ? 'Activo' : 'Pausado',
    calls: 0, callsPct: 0, success: null,
    bg: BG[i % BG.length], color: CLR[i % CLR.length],
    stats: [
      { label: 'Llamadas', value: '—', pct: '—' },
      { label: 'Tasa de éxito', value: '—', pct: '—' },
      { label: 'Reuniones', value: '—', pct: '—' },
      { label: 'Pipe generado', value: '—', pct: '—' },
    ],
    tags: a.personality ? a.personality.split(',').map(t => t.trim()).filter(Boolean) : [],
    energia: 5, humor: 3,
    objetivo: a.systemPrompt ?? '',
    docs: [], extraDocs: 0,
  }
}

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

function AgentDetail({ agent, onClose, onNavigate, onToggle }) {
  const [tab, setTab] = useState('Resumen')
  const [isActive, setIsActive] = useState(agent.status === 'Activo')
  const [toggling, setToggling] = useState(false)
  const [agentStats, setAgentStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    setIsActive(agent.status === 'Activo')
    setTab('Resumen')
    setAgentStats(null)
  }, [agent.id])

  useEffect(() => {
    if (tab !== 'Rendimiento') return
    setLoadingStats(true)
    apiFetch(`/api/agents/${agent.id}/stats`)
      .then(r => r.json())
      .then(setAgentStats)
      .catch(() => {})
      .finally(() => setLoadingStats(false))
  }, [tab, agent.id])

  async function handleToggle() {
    if (toggling) return
    const next = !isActive
    setIsActive(next)
    setToggling(true)
    try {
      await apiFetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: next }),
      })
      onToggle?.(agent.id, next)
    } catch {
      setIsActive(!next) // revert on error
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="dark-scroll panel-desktop" style={{
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
            <StatusBadge status={isActive ? 'Activo' : 'Pausado'} />
            <div onClick={handleToggle} style={{ width: 34, height: 18, borderRadius: 99, background: isActive ? '#10b981' : '#374151', position: 'relative', cursor: toggling ? 'wait' : 'pointer', transition: 'background .2s', flexShrink: 0, opacity: toggling ? 0.6 : 1 }}>
              <div style={{ position: 'absolute', top: 2, left: isActive ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
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
            <p style={{ margin: '0 0 3px', fontSize: 11.5, color: '#94a3b8' }}>{agent.role}{agent.subrole ? ` • ${agent.subrole}` : ''}</p>
          </div>

          {/* probar button */}
          <button onClick={() => onNavigate?.('/agentes/' + agent.id)} style={{
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
            {agent.tags.length > 0 && (
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
              </div>
            )}

            {/* objetivo */}
            {agent.objetivo && (
              <div style={{ background: '#111827', borderRadius: 10, padding: '11px 12px', border: '1px solid #1a2235' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: `${agent.color}18`, border: `1px solid ${agent.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiSettings3Line style={{ width: 14, height: 14, color: agent.color }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Objetivo principal</span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>{agent.objetivo}</p>
              </div>
            )}

            {/* acciones rápidas */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Acciones rápidas</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {[
                  [RiEditLine,    'Editar configuración', () => onNavigate?.('/agentes/' + agent.id)],
                  [RiBookOpenLine,'Entrenar con documentos', () => onNavigate?.('/knowledge-base')],
                  [RiFileTextLine,'Ver playbook', () => onNavigate?.('/playbooks')],
                  [RiFileCopyLine,'Clonar agente', () => onNavigate?.('/agentes')],
                ].map(([Icon, label, action]) => (
                  <button key={label} onClick={action} style={{
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

        {/* rendimiento tab — real stats from API */}
        {tab === 'Rendimiento' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingStats ? (
              <p style={{ textAlign: 'center', color: '#374151', fontSize: 13, padding: '32px 0' }}>Cargando…</p>
            ) : agentStats ? (
              <>
                {[
                  { label: 'Total llamadas', value: agentStats.calls ?? 0 },
                  { label: 'Reuniones agendadas', value: agentStats.meetingsScheduled ?? 0 },
                  { label: 'Sentimiento promedio', value: agentStats.avgSentimentScore != null ? `${(agentStats.avgSentimentScore * 100).toFixed(0)}%` : '—' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#111827', borderRadius: 10, padding: '12px 14px', border: '1px solid #1a2235', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</span>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ textAlign: 'center', color: '#374151', fontSize: 13, padding: '32px 0' }}>Sin datos</p>
            )}
          </div>
        )}

        {tab !== 'Resumen' && tab !== 'Rendimiento' && (
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
  const [activeTab, setActiveTab] = useState('Todos')
  const navigate = useNavigate()
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        setAgents(data.map(mapAgent))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshKey])

  const handleToggle = useCallback((id, isActive) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status: isActive ? 'Activo' : 'Pausado' } : a))
  }, [])

  const kpis = useMemo(() => {
    const total = agents.length
    const active = agents.filter(a => a.status === 'Activo').length
    return [
      { Icon: RiRobot2Line,  iconBg:'#6d28d9', label:'Total\nagentes',          value: String(total),  pct: 0, color:'#a78bfa', data:[] },
      { Icon: RiGroupLine,   iconBg:'#0e7490', label:'Agentes\nactivos',         value: String(active), pct: 0, color:'#22d3ee', data:[] },
      { Icon: RiPhoneLine,   iconBg:'#047857', label:'Llamadas esta\nsemana',    value: '—',            pct: 0, color:'#34d399', data:[] },
      { Icon: RiPercentLine, iconBg:'#b45309', label:'Tasa de éxito\npromedio',  value: '—',            pct: 0, color:'#fbbf24', data:[] },
      { Icon: RiCalendarLine,iconBg:'#1e40af', label:'Reuniones\nagendadas',     value: '—',            pct: 0, color:'#60a5fa', data:[] },
    ]
  }, [agents])

  const filtered = activeTab === 'Todos'      ? agents
    : activeTab === 'Activos'                 ? agents.filter(a => a.status === 'Activo')
    : activeTab === 'Pausados'                ? agents.filter(a => a.status === 'Pausado')
    : activeTab === 'Borradores'              ? agents.filter(a => a.status === 'Borrador')
    : agents.filter(a => a.status === 'Archivado')

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

        {showNewAgent && <NewAgenteModal onClose={() => setShowNewAgent(false)} onSuccess={() => { setShowNewAgent(false); setRefreshKey(k => k + 1) }} />}

        {/* kpi row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          {kpis.map((k, i) => <KPICard key={k.label} {...k} delay={`${i * 55}ms`} compact />)}
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
              <button onClick={() => setViewMode('grid')} style={{ padding: '4px 9px', background: viewMode === 'grid' ? '#1a2235' : 'none', border: 'none', color: viewMode === 'grid' ? '#94a3b8' : '#374151', cursor: 'pointer', fontSize: 13 }}>⊞</button>
              <button onClick={() => setViewMode('list')} style={{ padding: '4px 9px', background: viewMode === 'list' ? '#1a2235' : 'none', border: 'none', color: viewMode === 'list' ? '#94a3b8' : '#374151', cursor: 'pointer', fontSize: 13 }}>☰</button>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 7, padding: '5px 10px', color: '#94a3b8', fontSize: 11.5, cursor: 'pointer' }}>
              Ordenar por: Más recientes <HiChevronDown style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>

        {/* loading */}
        {loading && (
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '48px 0' }}>Cargando agentes…</p>
        )}

        {/* agent grid */}
        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
            gap: 12,
          }}>
            {filtered.map(a => (
              <AgentCard key={a.id} agent={a}
                selected={selectedAgent?.id === a.id}
                onClick={() => setSelectedAgent(prev => prev?.id === a.id ? null : a)}
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
        )}
      </div>

      {/* ── detail panel ── */}
      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onNavigate={navigate}
          onToggle={handleToggle}
        />
      )}
    </div>
  )
}
