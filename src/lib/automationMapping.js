import {
  RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine, RiFlowChart,
} from 'react-icons/ri'

// Convierte una Automation real (Prisma) al shape que usan Automatizaciones.jsx
// y AutomacionDetailPage.jsx — único lugar que asigna icono/color (no hay esos
// campos en el modelo, así que se ciclan por índice) y lee trigger/actions reales.
const AUTO_ICONS = [RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine]
const AUTO_BG = ['#6366f1', '#8b5cf6', '#10b981', '#f97316', '#8b5cf6', '#fb7185']
const AUTO_COLOR = ['#818cf8', '#a78bfa', '#34d399', '#fb923c', '#a78bfa', '#fda4af']

// Índice estable a partir del id — para la ficha de detalle, que no tiene la
// posición del automation dentro de la lista.
export function stableIndex(id) {
  let sum = 0
  for (const c of String(id)) sum += c.charCodeAt(0)
  return sum
}

export function mapAutomation(a, i) {
  const t = a.trigger && typeof a.trigger === 'object' ? a.trigger : {}
  const triggerLabel = t.event ?? t.type ?? String(a.trigger ?? '—')
  const actions = Array.isArray(a.actions) ? a.actions : []
  return {
    id: a.id,
    Icon: AUTO_ICONS[i % AUTO_ICONS.length],
    iconBg: AUTO_BG[i % AUTO_BG.length],
    iconColor: AUTO_COLOR[i % AUTO_COLOR.length],
    name: a.name,
    desc: a.description ?? '',
    tags: Array.isArray(a.tags) ? a.tags : [],
    status: a.isActive ? 'activa' : 'pausada',
    TriggerIcon: RiFlowChart,
    triggerRaw: a.trigger,
    trigger: triggerLabel,
    actions,
    runsCount: a.runsCount ?? 0,
    execs: (a.runsCount ?? 0).toLocaleString('es-ES'),
    last: a.lastRunAt
      ? new Date(a.lastRunAt).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—',
    lastRunAt: a.lastRunAt ?? null,
  }
}
