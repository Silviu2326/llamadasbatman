import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiMapPinLine, RiMoneyDollarBoxLine,
  RiCalendarLine, RiEditLine, RiAddLine, RiPhoneLine,
  RiCheckLine,
} from 'react-icons/ri'
import '../dashboard.css'

const ALL_STAGES = [
  { id:'lead',        label:'Lead' },
  { id:'contactado',  label:'Contactado' },
  { id:'interesado',  label:'Interesado' },
  { id:'reunion',     label:'Reunión' },
  { id:'propuesta',   label:'Propuesta' },
  { id:'negociacion', label:'Negociación' },
  { id:'ganado',      label:'Ganado' },
]

const STAGE_COLOR = { lead:'#6366f1', contactado:'#0891b2', interesado:'#f59e0b', reunion:'#059669', propuesta:'#8b5cf6', negociacion:'#ea580c', ganado:'#10b981' }

const TABS = ['Resumen', 'Actividad', 'Notas']

function Avatar({ text, bg, size = 48 }) {
  const letters = text.split(' ').map(w => w[0]).slice(0,2).join('')
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.28), flexShrink:0,
      background:`linear-gradient(135deg, ${bg}, ${bg}bb)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.3, fontWeight:700, color:'#fff', boxShadow:`0 0 18px ${bg}55`,
    }}>{letters}</div>
  )
}

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [opp, setOpp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  useEffect(() => {
    apiFetch(`/api/pipeline/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        const stageMap = { lead: 'lead', qualified: 'interesado', proposal: 'propuesta', negotiation: 'negociacion', closed_won: 'ganado', closed_lost: 'lead' }
        setOpp({
          ...data,
          company: data.lead?.name ?? data.name,
          city: '—',
          stage: stageMap[data.stage] ?? 'lead',
          value: data.value ? `€${Number(data.value).toLocaleString('es-ES')}` : '—',
          score: data.probability ?? 0,
          bg: '#6366f1',
          activities: [],
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

  if (!opp) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Oportunidad no encontrada
    </div>
  )

  const stageIdx = ALL_STAGES.findIndex(s => s.id === opp.stage)
  const stageColor = STAGE_COLOR[opp.stage] || '#6366f1'

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/pipeline')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Pipeline
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:18, alignItems:'flex-start',
        }}>
          <Avatar text={opp.company} bg={opp.bg} size={52} />

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{opp.company}</h1>
              <span style={{ fontSize:12, fontWeight:700, background:`${stageColor}20`, color:stageColor, border:`1px solid ${stageColor}40`, borderRadius:99, padding:'2px 10px' }}>{opp.badge}</span>
            </div>
            <div style={{ display:'flex', gap:16, marginBottom:12 }}>
              <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                <RiMapPinLine style={{ width:12, height:12 }} /> {opp.city}
              </span>
              <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                <RiCalendarLine style={{ width:12, height:12 }} /> {opp.date}
              </span>
              <span style={{ fontSize:13, fontWeight:800, color:'#f1f5f9', display:'flex', alignItems:'center', gap:5 }}>
                <RiMoneyDollarBoxLine style={{ width:13, height:13, color:stageColor }} /> {opp.value}
              </span>
              {opp.score !== null && (
                <span style={{ fontSize:12, color:opp.score >= 70 ? '#10b981' : '#f59e0b', fontWeight:600 }}>
                  Lead Score: {opp.score}/100
                </span>
              )}
            </div>

            {/* Stage progress */}
            <div style={{ display:'flex', gap:0, alignItems:'center' }}>
              {ALL_STAGES.map((s, i) => {
                const done = i <= stageIdx
                const active = i === stageIdx
                const c = STAGE_COLOR[s.id]
                return (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', flex:1, minWidth:0 }}>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{
                        width:20, height:20, borderRadius:'50%', flexShrink:0,
                        background: done ? c : '#1e2433',
                        border:`2px solid ${done ? c : '#2a3245'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow: active ? `0 0 10px ${c}80` : 'none',
                      }}>
                        {done && <RiCheckLine style={{ width:10, height:10, color:'#fff' }} />}
                      </div>
                      <span style={{ fontSize:9, color: done ? c : '#374151', fontWeight: active ? 700 : 400, whiteSpace:'nowrap' }}>{s.label}</span>
                    </div>
                    {i < ALL_STAGES.length - 1 && (
                      <div style={{ height:2, flex:1, background: i < stageIdx ? stageColor : '#1e2433', marginBottom:14 }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={() => navigate('/llamadas')} style={{
              display:'flex', alignItems:'center', gap:6, background:'linear-gradient(90deg,#4f46e5,#7c3aed)', border:'none',
              borderRadius:9, padding:'8px 14px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            }}>
              <RiPhoneLine style={{ width:13, height:13 }} /> Llamar
            </button>
            <button onClick={() => setTab('Resumen')} style={{
              display:'flex', alignItems:'center', gap:6, background:'#111827', border:'1px solid #1e2433',
              borderRadius:9, padding:'8px 12px', color:'#94a3b8', fontSize:13, cursor:'pointer',
            }}>
              <RiEditLine style={{ width:13, height:13 }} /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Main */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? stageColor : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Información de la oportunidad</p>
                {[
                  { label:'Empresa', value:opp.company },
                  { label:'Ciudad', value:opp.city },
                  { label:'Valor estimado', value:opp.value },
                  { label:'Etapa', value:opp.badge },
                  { label:'Última actividad', value:opp.date },
                  { label:'Lead Score', value: opp.score !== null ? `${opp.score}/100` : '—' },
                ].map(m => (
                  <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #111827' }}>
                    <span style={{ fontSize:12.5, color:'#4b5563' }}>{m.label}</span>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{m.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Próximas acciones recomendadas</p>
                {['Enviar propuesta actualizada', 'Agendar reunión de seguimiento', 'Consultar decision-maker'].map((a, i) => (
                  <div key={i} style={{ display:'flex', gap:9, marginBottom:9 }}>
                    <div style={{ width:16, height:16, borderRadius:5, background:`${stageColor}15`, border:`1px solid ${stageColor}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                      <RiCheckLine style={{ width:10, height:10, color:stageColor }} />
                    </div>
                    <p style={{ margin:0, fontSize:12.5, color:'#94a3b8' }}>{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Actividad' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Historial de actividad</p>
              {[
                { type:'Llamada', desc:'Llamada de presentación realizada', date:opp.date, color:'#6366f1' },
                { type:'Email', desc:'Email de seguimiento enviado', date:'Hace 2 días', color:'#0891b2' },
                { type:'Lead', desc:'Lead creado en el sistema', date:'Hace 5 días', color:'#10b981' },
              ].map((a, i) => (
                <div key={i} style={{ display:'flex', gap:12, marginBottom:14 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:a.color, boxShadow:`0 0 5px ${a.color}80`, flexShrink:0 }} />
                    {i < 2 && <div style={{ width:1, height:30, background:'#1e2433', margin:'4px 0' }} />}
                  </div>
                  <div style={{ flex:1, paddingTop:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:a.color }}>{a.type}</span>
                      <span style={{ fontSize:11, color:'#374151' }}>{a.date}</span>
                    </div>
                    <p style={{ margin:0, fontSize:12.5, color:'#94a3b8' }}>{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Notas' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <textarea placeholder="Escribe tus notas aquí..." style={{
                width:'100%', minHeight:180, background:'transparent', border:'none',
                color:'#94a3b8', fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6,
                fontFamily:'inherit',
              }} />
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Acciones rápidas</p>
            {[
              { Icon:RiPhoneLine, label:'Nueva llamada', color:'#6366f1', action:() => navigate('/llamadas') },
              { Icon:RiCalendarLine, label:'Agendar reunión', color:'#8b5cf6', action:() => navigate('/reuniones') },
              { Icon:RiAddLine, label:'Añadir nota', color:'#10b981', action:() => setTab('Notas') },
              { Icon:RiEditLine, label:'Editar oportunidad', color:'#0891b2', action:() => setTab('Resumen') },
            ].map(({ Icon, label, color, action }) => (
              <button key={label} onClick={action} style={{
                display:'flex', alignItems:'center', gap:9, width:'100%', background:'transparent',
                border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', cursor:'pointer',
                color:'#94a3b8', fontSize:12.5, marginBottom:6, transition:'all .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Icon style={{ width:14, height:14, color, flexShrink:0 }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
