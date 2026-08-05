// Shared visual utilities for dashboard widgets (no mock data)

export const card = { background:'var(--surface)', border:'1px solid var(--line)', borderRadius:14, padding:'18px 20px' }

// `cursor` no lleva stroke: es un atributo SVG y var() no resuelve ahí. Quien
// lo use debe pasarlo resuelto con useThemeColors().
export const tooltipStyle = {
  contentStyle: { background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:10, fontSize:12, boxShadow:'var(--shadow-2)' },
  labelStyle:   { color:'var(--muted)', marginBottom:6, fontWeight:600 },
  itemStyle:    { color:'var(--text-strong)' },
  cursor:       { strokeWidth:1, strokeDasharray:'4 4' },
}

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

export const AGENT_BG = ['var(--accent-deep)','var(--cyan-deep)','var(--violet-deep)','var(--success)','var(--pink)']

// Empty fallbacks: widgets must render from real backend data only.
export const FUNNEL = []
export const DONUT = []
export const BAR_DATA = []
export const AGENTS = []
export const ALERTS = []
