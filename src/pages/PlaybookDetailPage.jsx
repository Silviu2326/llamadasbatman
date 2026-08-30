import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiAddLine, RiDownloadLine,
  RiFlowChart, RiAlarmLine, RiSearchLine, RiChatVoiceLine,
  RiCheckLine,
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

const INCLUDES = [
  { Icon:RiFlowChart, label:'Flujo conversacional', value:'15 pasos' },
  { Icon:RiAlarmLine, label:'Manejo de objeciones', value:'8 objeciones' },
  { Icon:RiSearchLine, label:'Preguntas de calificación', value:'12 preguntas' },
  { Icon:RiChatVoiceLine, label:'Mensajes y momentos clave', value:'9 mensajes' },
]

const IDEAL = ['Leads inbound interesados', 'Empresas SaaS / Tecnología', 'Ciclos de venta de 7-30 días']

const TABS = ['Resumen', 'Incluye', 'Rendimiento']

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
          tags: [], tasa: '—', reuniones: 0, campanas: 0,
          successRate: '—', uses: 0, avgDuration: '—',
          description: data.description ?? '',
          desc: data.description ?? '',
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

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
              const blob = new Blob([`PLAYBOOK: ${pb.name}\n\n${pb.desc}\n\nEtiquetas: ${pb.tags.map(t=>t.label).join(', ')}\nTasa de éxito: ${pb.tasa}\nReuniones generadas: ${pb.reuniones}\nCampañas activas: ${pb.campanas}`], { type:'text/plain' })
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
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Ideal para</p>
                {IDEAL.map((item, i) => (
                  <div key={i} style={{ display:'flex', gap:9, alignItems:'center', marginBottom:9 }}>
                    <div style={{ width:16, height:16, borderRadius:5, background:`color-mix(in srgb, ${pb.badgeColor} 13%, transparent)`, border:`1px solid color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <RiCheckLine style={{ width:10, height:10, color:pb.badgeColor }} />
                    </div>
                    <p style={{ margin:0, fontSize:13, color:'var(--muted)' }}>{item}</p>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Componentes incluidos</p>
                {INCLUDES.map(({ Icon, label, value }, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom: i < INCLUDES.length-1 ? '1px solid var(--surface-2)' : 'none' }}>
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

          {tab === 'Incluye' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:700, color:'var(--text)' }}>Estructura completa del playbook</p>
              {['Apertura y presentación', 'Detección de necesidades (5 preguntas)', 'Manejo de 8 objeciones comunes', 'Propuesta de valor personalizada', 'Cierre y agenda de siguiente paso'].map((item, i) => (
                <div key={i} style={{ display:'flex', gap:10, marginBottom:12 }}>
                  <div style={{ width:22, height:22, borderRadius:7, background:`color-mix(in srgb, ${pb.badgeColor} 13%, transparent)`, border:`1px solid color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:700, color:pb.badgeColor }}>{i+1}</div>
                  <p style={{ margin:0, fontSize:13, color:'var(--muted)', paddingTop:3 }}>{item}</p>
                </div>
              ))}
            </div>
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
