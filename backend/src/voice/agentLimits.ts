import { z } from 'zod'

/**
 * Límites operativos de un agente: máximo de llamadas al día, días activos,
 * franja horaria y zona horaria. Viven en `Agent.settings.operationalLimits`
 * (sin columna propia) y los consume `leadCallDispatch` antes de marcar.
 *
 * El módulo es puro: recibe el agente, la hora y las llamadas ya hechas hoy,
 * y devuelve si se puede marcar ahora y, si no, cuándo se abre la siguiente
 * ventana. Nada de Prisma aquí para que sea trivial de probar y de llamar
 * desde el worker.
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = typeof WEEKDAYS[number]

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value)

function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true } catch { return false }
}

export const agentOperationalLimitsSchema = z.object({
  maxCallsPerDay: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).optional()),
  activeDays: z.preprocess(emptyToUndefined, z.array(z.enum(WEEKDAYS)).max(7).optional()),
  schedule: z.preprocess(emptyToUndefined, z.object({
    start: z.string().regex(TIME_PATTERN, 'Usa el formato HH:MM'),
    end: z.string().regex(TIME_PATTERN, 'Usa el formato HH:MM'),
  }).refine(value => value.start < value.end, { message: 'La hora de inicio debe ser anterior a la de fin' }).optional()),
  timezone: z.preprocess(emptyToUndefined, z.string().trim().max(64).refine(validTimeZone, { message: 'Zona horaria no reconocida' }).optional()),
})

export type AgentOperationalLimits = z.infer<typeof agentOperationalLimitsSchema>

export type OperationalLimitReason = 'daily_limit' | 'inactive_day' | 'outside_schedule' | 'monthly_minutes'

export type OperationalLimitCheck = {
  allowed: boolean
  reason?: OperationalLimitReason
  /** Próximo instante en el que el agente vuelve a poder marcar, si se sabe. */
  nextWindow?: Date
  timeZone: string
}

export const OPERATIONAL_LIMIT_LABELS: Record<OperationalLimitReason, string> = {
  daily_limit: 'El agente ya ha hecho el máximo de llamadas de hoy.',
  inactive_day: 'Hoy no es un día activo para este agente.',
  outside_schedule: 'Fuera del horario de llamadas del agente.',
  monthly_minutes: 'El agente ha agotado sus minutos del mes.',
}

export const DEFAULT_AGENT_TIME_ZONE = 'Europe/Madrid'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Lee los límites del agente; una configuración inválida o antigua cuenta como sin límites. */
export function readOperationalLimits(settings: unknown): AgentOperationalLimits {
  const parsed = agentOperationalLimitsSchema.safeParse(record(record(settings).operationalLimits))
  return parsed.success ? parsed.data : {}
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: Weekday }

const WEEKDAY_FROM_INTL: Record<string, Weekday> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' }

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return {
    year: Number(value('year')), month: Number(value('month')), day: Number(value('day')),
    hour: Number(value('hour')) % 24, minute: Number(value('minute')),
    weekday: WEEKDAY_FROM_INTL[value('weekday')] ?? 'mon',
  }
}

function offsetMs(date: Date, timeZone: string) {
  const local = localParts(date, timeZone)
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000
  return asUtc - truncated
}

/** Instante UTC que corresponde a una hora local (año, mes, día, HH:MM) de la zona indicada. */
export function zonedTimeToUtc(year: number, month: number, day: number, time: string, timeZone: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = new Date(guess - offsetMs(new Date(guess), timeZone))
  // Segunda pasada por si el primer cálculo cae al otro lado de un cambio de hora.
  return new Date(guess - offsetMs(first, timeZone))
}

function addDays(parts: LocalParts, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/** Primer instante, hoy o en los próximos 7 días, en el que día y franja vuelven a permitir llamar. */
function nextOpening(now: Date, timeZone: string, limits: AgentOperationalLimits, skipToday: boolean): Date | undefined {
  const today = localParts(now, timeZone)
  const start = limits.schedule?.start ?? '00:00'
  const activeDays = limits.activeDays?.length ? limits.activeDays : [...WEEKDAYS]
  for (let offset = skipToday ? 1 : 0; offset <= 7; offset++) {
    const weekday = WEEKDAYS[(WEEKDAYS.indexOf(today.weekday) + offset) % 7]
    if (!activeDays.includes(weekday)) continue
    const day = addDays(today, offset)
    const candidate = zonedTimeToUtc(day.year, day.month, day.day, start, timeZone)
    if (candidate > now) return candidate
  }
  return undefined
}

export function checkAgentOperationalLimits(
  agent: { settings?: unknown; monthlyMinuteLimit?: number | null },
  options: { now?: Date; callsToday?: number; timeZone?: string; minutesThisMonth?: number } = {},
): OperationalLimitCheck {
  const now = options.now ?? new Date()
  const limits = readOperationalLimits(agent.settings)
  const timeZone = limits.timezone ?? (options.timeZone && validTimeZone(options.timeZone) ? options.timeZone : DEFAULT_AGENT_TIME_ZONE)
  const local = localParts(now, timeZone)

  if (agent.monthlyMinuteLimit != null && options.minutesThisMonth != null && options.minutesThisMonth >= agent.monthlyMinuteLimit) {
    return { allowed: false, reason: 'monthly_minutes', timeZone }
  }
  if (limits.activeDays?.length && !limits.activeDays.includes(local.weekday)) {
    return { allowed: false, reason: 'inactive_day', nextWindow: nextOpening(now, timeZone, limits, true), timeZone }
  }
  if (limits.schedule) {
    const minutes = local.hour * 60 + local.minute
    if (minutes < minutesOf(limits.schedule.start) || minutes >= minutesOf(limits.schedule.end)) {
      return { allowed: false, reason: 'outside_schedule', nextWindow: nextOpening(now, timeZone, limits, minutes >= minutesOf(limits.schedule.end)), timeZone }
    }
  }
  if (limits.maxCallsPerDay != null && (options.callsToday ?? 0) >= limits.maxCallsPerDay) {
    return { allowed: false, reason: 'daily_limit', nextWindow: nextOpening(now, timeZone, limits, true), timeZone }
  }
  return { allowed: true, timeZone }
}
