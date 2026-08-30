import React from 'react'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'
import { RiLineChartLine } from 'react-icons/ri'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { card, tooltipStyle, BAR_DATA } from './dashboardData'
import { useThemeColors } from '../../hooks/useTheme'
import { localeCode, useI18n } from '../../i18n'
import DashboardEmptyState from './DashboardEmptyState'

export default function IngresosChart({ pipelineByDay, pipelinePct }) {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const hasPipelineData = pipelineByDay?.some(day => Number(day?.value) > 0)
  const barData = hasPipelineData ? pipelineByDay : BAR_DATA
  const weekTotal = barData.reduce((s, d) => s + d.value, 0)
  const maxVal = Math.max(...barData.map(d => d.value), 1)
  const yMax = Math.ceil(maxVal * 1.25 / 1000) * 1000 || 10000
  const yTicks = [...new Set([
    0,
    Math.round(yMax / 3 / 1000) * 1000,
    Math.round(yMax * 2 / 3 / 1000) * 1000,
    yMax,
  ])]
  const isReal = !!hasPipelineData

  return (
    <div className="income-chart-card" style={{ ...card, display:'flex', flexDirection:'column', gap:12, height:'100%' }}>
      <div className="income-chart-heading">
        <div>
          <span className="income-chart-eyebrow">{locale === 'en' ? 'Attributed value' : 'Valor atribuido'}</span>
          <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>
            {locale === 'en' ? 'Pipeline this week' : 'Pipeline esta semana'}
          </h3>
        </div>
        <span className={`income-chart-badge${hasPipelineData ? '' : ' income-chart-badge-empty'}`}>{hasPipelineData ? (locale === 'en' ? 'LIVE' : 'EN VIVO') : (locale === 'en' ? 'NO DATA' : 'SIN DATOS')}</span>
      </div>
      <div className="income-chart-total" style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:28, fontWeight:800, color:'var(--text-strong)', letterSpacing:-1 }}>
          €{Math.round(weekTotal).toLocaleString(localeCode(locale))}
        </span>
        {isReal && pipelinePct != null && (
          <>
            {pipelinePct >= 0
              ? <HiArrowUp style={{ width:13, height:13, color:'var(--success-soft)' }} />
              : <HiArrowDown style={{ width:13, height:13, color:'var(--danger-soft)' }} />
            }
            <span style={{ fontSize:12, color: pipelinePct >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)', fontWeight:700 }}>{Math.abs(pipelinePct)}%</span>
            <span style={{ fontSize:11, color:'var(--muted)' }}>{locale === 'en' ? 'vs. previous week' : 'vs. semana anterior'}</span>
          </>
        )}
      </div>
      <div className="income-chart-meta"><span className="income-chart-dot" />{hasPipelineData ? (locale === 'en' ? 'Potential revenue linked to active opportunities' : 'Ingresos potenciales vinculados a oportunidades activas') : (locale === 'en' ? 'Your attributed pipeline will appear here' : 'Tu pipeline atribuido aparecerá aquí')}</div>
      <div style={{ flex:1, minHeight:180 }}>
        {!barData?.length ? (
          <DashboardEmptyState
            Icon={RiLineChartLine}
            title={locale === 'en' ? 'Your pipeline is ready to grow' : 'Tu pipeline está listo para crecer'}
            description={locale === 'en' ? 'Create an opportunity with value to see the trend here.' : 'Crea una oportunidad con valor para ver la evolución aquí.'}
            tone="green"
            centered
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top:8, right:0, left:0, bottom:0 }} barCategoryGap="35%">
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={colors.violet} stopOpacity={1} />
                  <stop offset="100%" stopColor={colors.accent} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill:colors.dim, fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, yMax]} ticks={yTicks}
                tickFormatter={v => v === 0 ? '0' : `${(v/1000).toFixed(0)}k`}
                tick={{ fill:colors.dim, fontSize:10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip {...tooltipStyle}
                contentStyle={{ ...tooltipStyle.contentStyle, background:'var(--surface-2)', border:'1px solid var(--line-2)' }}
                cursor={{ ...tooltipStyle.cursor, stroke:colors.line2 }}
                formatter={v => [`€${v.toLocaleString(localeCode(locale))}`, 'Pipeline']} />
              <Bar dataKey="value" fill={colors.violet} fillOpacity={0.25} radius={[5,5,0,0]} isAnimationActive={false} />
              <Bar dataKey="value" fill="url(#barGrad)" radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
