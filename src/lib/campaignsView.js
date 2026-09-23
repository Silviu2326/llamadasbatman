// Lógica pura de la página Planificar · Campañas (/captacion/planificar):
// resumen, embudo y mezcla de canales con sus estados de medición, validación
// del formulario de campaña, texto de confirmación de activación y lectura del
// error real del backend. Sin React para poder probarla con node --test.

export const CHANNELS = [
  { id: 'ads', label: 'Publicidad', color: 'var(--warn)' },
  { id: 'social', label: 'Redes sociales', color: 'var(--cyan)' },
  { id: 'prospecting', label: 'Prospección', color: 'var(--success)' },
  { id: 'multichannel', label: 'Multicanal', color: 'var(--pink)' },
  { id: 'outbound', label: 'Llamadas outbound', color: 'var(--violet)' },
]

const EMPTY = '—'
const defaultFormat = value => String(value)

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
export function buildFunnelView(stats, statsStatus, format = defaultFormat) {
  const measured = statsStatus === 'live'
  const max = stats.totalLeads || 1
  const pct = value => `${Math.min(100, Math.round((value / max) * 100))}%`
  const steps = [
    { key: 'leads', label: 'Leads', value: stats.totalLeads, width: '100%', color: 'var(--violet-deep)' },
    { key: 'contacted', label: 'Contactados', value: stats.contacted, width: pct(stats.contacted), color: 'var(--cyan)' },
    { key: 'meetings', label: 'Reuniones agendadas', value: stats.meetingsScheduled, width: pct(stats.meetingsScheduled), color: 'var(--pink)' },
  ].map(step => measured
    ? { ...step, display: format(step.value) }
    : { ...step, value: null, width: '0%', display: EMPTY })
  return {
    measured,
    steps,
    conversionDisplay: measured ? `${stats.conversionRate}%` : EMPTY,
    note: measured ? '' : statsStatus === 'loading' ? 'Calculando…' : 'Sin medición',
  }
}

// Mezcla de canales: 'unmeasured' (sin datos fiables), 'empty' (medido y sin
// campañas) o 'ready' con segmentos para el conic-gradient.
export function buildChannelMixView(stats, statsStatus) {
  if (statsStatus !== 'live') {
    return { state: 'unmeasured', note: statsStatus === 'loading' ? 'Calculando…' : 'Sin medición', channels: [], gradient: '' }
  }
  if (!stats.total) return { state: 'empty', note: '', channels: [], gradient: '' }
  let cursor = 0
  const channels = CHANNELS
    .map(channel => ({ ...channel, count: stats.channelCounts?.[channel.id] || 0 }))
    .filter(channel => channel.count > 0)
    .map(channel => {
      const start = cursor
      cursor += (channel.count / stats.total) * 100
      return { ...channel, start, end: cursor, pct: Math.round((channel.count / stats.total) * 100) }
    })
  return {
    state: 'ready',
    note: '',
    channels,
    gradient: `conic-gradient(${channels.map(c => `${c.color} ${c.start}% ${c.end}%`).join(', ')})`,
  }
}

// Validación del formulario de crear/editar campaña. `budget` es el texto del
// input en euros; se devuelve el payload listo para POST/PUT.
// En edición (`editing`) un presupuesto vacío se envía como null para borrarlo.
export function validateCampaignForm({ name = '', objective = '', budget = '' } = {}, { editing = false } = {}) {
  const trimmedName = String(name).trim()
  if (!trimmedName) return { ok: false, error: 'Ponle un nombre a la campaña para continuar.' }
  if (trimmedName.length > 140) return { ok: false, error: 'El nombre no puede superar 140 caracteres.' }
  const trimmedObjective = String(objective).trim()
  if (trimmedObjective.length > 2000) return { ok: false, error: 'El objetivo no puede superar 2.000 caracteres.' }

  const rawBudget = String(budget ?? '').trim().replace(',', '.')
  let budgetCents
  if (rawBudget === '') {
    budgetCents = editing ? null : undefined
  } else {
    const euros = Number(rawBudget)
    if (!Number.isFinite(euros)) return { ok: false, error: 'El presupuesto debe ser un número.' }
    if (euros < 0) return { ok: false, error: 'El presupuesto no puede ser negativo.' }
    budgetCents = Math.round(euros * 100)
    if (budgetCents > 100_000_000) return { ok: false, error: 'El presupuesto máximo es 1.000.000 €.' }
  }

  const payload = { name: trimmedName }
  if (trimmedObjective) payload.objective = trimmedObjective
  else if (editing) payload.objective = null
  if (budgetCents !== undefined) payload.budgetCents = budgetCents
  return { ok: true, error: '', payload }
}

// Texto del diálogo que confirma la activación (encola llamadas reales).
export function startConfirmation(preview) {
  const name = preview?.name || 'esta campaña'
  const count = Math.max(0, Number(preview?.eligibleLeads) || 0)
  const withoutPhone = Math.max(0, Number(preview?.newLeadsWithoutPhone) || 0)
  const lines = []
  if (count === 0) {
    lines.push(`Al activar «${name}» no se encolará ninguna llamada: no hay leads nuevos con teléfono.`)
  } else {
    lines.push(`Al activar «${name}» se encolará${count === 1 ? '' : 'n'} ${count} llamada${count === 1 ? '' : 's'} telefónica${count === 1 ? '' : 's'} real${count === 1 ? '' : 'es'} a leads nuevos con teléfono.`)
  }
  if (withoutPhone > 0) lines.push(`${withoutPhone} lead${withoutPhone === 1 ? '' : 's'} nuevo${withoutPhone === 1 ? '' : 's'} sin teléfono no se llamará${withoutPhone === 1 ? '' : 'n'}.`)
  if (!preview?.agent) lines.push('La campaña no tiene agente asignado: las llamadas no saldrán hasta que asignes uno.')
  // Publicar un agente lo deja en lifecycleStatus 'active' (agents.service).
  else if (preview.agent.lifecycleStatus && preview.agent.lifecycleStatus !== 'active') lines.push(`El agente ${preview.agent.name} no está publicado: las llamadas no saldrán hasta publicarlo.`)
  return {
    title: count > 0 ? `Activar y encolar ${count} llamada${count === 1 ? '' : 's'}` : 'Activar campaña',
    message: lines.join(' '),
    confirmText: count > 0 ? `Activar y llamar (${count})` : 'Activar',
    count,
  }
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
