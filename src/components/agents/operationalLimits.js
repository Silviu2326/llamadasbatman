// Límites operativos del agente: mismo contrato que
// backend/src/voice/agentLimits.ts (`Agent.settings.operationalLimits`).
// El worker los aplica antes de marcar; aquí solo se editan.
export const WEEKDAYS = [
  ['mon', 'Lun'], ['tue', 'Mar'], ['wed', 'Mié'], ['thu', 'Jue'], ['fri', 'Vie'], ['sat', 'Sáb'], ['sun', 'Dom'],
]

export const TIME_ZONES = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/New_York', 'UTC']

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_CODES = WEEKDAYS.map(([code]) => code)

export const EMPTY_LIMITS = { maxCallsPerDay: '', activeDays: [], scheduleEnabled: false, start: '09:00', end: '18:00', timezone: '' }

/** Estado editable a partir de `settings.operationalLimits` (ignora los campos antiguos en texto libre). */
export function limitsFromSettings(settings) {
  const limits = settings?.operationalLimits && typeof settings.operationalLimits === 'object' ? settings.operationalLimits : {}
  const max = Number(limits.maxCallsPerDay)
  const schedule = limits.schedule && typeof limits.schedule === 'object' && TIME.test(limits.schedule.start || '') && TIME.test(limits.schedule.end || '') ? limits.schedule : null
  return {
    maxCallsPerDay: Number.isInteger(max) && max > 0 ? String(max) : '',
    activeDays: Array.isArray(limits.activeDays) ? limits.activeDays.filter(day => DAY_CODES.includes(day)) : [],
    scheduleEnabled: Boolean(schedule),
    start: schedule?.start || '09:00',
    end: schedule?.end || '18:00',
    timezone: typeof limits.timezone === 'string' ? limits.timezone : '',
  }
}

/** Objeto que viaja en `settings.operationalLimits`; vacío significa sin límites. */
export function limitsToSettings(form) {
  const max = Number(form.maxCallsPerDay)
  const result = {}
  if (Number.isInteger(max) && max > 0) result.maxCallsPerDay = max
  if (form.activeDays?.length && form.activeDays.length < 7) result.activeDays = form.activeDays
  if (form.scheduleEnabled && TIME.test(form.start) && TIME.test(form.end) && form.start < form.end) result.schedule = { start: form.start, end: form.end }
  if (form.timezone) result.timezone = form.timezone
  return result
}

/** Texto corto para resumir los límites en la ficha. */
export function describeLimits(form) {
  const parts = []
  if (form.maxCallsPerDay) parts.push(`${form.maxCallsPerDay} llamadas/día`)
  if (form.activeDays?.length && form.activeDays.length < 7) parts.push(form.activeDays.map(code => WEEKDAYS.find(([value]) => value === code)?.[1]).join(', '))
  if (form.scheduleEnabled) parts.push(`${form.start}–${form.end}`)
  if (form.timezone) parts.push(form.timezone)
  return parts.length ? parts.join(' · ') : 'Sin límites: llama cuando la campaña y el cumplimiento lo permitan.'
}
