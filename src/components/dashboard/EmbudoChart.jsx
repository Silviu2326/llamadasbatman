import React, { useMemo } from 'react'
import { card, FUNNEL } from './dashboardData'
import { useThemeColors } from '../../hooks/useTheme'
import { useI18n } from '../../i18n'

// Un color por etapa del embudo. Se pinta en `fill`/`stroke` del SVG y además se
// le concatena alfa (`+ '55'`), así que hace falta el hex ya resuelto.
const funnelPalette = c => [c.info, c.cyan, c.success, c.warn, c.pink]

export default function EmbudoChart({ funnel: funnelProp }) {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const palette = useMemo(() => funnelPalette(colors), [colors])
  const FUNNEL_DATA = funnelProp?.length
    ? funnelProp.map((f, i) => ({ ...f, value: String(f.value), color: palette[i] ?? colors.muted }))
    : FUNNEL

  if (!FUNNEL_DATA.length) {
    return (
      <div style={{ ...card, display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>
          {locale === 'en' ? 'Conversion funnel' : 'Embudo de conversiones'}
        </h3>
        <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>{locale === 'en' ? 'No funnel data' : 'Sin datos de embudo'}</p>
      </div>
    )
  }

  const W = 200, stepH = 54, gap = 4, n = FUNNEL_DATA.length
  const maxW = 196, minW = 80
  const widths = FUNNEL_DATA.map((_, i) => maxW - (maxW - minW) * (i / (n - 1)))
  const svgH = n * (stepH + gap)

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>
        {locale === 'en' ? 'Conversion funnel' : 'Embudo de conversiones'}
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
                  fill={colors.text} fontSize="11" fontWeight="600">
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
