import { apiFetch } from '../api'
import { readPlanGate } from '../planGate'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
}

/**
 * Normaliza el contrato de organico.md §7.1.
 *
 * Lo que hacía antes: cadenas de `firstDefined(kpis.potentialCustomers,
 * kpis.clientsFound, kpis.searchDemand)` que no resolvían a nada porque el
 * backend nunca envió ninguno de los tres. El resultado eran paneles
 * renderizados vacíos para siempre, indistinguibles de "tu negocio no tiene
 * datos". La regla ahora es la del documento: **la interfaz solo pinta lo que
 * el contrato declara**, y lo que aún no existe se declara ausente con el
 * motivo, no con un hueco mudo.
 */
function normalizeOverview(payload) {
  const source = payload || {}
  const summary = source.summary || {}

  return {
    project: source.project || null,
    period: source.period || null,
    profile: source.profile || null,
    dataQuality: source.dataQuality || null,
    // `null` es "sin medición" y viaja tal cual: la tarjeta decide cómo
    // decirlo. Convertirlo en 0 aquí sería mentir en el sitio más discreto.
    summary: {
      fast: {
        organicLeads: summary.fast?.organicLeads ?? null,
        visits: summary.fast?.visits ?? null,
        presence: summary.fast?.presence ?? null,
      },
      mature: {
        qualified: summary.mature?.qualified ?? null,
        opportunities: summary.mature?.opportunities ?? null,
        sales: summary.mature?.sales ?? null,
        hoursInvested: summary.mature?.hoursInvested ?? null,
        hoursPerQualified: summary.mature?.hoursPerQualified ?? null,
      },
      deepestEligibleSignal: summary.deepestEligibleSignal ?? null,
    },
    funnel: asArray(source.funnel),
    pieces: asArray(source.pieces),
    pages: asArray(source.pages),
    channels: asArray(source.channels),
    recommendations: asArray(source.recommendations),
    weeklyNarrative: source.weeklyNarrative || null,
    policy: source.policy || null,
    // Lo que sí existe hoy y la página seguía usando.
    opportunities: asArray(source.opportunities),
    actions: asArray(source.actions),
    assets: asArray(source.assets),
    setupRequired: Boolean(source.setupRequired),
  }
}

const ORGANIC_INTEGRATION_PROVIDERS = ['search_console', 'ga4', 'google_business_profile']

function normalizeIntegration(integration = {}) {
  const discovery = integration.discovery && typeof integration.discovery === 'object' ? integration.discovery : {}
  return {
    ...integration,
    provider: integration.provider || integration.type || 'unknown',
    status: integration.status || 'not_connected',
    externalPropertyId: integration.externalPropertyId || integration.propertyId || null,
    lastSyncedAt: integration.lastSyncedAt || integration.syncedAt || null,
    lastError: integration.lastError || integration.error || null,
    properties: Array.isArray(integration.properties)
      ? integration.properties
      : Array.isArray(integration.availableProperties)
        ? integration.availableProperties
        : Array.isArray(discovery.resources)
          ? discovery.resources
          : Array.isArray(discovery.locations)
            ? discovery.locations
            : [],
  }
}

export async function fetchOrganicOverview({ projectId, period } = {}) {
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  if (period) params.set('period', period)
  const query = params.toString()
  const response = await apiFetch(`/api/organic/overview${query ? `?${query}` : ''}`)
  if (response.status === 404 || response.status === 204) return { status: 'setup', data: null }
  // Bloqueo de plan: misma rama que el estado inicial, para caer en el onboarding y no en la tarjeta de error.
  const gate = response.ok ? null : await readPlanGate(response)
  if (gate) return { status: 'setup', data: null, gate }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || 'No pudimos cargar Organic Leads.')
  if (!payload?.project && !payload?.data?.project && !payload?.overview?.project) {
    return { status: 'setup', data: null }
  }
  return { status: 'ready', data: normalizeOverview(payload) }
}

async function requestJson(path, options = {}) {
  const response = await apiFetch(path, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error || 'No pudimos completar la acción orgánica.')
    error.status = response.status
    throw error
  }
  return payload
}

export async function fetchOrganicIntegrations() {
  const response = await apiFetch('/api/organic/integrations')
  const payload = await response.json().catch(() => null)
  if (response.status === 404 || response.status === 405) {
    return { status: 'unavailable', integrations: [], error: 'El estado de integraciones aún no está disponible en el backend.' }
  }
  if (!response.ok) throw new Error(payload?.error || 'No pudimos consultar las integraciones orgánicas.')
  const integrations = Array.isArray(payload?.integrations) ? payload.integrations : []
  return {
    status: payload?.setupRequired ? 'setup' : 'ready',
    integrations: ORGANIC_INTEGRATION_PROVIDERS.map(provider => normalizeIntegration(integrations.find(item => item.provider === provider) || { provider })),
  }
}

export function startOrganicOAuth(provider) {
  return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/oauth/start-url`)
}

export function disconnectOrganicIntegration(provider) {
  return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}`, { method: 'DELETE' })
}

const SYNCABLE_PROVIDERS = new Set(['search_console', 'ga4', 'google_business_profile'])

/**
 * Sincroniza una fuente. GA4 y el Perfil de Empresa hacían `discover`, que solo
 * vuelve a listar propiedades: parecía una sincronización y no traía ni un
 * dato. Ahora los tres proveedores ingieren de verdad.
 */
export function syncOrganicIntegration(provider, payload = {}) {
  if (!SYNCABLE_PROVIDERS.has(provider)) {
    return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/discover`, { method: 'POST' })
  }
  const end = payload.endDate || new Date().toISOString().slice(0, 10)
  const startDate = new Date(`${end}T00:00:00.000Z`)
  startDate.setUTCDate(startDate.getUTCDate() - 30)
  const body = { startDate: payload.startDate || startDate.toISOString().slice(0, 10), endDate: end }
  if (provider === 'search_console') body.rowLimit = payload.rowLimit || 1000
  return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/sync`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function configureOrganicIntegration(provider, externalPropertyId) {
  return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/resource`, {
    method: 'PUT',
    body: JSON.stringify({ externalPropertyId }),
  })
}

// ─── Cola priorizada y sala de autonomía ────────────────────────────────────
// Vivían sueltas dentro de la página con `apiFetch` sin importar, así que la
// primera llamada lanzaba un ReferenceError y la pantalla entera caía al estado
// de error. Aquí comparten el mismo manejo de errores que el resto.

export async function fetchOrganicRecommendations() {
  const response = await apiFetch('/api/organic/recommendations')
  if (!response.ok) return []
  const payload = await response.json().catch(() => null)
  return Array.isArray(payload) ? payload : []
}

export function dispatchOrganicRecommendation(id) {
  return requestJson(`/api/organic/recommendations/${encodeURIComponent(id)}/dispatch`, { method: 'POST' })
}

export function dismissOrganicRecommendation(id, reason) {
  return requestJson(`/api/organic/recommendations/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function fetchOrganicAutonomy() {
  const response = await apiFetch('/api/organic/autonomy')
  if (!response.ok) return null
  return response.json().catch(() => null)
}

export function updateOrganicAutonomy(patch) {
  return requestJson('/api/organic/autonomy', { method: 'PUT', body: JSON.stringify(patch) })
}

export function runOrganicAutonomyPass() {
  return requestJson('/api/organic/autonomy/run', { method: 'POST' })
}

export function approveOrganicAutonomyDecision(id) {
  return requestJson(`/api/organic/autonomy/decisions/${encodeURIComponent(id)}/approve`, { method: 'POST' })
}

export function rejectOrganicAutonomyDecision(id, reason) {
  return requestJson(`/api/organic/autonomy/decisions/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function promoteOrganicAutonomyKind(kind) {
  return requestJson(`/api/organic/autonomy/kinds/${encodeURIComponent(kind)}/promote`, { method: 'POST' })
}

export function createOrganicProject(payload = {}) {
  return requestJson('/api/organic/project', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      website: payload.website || null,
      locations: payload.location ? [payload.location] : undefined,
      config: payload.notes ? { notes: payload.notes } : undefined,
    }),
  })
}

export function createOrganicDraft(payload = {}) {
  return requestJson('/api/organic/assets', {
    method: 'POST',
    body: JSON.stringify({
      projectId: payload.projectId || undefined,
      opportunityId: payload.opportunityId || null,
      type: payload.type || 'service_page',
      title: payload.name || payload.title || 'Nuevo activo orgánico',
      content: { notes: payload.notes || '' },
      targetUrl: payload.targetUrl || null,
    }),
  })
}

export function connectOrganicWeb(payload = {}) {
  return requestJson('/api/organic/project', {
    method: 'PATCH',
    body: JSON.stringify({
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.website ? { website: payload.website } : {}),
      ...(payload.location ? { locations: [payload.location] } : {}),
      ...(payload.notes ? { config: { notes: payload.notes } } : {}),
    }),
  })
}
