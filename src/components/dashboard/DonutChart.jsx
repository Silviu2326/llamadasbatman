import React from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { card, tooltipStyle, DONUT, DONUT_COLORS } from './dashboardData'
import { getLocale, localeCode, useI18n } from '../../i18n'

export default function DonutChart({ callsByCampaign, totalCalls }) {
  const { locale } = useI18n()
  const SIZE = 190
  const donutData = callsByCampaign?.length
    ? callsByCampaign.map((c, i) => ({ ...c, name: c.name, pct: c.pct, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    : DONUT
  const centerCount = totalCalls ?? 0

  return (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#ffffff', textShadow:'0 0 20px rgba(255,255,255,0.15)' }}>
        {locale === 'en' ? 'Calls by campaign' : 'Llamadas por campaña'}
      </h3>

      <div style={{ position:'relative', width:SIZE, height:SIZE, margin:'0 auto' }}>
        <PieChart width={SIZE} height={SIZE}>
          <Pie data={donutData} cx={SIZE/2} cy={SIZE/2}
            innerRadius={58} outerRadius={84}
            dataKey="pct" paddingAngle={3} startAngle={90} endAngle={-270}>
            {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle}
            formatter={(v, name, props) => [`${v}% (${props.payload.value})`, props.payload.name]} />
        </PieChart>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#ffffff', lineHeight:1, textShadow:'0 0 16px rgba(255,255,255,0.3)' }}>
            {centerCount.toLocaleString(localeCode(getLocale()))}
          </div>
          <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{locale === 'en' ? 'Calls' : 'Llamadas'}</div>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1, justifyContent:'center' }}>
        {donutData.length === 0
          ? <p style={{ margin:0, fontSize:12, color:'#4b5563', textAlign:'center' }}>{locale === 'en' ? 'No campaign data' : 'Sin datos de campañas'}</p>
          : donutData.map(d => (
            <div key={d.name} style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:d.color, flexShrink:0, boxShadow:`0 0 6px ${d.color}` }} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:12, color:'#e2e8f0', fontWeight:600, lineHeight:1.2 }}>{d.name}</p>
                <p style={{ margin:0, fontSize:11, color:'#6b7280' }}>{d.pct}% ({d.value})</p>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
