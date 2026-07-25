import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPlayLine, RiEditLine, RiBookOpenLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import '../dashboard.css'

const STATUS = {
  Activo:    { color: '#10b981', bg: '#10b98112', border: '#10b98130' },
  Inactivo:  { color: '#6b7280', bg: '#6b728012', border: '#6b728030' },
  Pausado:   { color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30' },
  Borrador:  { color: '#94a3b8', bg: '#94a3b812', border: '#94a3b830' },
  Archivado: { color: '#6b7280', bg: '#6b728012', border: '#6b728030' },
}

// ponytail: solo pestañas con datos reales — Resumen/Rendimiento vuelven cuando existan endpoints de series
const TABS = ['Conversaciones', 'Configuración', 'Playbooks']

const OUTCOME_LABEL = { meeting_scheduled: 'Reunión agendada', interested: 'Interesado', rejected: 'No interesado', callback: 'Seguimiento' }

// Ítems del tab "Configuración". Los que corresponden a columnas propias de
// Agent (voiceId, personality) se guardan ahí; el resto (límites operativos,
// horario) no tiene columna propia y se guarda en Agent.settings (JSON).
const CFG_SECTIONS = [
  { section: 'Voz y personalidad', items: [
    { label: 'Modelo de voz' },
    { label: 'Velocidad de habla' },
    { label: 'Tono de voz' },
  ] },
  { section: 'Límites operativos', items: [
    { label: 'Máx. llamadas/día' },
    { label: 'Tiempo máx. por llamada' },
    { label: 'Reintentos automáticos' },
  ] },
  { section: 'Horario activo', items: [
    { label: 'Días activos' },
    { label: 'Horario de llamadas' },
    { label: 'Zona horaria' },
  ] },
]

function toAgent(d, stats) {
  return {
    id: d.id, name: d.name, role: d.role, subrole: d.role,
    desc: d.systemPrompt || d.personality || '',
    color: '#6366f1', bg: '#6366f120', verified: false,
    status: d.isActive ? 'Activo' : 'Pausado',
    personality: d.personality || '', tag: d.personality || 'Profesional amigable',
    tags: d.personality ? d.personality.split(',').map(s => s.trim()) : [],
    objetivo: d.systemPrompt || '',
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
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Conversaciones')
  const [isActive, setIsActive] = useState(false)
  const [savedConfig, setSavedConfig] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [cfgVals, setCfgVals] = useState({})
  const [agentSettings, setAgentSettings] = useState({})
  const [playbooks, setPlaybooks] = useState([])
  const [recentCalls, setRecentCalls] = useState([])

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`/api/agents/${id}/stats`).then(r => r.ok ? r.json() : null),
      apiFetch('/api/playbooks').then(r => r.ok ? r.json() : []),
      apiFetch(`/api/calls?agentId=${id}&limit=20`).then(r => r.ok ? r.json() : null),
    ]).then(([data, stats, pbList, callsData]) => {
      setRecentCalls(Array.isArray(callsData?.data) ? callsData.data : [])
      if (data) {
        const a = toAgent(data, stats)
        setAgent(a)
        setIsActive(data.isActive)
        const settings = data.settings || {}
        setAgentSettings(settings)
        setCfgVals({
          'Modelo de voz': data.voiceId || 'Neural TTS — Español (España)',
          'Velocidad de habla': settings.speechSpeed || '1.0x (Normal)',
          'Tono de voz': data.personality || 'Profesional amigable',
          'Máx. llamadas/día': settings.operationalLimits?.maxCallsPerDay || '200',
          'Tiempo máx. por llamada': settings.operationalLimits?.maxCallDuration || '10 min',
          'Reintentos automáticos': settings.operationalLimits?.autoRetries || '2 intentos',
          'Días activos': settings.schedule?.activeDays || 'Lunes — Viernes',
          'Horario de llamadas': settings.schedule?.callHours || '09:00 — 19:00',
          'Zona horaria': settings.schedule?.timezone || 'Europe/Madrid (CET)',
        })
      }
      setPlaybooks(Array.isArray(pbList) ? pbList : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const toggleActive = () => {
    const next = !isActive
    setIsActive(next)
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: next }) }).catch(() => setIsActive(!next))
  }

  const saveConfig = () => {
    const settings = {
      ...agentSettings,
      speechSpeed: cfgVals['Velocidad de habla'],
      operationalLimits: {
        maxCallsPerDay: cfgVals['Máx. llamadas/día'],
        maxCallDuration: cfgVals['Tiempo máx. por llamada'],
        autoRetries: cfgVals['Reintentos automáticos'],
      },
      schedule: {
        activeDays: cfgVals['Días activos'],
        callHours: cfgVals['Horario de llamadas'],
        timezone: cfgVals['Zona horaria'],
      },
    }
    apiFetch(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ personality: cfgVals['Tono de voz'], voiceId: cfgVals['Modelo de voz'], settings }),
    }).then(r => {
      if (r.ok) {
        setAgentSettings(settings)
        setSavedConfig(true)
        setTimeout(() => setSavedConfig(false), 2000)
      }
    })
  }

  const activatePlaybook = pb => {
    const settings = { ...agentSettings, activePlaybookId: pb.id, activePlaybookVersion: 1 }
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ settings }) })
      .then(r => { if (r.ok) setAgentSettings(settings) })
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      {locale === 'en' ? 'Loading…' : 'Cargando…'}
    </div>
  )

  if (!agent) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      {locale === 'en' ? 'Agent not found' : 'Agente no encontrado'}
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
          <div onClick={toggleActive} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, cursor: 'pointer' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 16, alignItems: 'start' }}>

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
                  <span aria-hidden="true" style={{ fontSize: 15 }}>📄</span>
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
              <button onClick={() => navigate('/playbooks')} style={{ padding: '9px', background: '#111827', border: '1px solid #1a2235', borderRadius: 9, color: '#94a3b8', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Ver playbook</button>
              <span title="La clonación de agentes aún no está disponible" style={{ padding: '9px', background: '#0b101a', border: '1px solid #1a2235', borderRadius: 9, color: '#64748b', fontSize: 11.5, cursor: 'not-allowed', fontFamily: 'inherit', textAlign: 'center' }}>Clonar agente — próximamente</span>
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
            {tab === 'Conversaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Últimas llamadas de este agente</p>
                  <button onClick={() => navigate('/llamadas')} style={{ background: 'transparent', border: `1px solid ${agent.color}50`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Ver todas</button>
                </div>
                {recentCalls.length === 0
                  ? <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '30px 0' }}>Este agente todavía no tiene llamadas registradas.</p>
                  : <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, overflow: 'hidden' }}>
                    {recentCalls.map((c, i) => {
                      const name = c.lead?.name ?? 'Sin contacto'
                      const seconds = c.durationSeconds ?? 0
                      const result = OUTCOME_LABEL[c.outcome] ?? 'Sin resultado'
                      const clr = c.outcome === 'meeting_scheduled' ? '#10b981' : c.outcome === 'interested' ? '#60a5fa' : c.outcome === 'rejected' ? '#ef4444' : '#6b7280'
                      return (
                        <div key={c.id} role="button" tabIndex="0" onClick={() => navigate(`/llamadas/${c.id}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/llamadas/${c.id}`)} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 120px', gap: 0, padding: '11px 16px', borderBottom: i < recentCalls.length - 1 ? '1px solid #1e2433' : 'none', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{name[0]}</div>
                            <div><p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{name}</p><p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{c.lead?.company ?? 'Sin empresa'}</p></div>
                          </div>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>{c.startedAt ? new Date(c.startedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span style={{ fontSize: 11.5, color: '#6b7280' }}>{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: clr + '15', color: clr, border: `1px solid ${clr}30`, whiteSpace: 'nowrap', textAlign: 'center' }}>{result}</span>
                        </div>
                      )
                    })}
                  </div>
                }
              </div>
            )}

            {tab === 'Configuración' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {CFG_SECTIONS.map(({ section, items }) => (
                  <div key={section} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                    <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{section}</p>
                    {items.map(({ label }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2433' }}>
                        <span style={{ fontSize: 12.5, color: '#6b7280' }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {editKey === label
                            ? <input autoFocus defaultValue={cfgVals[label] ?? ''}
                                onBlur={e => { setCfgVals(v => ({ ...v, [label]: e.target.value })); setEditKey(null) }}
                                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid ' + agent.color, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, outline: 'none', width: 180, textAlign: 'right', fontFamily: 'inherit' }}
                              />
                            : <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{cfgVals[label] ?? ''}</span>
                          }
                          <RiEditLine style={{ width: 13, height: 13, color: '#374151', cursor: 'pointer' }} onClick={() => setEditKey(label)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <button onClick={saveConfig} style={{ alignSelf: 'flex-start', background: savedConfig ? '#10b981' : `linear-gradient(90deg, ${agent.bg}, ${agent.color})`, border: 'none', borderRadius: 9, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .3s' }}>
                  {savedConfig ? '✓ Guardado' : 'Guardar cambios'}
                </button>
              </div>
            )}

            {tab === 'Playbooks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Playbooks disponibles</p>
                  <button onClick={() => navigate('/playbooks')} style={{ background: 'transparent', border: `1px solid ${agent.color}50`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Asignar playbook</button>
                </div>
                {playbooks.length === 0
                  ? <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '30px 0' }}>Sin playbooks. Crea uno desde la sección Playbooks.</p>
                  : playbooks.map(pb => {
                    const active = agentSettings.activePlaybookId === pb.id
                    return (
                      <div key={pb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '14px 16px' }}>
                        <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: agent.bg + '50', border: `1px solid ${agent.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📖</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{pb.name}</p>
                            {active && <span style={{ fontSize: 10, fontWeight: 600, background: '#10b98115', color: '#10b981', border: '1px solid #10b98130', borderRadius: 4, padding: '1px 6px' }}>Activo · v{agentSettings.activePlaybookVersion ?? 1}</span>}
                          </div>
                          <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>{pb.description || 'Sin descripción'}</p>
                        </div>
                        <button onClick={() => activatePlaybook(pb)} style={{ fontSize: 11, fontWeight: 600, color: active ? '#10b981' : '#94a3b8', background: active ? '#10b98115' : '#1e2433', border: `1px solid ${active ? '#10b98130' : '#1e2433'}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{active ? 'Activo' : 'Activar'}</button>
                      </div>
                    )
                  })
                }
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

