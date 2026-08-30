import React, { useMemo } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { RiPieChartLine } from 'react-icons/ri'
import { card, tooltipStyle, DONUT } from './dashboardData'
import { useThemeColors } from '../../hooks/useTheme'
import { getLocale, localeCode, useI18n } from '../../i18n'
import DashboardEmptyState from './DashboardEmptyState'

// Una porción por campaña. Va a `fill` (atributo SVG), donde var() no resuelve:
// la paleta se construye con los tokens ya resueltos a hex.
const donutPalette = c => [c.info, c.success, c.violet, c.warn, c.cyan]

export default function DonutChart({ callsByCampaign, totalCalls }) {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const palette = useMemo(() => donutPalette(colors), [colors])
  const SIZE = 190
  const donutData = callsByCampaign?.length
    ? callsByCampaign.map((c, i) => ({ ...c, name: c.name, pct: c.pct, color: palette[i % palette.length] }))
    : DONUT
  const centerCount = totalCalls ?? 0

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>
        {locale === 'en' ? 'Calls by campaign' : 'Llamadas por campaña'}
      </h3>

      {donutData.length ? <div style={{ position:'relative', width:SIZE, height:SIZE, margin:'0 auto' }}>
        <PieChart width={SIZE} height={SIZE}>
          <Pie data={donutData} cx={SIZE/2} cy={SIZE/2}
            innerRadius={58} outerRadius={84}
            dataKey="pct" paddingAngle={3} startAngle={90} endAngle={-270}>
            {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={{ ...tooltipStyle.contentStyle, background:'var(--surface-2)', border:'1px solid var(--line-2)' }} itemStyle={tooltipStyle.itemStyle}
            formatter={(v, name, props) => [`${v}% (${props.payload.value})`, props.payload.name]} />
        </PieChart>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'var(--text-strong)', lineHeight:1 }}>
            {centerCount.toLocaleString(localeCode(getLocale()))}
          </div>
          <div style={{ fontSize:11, color:'var(--dim)', marginTop:4 }}>{locale === 'en' ? 'Calls' : 'Llamadas'}</div>
        </div>
      </div> : <DashboardEmptyState
        Icon={RiPieChartLine}
        title={locale === 'en' ? 'No campaign activity yet' : 'Aún no hay actividad por campaña'}
        description={locale === 'en' ? 'Calls will be distributed here as soon as your campaigns start.' : 'Las llamadas se repartirán aquí cuando tus campañas empiecen a moverse.'}
        tone="cyan"
        centered
      />}

      <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1, justifyContent:'center' }}>
        {donutData.length
          ? donutData.map(d => (
            <div key={d.name} style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:d.color, flexShrink:0, boxShadow:`0 0 6px ${d.color}` }} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:12, color:'var(--text)', fontWeight:600, lineHeight:1.2 }}>{d.name}</p>
                <p style={{ margin:0, fontSize:11, color:'var(--dim)' }}>{d.pct}% ({d.value})</p>
              </div>
            </div>
          ))
          : null
        }
      </div>
    </div>
  )
}
