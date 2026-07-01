import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiPhoneLine, RiCalendarLine, RiArrowRightLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { card } from './dashboardData'

export default function AlertasIA() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    apiFetch('/api/dashboard/activity?limit=4').then(r => r.json()).then(data => {
      setItems(data)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const display = items.map(item => {
    const isCall = item.type === 'call'
    return {
      Icon: isCall ? RiPhoneLine : RiCalendarLine,
      color: isCall ? '#3b82f6' : '#10b981',
      text: isCall
        ? `Llamada con ${item.data.lead?.name ?? 'Lead'} — ${item.data.durationSeconds ? `${Math.round(item.data.durationSeconds / 60)} min` : item.data.status}`
        : `Reunión: ${item.data.title} con ${item.data.lead?.name ?? 'Lead'}`,
    }
  })

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <h3 style={{ margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Actividad reciente
      </h3>
      {!loaded
        ? <p style={{ margin:'8px 0', fontSize:12, color:'#4b5563' }}>Cargando…</p>
        : display.length === 0
          ? <p style={{ margin:'8px 0', fontSize:12, color:'#4b5563' }}>Sin actividad reciente</p>
          : display.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:10,
              background: a.color + '0d',
              border:`1px solid ${a.color}40`,
              borderRadius:10, padding:'10px 11px',
              boxShadow:`0 0 14px ${a.color}15`,
            }}>
              <div style={{
                width:28, height:28, borderRadius:8,
                background: a.color + '25',
                border:`1px solid ${a.color}50`,
                boxShadow:`0 0 10px ${a.color}40`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <a.Icon style={{ width:14, height:14, color:a.color }} />
              </div>
              <p style={{ margin:0, fontSize:11.5, color:'#cbd5e1', lineHeight:1.55, flex:1 }}>{a.text}</p>
            </div>
          ))
      }
      <div style={{ borderTop:'1px solid #1a2235', paddingTop:10, marginTop:'auto' }}>
        <button onClick={() => navigate('/llamadas')} style={{ display:'flex', width:'100%', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, textShadow:'0 0 8px #818cf880' }}>
          <span>Ver toda la actividad</span>
          <RiArrowRightLine style={{ width:15, height:15 }} />
        </button>
      </div>
    </div>
  )
}
