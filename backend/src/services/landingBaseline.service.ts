import { prisma } from '../lib/prisma'

/**
 * Línea base de una landing — docs/xarly/landings.md §3.4.
 *
 * "Degradada frente a línea base" solo significa algo si la comparación tiene
 * reglas explícitas. Las de aquí:
 *
 * - ventana habitual: últimos 28 días maduros, comparados con los últimos 7;
 * - mínimo de sesiones antes de emitir un veredicto (sin volumen no hay
 *   diagnóstico, hay "sin datos suficientes");
 * - **ajuste por mezcla de tráfico**: si el origen cambia mucho, se compara
 *   contra la línea base *por canal*, no contra la global. Bajar del 4% al 2%
 *   porque empezó a entrar tráfico frío de Meta no es una landing estropeada,
 *   y culparla de ello es el error más caro que puede cometer esta página.
 *
 * Toda línea base declara cuál se usó: `scope` viaja hasta la interfaz.
 */

/** Ventana de referencia y ventana reciente que se compara contra ella. */
export const BASELINE_WINDOW_DAYS = 28
export const RECENT_WINDOW_DAYS = 7

/**
 * Sesiones mínimas en cada lado de la comparación. Con menos, la diferencia
 * entre 2% y 4% es una sesión de más o de menos.
 */
const MIN_SESSIONS_PER_SIDE = 60

/**
 * Cuánto tiene que cambiar la mezcla de canales para que la línea base global
 * deje de ser comparable. 25 puntos porcentuales de diferencia en el reparto de
 * orígenes es un cambio de tráfico, no un cambio de landing.
 */
const MIX_SHIFT_THRESHOLD = 0.25

const DAY_MS = 24 * 60 * 60 * 1000

export type BaselineScope = 'landing' | 'channel'

export interface BaselineWindow {
  sessions: number
  leads: number
  conversion: number | null
  scrollReach: number | null
  ctaReach: number | null
  formStartRate: number | null
}

export interface LandingBaseline {
  landingKey: string
  scope: BaselineScope
  /** Canal al que se refiere la línea base cuando `scope` es 'channel'. */
  channel: string | null
  baseline: BaselineWindow
  recent: BaselineWindow
  /** Diferencia relativa de conversión: -0.38 = 38% por debajo de su base. */
  delta: number | null
  /** Motivo por el que no hay veredicto, cuando lo hay. */
  insufficientReason: string | null
  /** Cuánto se movió la mezcla de canales entre ventanas. */
  mixShift: number | null
}

interface RollupRow {
  day: Date
  source: string
  /** Cadena vacía = tráfico fuera de cualquier experimento. */
  variantId: string
  sessions: number
  views: number
  scroll50: number
  ctaClicks: number
  formStarts: number
  formSubmits: number
}

/**
 * Tráfico de la versión principal: el que no está dentro de un experimento.
 *
 * §3.4 pide excluir los períodos con experimento activo al evaluar la versión
 * principal, y por un motivo concreto: mientras el experimento corre, la mitad
 * de los visitantes está viendo otra página. Mezclarlos haría que la landing
 * compitiera contra su propia variante y emitiera un «degradada» que en
 * realidad describe el experimento, no la landing.
 */
const mainVersionOnly = (rows: RollupRow[]) => rows.filter(row => !row.variantId)

function emptyWindow(): BaselineWindow {
  return { sessions: 0, leads: 0, conversion: null, scrollReach: null, ctaReach: null, formStartRate: null }
}

function summarize(rows: RollupRow[]): BaselineWindow {
  const sessions = rows.reduce((total, row) => total + row.sessions, 0)
  const leads = rows.reduce((total, row) => total + row.formSubmits, 0)
  if (!sessions) return { ...emptyWindow(), leads }

  const rate = (value: number) => Number((value / sessions).toFixed(4))
  return {
    sessions,
    leads,
    conversion: rate(leads),
    // Alcance del hero: qué parte de las sesiones pasó del primer pantallazo.
    scrollReach: rate(rows.reduce((total, row) => total + row.scroll50, 0)),
    ctaReach: rate(rows.reduce((total, row) => total + row.ctaClicks, 0)),
    formStartRate: rate(rows.reduce((total, row) => total + row.formStarts, 0)),
  }
}

/** Reparto de sesiones por canal, para detectar cambios de mezcla. */
export function channelMix(rows: RollupRow[]) {
  const total = rows.reduce((sum, row) => sum + row.sessions, 0)
  const mix = new Map<string, number>()
  if (!total) return mix
  for (const row of rows) {
    mix.set(row.source, (mix.get(row.source) ?? 0) + row.sessions / total)
  }
  return mix
}

/**
 * Distancia entre dos repartos de canales (mitad de la distancia L1): 0 = misma
 * mezcla, 1 = mezclas sin nada en común.
 */
export function mixDistance(before: Map<string, number>, after: Map<string, number>) {
  if (!before.size || !after.size) return null
  const channels = new Set([...before.keys(), ...after.keys()])
  let distance = 0
  for (const channel of channels) {
    distance += Math.abs((before.get(channel) ?? 0) - (after.get(channel) ?? 0))
  }
  return Number((distance / 2).toFixed(4))
}

/** Canal dominante de la ventana reciente: el que manda en el diagnóstico. */
function dominantChannel(rows: RollupRow[]) {
  const mix = channelMix(rows)
  let best: { channel: string; share: number } | null = null
  for (const [channel, share] of mix) {
    if (!best || share > best.share) best = { channel, share }
  }
  return best?.channel ?? null
}

/**
 * Calcula la línea base de una landing y la compara con la ventana reciente.
 *
 * Devuelve siempre un objeto: cuando no hay volumen, `delta` es `null` y
 * `insufficientReason` explica por qué. Un diagnóstico sin datos suficientes se
 * comunica como tal, nunca como un veredicto suave.
 */
export async function computeBaseline(landingKey: string, now = new Date()): Promise<LandingBaseline> {
  const recentFrom = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS)
  const baselineFrom = new Date(now.getTime() - BASELINE_WINDOW_DAYS * DAY_MS)

  const allRows = await prisma.landingDailyRollup.findMany({
    where: { landingKey, day: { gte: baselineFrom } },
    select: {
      day: true,
      source: true,
      variantId: true,
      sessions: true,
      views: true,
      scroll50: true,
      ctaClicks: true,
      formStarts: true,
      formSubmits: true,
    },
  })

  const rows = mainVersionOnly(allRows)
  // Si todo el tráfico del período está dentro de un experimento, no hay
  // versión principal que evaluar, y decirlo es más honesto que devolver
  // "0 sesiones".
  const experimentTraffic = allRows.length - rows.length

  // La ventana de referencia excluye los días recientes: comparar los últimos 7
  // días contra un período que los contiene diluye cualquier caída.
  const baselineRows = rows.filter(row => row.day < recentFrom)
  const recentRows = rows.filter(row => row.day >= recentFrom)

  const mixShift = mixDistance(channelMix(baselineRows), channelMix(recentRows))
  const channel = dominantChannel(recentRows)

  // Si la mezcla se movió mucho, se compara canal contra canal.
  const useChannel = mixShift !== null && mixShift >= MIX_SHIFT_THRESHOLD && channel !== null
  const scope: BaselineScope = useChannel ? 'channel' : 'landing'
  const filtered = (rows: RollupRow[]) => useChannel ? rows.filter(row => row.source === channel) : rows

  const baseline = summarize(filtered(baselineRows))
  const recent = summarize(filtered(recentRows))

  let insufficientReason: string | null = null
  if (!rows.length && experimentTraffic) {
    insufficientReason = 'Experimento activo: la línea base de la versión principal se calcula fuera de los experimentos, así que no hay veredicto mientras dure.'
  } else if (baseline.sessions < MIN_SESSIONS_PER_SIDE) {
    insufficientReason = `Sin línea base: ${baseline.sessions} sesiones en el período de referencia (mínimo ${MIN_SESSIONS_PER_SIDE}).`
  } else if (recent.sessions < MIN_SESSIONS_PER_SIDE) {
    insufficientReason = `Sin datos recientes suficientes: ${recent.sessions} sesiones en los últimos ${RECENT_WINDOW_DAYS} días (mínimo ${MIN_SESSIONS_PER_SIDE}).`
  }

  const delta = insufficientReason || !baseline.conversion || recent.conversion === null
    ? null
    : Number(((recent.conversion - baseline.conversion) / baseline.conversion).toFixed(4))

  return {
    landingKey,
    scope,
    channel: useChannel ? channel : null,
    baseline,
    recent,
    delta,
    insufficientReason,
    mixShift,
  }
}

/** Frase corta que explica qué línea base se usó, para mostrarla junto al veredicto. */
export function describeBaseline(baseline: LandingBaseline) {
  if (baseline.scope === 'channel') {
    return `línea base del canal «${baseline.channel}» (la mezcla de tráfico cambió un ${Math.round((baseline.mixShift ?? 0) * 100)}%)`
  }
  return 'línea base global de la landing'
}
