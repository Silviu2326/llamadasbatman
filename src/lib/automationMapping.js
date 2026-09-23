import {
  RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine, RiFlowChart,
} from 'react-icons/ri'
import { getLocale, localeCode } from '../i18n'

// Convierte una Automation real (Prisma) al shape que usan Automatizaciones.jsx
// y AutomacionDetailPage.jsx — único lugar que asigna icono/color (no hay esos
// campos en el modelo, así que se ciclan por índice) y lee trigger/actions reales.
const AUTO_ICONS = [RiPhoneLine, RiMailLine, RiCalendarLine, RiShoppingCart2Line, RiRobot2Line, RiBarChartLine]
const AUTO_BG = ['var(--accent)', 'var(--violet)', 'var(--success)', 'var(--warn)', 'var(--violet)', 'var(--danger-soft)']
const AUTO_COLOR = ['var(--accent-soft)', 'var(--violet)', 'var(--success)', 'var(--warn)', 'var(--violet)', 'var(--danger-soft)']
const AUTOMATION_EVENT_LABELS = {
  'call.completed': 'Llamada completada',
  'lead.inactive.7d': 'Lead sin actividad > 7 días',
  'meeting.scheduled.24h': 'Reunión agendada 24h antes',
  'opportunity.proposal.3d': 'Oportunidad en etapa Propuesta > 3 días',
  'lead.created': 'Nuevo lead creado',
  'lead.inactive.30d': 'Lead sin actividad > 30 días',
  'message.received': 'Mensaje recibido',
  'meeting.created': 'Reunión creada',
  'meeting.rescheduled': 'Reunión reprogramada',
  'meeting.completed': 'Reunión completada',
  'meeting.cancelled': 'Reunión cancelada',
  'meeting.no_show': 'Reunión sin asistencia',
  'task.due': 'Tarea por vencer',
  'task.overdue': 'Tarea vencida',
  'opportunity.created': 'Oportunidad creada',
  'opportunity.stage.changed': 'Oportunidad cambia de etapa',
  'opportunity.won': 'Oportunidad ganada',
  'opportunity.lost': 'Oportunidad perdida',
  'opportunity.reopened': 'Oportunidad reabierta',
}

// Mismo catálogo que CANONICAL_AUTOMATION_EVENTS en el backend.
export const AUTOMATION_TRIGGER_OPTIONS = Object.entries(AUTOMATION_EVENT_LABELS).map(([value, label]) => ({ value, label }))

// Parámetros por acción, alineados con validateAutomationActions y el
// ejecutor de automations.service.ts. `required` replica la validación del
// backend para avisar antes de guardar.
export const AUTOMATION_ACTION_DEFINITIONS = {
  log: { label: 'Registrar en el log', params: [] },
  update_lead_status: { label: 'Cambiar estado del lead', params: [{ key: 'status', label: 'Nuevo estado', type: 'select', options: ['new', 'contacted', 'qualified', 'unqualified', 'converted'] }] },
  send_whatsapp_template: { label: 'Enviar plantilla de WhatsApp', params: [{ key: 'contentSid', label: 'Content SID aprobado en Twilio', required: true, placeholder: 'HX...' }] },
  queue_voice_call: { label: 'Iniciar llamada automática', params: [] },
  send_email_template: { label: 'Enviar plantilla de email', params: [{ key: 'emailDraftId', label: 'ID del borrador de email', required: true }] },
  ai_reply_whatsapp: { label: 'Responder WhatsApp con IA', params: [{ key: 'tone', label: 'Tono', type: 'select', options: ['consultivo', 'cercano', 'formal'] }] },
  create_task: { label: 'Crear tarea', params: [{ key: 'title', label: 'Título', required: true }, { key: 'dueInDays', label: 'Vence en (días)', type: 'number' }, { key: 'priority', label: 'Prioridad', type: 'select', options: ['low', 'normal', 'high', 'urgent'] }] },
  set_owner: { label: 'Asignar responsable', params: [{ key: 'ownerId', label: 'ID del usuario responsable', required: true }] },
  add_tag: { label: 'Añadir etiqueta', params: [{ key: 'tag', label: 'Etiqueta', required: true }] },
  update_field: { label: 'Actualizar campo personalizado', params: [{ key: 'field', label: 'Campo', required: true }, { key: 'value', label: 'Valor' }] },
  create_opportunity: { label: 'Crear oportunidad', params: [{ key: 'name', label: 'Nombre (opcional)' }] },
  notify: { label: 'Notificar al responsable', params: [{ key: 'message', label: 'Mensaje' }] },
}

export function automationActionLabel(type) {
  return AUTOMATION_ACTION_DEFINITIONS[type]?.label ?? type ?? 'acción'
}

/** Devuelve el primer error de validación local, o '' si la configuración es válida. */
export function validateAutomationConfig({ name, trigger, actions }) {
  if (!String(name ?? '').trim()) return 'El nombre es obligatorio.'
  if (!AUTOMATION_EVENT_LABELS[trigger]) return 'Selecciona un disparador válido.'
  for (const [index, action] of (actions ?? []).entries()) {
    const definition = AUTOMATION_ACTION_DEFINITIONS[action?.type]
    if (!definition) return `La acción ${index + 1} no es de un tipo soportado.`
    const missing = definition.params.find(param => param.required && !String(action.params?.[param.key] ?? '').trim())
    if (missing) return `La acción ${index + 1} (${definition.label}) necesita «${missing.label}».`
  }
  return ''
}

/** Limpia parámetros vacíos y convierte números antes de enviar al backend. */
export function serializeAutomationActions(actions) {
  return (actions ?? []).map(action => {
    const definition = AUTOMATION_ACTION_DEFINITIONS[action.type]
    const params = {}
    for (const [key, value] of Object.entries(action.params ?? {})) {
      if (value === '' || value == null) continue
      const param = definition?.params.find(item => item.key === key)
      params[key] = param?.type === 'number' ? Number(value) : value
    }
    return Object.keys(params).length ? { type: action.type, params } : { type: action.type }
  })
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
    nuevo_lead: 'lead.created', reunion_creada: 'meeting.created', tarea_vencida: 'task.overdue',
    oportunidad_ganada: 'opportunity.won', oportunidad_perdida: 'opportunity.lost',
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
    triggerEvent,
    description: a.description ?? '',
    hasUnpublishedChanges: Boolean(a.hasUnpublishedChanges),
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
