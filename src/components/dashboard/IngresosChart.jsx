import React from 'react'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { card, tooltipStyle, BAR_DATA } from './dashboardData'

export default function IngresosChart({ pipelineByDay, pipelinePct }) {
  const barData = pipelineByDay?.length ? pipelineByDay : BAR_DATA
  const weekTotal = barData.reduce((s, d) => s + d.value, 0)
  const maxVal = Math.max(...barData.map(d => d.value), 1)
  const yMax = Math.ceil(maxVal * 1.25 / 1000) * 1000 || 10000
  const yTicks = [0, Math.round(yMax / 3 / 1000) * 1000, Math.round(yMax * 2 / 3 / 1000) * 1000, yMax]
  const isReal = !!pipelineByDay?.length

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:12, height:'100%' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Pipeline esta semana
      </h3>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:28, fontWeight:800, color:'#ffffff', letterSpacing:-1, textShadow:'0 0 20px rgba(255,255,255,0.25)' }}>
          €{Math.round(weekTotal).toLocaleString('es-ES')}
        </span>
        {isReal && pipelinePct != null && (
          <>
            {pipelinePct >= 0
              ? <HiArrowUp style={{ width:13, height:13, color:'#4ade80' }} />
              : <HiArrowDown style={{ width:13, height:13, color:'#f87171' }} />
            }
            <span style={{ fontSize:12, color: pipelinePct >= 0 ? '#4ade80' : '#f87171', fontWeight:700 }}>{Math.abs(pipelinePct)}%</span>
            <span style={{ fontSize:11, color:'#94a3b8' }}>vs. semana anterior</span>
          </>
        )}
      </div>
      <div style={{ flex:1, minHeight:180 }}>
        {!barData?.length ? (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ margin:0, fontSize:12, color:'#4b5563' }}>Sin datos de pipeline</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top:8, right:0, left:0, bottom:0 }} barCategoryGap="35%">
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#c084fc" stopOpacity={1} />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1a2235" vertical={false} />
              <XAxis dataKey="date" tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, yMax]} ticks={yTicks}
                tickFormatter={v => v === 0 ? '0' : `${(v/1000).toFixed(0)}k`}
                tick={{ fill:'#94a3b8', fontSize:10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip {...tooltipStyle} formatter={v => [`€${v.toLocaleString('es-ES')}`, 'Pipeline']} />
              <Bar dataKey="value" fill="#a855f7" fillOpacity={0.25} radius={[5,5,0,0]} isAnimationActive={false} />
              <Bar dataKey="value" fill="url(#barGrad)" radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
