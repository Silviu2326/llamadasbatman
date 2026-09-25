import { createTranslator, getLocale, localeCode } from '../../i18n'

/** Traductor del idioma vigente para etiquetas que se leen fuera de un componente. */
const tr = (key, vars) => createTranslator(getLocale())(key, vars)

/**
 * Modelo de landings: cómo se leen las campañas con landing, las webs externas
 * guardadas en el navegador y las etiquetas que traducen los diagnósticos del
 * backend a algo que una persona pueda leer.
 */

export const STORAGE_KEY = 'vendrava.external-webs.v1'

// `label` es el nombre comercial de la plantilla (no se traduce); `kindKey`
// es la clave de su categoría en organic.js.
export const TEMPLATE_META = {
  'gym-trial-v1': { label: 'Fitness Boost', kindKey: 'gymKind', color: 'var(--pink)' },
  'pet-grooming-v1': { label: 'Pet Care', kindKey: 'petKind', color: 'var(--warn)' },
  'legal-consult-v1': { label: 'Lex Pro', kindKey: 'legalKind', color: 'var(--warn-soft)' },
  'generic-v1': { label: 'Clarity Pro', kindKey: 'genericKind', color: 'var(--cyan)' },
}
export const templateKind = (templateId, t = tr) => t(`webSeo.model.template.${(TEMPLATE_META[templateId] || TEMPLATE_META['generic-v1']).kindKey}`)

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
    name: assets.title || campaign.name || tr('webSeo.model.untitledLanding'),
    campaignName: campaign.name || tr('webSeo.model.unnamedCampaign'),
    slug: campaign.landingSlug || '',
    templateId,
    status: !hasLanding ? 'none' : campaign.status === 'active' ? 'published' : 'draft',
    leads,
    meetings,
    visits,
    updatedAt: activityDate ? new Date(activityDate).toLocaleDateString(localeCode(getLocale()), { day: 'numeric', month: 'short', year: 'numeric' }) : tr('webSeo.model.noDate'),
    updatedBy: campaign.agent?.name || tr('webSeo.model.vendravaTeam'),
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

// Vocabularios cerrados (mismo que los diagnósticos del backend). Cada uno se
// traduce por clave en organic.js; un valor desconocido se devuelve tal cual.
const STATUS_TONE = { published: 'ok', draft: 'warn', none: '', external: 'cyan' }
export function statusMeta(status, t = tr) {
  return STATUS_TONE[status] !== undefined ? { label: t(`webSeo.model.status.${status}`), tone: STATUS_TONE[status] } : { label: t('webSeo.model.status.unknown'), tone: '' }
}
const labelFor = (group, keys) => (value, t = tr) => (keys.includes(value) ? t(`webSeo.model.${group}.${value}`) : value)
export const confidenceLabel = labelFor('confidence', ['high', 'medium', 'low', 'none'])
export const effortLabel = labelFor('effort', ['low', 'medium', 'high'])
export const fieldLabel = labelFor('field', ['name', 'phone', 'email', 'contactTime', 'consent'])
export const changeTypeLabel = labelFor('changeType', ['optional_field', 'block_order', 'cta_text', 'hero_variant', 'faq', 'pricing', 'testimonial', 'legal_claim', 'contract_terms', 'consent', 'targeting'])
export const variantStatusLabel = labelFor('variant', ['generated', 'pending_approval', 'active', 'winner', 'loser', 'inconclusive', 'discarded'])
export const decisionLabel = labelFor('decision', ['running', 'winner', 'inconclusive', 'insufficient'])
export const autonomyStatusLabel = labelFor('autonomy', ['shadow', 'proposed', 'approved', 'applied', 'rolled_back', 'blocked', 'expired'])

const fieldList = (fields, t) => (Array.isArray(fields) ? fields : []).map(field => fieldLabel(field, t)).join(', ')

/** Traduce un parche de variante o un cambio de autonomía a lenguaje llano. */
export function describeChange(payload, t = tr) {
  if (!payload || typeof payload !== 'object') return t('webSeo.model.change.none')
  const parts = []
  if (payload.hiddenFields?.length) parts.push(t('webSeo.model.change.hidden', { fields: fieldList(payload.hiddenFields, t) }))
  if (payload.optionalFields?.length) parts.push(t('webSeo.model.change.optional', { fields: fieldList(payload.optionalFields, t) }))
  if (payload.fields?.length) parts.push(t('webSeo.model.change.affects', { fields: fieldList(payload.fields, t) }))
  if (payload.title) parts.push(t('webSeo.model.change.title', { value: payload.title }))
  if (payload.offer) parts.push(t('webSeo.model.change.offer', { value: payload.offer }))
  if (payload.leadMagnet) parts.push(t('webSeo.model.change.leadMagnet'))
  if (payload.adCopy) parts.push(t('webSeo.model.change.adCopy'))
  if (payload.text) parts.push(t('webSeo.model.change.text', { value: payload.text }))
  return parts.length ? parts.join(' · ') : t('webSeo.model.change.none')
}

/** Copia de la banda de integridad de landings (landings.md §5). */
export function landingsIntegrityCopy(integrity, t = tr) {
  if (!integrity) {
    return { state: 'unknown', label: t('webSeo.model.integrity.unreadLabel'), detail: t('webSeo.model.integrity.unreadDetail'), coverage: '' }
  }
  const known = ['ready', 'partial', 'stale', 'unreliable'].includes(integrity.state)
  const meta = known
    ? { label: t(`webSeo.model.integrity.${integrity.state}`), detail: t(`webSeo.model.integrity.${integrity.state}Detail`, { measured: integrity.measured, total: integrity.landings }) }
    : { label: t('webSeo.model.integrity.unknown'), detail: '' }
  const coverage = integrity.utmCoverage === null || integrity.utmCoverage === undefined
    ? t('webSeo.model.integrity.noVisits')
    : t('webSeo.model.integrity.coverage', { pct: Math.round(integrity.utmCoverage * 100) })
  return {
    state: integrity.state,
    label: meta.label,
    detail: meta.detail,
    coverage: t('webSeo.model.integrity.attribution', { coverage }) + (integrity.lastComputedAt ? t('webSeo.model.integrity.computed', { date: new Date(integrity.lastComputedAt).toLocaleString(localeCode(getLocale())) }) : t('webSeo.model.integrity.noComputation')),
  }
}
