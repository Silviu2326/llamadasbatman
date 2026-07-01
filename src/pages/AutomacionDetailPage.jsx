import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiPlayLine, RiPauseLine, RiEditLine,
  RiArrowRightLine, RiFlowChart,
} from 'react-icons/ri'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'
import { ResponsiveContainer, AreaChart, Area, XAxis } from 'recharts'
import '../dashboard.css'

const CHART_DATA = [
  { label:'Lun', v:1200 }, { label:'Mar', v:1450 }, { label:'Mié', v:1320 },
  { label:'Jue', v:1680 }, { label:'Vie', v:1823 }, { label:'Sáb', v:980 }, { label:'Dom', v:740 },
]

const STEPS = [
  { color:'#6366f1', label:'Disparador', desc:'Evento detectado' },
  { color:'#8b5cf6', label:'Filtrado',   desc:'Verifica condiciones' },
  { color:'#0891b2', label:'Acción',     desc:'Ejecuta tarea' },
  { color:'#10b981', label:'Log',        desc:'Registra resultado' },
]

const TABS = ['Resumen', 'Historial', 'Configuración']

export default function AutomacionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [auto, setAuto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')
  const [savedAuto, setSavedAuto] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [cfgVals, setCfgVals] = useState({})

  useEffect(() => {
    apiFetch(`/api/automations/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setAuto({
          ...data,
          status: data.isActive ? 'activa' : 'pausada',
          trigger: typeof data.trigger === 'object' ? (data.trigger.type ?? JSON.stringify(data.trigger)) : data.trigger,
          runs: data.runsCount ?? 0,
          lastRun: data.lastRunAt ? new Date(data.lastRunAt).toLocaleDateString('es-ES') : '—',
          tags: [],
        })
      }
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
            <p style={{ margin:'0 0 10px', fontSize:13, color:'#6b7280', lineHeight:1.5 }}>{auto.desc}</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {auto.tags.map(t => (
                <span key={t} style={{ fontSize:11, color:'#6b7280', background:'#1e2433', border:'1px solid #2a3245', borderRadius:5, padding:'2px 8px', fontWeight:500 }}>{t}</span>
              ))}
            </div>
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
            <button onClick={() => setTab('Configuración')} style={{
              display:'flex', alignItems:'center', gap:6, background:'#111827',
              border:'1px solid #1e2433', borderRadius:9, padding:'8px 12px',
              color:'#94a3b8', fontSize:13, cursor:'pointer',
            }}>
              <RiEditLine style={{ width:13, height:13 }} /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ padding:'0 28px 20px', flexShrink:0, display:'flex', gap:12 }}>
        {[
          { label:'Ejecuciones', value:auto.execs, delta:auto.execDelta, up:auto.execUp },
          { label:'Conversiones', value:auto.convs, delta:`${auto.convRate}`, up:auto.execUp, note:'tasa' },
          { label:'Ingresos', value:auto.rev, delta:auto.revDelta, up:auto.revUp },
          { label:'Última ejecución', value:auto.last, delta:null },
        ].map((k, i) => {
          const Up = HiArrowUp, Down = HiArrowDown
          const Arr = k.up ? Up : Down
          const c = k.up ? '#4ade80' : '#f87171'
          return (
            <div key={i} style={{ flex:1, background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px 16px' }}>
              <p style={{ margin:'0 0 6px', fontSize:11, color:'#4b5563', fontWeight:600 }}>{k.label}</p>
              <p style={{ margin:'0 0 4px', fontSize:20, fontWeight:800, color:'#f1f5f9', letterSpacing:-0.5 }}>{k.value}</p>
              {k.delta && (
                <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                  <Arr style={{ width:10, height:10, color:c }} />
                  <span style={{ fontSize:11, color:c, fontWeight:700 }}>{k.delta.replace(/^[+-]/,'')}</span>
                  {k.note && <span style={{ fontSize:10, color:'#4b5563' }}>{k.note}</span>}
                </div>
              )}
            </div>
          )
        })}
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
            <>
              {/* Chart */}
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Ejecuciones esta semana</p>
                <div style={{ height:140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={CHART_DATA} margin={{ top:4, right:4, left:-24, bottom:0 }}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={auto.iconBg} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={auto.iconBg} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill:'#374151', fontSize:10 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="v" stroke={auto.iconBg} strokeWidth={2} fill="url(#ag)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent executions */}
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Ejecuciones recientes</p>
                {[
                  { time:'Hoy, 09:32', result:'Éxito', color:'#10b981', lead:'María Rodríguez' },
                  { time:'Hoy, 08:18', result:'Éxito', color:'#10b981', lead:'José López' },
                  { time:'Ayer, 18:45', result:'Error', color:'#ef4444', lead:'Carlos Ruiz' },
                  { time:'Ayer, 16:22', result:'Éxito', color:'#10b981', lead:'Laura Pérez' },
                  { time:'Ayer, 14:11', result:'Omitido', color:'#6b7280', lead:'Ana Martínez' },
                ].map((e, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #111827' }}>
                    <div>
                      <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{e.lead}</p>
                      <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{e.time}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:e.color, background:`${e.color}15`, border:`1px solid ${e.color}30`, borderRadius:5, padding:'2px 8px' }}>{e.result}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'Historial' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Ejecuciones · últimos 30 días</p>
                <div style={{ display:'flex', gap:6 }}>
                  {['Todo', 'Éxito', 'Error'].map((f, i) => (
                    <button key={f} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid ' + (i === 0 ? auto.iconColor : '#1e2433'), background: i === 0 ? auto.iconColor + '20' : 'transparent', color: i === 0 ? auto.iconColor : '#6b7280', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>{f}</button>
                  ))}
                </div>
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 90px 80px', padding:'9px 14px', borderBottom:'1px solid #1e2433' }}>
                  {['Lead / empresa', 'Fecha', 'Duración', 'Resultado'].map(h => (
                    <span key={h} style={{ fontSize:10.5, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:0.4 }}>{h}</span>
                  ))}
                </div>
                {[
                  { lead:'María Rodríguez', company:'TechSolutions', date:'Hoy 09:32', dur:'4:32', result:'Éxito', color:'#10b981' },
                  { lead:'José López', company:'DataPro', date:'Hoy 08:18', dur:'3:10', result:'Éxito', color:'#10b981' },
                  { lead:'Carlos Ruiz', company:'Innovate SA', date:'Ayer 18:45', dur:'0:48', result:'Error', color:'#ef4444' },
                  { lead:'Laura Pérez', company:'MedCare', date:'Ayer 16:22', dur:'5:07', result:'Éxito', color:'#10b981' },
                  { lead:'Ana Martínez', company:'NextGen', date:'Ayer 14:11', dur:'—', result:'Omitido', color:'#6b7280' },
                  { lead:'Pablo García', company:'Retail Group', date:'23 may 11:55', dur:'6:21', result:'Éxito', color:'#10b981' },
                  { lead:'Isabel Torres', company:'BuildIt Corp', date:'23 may 09:40', dur:'2:55', result:'Éxito', color:'#10b981' },
                  { lead:'Ramón Blanco', company:'SaaS Tools', date:'22 may 17:30', dur:'1:12', result:'Error', color:'#ef4444' },
                ].map((e, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 90px 80px', padding:'10px 14px', borderBottom:'1px solid #111827', alignItems:'center' }}>
                    <div>
                      <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{e.lead}</p>
                      <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{e.company}</p>
                    </div>
                    <span style={{ fontSize:11.5, color:'#4b5563' }}>{e.date}</span>
                    <span style={{ fontSize:11.5, color:'#6b7280' }}>{e.dur}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:e.color, background:`${e.color}15`, border:`1px solid ${e.color}30`, borderRadius:5, padding:'2px 8px', whiteSpace:'nowrap' }}>{e.result}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Configuración' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { section:'Disparador', items:[
                  { label:'Tipo', value:auto.trigger },
                  { label:'Condición', value:'Nuevo lead en CRM con tag "outbound"' },
                  { label:'Evaluación', value:'Inmediata (en tiempo real)' },
                ]},
                { section:'Acciones', items:[
                  { label:'Acción 1', value:'Asignar agente AI (prioridad alta)' },
                  { label:'Acción 2', value:'Iniciar llamada saliente en 5 min' },
                  { label:'Acción 3', value:'Registrar resultado en CRM' },
                  { label:'Acción 4', value:'Enviar email de seguimiento si no contesta' },
                ]},
                { section:'Límites', items:[
                  { label:'Máx. ejecuciones/día', value:'500' },
                  { label:'Cooldown por lead', value:'24 horas' },
                  { label:'Reintentos', value:'2 (cada 30 min)' },
                ]},
              ].map(({ section, items }) => (
                <div key={section} style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                  <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{section}</p>
                  {items.map(({ label, value }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #111827' }}>
                      <span style={{ fontSize:12, color:'#4b5563' }}>{label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {editKey === label
                          ? <input autoFocus defaultValue={cfgVals[label] ?? value}
                              onBlur={e => { setCfgVals(v => ({ ...v, [label]: e.target.value })); setEditKey(null) }}
                              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                              style={{ background:'transparent', border:'none', borderBottom:'1px solid ' + auto.iconColor, color:'#94a3b8', fontSize:12.5, fontWeight:600, outline:'none', width:160, textAlign:'right', fontFamily:'inherit' }}
                            />
                          : <span style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8' }}>{cfgVals[label] ?? value}</span>
                        }
                        <RiEditLine style={{ width:12, height:12, color:'#374151', cursor:'pointer', flexShrink:0 }} onClick={() => setEditKey(label)} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <button onClick={() => { setSavedAuto(true); setTimeout(() => setSavedAuto(false), 2000) }} style={{ alignSelf:'flex-start', background: savedAuto ? '#10b981' : `linear-gradient(90deg, ${auto.iconBg}, ${auto.iconColor})`, border:'none', borderRadius:9, padding:'10px 20px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', transition:'background .3s' }}>
                {savedAuto ? '✓ Guardado' : 'Guardar cambios'}
              </button>
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
              <p style={{ margin:0, fontSize:11.5, color:'#94a3b8', lineHeight:1.4, whiteSpace:'pre-line' }}>{auto.trigger}</p>
            </div>
          </div>

          {/* Flow */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <RiFlowChart style={{ width:13, height:13, color:'#6b7280' }} />
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Flujo</p>
            </div>
            {STEPS.map((s, i) => (
              <div key={i}>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0, boxShadow:`0 0 5px ${s.color}80` }} />
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{s.label}</p>
                    <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>{s.desc}</p>
                  </div>
                  {i < STEPS.length - 1 && <RiArrowRightLine style={{ width:12, height:12, color:'#374151', flexShrink:0 }} />}
                </div>
                {i < STEPS.length - 1 && <div style={{ width:1, height:14, background:'#1e2433', marginLeft:3.5, margin:'4px 0 4px 3.5px' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
