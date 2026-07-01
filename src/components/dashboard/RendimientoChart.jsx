import React, { useState, useRef } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { HiChevronDown } from 'react-icons/hi'
import useClickOutside from '../../hooks/useClickOutside'
import { card, tooltipStyle, dot, activeDot, VIEW_OPTIONS_DEFAULT, REND_SERIES, getChartDomain } from './dashboardData'

export default function RendimientoChart({ dayData }) {
  const [view, setView] = useState('day')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  const VIEW_OPTIONS = {
    ...VIEW_OPTIONS_DEFAULT,
    day: { label:'Por día', data: dayData?.length ? dayData : VIEW_OPTIONS_DEFAULT.day.data },
  }
  const current = VIEW_OPTIONS[view]
  const { leftMax, rightMax } = getChartDomain(current.data)

  const dropdownStyle = {
    position:'absolute', top:'calc(100% + 6px)', right:0,
    background:'#0d1117', border:'1px solid #1e2433', borderRadius:10,
    padding:6, minWidth:140, boxShadow:'0 10px 30px rgba(0,0,0,0.5)',
    zIndex:20, display:'flex', flexDirection:'column', gap:2,
  }
  const itemStyle = {
    background:'transparent', border:'none', borderRadius:6,
    padding:'7px 10px', color:'#cbd5e1', fontSize:12,
    textAlign:'left', cursor:'pointer',
  }
  const activeItemStyle = { ...itemStyle, background:'#1e2433', color:'#ffffff', fontWeight:600 }

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:12, height:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>Rendimiento general</h3>
        <div ref={ref} style={{ position:'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:5, background:'#131b2b', border:'1px solid #1e2433', borderRadius:8, padding:'5px 10px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}
          >
            {current.label} <HiChevronDown style={{ width:12, height:12, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
          </button>
          {open && (
            <div style={dropdownStyle}>
              {Object.entries(VIEW_OPTIONS).map(([key, o]) => (
                <button
                  key={key}
                  style={view === key ? activeItemStyle : itemStyle}
                  onClick={() => { setView(key); setOpen(false) }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
        {[['#60a5fa','Llamadas'],['#34d399','Contactados'],['#a78bfa','Reuniones'],['#fb923c','Conversión (%)']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }} />
            <span style={{ fontSize:11.5, color:'#cbd5e1' }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ flex:1, minHeight:180 }}>
        {!current.data?.length ? (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ margin:0, fontSize:12, color:'#4b5563' }}>Sin datos de rendimiento</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={current.data} margin={{ top:5, right:38, left:0, bottom:0 }}>
              <defs>
                {REND_SERIES.map(({ grad, color }) => (
                  <linearGradient key={grad} id={grad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#1a2235" vertical={false} />
              <XAxis dataKey="date" tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="L" domain={[0, leftMax]}
                tickFormatter={v => v>=1000 ? `${v/1000}K` : `${v}`}
                tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={38} />
              <YAxis yAxisId="R" orientation="right" domain={[0, rightMax]}
                tickFormatter={v => `${v}%`}
                tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip {...tooltipStyle} />

              {REND_SERIES.map(({ key, color, yId }) => (
                <Area key={`glow-${key}`} yAxisId={yId} type="monotone" dataKey={key}
                  stroke={color} strokeWidth={10} strokeOpacity={0.25}
                  fill="none" dot={false} isAnimationActive={false} legendType="none" />
              ))}

              {REND_SERIES.map(({ key, name, color, yId }) => (
                <Area key={key} yAxisId={yId} type="monotone" dataKey={key} name={name}
                  stroke={color} fill="none" strokeWidth={2.5}
                  dot={dot(color)} activeDot={activeDot(color)} />
              ))}

              <Line yAxisId="R" type="monotone" dataKey="conversion" stroke="#fb923c"
                strokeWidth={10} strokeOpacity={0.25} dot={false} isAnimationActive={false} legendType="none" />
              <Line yAxisId="R" type="monotone" dataKey="conversion" name="Conversión %"
                stroke="#fb923c" strokeWidth={2.5} dot={dot('#fb923c')} activeDot={activeDot('#fb923c')} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
