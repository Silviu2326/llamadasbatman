const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }

export function pendingActions(payload) {
  const source = Array.isArray(payload) ? payload : payload?.items
  if (!Array.isArray(source)) throw new Error('No se pudo leer la lista de pendientes.')
  const seen = new Set()
  return source.filter(item => {
    if (!item || typeof item.title !== 'string' || ['completed', 'dismissed', 'discarded', 'postponed'].includes(item.status)) return false
    const key = item.id || item.title + item.target?.path
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
}

// Only rewrite known rules. Their counts are records, never estimated revenue.
export function actionCopy(item) {
  const count = Number(item.impact?.value)
  const hasCount = Number.isFinite(count) && count > 0
  const copies = {
    lead_without_contact: ['Primer contacto pendiente', hasCount ? `${count} contactos nuevos sin intentos de contacto registrados.` : 'Hay contactos nuevos sin contactar.', 'Ver contactos'],
    stalled_opportunity: ['Oportunidades sin seguimiento', hasCount ? `${count} oportunidades llevan al menos 7 días sin cambios.` : 'Hay oportunidades sin cambios recientes.', 'Ver oportunidades'],
    campaign_efficiency: ['Campañas sin contactos registrados', 'Revisa las campañas activas que todavía no tienen contactos registrados.', 'Ver campañas'],
    organic_opportunity: ['Acciones pendientes de publicación', 'Hay acciones de contenido cuya fecha prevista ya ha pasado.', 'Revisar acciones'],
    automation_error: ['Automatizaciones con errores', 'Revisa las ejecuciones que han fallado antes de repetirlas.', 'Revisar errores'],
    meeting_follow_up: ['Reuniones por actualizar', 'Hay reuniones pasadas que siguen programadas, sin resultado registrado.', 'Ver reuniones'],
  }
  const [title, detail, label] = copies[item.kind] || [item.title, typeof item.evidence === 'string' ? item.evidence : '', item.cta?.label || 'Revisar']
  const path = item.target?.path
  // Navigation is internal; do not accept external or protocol-relative paths.
  return { title, detail, label, path: typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : null }
}

export function goalProgress(actual, target) {
  if (actual == null || target == null) return null
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || Number(target) <= 0) return null
  return Math.max(0, Math.round(Number(actual) / Number(target) * 100))
}

export function isNewWorkspace(stats, activity) {
  // Series arrays may contain zero-filled days: they do not establish activity.
  return stats != null && Array.isArray(activity) && activity.length === 0
    && ['totalCalls', 'totalLeads', 'closedWonValue', 'pipelineValue', 'meetingsScheduled', 'activeCampaigns']
      .every(key => typeof stats[key] === 'number' && stats[key] === 0)
}

export function validGoals(draft) {
  return [draft.monthlyRevenue, draft.monthlyMeetings].every(value => {
    const number = Number(value)
    return Number.isSafeInteger(number) && number >= 1
  })
}
