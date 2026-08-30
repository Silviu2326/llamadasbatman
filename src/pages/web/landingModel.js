import { getLocale, localeCode } from '../../i18n'

/**
 * Modelo de landings: cómo se leen las campañas con landing, las webs externas
 * guardadas en el navegador y las etiquetas que traducen los diagnósticos del
 * backend a algo que una persona pueda leer.
 */

export const STORAGE_KEY = 'vendrava.external-webs.v1'

export const TEMPLATE_META = {
  'gym-trial-v1': { label: 'Fitness Boost', kind: 'Fitness', color: 'var(--pink)' },
  'pet-grooming-v1': { label: 'Pet Care', kind: 'Mascotas', color: 'var(--warn)' },
  'legal-consult-v1': { label: 'Lex Pro', kind: 'Servicios legales', color: 'var(--warn-soft)' },
  'generic-v1': { label: 'Clarity Pro', kind: 'General', color: 'var(--cyan)' },
}

export const FALLBACK_IMAGES = [
  '/assets/landings/landing-hero.png',
  '/assets/campaigns/campaign-signal.png',
]

export function templateMeta(templateId) {
  return TEMPLATE_META[templateId] || TEMPLATE_META['generic-v1']
}

export function readExternalWebs() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.map(item => ({ ...item, leads: null, meetings: null, visits: null })) : []
  } catch {
    return []
  }
}

export function writeExternalWebs(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

/**
 * Una campaña se lee como landing. Las visitas vienen del snapshot de
 * telemetría y de ningún otro sitio (una doble fuente de verdad es lo que
 * advierte landings.md §12); los leads medidos mandan sobre el acumulador de
 * la campaña, que puede no estar mantenido.
 */
export function normalizeCampaign(campaign, index) {
  const assets = campaign.adAssets && typeof campaign.adAssets === 'object' ? campaign.adAssets : {}
  const templateId = assets.landingTemplateId || 'generic-v1'
  const hasLanding = Boolean(campaign.landingSlug)
  const rawVisits = campaign.trackedVisits
  const parsedVisits = rawVisits === null || rawVisits === undefined || rawVisits === '' ? null : Number(rawVisits)
  const visits = Number.isFinite(parsedVisits) && parsedVisits >= 0 ? parsedVisits : null
  const measuredLeads = campaign.snapshotLeads
  const leads = Number.isFinite(measuredLeads) && measuredLeads !== null ? measuredLeads : Math.max(0, Number(campaign.totalLeads) || 0)
  const meetings = Math.max(0, Number(campaign.meetingsScheduled) || 0)
  const activityDate = campaign.updatedAt || campaign.createdAt
  return {
    id: campaign.id,
    sourceId: campaign.id,
    name: assets.title || campaign.name || 'Landing sin título',
    campaignName: campaign.name || 'Campaña sin nombre',
    slug: campaign.landingSlug || '',
    templateId,
    status: !hasLanding ? 'none' : campaign.status === 'active' ? 'published' : 'draft',
    leads,
    meetings,
    visits,
    updatedAt: activityDate ? new Date(activityDate).toLocaleDateString(localeCode(getLocale()), { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha',
    updatedBy: campaign.agent?.name || 'Equipo Vendrava',
    telemetryState: campaign.telemetryState || 'pending',
    landingKey: campaign.landingKey || null,
    image: assets.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    offer: assets.offer || '',
    leadMagnet: assets.leadMagnet || '',
    adCopy: assets.adCopy || campaign.objective || '',
    assets,
    external: false,
  }
}

export function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(localeCode(getLocale())).format(Number(value))
}

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString(localeCode(getLocale()), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function formatMoney(cents) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export function formatRate(rate) {
  if (rate === null || rate === undefined) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function getConversion(item) {
  return Number.isFinite(item.visits) && item.visits > 0 ? (item.leads / item.visits) * 100 : null
}

export function getLink(item) {
  if (item.external) return item.url
  return item.slug ? `${window.location.origin}/l/${item.slug}` : null
}

export const STATUS_META = {
  published: { label: 'Publicada', tone: 'ok' },
  draft: { label: 'Borrador', tone: 'warn' },
  none: { label: 'Sin landing', tone: '' },
  external: { label: 'Web externa', tone: 'cyan' },
}

export const CONFIDENCE_LABEL = { high: 'alta', medium: 'media', low: 'baja', none: 'sin datos' }
export const EFFORT_LABEL = { low: 'bajo', medium: 'medio', high: 'alto' }
// Mismo vocabulario que los diagnósticos del backend.
export const FIELD_LABEL = { name: 'nombre', phone: 'teléfono', email: 'email', contactTime: 'franja horaria', consent: 'consentimiento' }

export const CHANGE_TYPE_LABEL = {
  optional_field: 'Campo del formulario',
  block_order: 'Orden de los bloques',
  cta_text: 'Texto del CTA',
  hero_variant: 'Variante de hero',
  faq: 'FAQ',
  pricing: 'Precios',
  testimonial: 'Testimonio',
  legal_claim: 'Afirmación legal',
  contract_terms: 'Condiciones contractuales',
  consent: 'Consentimiento',
  targeting: 'Segmentación',
}

export const VARIANT_STATUS_LABEL = {
  generated: 'Generada',
  pending_approval: 'Pendiente de aprobación',
  active: 'Activa',
  winner: 'Ganadora',
  loser: 'Perdedora',
  inconclusive: 'Sin conclusión',
  discarded: 'Descartada',
}

export const DECISION_LABEL = {
  running: 'En curso',
  winner: 'Hay ganadora',
  inconclusive: 'Sin conclusión',
  insufficient: 'Sin volumen suficiente',
}

export const AUTONOMY_STATUS_LABEL = {
  shadow: 'En sombra',
  proposed: 'Propuesta',
  approved: 'Aprobada',
  applied: 'Aplicada',
  rolled_back: 'Revertida',
  blocked: 'Bloqueada',
  expired: 'Caducada',
}

const fieldList = fields => (Array.isArray(fields) ? fields : []).map(field => FIELD_LABEL[field] || field).join(', ')

/** Traduce un parche de variante o un cambio de autonomía a lenguaje llano. */
export function describeChange(payload) {
  if (!payload || typeof payload !== 'object') return 'sin cambios'
  const parts = []
  if (payload.hiddenFields?.length) parts.push(`retira ${fieldList(payload.hiddenFields)} del formulario`)
  if (payload.optionalFields?.length) parts.push(`deja de exigir ${fieldList(payload.optionalFields)}`)
  if (payload.fields?.length) parts.push(`afecta a ${fieldList(payload.fields)}`)
  if (payload.title) parts.push(`nuevo titular: «${payload.title}»`)
  if (payload.offer) parts.push(`nueva oferta: «${payload.offer}»`)
  if (payload.leadMagnet) parts.push('nuevo recurso descargable')
  if (payload.adCopy) parts.push('nuevo texto de captación')
  if (payload.text) parts.push(`texto: «${payload.text}»`)
  return parts.length ? parts.join(' · ') : 'sin cambios'
}

/** Copia de la banda de integridad de landings (landings.md §5). */
export function landingsIntegrityCopy(integrity) {
  if (!integrity) {
    return { state: 'unknown', label: 'Telemetría de landings sin leer', detail: 'Los indicadores que dependen de ella aparecen como «sin medición», nunca como cero.', coverage: '' }
  }
  const meta = {
    ready: { label: 'Landings midiendo', detail: 'Todas las landings publicadas están midiendo.' },
    partial: { label: 'Landings con datos parciales', detail: `${integrity.measured} de ${integrity.landings} landings están midiendo. Las demás aún no han recibido visitas desde que la telemetría está activa.` },
    stale: { label: 'Telemetría obsoleta', detail: 'El último cálculo tiene más de dos días. Actualiza antes de tomar decisiones.' },
    unreliable: { label: 'Sin telemetría fiable', detail: 'Ninguna landing ha registrado comportamiento todavía: no hay base para diagnosticar.' },
  }[integrity.state] || { label: 'Estado desconocido', detail: '' }
  const coverage = integrity.utmCoverage === null || integrity.utmCoverage === undefined
    ? 'sin visitas registradas'
    : `${Math.round(integrity.utmCoverage * 100)}% del tráfico con origen identificado`
  return {
    state: integrity.state,
    label: meta.label,
    detail: meta.detail,
    coverage: `Atribución: ${coverage}${integrity.lastComputedAt ? ` · calculado ${new Date(integrity.lastComputedAt).toLocaleString(localeCode(getLocale()))}` : ' · sin cálculo previo'}`,
  }
}
