// Estado del agente tal y como lo entiende el backend (`Agent.lifecycleStatus`).
// `isActive` es un flag interno de marcado; la ficha, la lista y los KPI
// muestran siempre el ciclo de vida, que es lo que cambian publish/pause/resume.
export const LIFECYCLE = {
  draft: { label: 'Borrador', tone: 'draft', description: 'Configurándose. Puede hacer pruebas, pero no llama a contactos.' },
  active: { label: 'Activo', tone: 'active', description: 'Publicado: las campañas activas pueden usarlo.' },
  paused: { label: 'Pausado', tone: 'paused', description: 'Detenido a propósito. Reanudar lo devuelve a borrador hasta volver a publicar.' },
  archived: { label: 'Archivado', tone: 'archived', description: 'Fuera de uso. Conserva su historial.' },
}

export function lifecycleOf(agent) {
  const status = agent?.lifecycleStatus
  return LIFECYCLE[status] ? status : 'draft'
}

export function lifecycleLabel(agent) {
  return LIFECYCLE[lifecycleOf(agent)].label
}

const FIELD_LABELS = {
  name: 'Nombre', role: 'Función', description: 'Descripción', agentType: 'Tipo de agente', callDirection: 'Dirección de llamadas',
  voiceId: 'Voz', systemPrompt: 'Instrucciones', language: 'Idioma', settings: 'Configuración', phoneNumber: 'Número de salida',
  monthlyMinuteLimit: 'Límite mensual de minutos', personality: 'Personalidad',
}

/**
 * Mensaje legible a partir de una respuesta de error de la API. Los 400 de zod
 * llegan como `{ error, fields: { campo: [mensajes] } }`; los 422 de negocio
 * como `{ error, code }`; publish como `{ error, blockers: [{ label, detail }] }`.
 */
export function apiErrorMessage(body, fallback = 'No se pudo completar la acción.') {
  if (!body || typeof body !== 'object') return fallback
  if (Array.isArray(body.blockers) && body.blockers.length) {
    return `Faltan requisitos: ${body.blockers.map(item => item.detail ? `${item.label} (${item.detail})` : item.label).join('; ')}`
  }
  if (body.fields && typeof body.fields === 'object') {
    const parts = Object.entries(body.fields).flatMap(([field, messages]) => (Array.isArray(messages) ? messages : [messages]).filter(Boolean).map(message => `${FIELD_LABELS[field] || field}: ${message}`))
    if (parts.length) return parts.join(' · ')
  }
  return body.error || fallback
}

/** Lee el cuerpo JSON de una respuesta sin romper si viene vacío. */
export async function readBody(response) {
  return response.json().catch(() => ({}))
}
