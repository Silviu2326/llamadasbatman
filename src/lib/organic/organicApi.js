import { apiFetch } from '../api'
import { readPlanGate } from '../planGate'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
}

function normalizeOverview(payload) {
  const source = payload?.overview || payload?.data || payload || {}
  const project = source.project || source.business || source.workspace || null
  const kpis = source.kpis || source.metrics || {}
  const demand = source.demand || {}
  const local = source.local || source.localPresence || {}
  const ai = source.ai || source.aiVisibility || {}
  const assets = source.assets || source.commercialAssets || []
  const leads = source.leads || source.organicLeads || []
  const competitorGap = source.competitorGap || source.competitors || {}

  return {
    project,
    periodLabel: firstDefined(source.periodLabel, source.period?.label, 'Periodo seleccionado'),
    opportunity: source.opportunity || source.opportunitySummary || {},
    kpis: {
      potentialCustomers: firstDefined(kpis.potentialCustomers, kpis.clientsFound, kpis.searchDemand),
      organicLeads: firstDefined(kpis.organicLeads, kpis.leads, 0),
      estimatedValue: firstDefined(
        kpis.estimatedValue,
        kpis.value,
        typeof kpis.estimatedValueCents === 'number' ? kpis.estimatedValueCents / 100 : undefined,
      ),
      missedOpportunities: firstDefined(kpis.missedOpportunities, kpis.uncovered, kpis.openOpportunities),
    },
    demand: {
      points: asArray(demand.points || demand.locations || source.map?.points),
      opportunities: asArray(demand.opportunities || demand.queries || source.opportunities).map(opportunity => ({
        ...opportunity,
        demand: firstDefined(opportunity.demand, opportunity.demandLevel),
        competition: firstDefined(opportunity.competition, opportunity.competitionLevel),
        valuePerLead: firstDefined(
          opportunity.valuePerLead,
          opportunity.estimatedValue,
          typeof opportunity.estimatedValueCents === 'number' ? opportunity.estimatedValueCents / 100 : undefined,
        ),
        actionLabel: firstDefined(opportunity.actionLabel, opportunity.recommendedAction),
      })),
      best: demand.best || source.bestOpportunity || null,
    },
    actions: asArray(source.actions || source.recommendedActions),
    local: {
      query: firstDefined(local.query, local.primaryQuery),
      areas: asArray(local.areas || local.grid || local.rankings),
      insight: firstDefined(local.insight, local.recommendation),
    },
    ai: {
      items: asArray(ai.items || ai.queries || ai.prompts),
      insight: firstDefined(ai.insight, ai.recommendation),
    },
    assets: asArray(assets),
    leads: asArray(leads),
    competitorGap: {
      summary: firstDefined(competitorGap.summary, competitorGap.description),
      items: asArray(competitorGap.items || competitorGap.competitors || competitorGap.gaps),
    },
    setup: source.setup || null,
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

export function syncOrganicIntegration(provider, payload = {}) {
  if (provider !== 'search_console') {
    return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/discover`, { method: 'POST' })
  }
  const end = payload.endDate || new Date().toISOString().slice(0, 10)
  const startDate = new Date(`${end}T00:00:00.000Z`)
  startDate.setUTCDate(startDate.getUTCDate() - 30)
  return requestJson('/api/organic/integrations/search_console/sync', {
    method: 'POST',
    body: JSON.stringify({ startDate: payload.startDate || startDate.toISOString().slice(0, 10), endDate: end, rowLimit: payload.rowLimit || 1000 }),
  })
}

export function configureOrganicIntegration(provider, externalPropertyId) {
  return requestJson(`/api/organic/integrations/${encodeURIComponent(provider)}/resource`, {
    method: 'PUT',
    body: JSON.stringify({ externalPropertyId }),
  })
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
