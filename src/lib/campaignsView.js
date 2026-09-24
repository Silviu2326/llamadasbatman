// Lógica pura de la página Planificar · Campañas (/captacion/planificar):
// resumen, embudo y mezcla de canales con sus estados de medición, validación
// del formulario de campaña, texto de confirmación de activación y lectura del
// error real del backend. Sin React para poder probarla con node --test.
//
// Todo texto visible sale de `t` (createTranslator de src/i18n, claves
// campaigns.*); por defecto se traduce al idioma base para que las funciones
// sigan siendo utilizables sin contexto React.
import { createTranslator, DEFAULT_LOCALE } from '../i18n/index.js'

export const CHANNELS = [
  { id: 'ads', color: 'var(--warn)' },
  { id: 'social', color: 'var(--cyan)' },
  { id: 'prospecting', color: 'var(--success)' },
  { id: 'multichannel', color: 'var(--pink)' },
  { id: 'outbound', color: 'var(--violet)' },
]

const EMPTY = '—'
const defaultFormat = value => String(value)
const defaultT = createTranslator(DEFAULT_LOCALE)

// Clave singular/plural: los mensajes con cantidad tienen `one` y `other`.
function plural(t, key, count, vars = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars })
}

// Suma de todas las filas ya normalizadas (toRow) para tarjetas, embudo y mezcla.
export function summarizeCampaigns(rows = []) {
  const totalLeads = rows.reduce((s, c) => s + (c.totalLeads || 0), 0)
  const contacted = rows.reduce((s, c) => s + (c.contacted || 0), 0)
  const meetingsScheduled = rows.reduce((s, c) => s + (c.meetingsScheduled || 0), 0)
  const budgetTotalCents = rows.reduce((s, c) => s + (c.budgetCents || 0), 0)
  const activeCount = rows.filter(c => c.status === 'active').length
  const channelCounts = rows.reduce((counts, campaign) => {
    counts[campaign.type] = (counts[campaign.type] || 0) + 1
    return counts
  }, {})
  const conversionRate = totalLeads > 0 ? Math.round((meetingsScheduled / totalLeads) * 1000) / 10 : 0
  return { totalLeads, contacted, meetingsScheduled, budgetTotalCents, activeCount, channelCounts, conversionRate, total: rows.length }
}

// Embudo: si el resumen no está medido ('loading' | 'plan' | 'error') no se
// pintan ceros que parecerían actividad real, sino «—» y barras vacías.
// `noteKind` ('' | 'loading' | 'unmeasured') es el estado; `note` su texto.
export function buildFunnelView(stats, statsStatus, format = defaultFormat, t = defaultT) {
  const measured = statsStatus === 'live'
  const max = stats.totalLeads || 1
  const pct = value => `${Math.min(100, Math.round((value / max) * 100))}%`
  const steps = [
    { key: 'leads', label: t('campaigns.funnel.leads'), value: stats.totalLeads, width: '100%', color: 'var(--violet-deep)' },
    { key: 'contacted', label: t('campaigns.funnel.contacted'), value: stats.contacted, width: pct(stats.contacted), color: 'var(--cyan)' },
    { key: 'meetings', label: t('campaigns.funnel.meetings'), value: stats.meetingsScheduled, width: pct(stats.meetingsScheduled), color: 'var(--pink)' },
  ].map(step => measured
    ? { ...step, display: format(step.value) }
    : { ...step, value: null, width: '0%', display: EMPTY })
  const noteKind = measured ? '' : statsStatus === 'loading' ? 'loading' : 'unmeasured'
  return {
    measured,
    steps,
    conversionDisplay: measured ? `${stats.conversionRate}%` : EMPTY,
    noteKind,
    note: noteKind ? t(`campaigns.funnel.${noteKind === 'loading' ? 'calculating' : 'unmeasured'}`) : '',
  }
}

// Mezcla de canales: 'unmeasured' (sin datos fiables), 'empty' (medido y sin
// campañas) o 'ready' con segmentos para el conic-gradient.
export function buildChannelMixView(stats, statsStatus, t = defaultT) {
  if (statsStatus !== 'live') {
    const noteKind = statsStatus === 'loading' ? 'loading' : 'unmeasured'
    return { state: 'unmeasured', noteKind, note: t(`campaigns.funnel.${noteKind === 'loading' ? 'calculating' : 'unmeasured'}`), channels: [], gradient: '' }
  }
  if (!stats.total) return { state: 'empty', noteKind: '', note: '', channels: [], gradient: '' }
  let cursor = 0
  const channels = CHANNELS
    .map(channel => ({ ...channel, label: t(`campaigns.channels.${channel.id}`), count: stats.channelCounts?.[channel.id] || 0 }))
    .filter(channel => channel.count > 0)
    .map(channel => {
      const start = cursor
      cursor += (channel.count / stats.total) * 100
      return { ...channel, start, end: cursor, pct: Math.round((channel.count / stats.total) * 100) }
    })
  return {
    state: 'ready',
    noteKind: '',
    note: '',
    channels,
    gradient: `conic-gradient(${channels.map(c => `${c.color} ${c.start}% ${c.end}%`).join(', ')})`,
  }
}

// Validación del formulario de crear/editar campaña. `budget` es el texto del
// input en euros; se devuelve el payload listo para POST/PUT.
// En edición (`editing`) un presupuesto vacío se envía como null para borrarlo.
// `field` indica qué campo falló ('name' | 'objective' | 'budget') para aria-invalid.
export function validateCampaignForm({ name = '', objective = '', budget = '' } = {}, { editing = false, t = defaultT } = {}) {
  const fail = (field, key) => ({ ok: false, field, error: t(`campaigns.validation.${key}`) })
  const trimmedName = String(name).trim()
  if (!trimmedName) return fail('name', 'nameRequired')
  if (trimmedName.length > 140) return fail('name', 'nameTooLong')
  const trimmedObjective = String(objective).trim()
  if (trimmedObjective.length > 2000) return fail('objective', 'objectiveTooLong')

  const rawBudget = String(budget ?? '').trim().replace(',', '.')
  let budgetCents
  if (rawBudget === '') {
    budgetCents = editing ? null : undefined
  } else {
    const euros = Number(rawBudget)
    if (!Number.isFinite(euros)) return fail('budget', 'budgetNumber')
    if (euros < 0) return fail('budget', 'budgetNegative')
    budgetCents = Math.round(euros * 100)
    if (budgetCents > 100_000_000) return fail('budget', 'budgetMax')
  }

  const payload = { name: trimmedName }
  if (trimmedObjective) payload.objective = trimmedObjective
  else if (editing) payload.objective = null
  if (budgetCents !== undefined) payload.budgetCents = budgetCents
  return { ok: true, field: '', error: '', payload }
}

// Texto del diálogo que confirma la activación (encola llamadas reales).
export function startConfirmation(preview, t = defaultT) {
  const name = preview?.name || t('campaigns.start.fallbackName')
  const count = Math.max(0, Number(preview?.eligibleLeads) || 0)
  const withoutPhone = Math.max(0, Number(preview?.newLeadsWithoutPhone) || 0)
  const lines = []
  if (count === 0) lines.push(t('campaigns.start.none', { name }))
  else lines.push(plural(t, 'campaigns.start.some', count, { name }))
  if (withoutPhone > 0) lines.push(plural(t, 'campaigns.start.withoutPhone', withoutPhone))
  // Desglose de motivos del backend (start-preview.breakdown): lo que la
  // campaña dejará fuera aunque se active, y por qué.
  lines.push(...breakdownLines(preview?.breakdown, t))
  if (!preview?.agent) lines.push(t('campaigns.start.noAgent'))
  // Publicar un agente lo deja en lifecycleStatus 'active' (agents.service).
  else if (preview.agent.lifecycleStatus && preview.agent.lifecycleStatus !== 'active') lines.push(t('campaigns.start.agentNotPublished', { name: preview.agent.name }))
  return {
    title: count > 0 ? plural(t, 'campaigns.start.title', count) : t('campaigns.start.titleNone'),
    message: lines.join(' '),
    confirmText: count > 0 ? t('campaigns.start.confirm', { count }) : t('campaigns.start.confirmNone'),
    count,
  }
}

const BREAKDOWN_KEYS = ['optOut', 'missingConsent', 'invalidPhone', 'maxAttempts']

// Frases del desglose de la vista previa; vacío si no hay nada que excluir.
export function breakdownLines(breakdown, t = defaultT) {
  if (!breakdown || typeof breakdown !== 'object') return []
  const parts = BREAKDOWN_KEYS
    .map(key => [key, Math.max(0, Number(breakdown[key]) || 0)])
    .filter(([, n]) => n > 0)
    .map(([key, n]) => t(`campaigns.start.breakdown.${key}`, { count: n }))
  if (!parts.length) return []
  return [t('campaigns.start.exclusions', { parts: parts.join(', ') })]
}

// Lee el mensaje de error real del backend (`error` o `message`) y cae al
// texto por defecto si el cuerpo no es JSON o no trae nada legible.
export async function readApiError(res, fallback) {
  try {
    const body = await res.clone().json()
    const detail = [body?.error, body?.message].find(value => typeof value === 'string' && value.trim())
    if (detail) return detail.trim()
  } catch {
    // cuerpo vacío o no JSON: se usa el texto por defecto
  }
  return fallback
}
