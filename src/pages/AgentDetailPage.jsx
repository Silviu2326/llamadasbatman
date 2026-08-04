import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPlayLine, RiEditLine, RiBookOpenLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import '../dashboard.css'

const STATUS = {
  Activo:    { color: 'var(--success)', bg: '#10b98112', border: '#10b98130' },
  Inactivo:  { color: 'var(--dim)', bg: '#6b728012', border: '#6b728030' },
  Pausado:   { color: 'var(--warn)', bg: '#f59e0b12', border: '#f59e0b30' },
  Borrador:  { color: 'var(--muted)', bg: '#94a3b812', border: '#94a3b830' },
  Archivado: { color: 'var(--dim)', bg: '#6b728012', border: '#6b728030' },
}

const TABS = ['Conversaciones', 'Rendimiento', 'Configuración', 'Playbooks']

const OUTCOME_LABEL = { meeting_scheduled: 'Reunión agendada', interested: 'Interesado', rejected: 'No interesado', callback: 'Seguimiento' }

// Ítems del tab "Configuración". Los que corresponden a columnas propias de
// Agent (voiceId, personality) se guardan ahí; el resto (límites operativos,
// horario) no tiene columna propia y se guarda en Agent.settings (JSON).
const CFG_SECTIONS = [
  { section: 'Voz y personalidad', items: [
    { label: 'Voz del agente' },
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
    color: 'var(--accent)', bg: '#6366f120', verified: false,
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
  const [saveError, setSaveError] = useState('')
  const [toggleError, setToggleError] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [cfgVals, setCfgVals] = useState({})
  const [agentSettings, setAgentSettings] = useState({})
  const [playbooks, setPlaybooks] = useState([])
  const [recentCalls, setRecentCalls] = useState([])
  const [timeseries, setTimeseries] = useState(null)

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then(r => r.ok ? r.json() : null),
      // Secundarios: si uno falla la ficha se sigue mostrando, solo pierde ese bloque.
      apiFetch(`/api/agents/${id}/stats`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/playbooks').then(r => r.ok ? r.json() : []).catch(() => null),
      apiFetch(`/api/calls?agentId=${id}&limit=20`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch(`/api/agents/${id}/timeseries?days=30`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([data, stats, pbList, callsData, series]) => {
      setRecentCalls(Array.isArray(callsData?.data) ? callsData.data : [])
      setTimeseries(series)
      if (data) {
        const a = toAgent(data, stats)
        setAgent(a)
        setIsActive(data.isActive)
        const settings = data.settings || {}
        setAgentSettings(settings)
        setCfgVals({
          'Voz del agente': data.voiceId || '',
          'Velocidad de habla': settings.speechSpeed || '',
          'Tono de voz': data.personality || '',
          'Máx. llamadas/día': settings.operationalLimits?.maxCallsPerDay || '',
          'Tiempo máx. por llamada': settings.operationalLimits?.maxCallDuration || '',
          'Reintentos automáticos': settings.operationalLimits?.autoRetries || '',
          'Días activos': settings.schedule?.activeDays || '',
          'Horario de llamadas': settings.schedule?.callHours || '',
          'Zona horaria': settings.schedule?.timezone || '',
        })
      }
      setPlaybooks(Array.isArray(pbList) ? pbList : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const toggleActive = () => {
    const next = !isActive
    setIsActive(next)
    setToggleError('')
    // Un 403/500 resuelve la promesa: hay que revertir mirando r.ok, no solo en el catch.
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: next }) })
      .then(r => { if (!r.ok) { setIsActive(!next); setToggleError('No se pudo cambiar el estado del agente.') } })
      .catch(() => { setIsActive(!next); setToggleError('No se pudo cambiar el estado del agente. Comprueba tu conexión.') })
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
      body: JSON.stringify({ personality: cfgVals['Tono de voz'], voiceId: cfgVals['Voz del agente'], settings }),
    }).then(r => {
      if (r.ok) {
        setAgentSettings(settings)
        setSaveError('')
        setSavedConfig(true)
        setTimeout(() => setSavedConfig(false), 2000)
      } else {
        setSaveError('No se pudieron guardar los cambios. Inténtalo de nuevo.')
      }
    }).catch(() => setSaveError('No se pudieron guardar los cambios. Comprueba tu conexión.'))
  }

  const [cloning, setCloning] = useState(false)
  const cloneAgent = async () => {
    if (!agent) return
    setCloning(true)
    try {
      const response = await apiFetch('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: `${agent.name} (copia)`,
          role: agent.role,
          personality: agent.personality || undefined,
          voiceId: cfgVals['Voz del agente'] || undefined,
          systemPrompt: agent.objetivo || undefined,
        }),
      })
      if (!response.ok) throw new Error()
      const created = await response.json()
      navigate(`/agentes/${created.id}`)
    } catch {
      setCloning(false)
    }
  }

  const activatePlaybook = pb => {
    const settings = { ...agentSettings, activePlaybookId: pb.id, activePlaybookVersion: 1 }
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ settings }) })
      .then(r => { if (r.ok) setAgentSettings(settings) })
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14, background: 'var(--bg)' }}>
      {locale === 'en' ? 'Loading…' : 'Cargando…'}
    </div>
  )

  if (!agent) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14, background: 'var(--bg)' }}>
      {locale === 'en' ? 'Agent not found' : 'Agente no encontrado'}
    </div>
  )

  const s = STATUS[isActive ? 'Activo' : 'Inactivo']

  return (
    <div className="dark-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg)', padding: '26px clamp(12px,4vw,32px) 40px' }}>

      {/* Back */}
      <button onClick={() => navigate('/agentes')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: 'var(--dim)', cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22,
        fontFamily: 'inherit',
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> Agentes IA
      </button>

      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 22, marginBottom: 24, flexWrap: 'wrap',
        padding: '20px clamp(14px,3vw,24px)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
      }}>
        {/* Avatar */}
        <div style={{
          width: 86, height: 86, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${agent.color} 31%, transparent), color-mix(in srgb, ${agent.bg} 80%, transparent))`,
          border: `2px solid color-mix(in srgb, ${agent.color} 38%, transparent)`,
          boxShadow: `0 0 0 5px color-mix(in srgb, ${agent.color} 7%, transparent), 0 0 32px color-mix(in srgb, ${agent.color} 19%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, fontWeight: 800, color: 'var(--text-strong)',
        }}>{agent.name[0]}</div>

        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', minWidth: 0, overflowWrap: 'anywhere' }}>{agent.name}</h1>
            {agent.verified && (
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: agent.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✓</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block', boxShadow: `0 0 4px ${s.color}` }} />}
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13.5, color: agent.color, fontWeight: 600 }}>{agent.role} · {agent.subrole}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, maxWidth: 520, overflowWrap: 'break-word' }}>{agent.desc}</p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div onClick={toggleActive} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, cursor: 'pointer' }}>
            <div style={{ width: 32, height: 17, borderRadius: 99, background: isActive ? 'var(--success)' : 'var(--line-2)', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: isActive ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{isActive ? 'Activo' : 'Pausado'}</span>
          </div>
          <button onClick={() => setTab('Playbooks')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RiBookOpenLine style={{ width: 14, height: 14 }} /> Entrenar
          </button>
          <button onClick={() => setTab('Configuración')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RiEditLine style={{ width: 14, height: 14 }} /> Editar
          </button>
          <button onClick={() => navigate('/voz/test')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: `linear-gradient(90deg, var(--accent-deep), ${agent.color})`, border: 'none', borderRadius: 9, color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: `0 0 18px color-mix(in srgb, ${agent.color} 15%, transparent)`, fontFamily: 'inherit' }}>
            <RiPlayLine style={{ width: 13, height: 13 }} /> Probar
          </button>
          {toggleError && <p role="alert" style={{ margin: 0, flexBasis: '100%', textAlign: 'right', fontSize: 11.5, color: 'var(--danger-soft)' }}>{toggleError}</p>}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: 12, marginBottom: 22 }}>
        {agent.stats.map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 10.5, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{s.value}</span>
              <span style={{ fontSize: 11.5, color: s.pct === '—' ? 'var(--faint)' : s.pct.startsWith('↑') ? 'var(--success-soft)' : 'var(--danger-soft)', fontWeight: 600 }}>{s.pct}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Body 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(270px,100%),1fr))', gap: 16, alignItems: 'start' }}>

        {/* Left: persona */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* Personality */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Personalidad</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {agent.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: agent.bg + '20', border: `1px solid color-mix(in srgb, ${agent.color} 25%, transparent)`, color: agent.color, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Objetivo */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Objetivo</p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, overflowWrap: 'break-word' }}>{agent.objetivo}</p>
          </div>

          {/* Docs */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Documentos de entrenamiento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {agent.docs.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <span aria-hidden="true" style={{ fontSize: 15 }}>📄</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d}</span>
                </div>
              ))}
              {agent.extraDocs > 0 && (
                <button onClick={() => navigate('/knowledge-base')} style={{ fontSize: 11.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 10px', fontWeight: 600, fontFamily: 'inherit' }}>
                  +{agent.extraDocs} más
                </button>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(130px,100%),1fr))', gap: 7 }}>
              <button onClick={() => navigate('/playbooks')} style={{ padding: '9px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Ver playbook</button>
              <button disabled={cloning} onClick={cloneAgent} style={{ padding: '9px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 11.5, cursor: cloning ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{cloning ? 'Clonando…' : 'Clonar agente'}</button>
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
          <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 16px' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', padding: '13px 13px',
                fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? agent.color : 'var(--faint)',
                borderBottom: `2px solid ${tab === t ? agent.color : 'transparent'}`,
                cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: '22px clamp(14px,4vw,22px)' }}>
            {tab === 'Conversaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Últimas llamadas de este agente</p>
                  <button onClick={() => navigate('/llamadas')} style={{ background: 'transparent', border: `1px solid color-mix(in srgb, ${agent.color} 31%, transparent)`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Ver todas</button>
                </div>
                {recentCalls.length === 0
                  ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '30px 0' }}>Este agente todavía no tiene llamadas registradas.</p>
                  : <div className="scroll-x" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12 }}>
                    {recentCalls.map((c, i) => {
                      const name = c.lead?.name ?? 'Sin contacto'
                      const seconds = c.durationSeconds ?? 0
                      const result = OUTCOME_LABEL[c.outcome] ?? 'Sin resultado'
                      const clr = c.outcome === 'meeting_scheduled' ? 'var(--success)' : c.outcome === 'interested' ? 'var(--info)' : c.outcome === 'rejected' ? 'var(--danger)' : 'var(--dim)'
                      return (
                        <div key={c.id} role="button" tabIndex="0" onClick={() => navigate(`/llamadas/${c.id}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/llamadas/${c.id}`)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 80px 120px', gap: 0, minWidth: 430, padding: '11px 16px', borderBottom: i < recentCalls.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--dim)', flexShrink: 0 }}>{name[0]}</div>
                            <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p><p style={{ margin: 0, fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lead?.company ?? 'Sin empresa'}</p></div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{c.startedAt ? new Date(c.startedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--dim)' }}>{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: clr + '15', color: clr, border: `1px solid color-mix(in srgb, ${clr} 19%, transparent)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{result}</span>
                        </div>
                      )
                    })}
                  </div>
                }
              </div>
            )}

            {tab === 'Rendimiento' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {!timeseries ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '30px 0' }}>No se pudieron cargar las métricas históricas.</p> : <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: 12 }}>
                    {[
                      { label: `Llamadas (${timeseries.days} días)`, value: timeseries.totals.calls },
                      { label: 'Tasa de éxito', value: `${timeseries.totals.successRate}%` },
                      { label: 'Duración media', value: timeseries.totals.avgDurationSeconds != null ? `${Math.floor(timeseries.totals.avgDurationSeconds / 60)}:${String(timeseries.totals.avgDurationSeconds % 60).padStart(2, '0')} min` : '—' },
                      { label: 'Sentimiento medio', value: timeseries.totals.avgSentiment != null ? (timeseries.totals.avgSentiment > 0 ? `+${timeseries.totals.avgSentiment}` : String(timeseries.totals.avgSentiment)) : '—' },
                    ].map(m => (
                      <div key={m.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Llamadas por día · últimos {timeseries.days} días</p>
                      <span style={{ fontSize: 11, color: 'var(--dim)' }}>Total: {timeseries.totals.calls}</span>
                    </div>
                    {timeseries.totals.calls === 0
                      ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '20px 0', background: 'var(--surface-2)', borderRadius: 10 }}>Sin llamadas en este periodo.</p>
                      : <div style={{ height: 110, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '10px 14px' }}>
                        {(() => { const max = Math.max(...timeseries.series.map(d => d.calls), 1); return timeseries.series.map(d => (
                          <div key={d.date} title={`${d.date}: ${d.calls} llamadas, ${d.meetings} reuniones`} style={{ flex: 1, borderRadius: '2px 2px 0 0', background: `linear-gradient(180deg, color-mix(in srgb, ${agent.color} 80%, transparent), ${agent.bg})`, height: `${(d.calls / max) * 100}%`, minHeight: d.calls ? 3 : 1, opacity: d.calls ? 1 : 0.25 }} />
                        )) })()}
                      </div>
                    }
                  </div>
                </>}
              </div>
            )}

            {tab === 'Configuración' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {CFG_SECTIONS.map(({ section, items }) => (
                  <div key={section} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 'clamp(14px,3vw,18px)' }}>
                    <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{section}</p>
                    {items.map(({ label }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                          {editKey === label
                            ? <input autoFocus defaultValue={cfgVals[label] ?? ''}
                                onBlur={e => { setCfgVals(v => ({ ...v, [label]: e.target.value })); setEditKey(null) }}
                                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid ' + agent.color, color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, outline: 'none', width: 'min(180px, 100%)', minWidth: 0, textAlign: 'right', fontFamily: 'inherit' }}
                              />
                            : <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere', color: cfgVals[label] ? 'var(--muted)' : 'var(--faint)' }}>{cfgVals[label] || 'Sin definir'}</span>
                          }
                          <RiEditLine style={{ width: 13, height: 13, color: 'var(--dim)', cursor: 'pointer' }} onClick={() => setEditKey(label)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {saveError && <p role="alert" style={{ margin: 0, color: 'var(--danger-soft)', fontSize: 12.5 }}>{saveError}</p>}
                <button onClick={saveConfig} style={{ alignSelf: 'flex-start', background: savedConfig ? 'var(--success-bg)' : `linear-gradient(90deg, var(--accent-deep), ${agent.color})`, border: 'none', borderRadius: 9, padding: '10px 20px', color: savedConfig ? 'var(--success)' : 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .3s' }}>
                  {savedConfig ? '✓ Guardado' : 'Guardar cambios'}
                </button>
              </div>
            )}

            {tab === 'Playbooks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Playbooks disponibles</p>
                  <button onClick={() => navigate('/playbooks')} style={{ background: 'transparent', border: `1px solid color-mix(in srgb, ${agent.color} 31%, transparent)`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Asignar playbook</button>
                </div>
                {playbooks.length === 0
                  ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '30px 0' }}>Sin playbooks. Crea uno desde la sección Playbooks.</p>
                  : playbooks.map(pb => {
                    const active = agentSettings.activePlaybookId === pb.id
                    return (
                      <div key={pb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '14px 16px' }}>
                        <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: agent.bg + '50', border: `1px solid color-mix(in srgb, ${agent.color} 19%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📖</div>
                        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{pb.name}</p>
                            {active && <span style={{ fontSize: 10, fontWeight: 600, background: '#10b98115', color: 'var(--success)', border: '1px solid #10b98130', borderRadius: 4, padding: '1px 6px' }}>Activo · v{agentSettings.activePlaybookVersion ?? 1}</span>}
                          </div>
                          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)' }}>{pb.description || 'Sin descripción'}</p>
                        </div>
                        <button onClick={() => activatePlaybook(pb)} style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--success)' : 'var(--muted)', background: active ? '#10b98115' : 'var(--line)', border: `1px solid ${active ? '#10b98130' : 'var(--line)'}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{active ? 'Activo' : 'Activar'}</button>
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

