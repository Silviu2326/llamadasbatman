// Shared visual utilities for dashboard widgets (no mock data)

export const card = { background:'#0d1117', border:'1px solid #1e2433', borderRadius:14, padding:'18px 20px' }

export const tooltipStyle = {
  contentStyle: { background:'rgba(10,14,26,0.97)', border:'1px solid #1e2433', borderRadius:10, fontSize:12, boxShadow:'0 8px 32px rgba(0,0,0,0.6)' },
  labelStyle:   { color:'#94a3b8', marginBottom:6, fontWeight:600 },
  itemStyle:    { color:'#f1f5f9' },
  cursor:       { stroke:'#1e2433', strokeWidth:1, strokeDasharray:'4 4' },
}

export const dot = (fill) => ({ r:3.5, fill, stroke:'#080c14', strokeWidth:2 })
export const activeDot = (fill) => ({ r:5.5, fill, stroke:'#080c14', strokeWidth:2 })

export const REND_SERIES = [
  { key:'llamadas',    name:'Llamadas',      color:'#60a5fa', yId:'L', grad:'gradL' },
  { key:'contactados', name:'Contactados',   color:'#34d399', yId:'L', grad:'gradC' },
  { key:'reuniones',   name:'Reuniones',     color:'#a78bfa', yId:'L', grad:'gradR' },
]

export function getChartDomain(data) {
  const leftMax = Math.max(...data.flatMap(d => [d.llamadas ?? 0, d.contactados ?? 0, d.reuniones ?? 0]))
  const rightMax = Math.max(...data.map(d => d.conversion ?? 0))
  const nice = n => {
    if (!n || n <= 0) return 10
    const p = Math.pow(10, Math.floor(Math.log10(n)))
    return Math.ceil(n / p) * p
  }
  return { leftMax: nice(leftMax * 1.1), rightMax: Math.max(Math.ceil(rightMax * 1.2), 10) }
}

export const FUNNEL_COLORS = ['#60a5fa','#22d3ee','#4ade80','#fbbf24','#e879f9']
export const DONUT_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4']
export const AGENT_BG = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#be185d']

// Empty fallbacks: widgets must render from real backend data only.
export const VIEW_OPTIONS_DEFAULT = {
  day:   { label: 'Por día',    data: [] },
  week:  { label: 'Por semana', data: [] },
  month: { label: 'Por mes',    data: [] },
}
export const FUNNEL = []
export const DONUT = []
export const BAR_DATA = []
export const AGENTS = []
export const ALERTS = []
