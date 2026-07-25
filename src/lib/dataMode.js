// Los datos de demostración solo se habilitan cuando el entorno lo declara
// explícitamente. Estar en desarrollo no es suficiente: una API caída debe
// seguir siendo visible como desconectada, también mientras se desarrolla.
const configuredMode = String(import.meta.env.VITE_DATA_MODE || '').trim().toLowerCase()

export const DEMO_MODE = configuredMode === 'demo'
  || configuredMode === 'preview'
  || String(import.meta.env.VITE_ALLOW_DEMO_DATA || '').toLowerCase() === 'true'

export const DATA_MODE = DEMO_MODE ? 'demo' : 'live'

export function getApiErrorMessage(body, fallback = 'No se pudo completar la operación.') {
  if (typeof body?.error === 'string' && body.error.trim()) return body.error
  if (typeof body?.message === 'string' && body.message.trim()) return body.message
  return fallback
}

export function isNonEmptyPayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  const numericKeys = [
    'totalCalls', 'totalLeads', 'meetingsScheduled', 'pipelineValue',
    'closedWonValue', 'activeCampaigns',
  ]
  if (numericKeys.some(key => Number(payload[key]) > 0)) return true
  return Object.values(payload).some(value => Array.isArray(value) && value.length > 0)
}

