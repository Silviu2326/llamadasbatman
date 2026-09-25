import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiAddLine, RiDownloadLine,
  RiFlowChart, RiAlarmLine, RiSearchLine, RiChatVoiceLine,
  RiCheckLine, RiArrowUpSLine, RiArrowDownSLine, RiDeleteBinLine, RiSaveLine,
} from 'react-icons/ri'
import { HiArrowUp } from 'react-icons/hi'
import { getLocale, localeCode, useI18n } from '../i18n'
import PageLoadingState from '../components/ui/PageLoadingState'
import '../dashboard.css'
import './sales-detail-standard.css'

const STATS = [
  { label:'Tasa de éxito', value:'28,4%', delta:'+3,2pp', up:true },
  { label:'Duración prom.', value:'6m 42s', delta:'-12s', up:false },
  { label:'Reuniones', value:'624', delta:'+18,1%', up:true },
]


const TABS = ['Resumen', 'Pasos', 'Rendimiento']

/** Pasos guardados en `Playbook.steps` (JSON) → forma editable. Tolera JSON antiguo. */
function normalizeSteps(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(step => step && typeof step === 'object')
    .map((step, index) => ({
      id: typeof step.id === 'string' && step.id ? step.id : `step-${index + 1}`,
      title: typeof step.title === 'string' ? step.title : typeof step.name === 'string' ? step.name : `Paso ${index + 1}`,
      instruction: typeof step.instruction === 'string' ? step.instruction : typeof step.text === 'string' ? step.text : '',
      goal: typeof step.goal === 'string' ? step.goal : '',
    }))
}

const stepsKey = steps => JSON.stringify(steps.map(step => [step.title, step.instruction, step.goal]))

/**
 * Editor de pasos del guion: lista ordenable con título, instrucción y
 * objetivo. Guarda con `PUT /api/playbooks/:id`; una lista vacía borra los
 * pasos. Es lo que el agente recibe como «Steps (follow them in order)».
 */
function PlaybookStepsEditor({ playbookId, initialSteps, accent, onSaved }) {
  const [steps, setSteps] = useState(initialSteps)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedKey, setSavedKey] = useState(stepsKey(initialSteps))
  const dirty = stepsKey(steps) !== savedKey
  const invalid = steps.findIndex(step => !step.title.trim())

  const patch = (index, field, value) => setSteps(current => current.map((step, i) => i === index ? { ...step, [field]: value } : step))
  const move = (index, delta) => setSteps(current => {
    const target = index + delta
    if (target < 0 || target >= current.length) return current
    const next = [...current]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    return next
  })
  const remove = index => setSteps(current => current.filter((_, i) => i !== index))
  const add = () => setSteps(current => current.length >= 40 ? current : [...current, { id: `step-${Date.now()}`, title: '', instruction: '', goal: '' }])

  const save = async () => {
    if (saving || invalid !== -1) return
    setSaving(true)
    setError('')
    try {
      const payload = steps.map(step => ({ id: step.id, title: step.title.trim(), instruction: step.instruction.trim(), goal: step.goal.trim() }))
      const response = await apiFetch(`/api/playbooks/${playbookId}`, { method: 'PUT', body: JSON.stringify({ steps: payload }) })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'No se pudieron guardar los pasos.')
      }
      setSavedKey(stepsKey(steps))
      onSaved?.(payload)
    } catch (saveError) {
      setError(saveError?.message || 'No se pudieron guardar los pasos.')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = { width:'100%', boxSizing:'border-box', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:12.5, fontFamily:'inherit' }
  const iconButton = { background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:7, width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', cursor:'pointer', padding:0 }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:12 }}>
        <div>
          <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Pasos del guion</p>
          <p style={{ margin:0, fontSize:12, color:'var(--dim)' }}>El agente los recibe en este orden dentro de su prompt. Sin pasos, el guion aporta solo nombre, descripción y etiquetas.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button type="button" onClick={add} disabled={steps.length >= 40} style={{ display:'flex', alignItems:'center', gap:5, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'8px 12px', color:'var(--muted)', fontSize:12.5, cursor:'pointer', fontFamily:'inherit' }}><RiAddLine /> Añadir paso</button>
          <button type="button" onClick={save} disabled={!dirty || saving || invalid !== -1} style={{ display:'flex', alignItems:'center', gap:5, background: dirty && invalid === -1 ? accent : 'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'8px 12px', color: dirty && invalid === -1 ? '#fff' : 'var(--dim)', fontSize:12.5, fontWeight:700, cursor: dirty ? 'pointer' : 'default', fontFamily:'inherit' }}><RiSaveLine /> {saving ? 'Guardando…' : steps.length === 0 && dirty ? 'Guardar (borra los pasos)' : 'Guardar pasos'}</button>
        </div>
      </div>
      {error ? <p role="alert" style={{ margin:'0 0 10px', fontSize:12, color:'var(--danger)' }}>{error}</p> : null}
      {invalid !== -1 ? <p style={{ margin:'0 0 10px', fontSize:12, color:'var(--danger)' }}>El paso {invalid + 1} necesita un título.</p> : null}
      {steps.length === 0 ? <p style={{ margin:0, fontSize:13, color:'var(--dim)' }}>Este guion no tiene pasos todavía.</p> : null}
      <ol style={{ listStyle:'none', margin:0, padding:0, display:'flex', flexDirection:'column', gap:10 }}>
        {steps.map((step, index) => (
          <li key={step.id} style={{ display:'flex', gap:10, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:10, padding:'10px 12px' }}>
            <div style={{ width:22, height:22, borderRadius:7, flexShrink:0, background:`color-mix(in srgb, ${accent} 13%, transparent)`, border:`1px solid color-mix(in srgb, ${accent} 25%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:accent }}>{index + 1}</div>
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:6 }}>
              <input aria-label={`Título del paso ${index + 1}`} value={step.title} maxLength={160} onChange={e => patch(index, 'title', e.target.value)} placeholder="Título del paso (p. ej. Apertura)" style={{ ...fieldStyle, fontWeight:600 }} />
              <textarea aria-label={`Instrucción del paso ${index + 1}`} value={step.instruction} maxLength={2000} rows={2} onChange={e => patch(index, 'instruction', e.target.value)} placeholder="Qué debe hacer o decir el agente en este paso" style={{ ...fieldStyle, resize:'vertical' }} />
              <input aria-label={`Objetivo del paso ${index + 1}`} value={step.goal} maxLength={400} onChange={e => patch(index, 'goal', e.target.value)} placeholder="Objetivo: qué debe conseguir antes de pasar al siguiente" style={fieldStyle} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
              <button type="button" aria-label="Subir paso" onClick={() => move(index, -1)} disabled={index === 0} style={iconButton}><RiArrowUpSLine /></button>
              <button type="button" aria-label="Bajar paso" onClick={() => move(index, 1)} disabled={index === steps.length - 1} style={iconButton}><RiArrowDownSLine /></button>
              <button type="button" aria-label="Eliminar paso" onClick={() => remove(index)} style={{ ...iconButton, color:'var(--danger-soft, #f87171)' }}><RiDeleteBinLine /></button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function PlaybookDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [pb, setPb] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  useEffect(() => {
    apiFetch(`/api/playbooks/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setPb({
          ...data,
          type: 'Personalizado', badge: 'Personalizado',
          color: 'var(--accent)', bg: '#6366f120',
          IconEl: RiFlowChart, iconBg: '#6366f120', iconColor: 'var(--accent-soft)', badgeColor: 'var(--accent)',
          tags: (Array.isArray(data.tags) ? data.tags : []).map(label => ({ label, bg: '#6366f120', color: 'var(--accent-soft)' })),
          tasa: '—', reuniones: 0, campanas: typeof data.campaignCount === 'number' ? data.campaignCount : 0,
          successRate: '—', uses: 0, avgDuration: '—',
          description: data.description ?? '',
          desc: data.description ?? '',
          steps: normalizeSteps(data.steps),
          agents: Array.isArray(data.agents) ? data.agents : [],
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const includes = useMemo(() => pb ? [
    { Icon: RiFlowChart, label: 'Pasos del guion', value: pb.steps.length ? `${pb.steps.length} ${pb.steps.length === 1 ? 'paso' : 'pasos'}` : 'Sin pasos' },
    { Icon: RiChatVoiceLine, label: 'Agentes con este guion activo', value: String(pb.agents.length) },
    { Icon: RiSearchLine, label: 'Campañas que lo usan', value: String(pb.campanas) },
    { Icon: RiAlarmLine, label: 'Etiquetas', value: pb.tags.length ? pb.tags.map(t => t.label).join(', ') : '—' },
  ] : [], [pb])

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading playbook' : 'Cargando playbook'} />

  if (!pb) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:16 }}>
      Playbook no encontrado
    </div>
  )

  return (
    <div className="sales-detail-page dark-scroll" style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px clamp(12px,4vw,28px) 0', flexShrink:0 }}>
        <button onClick={() => navigate('/playbooks')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'var(--dim)', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Playbooks
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px clamp(12px,4vw,28px)', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, var(--surface), var(--surface-2))',
          border:'1px solid var(--line)', borderRadius:16, padding:'22px clamp(14px,3vw,24px)',
          display:'flex', gap:18, alignItems:'flex-start', flexWrap:'wrap',
        }}>
          <div style={{
            width:60, height:60, borderRadius:16, flexShrink:0,
            background:pb.iconBg,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 24px color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`,
          }}>
            <pb.IconEl style={{ width:26, height:26, color:pb.iconColor }} />
          </div>

          <div style={{ flex:'1 1 220px', minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'var(--text-strong)', minWidth:0, overflowWrap:'anywhere' }}>{pb.name}</h1>
              <span style={{ fontSize:12, fontWeight:700, background:`color-mix(in srgb, ${pb.badgeColor} 13%, transparent)`, color:pb.badgeColor, border:`1px solid color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`, borderRadius:99, padding:'2px 10px' }}>{pb.badge}</span>
            </div>
            <p style={{ margin:'0 0 12px', fontSize:13, color:'var(--dim)', lineHeight:1.5 }}>{pb.desc}</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {pb.tags.map(t => (
                <span key={t.label} style={{ fontSize:10.5, fontWeight:600, padding:'2px 9px', borderRadius:20, background:t.bg, color:t.color }}>{t.label}</span>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
            <button onClick={() => navigate('/captacion/planificar')} style={{
              display:'flex', alignItems:'center', gap:6,
              background:'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', border:'none',
              borderRadius:9, padding:'9px 16px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
              boxShadow:'0 0 18px #7c3aed40',
            }}>
              <RiAddLine style={{ width:14, height:14 }} /> Usar en campaña
            </button>
            <button onClick={() => {
              const blob = new Blob([`PLAYBOOK: ${pb.name}\n\n${pb.desc}\n\nEtiquetas: ${pb.tags.map(t=>t.label).join(', ')}\n\nPASOS:\n${pb.steps.map((step, i) => `${i + 1}. ${step.title}${step.instruction ? ` — ${step.instruction}` : ''}${step.goal ? ` (objetivo: ${step.goal})` : ''}`).join('\n') || '(sin pasos)'}`], { type:'text/plain' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${pb.name.replace(/ /g,'_')}.txt`; a.click()
            }} style={{
              display:'flex', alignItems:'center', gap:6, background:'var(--surface-2)',
              border:'1px solid var(--line)', borderRadius:9, padding:'9px 12px',
              color:'var(--muted)', fontSize:13, cursor:'pointer',
            }}>
              <RiDownloadLine style={{ width:13, height:13 }} /> Exportar
            </button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ padding:'0 clamp(12px,4vw,24px) 20px', flexShrink:0, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap:12 }}>
        {[
          { label:'Tasa de éxito', value:pb.tasa },
          { label:'Reuniones generadas', value:pb.reuniones.toLocaleString(localeCode(getLocale())) },
          { label:'Campañas que lo usan', value:String(pb.campanas) },
        ].concat(STATS.map(s => ({ label:s.label, value:s.value, delta:s.delta, up:s.up }))).slice(0, 4).map((k, i) => (
          <div key={i} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px 16px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, color: 'var(--dim)', fontWeight:600 }}>{k.label}</p>
            <p style={{ margin:'0 0 4px', fontSize:20, fontWeight:800, color:'var(--text-strong)', letterSpacing:-0.5 }}>{k.value}</p>
            {k.delta && (
              <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                <HiArrowUp style={{ width:10, height:10, color: k.up ? 'var(--success-soft)' : 'var(--danger-soft)', transform: k.up ? 'none' : 'rotate(180deg)' }} />
                <span style={{ fontSize:11, color: k.up ? 'var(--success-soft)' : 'var(--danger-soft)', fontWeight:700 }}>{k.delta.replace(/^[+-]/,'')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="split-pane" style={{ flex:1, display:'flex', gap:14, padding:'0 clamp(12px,4vw,28px) 28px', minHeight:0 }}>

        {/* Main */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div className="tabs-scroll" style={{ display:'flex', gap:0, borderBottom:'1px solid var(--line)' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? 'var(--text-strong)' : 'var(--faint)',
                borderBottom:`2px solid ${tab===t ? pb.badgeColor : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Agentes que lo usan como guion activo</p>
                {pb.agents.length === 0 ? <p style={{ margin:0, fontSize:13, color:'var(--dim)' }}>Ningún agente lo tiene activo. Se asigna desde la ficha del agente (estrategia → guion).</p> : pb.agents.map(agent => (
                  <div key={agent.id} style={{ display:'flex', gap:9, alignItems:'center', marginBottom:9 }}>
                    <div style={{ width:16, height:16, borderRadius:5, background:`color-mix(in srgb, ${pb.badgeColor} 13%, transparent)`, border:`1px solid color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <RiCheckLine style={{ width:10, height:10, color:pb.badgeColor }} />
                    </div>
                    <button type="button" onClick={() => navigate(`/agentes/${agent.id}`)} style={{ background:'none', border:'none', padding:0, margin:0, fontSize:13, color:'var(--accent)', cursor:'pointer', fontFamily:'inherit' }}>{agent.name}</button>
                    <span style={{ fontSize:11.5, color:'var(--dim)' }}>{agent.lifecycleStatus || (agent.isActive ? 'activo' : 'pausado')}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Componentes incluidos</p>
                {includes.map(({ Icon, label, value }, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom: i < includes.length-1 ? '1px solid var(--surface-2)' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:`color-mix(in srgb, ${pb.badgeColor} 8%, transparent)`, border:`1px solid color-mix(in srgb, ${pb.badgeColor} 19%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon style={{ width:13, height:13, color:pb.iconColor }} />
                      </div>
                      <p style={{ margin:0, fontSize:12.5, color:'var(--muted)' }}>{label}</p>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--text-strong)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Pasos' && (
            <PlaybookStepsEditor key={pb.id} playbookId={pb.id} initialSteps={pb.steps} accent={pb.badgeColor} onSaved={steps => setPb(current => ({ ...current, steps: normalizeSteps(steps) }))} />
          )}

          {tab === 'Rendimiento' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
            <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Estadísticas de rendimiento</p>
              {STATS.map((s, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid var(--surface-2)' }}>
                  <p style={{ margin:0, fontSize:13, color:'var(--muted)' }}>{s.label}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)' }}>{s.value}</span>
                    <span style={{ fontSize:11, fontWeight:600, color: s.up ? 'var(--success-soft)' : 'var(--danger-soft)', background: s.up ? '#4ade8015' : '#f8717115', border:`1px solid ${s.up ? '#4ade8030' : '#f8717130'}`, borderRadius:5, padding:'2px 7px' }}>{s.delta}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="split-rail" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Resumen rápido</p>
            {[
              { label:'Tipo', value:pb.badge },
              { label:'Tasa de éxito', value:pb.tasa },
              { label:'Reuniones', value:pb.reuniones.toLocaleString(localeCode(getLocale())) },
              { label:'Campañas activas', value:String(pb.campanas) },
            ].map(m => (
              <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--surface-2)' }}>
                <span style={{ fontSize:11.5, color: 'var(--dim)' }}>{m.label}</span>
                <span style={{ fontSize:11.5, fontWeight:600, color:'var(--text)' }}>{m.value}</span>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Integraciones</p>
            {['HubSpot', 'Salesforce', 'Zapier'].map((integ, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:'var(--line)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'var(--muted)', flexShrink:0 }}>{integ[0]}</div>
                <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>{integ}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
