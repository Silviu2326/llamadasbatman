import { useState } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'
import '../dashboard.css'
import { useI18n } from '../i18n'

function Sparkline({ data, color }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:10, color:'#4b5563' }}>—</span>
      </div>
    )
  }
  const d = data.map(v => ({ v }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={d} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={9}
          strokeOpacity={0.10} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={4}
          strokeOpacity={0.28} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
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
        background: hov ? '#0f1520' : '#0d1117',
        borderWidth: 1, borderStyle: 'solid',
        borderColor: hov ? `${iconBg}70` : '#1e2433',
        borderRadius: 14, overflow: 'hidden',
        animationDelay: delay, cursor: 'default',
        '--kpi-accent': color,
        boxShadow: hov ? `0 0 32px ${iconBg}25` : 'none',
        transition: 'all .25s ease',
      }}
    >
      <div className="kpi-card-body" style={{ padding: C ? '10px 11px 6px' : L ? '14px 16px 10px' : '11px 13px 8px', flex: 1 }}>
        <div className="kpi-card-heading" style={{ display: 'flex', alignItems: 'center', gap: C ? 6 : L ? 10 : 8, marginBottom: C ? 6 : L ? 12 : 10 }}>
          <div style={{
            width: C ? 26 : L ? 38 : 32, height: C ? 26 : L ? 38 : 32, borderRadius: C ? 7 : L ? 10 : 9, flexShrink: 0,
            background: `linear-gradient(145deg, ${iconBg}55 0%, ${iconBg}25 100%)`,
            borderWidth: 1, borderStyle: 'solid', borderColor: `${iconBg}60`,
            boxShadow: `0 0 16px ${iconBg}45, 0 0 4px ${iconBg}30, inset 0 1px 0 ${iconBg}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {image
              ? <img className="kpi-card-icon-image" src={image} alt="" aria-hidden="true" />
              : <Icon style={{ width: C ? 12 : L ? 17 : 15, height: C ? 12 : L ? 17 : 15, color }} />}
          </div>
          <p className="kpi-card-label" style={{ margin: 0, fontSize: C ? 9 : L ? 11.5 : 10, color: '#e2e8f0', lineHeight: 1.3, whiteSpace: 'pre-line', fontWeight: 600 }}>
            {cleanLabel}
          </p>
        </div>
        <p className="kpi-card-value" style={{ margin: C ? '0 0 3px' : L ? '0 0 7px' : '0 0 5px', fontSize: C ? 18 : L ? 26 : 21, fontWeight: 800, color: '#ffffff', letterSpacing: -1, textShadow: '0 0 20px rgba(255,255,255,0.25)' }}>
          {value}
        </p>
        {pct != null && (
          <div className="kpi-card-trend" style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {pct >= 0
              ? <HiArrowUp style={{ width: C ? 10 : L ? 11 : 10, height: C ? 10 : L ? 11 : 10, color: '#4ade80', flexShrink: 0 }} />
              : <HiArrowDown style={{ width: C ? 10 : L ? 11 : 10, height: C ? 10 : L ? 11 : 10, color: '#f87171', flexShrink: 0 }} />
            }
            <span style={{ fontSize: C ? 9 : L ? 11 : 10, color: pct >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{Math.abs(pct)}%</span>
            {!C && <span style={{ fontSize: L ? 10 : 9, color: '#94a3b8' }}>{locale === 'en' ? 'vs. previous week' : 'vs. semana anterior'}</span>}
          </div>
        )}
        {isRevenue && !C && <span className="kpi-card-context">{locale === 'en' ? 'team-attributed closes' : 'cierres atribuidos al equipo'}</span>}
      </div>
    </div>
  )
}
