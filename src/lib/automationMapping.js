import {
  RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine, RiFlowChart,
} from 'react-icons/ri'
import { getLocale, localeCode } from '../i18n'

// Convierte una Automation real (Prisma) al shape que usan Automatizaciones.jsx
// y AutomacionDetailPage.jsx — único lugar que asigna icono/color (no hay esos
// campos en el modelo, así que se ciclan por índice) y lee trigger/actions reales.
const AUTO_ICONS = [RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine]
const AUTO_BG = ['#6366f1', '#8b5cf6', '#10b981', '#f97316', '#8b5cf6', '#fb7185']
const AUTO_COLOR = ['#818cf8', '#a78bfa', '#34d399', '#fb923c', '#a78bfa', '#fda4af']
const AUTOMATION_EVENT_LABELS = {
  'call.completed': 'Llamada completada',
  'lead.inactive.7d': 'Lead sin actividad > 7 días',
  'meeting.scheduled.24h': 'Reunión agendada 24h antes',
  'opportunity.proposal.3d': 'Oportunidad en etapa Propuesta > 3 días',
  'lead.created': 'Nuevo lead creado',
  'lead.inactive.30d': 'Lead sin actividad > 30 días',
  'message.received': 'Mensaje recibido',
}

export function normalizeAutomationEvent(value) {
  const aliases = {
    'llamada completada': 'call.completed', llamada_completada: 'call.completed',
    'lead sin actividad > 7 días': 'lead.inactive.7d',
    'reunión agendada 24h antes': 'meeting.scheduled.24h',
    'oportunidad en etapa propuesta > 3 días': 'opportunity.proposal.3d',
    'nuevo lead creado': 'lead.created',
    'lead sin actividad > 30 días': 'lead.inactive.30d',
    'mensaje recibido': 'message.received', mensaje_recibido: 'message.received',
  }
  const event = String(value ?? '').trim().toLowerCase()
  return AUTOMATION_EVENT_LABELS[event] ? event : aliases[event] ?? null
}

// Índice estable a partir del id — para la ficha de detalle, que no tiene la
// posición del automation dentro de la lista.
export function stableIndex(id) {
  let sum = 0
  for (const c of String(id)) sum += c.charCodeAt(0)
  return sum
}

export function mapAutomation(a, i) {
  const t = a.trigger && typeof a.trigger === 'object' ? a.trigger : {}
  const triggerEvent = normalizeAutomationEvent(t.event ?? t.type ?? a.trigger)
  const triggerLabel = AUTOMATION_EVENT_LABELS[triggerEvent] ?? t.event ?? t.type ?? String(a.trigger ?? '—')
  const actions = Array.isArray(a.actions) ? a.actions : []
  return {
    id: a.id,
    Icon: AUTO_ICONS[i % AUTO_ICONS.length],
    iconBg: AUTO_BG[i % AUTO_BG.length],
    iconColor: AUTO_COLOR[i % AUTO_COLOR.length],
    name: a.name,
    // description es el campo nuevo (AU-08); trigger.description queda solo
    // como fallback de lectura para automatizaciones antiguas creadas con el
    // bug que guardaba la descripción dentro del trigger.
    desc: a.description ?? t.description ?? '',
    tags: Array.isArray(a.tags) ? a.tags : [],
    status: a.isActive ? 'activa' : 'pausada',
    rawStatus: a.status ?? 'active',
    TriggerIcon: RiFlowChart,
    triggerRaw: a.trigger,
    trigger: triggerLabel,
    actions,
    runsCount: a.runsCount ?? 0,
    execs: (a.runsCount ?? 0).toLocaleString(localeCode(getLocale())),
    last: a.lastRunAt
      ? new Date(a.lastRunAt).toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—',
    lastRunAt: a.lastRunAt ?? null,
  }
}
