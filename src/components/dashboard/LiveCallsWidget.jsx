import React, { useEffect, useState } from 'react'
import { RiPhoneLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { card } from './dashboardData'
import { useI18n } from '../../i18n'

const fmt = ms => {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function LiveCallsWidget() {
  const { locale } = useI18n()
  const [calls, setCalls] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let alive = true
    const load = () => apiFetch('/api/dashboard/live')
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (alive) setCalls(Array.isArray(data) ? data : []) })
      .catch(() => {})
    load()
    const poll = setInterval(load, 10000)
    return () => { alive = false; clearInterval(poll) }
  }, [])

  // El cronómetro solo corre mientras hay llamadas en pantalla.
  useEffect(() => {
    if (!calls.length) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [calls.length])

  const en = locale === 'en'
  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span className="live-dot" aria-hidden="true" />
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>{en ? 'Live now' : 'En directo'}</h3>
        {calls.length > 0 && (
          <span style={{ fontSize:11.5, color:'var(--dim)' }}>
            {calls.length} {en ? (calls.length === 1 ? 'active call' : 'active calls') : (calls.length === 1 ? 'llamada activa' : 'llamadas activas')}
          </span>
        )}
      </div>
      {calls.length === 0 ? (
        <p style={{ margin:'auto 0', fontSize:12, color:'var(--dim)' }}>
          {en ? 'No calls in progress right now. When an agent is on a call it will appear here live.' : 'Ahora mismo no hay llamadas en curso. Cuando un agente esté al teléfono aparecerá aquí en vivo.'}
        </p>
      ) : (
        <div className="dark-scroll" style={{ display:'flex', gap:10, flexWrap:'wrap', overflowY:'auto' }}>
          {calls.map(c => (
            <div key={c.callSid} style={{ display:'flex', alignItems:'center', gap:10, background:'color-mix(in srgb, var(--success) 6%, transparent)', border:'1px solid color-mix(in srgb, var(--success) 28%, transparent)', borderRadius:10, padding:'9px 12px', minWidth:210 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'color-mix(in srgb, var(--success) 15%, transparent)', border:'1px solid color-mix(in srgb, var(--success) 31%, transparent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <RiPhoneLine aria-hidden="true" style={{ width:14, height:14, color:'var(--success)' }} />
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'var(--text-strong)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.leadName}</p>
                <p style={{ margin:0, fontSize:11, color:'var(--dim)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{en ? 'with' : 'con'} {c.agentName}</p>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--success)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{fmt(now - c.startedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
