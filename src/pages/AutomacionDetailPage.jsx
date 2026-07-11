import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiPlayLine, RiPauseLine,
  RiArrowRightLine, RiFlowChart,
} from 'react-icons/ri'
import { mapAutomation, stableIndex } from '../lib/automationMapping'
import '../dashboard.css'

const TABS = ['Resumen', 'Historial', 'Configuración']

export default function AutomacionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [auto, setAuto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  useEffect(() => {
    apiFetch(`/api/automations/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      setAuto(data ? mapAutomation(data, stableIndex(data.id)) : null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Cargando…
    </div>
  )

  if (!auto) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Automatización no encontrada
    </div>
  )

  const isActive = auto.status === 'activa'
  const toggle = () => {
    apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' }).catch(() => {})
    setAuto(prev => ({ ...prev, status: isActive ? 'pausada' : 'activa' }))
  }

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/automatizaciones')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Automatizaciones
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:18, alignItems:'flex-start',
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:`linear-gradient(145deg, ${auto.iconBg}55, ${auto.iconBg}25)`,
            border:`1px solid ${auto.iconBg}50`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 20px ${auto.iconBg}35`,
          }}>
            <auto.Icon style={{ width:22, height:22, color:auto.iconColor }} />
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{auto.name}</h1>
              <span style={{ fontSize:12, fontWeight:600, borderRadius:99, padding:'2px 10px', background: isActive ? '#10b98120' : '#6b728015', color: isActive ? '#10b981' : '#9ca3af', border: `1px solid ${isActive ? '#10b98140' : '#2a3245'}` }}>
                {isActive ? 'Activa' : 'Pausada'}
              </span>
            </div>
            {auto.desc && <p style={{ margin:'0 0 10px', fontSize:13, color:'#6b7280', lineHeight:1.5 }}>{auto.desc}</p>}
            {auto.tags.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {auto.tags.map(t => (
                  <span key={t} style={{ fontSize:11, color:'#6b7280', background:'#1e2433', border:'1px solid #2a3245', borderRadius:5, padding:'2px 8px', fontWeight:500 }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={toggle} style={{
              display:'flex', alignItems:'center', gap:6,
              background: isActive ? '#ef444410' : 'linear-gradient(90deg,#4f46e5,#7c3aed)',
              border: isActive ? '1px solid #ef444430' : 'none',
              borderRadius:9, padding:'8px 14px',
              color: isActive ? '#ef4444' : '#fff', fontSize:13, fontWeight:600, cursor:'pointer',
            }}>
              {isActive ? <RiPauseLine style={{ width:14, height:14 }} /> : <RiPlayLine style={{ width:14, height:14 }} />}
              {isActive ? 'Pausar' : 'Reanudar'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI row — solo lo que existe de verdad en el modelo (runsCount, lastRunAt) */}
      <div style={{ padding:'0 24px 20px', flexShrink:0, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
        {[
          { label:'Ejecuciones totales', value:auto.execs },
          { label:'Última ejecución', value:auto.last },
          { label:'Estado', value: isActive ? 'Activa' : 'Pausada' },
          { label:'Acciones configuradas', value: String(auto.actions.length) },
        ].map((k, i) => (
          <div key={i} style={{ flex:1, background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px 16px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, color:'#4b5563', fontWeight:600 }}>{k.label}</p>
            <p style={{ margin:0, fontSize:20, fontWeight:800, color:'#f1f5f9', letterSpacing:-0.5 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? '#8b5cf6' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Qué hace esta automatización</p>
              {auto.actions.length === 0 ? (
                <p style={{ color:'#4b5563', fontSize:13 }}>Sin acciones configuradas.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {auto.actions.map((a, i) => (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px', background:'#111827', border:'1px solid #1a2235', borderRadius:9 }}>
                      <span style={{ width:22, height:22, borderRadius:6, background:'#8b5cf620', border:'1px solid #8b5cf640', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'#a78bfa', flexShrink:0 }}>{i + 1}</span>
                      <div>
                        <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{a.type ?? 'acción'}</p>
                        {a.params && <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{JSON.stringify(a.params)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Historial' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 8px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Historial de ejecuciones</p>
              <p style={{ margin:0, fontSize:13, color:'#4b5563', lineHeight:1.6 }}>
                Todavía no se registra un historial detallado por ejecución — solo el conteo total.
                Esta automatización se ejecutó <strong style={{ color:'#94a3b8' }}>{auto.execs}</strong> veces
                {auto.lastRunAt && <> · última vez <strong style={{ color:'#94a3b8' }}>{auto.last}</strong></>}.
              </p>
            </div>
          )}

          {tab === 'Configuración' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Disparador</p>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0' }}>
                  <span style={{ fontSize:12, color:'#4b5563' }}>Evento</span>
                  <span style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8' }}>{auto.trigger}</span>
                </div>
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Acciones ({auto.actions.length})</p>
                {auto.actions.length === 0 ? (
                  <p style={{ color:'#4b5563', fontSize:13 }}>Sin acciones configuradas.</p>
                ) : (
                  auto.actions.map((a, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom: i < auto.actions.length - 1 ? '1px solid #111827' : 'none' }}>
                      <span style={{ fontSize:12, color:'#4b5563' }}>Acción {i + 1}</span>
                      <span style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8' }}>{a.type}{a.params ? ` — ${JSON.stringify(a.params)}` : ''}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Trigger */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Disparador</p>
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'10px 12px' }}>
              <auto.TriggerIcon style={{ width:18, height:18, color:auto.iconColor, flexShrink:0 }} />
              <p style={{ margin:0, fontSize:11.5, color:'#94a3b8', lineHeight:1.4 }}>{auto.trigger}</p>
            </div>
          </div>

          {/* Flow — pasos reales de la automatización */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <RiFlowChart style={{ width:13, height:13, color:'#6b7280' }} />
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Flujo</p>
            </div>
            {auto.actions.length === 0 ? (
              <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>Sin acciones configuradas.</p>
            ) : (
              auto.actions.map((a, i) => (
                <div key={i}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:auto.iconColor, flexShrink:0, boxShadow:`0 0 5px ${auto.iconColor}80` }} />
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{a.type ?? 'acción'}</p>
                    </div>
                    {i < auto.actions.length - 1 && <RiArrowRightLine style={{ width:12, height:12, color:'#374151', flexShrink:0 }} />}
                  </div>
                  {i < auto.actions.length - 1 && <div style={{ width:1, height:14, background:'#1e2433', margin:'4px 0 4px 3.5px' }} />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
