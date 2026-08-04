import { useMemo, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'
import '../dashboard.css'
import { useI18n } from '../i18n'
import { useThemeColors } from '../hooks/useTheme'

// `stroke` es un atributo de presentación SVG y ahí var() no resuelve. El prop
// `color` llega como 'var(--token)' desde las tarjetas, así que se resuelve a
// hex; useThemeColors() solo se usa para repetir la lectura al cambiar de tema.
function useSvgColor(value) {
  const colors = useThemeColors()
  const token = /^var\((--[\w-]+)\)$/.exec(String(value ?? ''))?.[1]
  return useMemo(
    () => (token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : value),
    [token, value, colors],
  )
}

// Tinte del color de acento de la tarjeta. `iconBg` llega como 'var(--token)',
// que no admite concatenar alfa: color-mix sí.
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

function Sparkline({ data, color }) {
  const stroke = useSvgColor(color)
  if (!data || data.length < 2) {
    return (
      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:10, color: 'var(--dim)' }}>—</span>
      </div>
    )
  }
  const d = data.map(v => ({ v }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={d} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={9}
          strokeOpacity={0.10} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={4}
          strokeOpacity={0.28} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2}
          fill="none" dot={false} animationDuration={1000} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function KPICard({ Icon, image, iconBg, label, value, pct, color, data, delay = '0ms', compact = false, large = false }) {
  const { locale } = useI18n()
  const [hov, setHov] = useState(false)
  const C = compact
  const L = large
  const cleanLabel = String(label ?? '').replace(/\n/g, ' ')
  const isRevenue = cleanLabel.toLowerCase().includes('ingresos')
  return (
    <div
      className={`fade-up kpi-card ${C ? 'kpi-card-compact' : ''} ${L ? 'kpi-card-large' : ''} ${isRevenue ? 'kpi-card-revenue' : ''}`}
      aria-label={`${cleanLabel}: ${value}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column',
        background: hov ? 'var(--surface)' : 'var(--surface)',
        borderWidth: 1, borderStyle: 'solid',
        borderColor: hov ? tint(iconBg, 44) : 'var(--line)',
        borderRadius: 14, overflow: 'hidden',
        animationDelay: delay, cursor: 'default',
        '--kpi-accent': color,
        boxShadow: hov ? `0 0 32px ${tint(iconBg, 15)}` : 'none',
        transition: 'all .25s ease',
      }}
    >
      <div className="kpi-card-body" style={{ padding: C ? '10px 11px 6px' : L ? '14px 16px 10px' : '11px 13px 8px', flex: 1 }}>
        <div className="kpi-card-heading" style={{ display: 'flex', alignItems: 'center', gap: C ? 6 : L ? 10 : 8, marginBottom: C ? 6 : L ? 12 : 10 }}>
          <div style={{
            width: C ? 26 : L ? 38 : 32, height: C ? 26 : L ? 38 : 32, borderRadius: C ? 7 : L ? 10 : 9, flexShrink: 0,
            background: `linear-gradient(145deg, ${tint(iconBg, 33)} 0%, ${tint(iconBg, 15)} 100%)`,
            borderWidth: 1, borderStyle: 'solid', borderColor: tint(iconBg, 38),
            boxShadow: `0 0 16px ${tint(iconBg, 27)}, 0 0 4px ${tint(iconBg, 19)}, inset 0 1px 0 ${tint(iconBg, 25)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {image
              ? <img className="kpi-card-icon-image" src={image} alt="" aria-hidden="true" />
              : <Icon style={{ width: C ? 12 : L ? 17 : 15, height: C ? 12 : L ? 17 : 15, color }} />}
          </div>
          <p className="kpi-card-label" style={{ margin: 0, fontSize: C ? 9 : L ? 11.5 : 10, color: 'var(--text)', lineHeight: 1.3, whiteSpace: 'pre-line', fontWeight: 600 }}>
            {cleanLabel}
          </p>
        </div>
        <p className="kpi-card-value" style={{ margin: C ? '0 0 3px' : L ? '0 0 7px' : '0 0 5px', fontSize: C ? 18 : L ? 26 : 21, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -1 }}>
          {value}
        </p>
        {pct != null && (
          <div className="kpi-card-trend" style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {pct >= 0
              ? <HiArrowUp style={{ width: C ? 10 : L ? 11 : 10, height: C ? 10 : L ? 11 : 10, color: 'var(--success-soft)', flexShrink: 0 }} />
              : <HiArrowDown style={{ width: C ? 10 : L ? 11 : 10, height: C ? 10 : L ? 11 : 10, color: 'var(--danger-soft)', flexShrink: 0 }} />
            }
            <span style={{ fontSize: C ? 9 : L ? 11 : 10, color: pct >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)', fontWeight: 700 }}>{Math.abs(pct)}%</span>
            {!C && <span style={{ fontSize: L ? 10 : 9, color: 'var(--muted)' }}>{locale === 'en' ? 'vs. previous week' : 'vs. semana anterior'}</span>}
          </div>
        )}
        {isRevenue && !C && <span className="kpi-card-context">{locale === 'en' ? 'team-attributed closes' : 'cierres atribuidos al equipo'}</span>}
      </div>
    </div>
  )
}
