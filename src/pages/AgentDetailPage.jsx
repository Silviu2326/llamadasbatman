import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPlayLine, RiEditLine, RiBookOpenLine,
  RiFileCopyLine, RiPhoneLine, RiCalendarLine, RiCheckLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import '../dashboard.css'

const STATUS = {
  Activo:    { color: '#10b981', bg: '#10b98112', border: '#10b98130' },
  Inactivo:  { color: '#6b7280', bg: '#6b728012', border: '#6b728030' },
  Pausado:   { color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30' },
  Borrador:  { color: '#94a3b8', bg: '#94a3b812', border: '#94a3b830' },
  Archivado: { color: '#6b7280', bg: '#6b728012', border: '#6b728030' },
}

const TABS = ['Resumen', 'Conversaciones', 'Configuración', 'Playbooks', 'Rendimiento']

const RECENT_CALLS = [
  { name: 'Carlos Méndez',   time: 'Hace 1h',  dur: '4:32', result: 'Éxito' },
  { name: 'Laura Fernández', time: 'Hace 3h',  dur: '3:18', result: 'Éxito' },
  { name: 'Ana Beltrán',     time: 'Hace 5h',  dur: '2:50', result: 'Sin respuesta' },
  { name: 'Miguel Soto',     time: 'Ayer 16h', dur: '6:11', result: 'Éxito' },
  { name: 'Sofía Vargas',    time: 'Ayer 14h', dur: '3:55', result: 'Interesado' },
]

const BAR_VALS = [62, 75, 68, 88, 82, 94, 100, 90, 105, 98, 112, 88, 102, 95, 118]

function toAgent(d, stats) {
  return {
    id: d.id, name: d.name, role: d.role, subrole: d.role,
    desc: d.systemPrompt || d.personality || '',
    color: '#6366f1', bg: '#6366f120', verified: false,
    status: d.isActive ? 'Activo' : 'Pausado',
    personality: d.personality || '', tag: d.personality || 'Profesional amigable',
    tags: d.personality ? d.personality.split(',').map(s => s.trim()) : [],
    energia: 7, humor: 6, objetivo: d.systemPrompt || '',
    docs: [], extraDocs: 0,
    calls: stats?.calls ?? 0, conv: stats ? Math.round((stats.meetingsScheduled / (stats.calls || 1)) * 100) : 0,
    stats: [
      { label: 'Llamadas totales', value: stats?.calls ?? 0, pct: '—' },
      { label: 'Reuniones', value: stats?.meetingsScheduled ?? 0, pct: '—' },
      { label: 'Sentimiento medio', value: stats ? (stats.avgSentimentScore?.toFixed(2) ?? '—') : '—', pct: '—' },
      { label: 'Tasa de cierre', value: stats ? `${Math.round((stats.meetingsScheduled / (stats.calls || 1)) * 100)}%` : '—', pct: '—' },
    ],
  }
}

export default function AgentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')
  const [isActive, setIsActive] = useState(false)
  const [savedConfig, setSavedConfig] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [cfgVals, setCfgVals] = useState({})

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`/api/agents/${id}/stats`).then(r => r.ok ? r.json() : null),
    ]).then(([data, stats]) => {
      if (data) { const a = toAgent(data, stats); setAgent(a); setIsActive(data.isActive) }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Cargando…
    </div>
  )

  if (!agent) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Agente no encontrado
    </div>
  )

  const s = STATUS[isActive ? 'Activo' : 'Inactivo']

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>

      {/* Back */}
      <button onClick={() => navigate('/agentes')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: '#6b7280', cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22,
        fontFamily: 'inherit',
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> Agentes IA
      </button>

      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 22, marginBottom: 24,
        padding: '20px 24px', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 16,
      }}>
        {/* Avatar */}
        <div style={{
          width: 86, height: 86, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 30%, ${agent.color}50, ${agent.bg}cc)`,
          border: `2px solid ${agent.color}60`,
          boxShadow: `0 0 0 5px ${agent.color}12, 0 0 32px ${agent.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, fontWeight: 800, color: '#fff',
          textShadow: `0 0 14px ${agent.color}`,
        }}>{agent.name[0]}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>{agent.name}</h1>
            {agent.verified && (
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: agent.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✓</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block', boxShadow: `0 0 4px ${s.color}` }} />}
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13.5, color: agent.color, fontWeight: 600 }}>{agent.role} · {agent.subrole}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, maxWidth: 520 }}>{agent.desc}</p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div onClick={() => setIsActive(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, cursor: 'pointer' }}>
            <div style={{ width: 32, height: 17, borderRadius: 99, background: isActive ? '#10b981' : '#374151', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: isActive ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{isActive ? 'Activo' : 'Pausado'}</span>
          </div>
          <button onClick={() => setTab('Playbooks')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RiBookOpenLine style={{ width: 14, height: 14 }} /> Entrenar
          </button>
          <button onClick={() => setTab('Configuración')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RiEditLine style={{ width: 14, height: 14 }} /> Editar
          </button>
          <button onClick={() => navigate('/llamadas')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: `linear-gradient(90deg, ${agent.bg}, ${agent.color}90)`, border: 'none', borderRadius: 9, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: `0 0 18px ${agent.color}25`, fontFamily: 'inherit' }}>
            <RiPlayLine style={{ width: 13, height: 13 }} /> Probar
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        {agent.stats.map(s => (
          <div key={s.label} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 10.5, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</span>
              <span style={{ fontSize: 11.5, color: s.pct === '—' ? '#4b5563' : s.pct.startsWith('↑') ? '#4ade80' : '#f87171', fontWeight: 600 }}>{s.pct}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Body 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left: persona */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Personality */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Personalidad</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {agent.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: agent.bg + '20', border: `1px solid ${agent.color}40`, color: agent.color, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
            {[{ label: 'Energía', val: agent.energia, color: agent.color }, { label: 'Humor', val: agent.humor, color: '#818cf8' }].map(({ label, val, color }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{val}/10</span>
                </div>
                <div style={{ height: 4, background: '#1e2433', borderRadius: 99 }}>
                  <div style={{ width: `${val * 10}%`, height: '100%', background: color, borderRadius: 99, boxShadow: `0 0 6px ${color}60` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Objetivo */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Objetivo</p>
            <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>{agent.objetivo}</p>
          </div>

          {/* Docs */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Documentos de entrenamiento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {agent.docs.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#111827', border: '1px solid #1a2235', borderRadius: 8 }}>
                  <span style={{ fontSize: 15 }}>📄</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{d}</span>
                </div>
              ))}
              {agent.extraDocs > 0 && (
                <button onClick={() => navigate('/knowledge-base')} style={{ fontSize: 11.5, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 10px', fontWeight: 600, fontFamily: 'inherit' }}>
                  +{agent.extraDocs} más
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {[
                ['Ver playbook', () => navigate('/playbooks')],
                ['Clonar agente', () => alert(`Clonando "${agent.name}"...`)],
              ].map(([label, action]) => (
                <button key={label} onClick={action} style={{ padding: '9px', background: '#111827', border: '1px solid #1a2235', borderRadius: 9, color: '#94a3b8', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #1e2433', padding: '0 16px' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', padding: '13px 13px',
                fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? agent.color : '#4b5563',
                borderBottom: `2px solid ${tab === t ? agent.color : 'transparent'}`,
                cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: '22px 22px' }}>
            {tab === 'Resumen' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Bar chart */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Llamadas · últimas 2 semanas</p>
                    <span style={{ fontSize: 11, color: '#4b5563' }}>Total: {agent.calls || 0}</span>
                  </div>
                  <div style={{ height: 110, background: '#111827', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 4, padding: '10px 14px 10px' }}>
                    {BAR_VALS.map((h, i) => (
                      <div key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', background: `linear-gradient(180deg, ${agent.color}cc, ${agent.bg})`, height: `${agent.calls ? h : 0}%`, minHeight: agent.calls ? 3 : 0, filter: `drop-shadow(0 0 4px ${agent.color}50)` }} />
                    ))}
                  </div>
                </div>

                {/* Extra metrics */}
                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Métricas adicionales</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Duración media', value: '4:32 min' },
                      { label: 'Tasa de rechazo', value: '18.3%' },
                      { label: 'Leads cualificados/día', value: agent.calls ? `${Math.floor(agent.calls / 7)}` : '—' },
                      { label: 'Satisfacción media', value: agent.calls ? '4.7 / 5.0' : '—' },
                    ].map(m => (
                      <div key={m.label} style={{ padding: '13px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10.5, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</p>
                        <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent calls */}
                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Últimas conversaciones</p>
                  <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 10, overflow: 'hidden' }}>
                    {RECENT_CALLS.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < RECENT_CALLS.length - 1 ? '1px solid #1e2433' : 'none' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
                          {c.name[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{c.name}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{c.time} · {c.dur} min</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <RiPhoneLine style={{ width: 12, height: 12, color: '#4b5563' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: c.result === 'Éxito' ? '#10b98115' : c.result === 'Interesado' ? '#3b82f615' : '#1e2433', color: c.result === 'Éxito' ? '#10b981' : c.result === 'Interesado' ? '#60a5fa' : '#6b7280', border: `1px solid ${c.result === 'Éxito' ? '#10b98130' : c.result === 'Interesado' ? '#3b82f630' : '#1e2433'}` }}>
                            {c.result}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'Conversaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Historial completo</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Todas', 'Éxito', 'Sin resp.', 'No interés'].map((f, i) => (
                      <button key={f} style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid ' + (i === 0 ? agent.color : '#1e2433'), background: i === 0 ? agent.color + '20' : 'transparent', color: i === 0 ? agent.color : '#6b7280', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>{f}</button>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { name: 'Carlos Méndez',   company: 'TechSolutions',  time: 'Hoy 11:32',  dur: '4:32', result: 'Éxito', score: '+0.82' },
                    { name: 'Laura Fernández', company: 'DataPro Iberia', time: 'Hoy 10:15',  dur: '3:18', result: 'Interesado', score: '+0.45' },
                    { name: 'Ana Beltrán',     company: 'Innovate Corp',  time: 'Ayer 17:21', dur: '2:50', result: 'Sin resp.', score: '—' },
                    { name: 'Miguel Soto',     company: 'MedCare Systems',time: 'Ayer 16:05', dur: '6:11', result: 'Éxito', score: '+0.91' },
                    { name: 'Sofía Vargas',    company: 'NextGen Tech',   time: 'Ayer 14:55', dur: '3:55', result: 'No interés', score: '-0.38' },
                    { name: 'Javier Ruiz',     company: 'Retail Group',   time: '23 may',     dur: '5:20', result: 'Éxito', score: '+0.67' },
                    { name: 'Elena Gómez',     company: 'BuildIt Sol.',   time: '22 may',     dur: '1:50', result: 'Sin resp.', score: '—' },
                  ].map((c, i) => {
                    const ok = c.result === 'Éxito'
                    const int = c.result === 'Interesado'
                    const bad = c.result === 'No interés'
                    const clr = ok ? '#10b981' : int ? '#60a5fa' : bad ? '#ef4444' : '#6b7280'
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 70px 90px', gap: 0, padding: '11px 16px', borderBottom: i < 6 ? '1px solid #1e2433' : 'none', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{c.name[0]}</div>
                          <div><p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{c.name}</p><p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{c.company}</p></div>
                        </div>
                        <span style={{ fontSize: 11, color: '#4b5563' }}>{c.time}</span>
                        <span style={{ fontSize: 11.5, color: '#6b7280' }}>{c.dur} min</span>
                        <span style={{ fontSize: 11.5, color: c.score.startsWith('+') ? '#4ade80' : c.score.startsWith('-') ? '#f87171' : '#4b5563', fontWeight: 600 }}>{c.score}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: clr + '15', color: clr, border: `1px solid ${clr}30`, whiteSpace: 'nowrap' }}>{c.result}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {tab === 'Configuración' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  { section: 'Voz y personalidad', items: [
                    { label: 'Modelo de voz', value: 'Neural TTS — Español (España)', type: 'select' },
                    { label: 'Velocidad de habla', value: '1.0x (Normal)', type: 'select' },
                    { label: 'Tono de voz', value: agent.tag || 'Profesional amigable', type: 'select' },
                  ]},
                  { section: 'Límites operativos', items: [
                    { label: 'Máx. llamadas/día', value: '200', type: 'input' },
                    { label: 'Tiempo máx. por llamada', value: '10 min', type: 'input' },
                    { label: 'Reintentos automáticos', value: '2 intentos', type: 'select' },
                  ]},
                  { section: 'Horario activo', items: [
                    { label: 'Días activos', value: 'Lunes — Viernes', type: 'select' },
                    { label: 'Horario de llamadas', value: '09:00 — 19:00', type: 'input' },
                    { label: 'Zona horaria', value: 'Europe/Madrid (CET)', type: 'select' },
                  ]},
                ].map(({ section, items }) => (
                  <div key={section} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                    <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{section}</p>
                    {items.map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2433' }}>
                        <span style={{ fontSize: 12.5, color: '#6b7280' }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {editKey === label
                            ? <input autoFocus defaultValue={cfgVals[label] ?? value}
                                onBlur={e => { setCfgVals(v => ({ ...v, [label]: e.target.value })); setEditKey(null) }}
                                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid ' + agent.color, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, outline: 'none', width: 180, textAlign: 'right', fontFamily: 'inherit' }}
                              />
                            : <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{cfgVals[label] ?? value}</span>
                          }
                          <RiEditLine style={{ width: 13, height: 13, color: '#374151', cursor: 'pointer' }} onClick={() => setEditKey(label)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <button onClick={() => { setSavedConfig(true); setTimeout(() => setSavedConfig(false), 2000) }} style={{ alignSelf: 'flex-start', background: savedConfig ? '#10b981' : `linear-gradient(90deg, ${agent.bg}, ${agent.color})`, border: 'none', borderRadius: 9, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .3s' }}>
                  {savedConfig ? '✓ Guardado' : 'Guardar cambios'}
                </button>
              </div>
            )}

            {tab === 'Playbooks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Playbooks asignados</p>
                  <button onClick={() => navigate('/playbooks')} style={{ background: 'transparent', border: `1px solid ${agent.color}50`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Asignar playbook</button>
                </div>
                {[
                  { name: 'Agendar demos B2B', badge: 'Oficial', tasa: '28,4%', uses: 312, active: true },
                  { name: 'Seguimiento post demo', badge: 'Personalizado', tasa: '26,5%', uses: 89, active: true },
                  { name: 'Reactivación inactivos', badge: 'Personalizado', tasa: '15,2%', uses: 41, active: false },
                ].map((pb, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '14px 16px' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: agent.bg + '50', border: `1px solid ${agent.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📖</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{pb.name}</p>
                        <span style={{ fontSize: 10, fontWeight: 600, background: '#1e2433', color: '#6b7280', borderRadius: 4, padding: '1px 6px' }}>{pb.badge}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Tasa de éxito: {pb.tasa} · {pb.uses} usos</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: pb.active ? '#10b981' : '#6b7280', background: pb.active ? '#10b98115' : '#1e2433', border: `1px solid ${pb.active ? '#10b98130' : '#1e2433'}`, borderRadius: 5, padding: '2px 8px' }}>{pb.active ? 'Activo' : 'Inactivo'}</span>
                      <RiEditLine style={{ width: 14, height: 14, color: '#374151', cursor: 'pointer' }} onClick={() => navigate('/playbooks')} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Rendimiento' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Llamadas este mes', value: agent.calls || 0, sub: '+18.2% vs mes ant.' },
                    { label: 'Tasa de éxito', value: `${agent.conv || 0}%`, sub: '+2.1pp vs mes ant.' },
                    { label: 'Sentimiento medio', value: '+0.71', sub: '+0.04 vs mes ant.' },
                    { label: 'Duración media', value: '4:32 min', sub: '-12s vs mes ant.' },
                    { label: 'Meetings generadas', value: agent.calls ? Math.floor(agent.calls * 0.14) : 0, sub: '+22.5% vs mes ant.' },
                    { label: 'Score promedio', value: '87/100', sub: '+3pts vs mes ant.' },
                  ].map((m, i) => (
                    <div key={i} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '16px' }}>
                      <p style={{ margin: '0 0 6px', fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</p>
                      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{m.value}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#4ade80' }}>{m.sub}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Evolución semanal</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, 1fr)', gap: 0 }}>
                    <div />{['Sem 1','Sem 2','Sem 3','Sem 4','Sem 5'].map(s => (
                      <span key={s} style={{ fontSize: 10, color: '#374151', textAlign: 'center' }}>{s}</span>
                    ))}
                    {[
                      { label: 'Llamadas', vals: [38, 42, 51, 48, agent.calls ? Math.floor(agent.calls / 4) : 0] },
                      { label: 'Éxitos',   vals: [12, 15, 18, 16, agent.conv ? Math.floor((agent.calls || 0) / 4 * agent.conv / 100) : 0] },
                      { label: 'Sentiment',vals: ['+0.61','+0.65','+0.70','+0.68','+0.71'] },
                    ].map(row => (
                      [<span key={row.label} style={{ fontSize: 11.5, color: '#6b7280', display: 'flex', alignItems: 'center', paddingTop: 10 }}>{row.label}</span>,
                      ...row.vals.map((v, j) => (
                        <div key={j} style={{ textAlign: 'center', paddingTop: 10 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: agent.color }}>{v}</span>
                        </div>
                      ))]
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
