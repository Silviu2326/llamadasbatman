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
    lead_without_contact: ['Abre la primera conversación', hasCount ? `${count === 1 ? '1 contacto nuevo sin intentos' : `${count} contactos nuevos sin intentos`} de contacto registrados. Elige por quién empezar.` : 'Tienes contactos nuevos sin contactar. Elige por quién empezar.', 'Elegir contacto'],
    stalled_opportunity: ['Retoma tus oportunidades', hasCount ? `${count === 1 ? '1 oportunidad lleva' : `${count} oportunidades llevan`} al menos 7 días sin cambios. Revisa el siguiente paso.` : 'Tienes oportunidades sin cambios recientes. Revisa el siguiente paso.', 'Revisar oportunidades'],
    campaign_efficiency: ['Revisa el arranque de tus campañas', 'Hay campañas activas sin contactos registrados. Comprueba qué necesitan para empezar.', 'Revisar campañas'],
    organic_opportunity: ['Pon al día tus publicaciones', 'La fecha prevista de algunas acciones de contenido ya ha pasado. Revisa qué queda por publicar.', 'Revisar contenido'],
    automation_error: ['Recupera tus automatizaciones', 'Algunas ejecuciones han fallado. Revisa el error antes de volver a intentarlo.', 'Revisar errores'],
    meeting_follow_up: ['Deja listo el próximo paso', 'Hay reuniones pasadas sin resultado registrado. Actualízalas para preparar el seguimiento.', 'Actualizar reuniones'],
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
