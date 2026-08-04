import React, { useState, useRef, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { HiChevronDown } from 'react-icons/hi'
import useClickOutside from '../../hooks/useClickOutside'
import { card, tooltipStyle, VIEW_OPTIONS_DEFAULT, getChartDomain } from './dashboardData'
import { useThemeColors } from '../../hooks/useTheme'
import { useI18n } from '../../i18n'

// Series del gráfico. `stroke`/`stopColor`/`fill` son atributos SVG, así que los
// colores tienen que llegar ya resueltos a hex desde useThemeColors().
const rendSeries = c => [
  { key:'llamadas',    name:'Llamadas',    color:c.info,    yId:'L', grad:'gradL' },
  { key:'contactados', name:'Contactados', color:c.success, yId:'L', grad:'gradC' },
  { key:'reuniones',   name:'Reuniones',   color:c.violet,  yId:'L', grad:'gradR' },
]

export default function RendimientoChart({ dayData }) {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const [view, setView] = useState('day')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  // El punto se recorta contra el lienzo, por eso el borde usa el color de fondo.
  const dot = fill => ({ r:3.5, fill, stroke:colors.bg, strokeWidth:2 })
  const activeDot = fill => ({ r:5.5, fill, stroke:colors.bg, strokeWidth:2 })
  const conversionColor = colors.warn

  const localizedSeries = useMemo(() => rendSeries(colors), [colors]).map((series, index) => ({
    ...series,
    name: locale === 'en' ? ['Calls', 'Contacted', 'Meetings'][index] : series.name,
  }))

  const VIEW_OPTIONS = {
    ...VIEW_OPTIONS_DEFAULT,
    day: { label: locale === 'en' ? 'By day' : 'Por día', data: dayData?.length ? dayData : VIEW_OPTIONS_DEFAULT.day.data },
    week: { ...VIEW_OPTIONS_DEFAULT.week, label: locale === 'en' ? 'By week' : 'Por semana' },
    month: { ...VIEW_OPTIONS_DEFAULT.month, label: locale === 'en' ? 'By month' : 'Por mes' },
  }
  const current = VIEW_OPTIONS[view]
  const { leftMax, rightMax } = getChartDomain(current.data)

  const dropdownStyle = {
    position:'absolute', top:'calc(100% + 6px)', right:0,
    background:'var(--surface)', border:'1px solid var(--line)', borderRadius:10,
    padding:6, minWidth:140, boxShadow:'var(--shadow-2)',
    zIndex:20, display:'flex', flexDirection:'column', gap:2,
  }
  const itemStyle = {
    background:'transparent', border:'none', borderRadius:6,
    padding:'7px 10px', color:'var(--text-2)', fontSize:12,
    textAlign:'left', cursor:'pointer',
  }
  const activeItemStyle = { ...itemStyle, background:'var(--surface-hover)', color:'var(--text-strong)', fontWeight:600 }

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:12, height:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>{locale === 'en' ? 'Overall performance' : 'Rendimiento general'}</h3>
        <div ref={ref} style={{ position:'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:5, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8, padding:'5px 10px', color:'var(--muted)', fontSize:12, cursor:'pointer' }}
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
        {[[colors.info, locale === 'en' ? 'Calls' : 'Llamadas'],[colors.success, locale === 'en' ? 'Contacted' : 'Contactados'],[colors.violet, locale === 'en' ? 'Meetings' : 'Reuniones'],[conversionColor, locale === 'en' ? 'Conversion (%)' : 'Conversión (%)']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }} />
            <span style={{ fontSize:11.5, color:'var(--text-2)' }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ flex:1, minHeight:180 }}>
        {!current.data?.length ? (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>{locale === 'en' ? 'No performance data' : 'Sin datos de rendimiento'}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={current.data} margin={{ top:5, right:38, left:0, bottom:0 }}>
              <defs>
                {localizedSeries.map(({ grad, color }) => (
                  <linearGradient key={grad} id={grad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={colors.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill:colors.dim, fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="L" domain={[0, leftMax]}
                tickFormatter={v => v>=1000 ? `${v/1000}K` : `${v}`}
                tick={{ fill:colors.dim, fontSize:10 }} axisLine={false} tickLine={false} width={38} />
              <YAxis yAxisId="R" orientation="right" domain={[0, rightMax]}
                tickFormatter={v => `${v}%`}
                tick={{ fill:colors.dim, fontSize:10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip {...tooltipStyle}
                contentStyle={{ ...tooltipStyle.contentStyle, background:'var(--surface-2)', border:'1px solid var(--line-2)' }}
                cursor={{ ...tooltipStyle.cursor, stroke:colors.line2 }} />

              {localizedSeries.map(({ key, color, yId }) => (
                <Area key={`glow-${key}`} yAxisId={yId} type="monotone" dataKey={key}
                  stroke={color} strokeWidth={10} strokeOpacity={0.25}
                  fill="none" dot={false} isAnimationActive={false} legendType="none" />
              ))}

              {localizedSeries.map(({ key, name, color, yId }) => (
                <Area key={key} yAxisId={yId} type="monotone" dataKey={key} name={name}
                  stroke={color} fill="none" strokeWidth={2.5}
                  dot={dot(color)} activeDot={activeDot(color)} />
              ))}

              <Line yAxisId="R" type="monotone" dataKey="conversion" stroke={conversionColor}
                strokeWidth={10} strokeOpacity={0.25} dot={false} isAnimationActive={false} legendType="none" />
              <Line yAxisId="R" type="monotone" dataKey="conversion" name={locale === 'en' ? 'Conversion %' : 'Conversión %'}
                stroke={conversionColor} strokeWidth={2.5} dot={dot(conversionColor)} activeDot={activeDot(conversionColor)} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
