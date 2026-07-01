import React from 'react'
import { card, FUNNEL, FUNNEL_COLORS } from './dashboardData'

export default function EmbudoChart({ funnel: funnelProp }) {
  const FUNNEL_DATA = funnelProp?.length
    ? funnelProp.map((f, i) => ({ ...f, value: String(f.value), color: FUNNEL_COLORS[i] ?? '#94a3b8' }))
    : FUNNEL

  if (!FUNNEL_DATA.length) {
    return (
      <div style={{ ...card, display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
          Embudo de conversiones
        </h3>
        <p style={{ margin:0, fontSize:12, color:'#4b5563' }}>Sin datos de embudo</p>
      </div>
    )
  }

  const W = 200, stepH = 54, gap = 4, n = FUNNEL_DATA.length
  const maxW = 196, minW = 80
  const widths = FUNNEL_DATA.map((_, i) => maxW - (maxW - minW) * (i / (n - 1)))
  const svgH = n * (stepH + gap)

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        Embudo de conversiones
      </h3>
      <div style={{ flex:1, minHeight:0 }}>
        <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" style={{ display:'block', overflow:'visible' }}>
          <defs>
            {FUNNEL_DATA.map((_, i) => (
              <filter key={i} id={`fg${i}`} x="-25%" y="-40%" width="150%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
          </defs>

          {FUNNEL_DATA.map((step, i) => {
            const y0 = i * (stepH + gap), y1 = y0 + stepH
            const tw = widths[i], bw = widths[i + 1] ?? widths[i] * 0.84
            const tm = (W - tw) / 2, bm = (W - bw) / 2
            const pts = `${tm},${y0} ${tm+tw},${y0} ${bm+bw},${y1} ${bm},${y1}`
            const cy = y0 + stepH / 2
            return (
              <g key={i}>
                <polygon points={pts} fill="none"
                  stroke={step.color} strokeWidth={4} opacity={0.7}
                  filter={`url(#fg${i})`} />
                <polygon points={pts}
                  fill={step.color + '55'}
                  stroke={step.color} strokeWidth={1.5} />
                <text x={W / 2} y={cy - 5} textAnchor="middle"
                  fill="white" fontSize="11" fontWeight="600"
                  style={{ filter:'drop-shadow(0 0 4px rgba(255,255,255,0.4))' }}>
                  {step.label}
                </text>
                <text x={W / 2} y={cy + 13} textAnchor="middle"
                  fill={step.color} fontSize="13" fontWeight="700"
                  style={{ filter:`drop-shadow(0 0 6px ${step.color}90)` }}>
                  {step.value}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
