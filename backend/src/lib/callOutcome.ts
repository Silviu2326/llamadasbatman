/**
 * Vocabulario cerrado de `Call.outcome`.
 *
 * `Call.outcome` es una columna `String` libre, así que nada impedía que cada
 * lector inventara su propia lista. El resultado eran filtros y métricas que
 * contaban cero para siempre: `agents.service.ts` medía éxito con `interested`,
 * el front filtraba por `rejected` y `callback`, y ninguno de esos tres valores
 * llega nunca a la base de datos.
 *
 * Quién escribe realmente en esta columna:
 *
 * - `voice/telephony/mediaStream.ts` (OUTCOME_MAP) tras una conversación real:
 *   `meeting_scheduled`, `callback_requested`, `not_interested`, `none`.
 * - `voice/telephony/amdService.ts` cuando contesta una máquina, con
 *   `status: 'no_answer'`: `voicemail`, `ivr`, `fax_or_noise`, `unknown`.
 * - `services/calls.service.ts` usa `none` como valor por defecto.
 *
 * El espejo de este módulo para la interfaz vive en `src/lib/callOutcome.js`.
 * Los dos ficheros deben cambiar a la vez: no hay paquete compartido entre el
 * backend y el frontend.
 */

export const CALL_OUTCOME = {
  /** Se agendó una reunión durante la llamada (`demo_agendada` en el motor). */
  MEETING_SCHEDULED: 'meeting_scheduled',
  /**
   * La llamada se transfirió a una persona (`transferido` en el motor). El
   * nombre es heredado y engañoso: no es "que me llamen luego", es que el lead
   * pidió hablar con alguien del equipo. Cuenta como cualificación.
   */
  TRANSFERRED_TO_HUMAN: 'callback_requested',
  /** El lead habló y rechazó, o pidió no ser contactado (`rechazado`/`optout`). */
  NOT_INTERESTED: 'not_interested',
  /**
   * El lead conversó y mostró interés sin llegar a agendar. Hoy el motor de
   * voz en vivo no lo produce — sus estados internos no contemplan este caso —
   * pero sí puede llegar por `POST /api/calls/ingest` desde un proveedor
   * externo, y es la señal que ya leen `agents.service` y `pipeline.service`.
   */
  INTERESTED: 'interested',
  /** Llamada sin resultado registrado todavía. */
  NONE: 'none',
  /** Contestó un buzón de voz. */
  VOICEMAIL: 'voicemail',
  /** Contestó una centralita automática. */
  IVR: 'ivr',
  /** Fax o ruido: no hubo interlocutor. */
  FAX_OR_NOISE: 'fax_or_noise',
  /** La detección de máquina no pudo clasificar la respuesta. */
  UNKNOWN: 'unknown',
} as const

export type CallOutcome = (typeof CALL_OUTCOME)[keyof typeof CALL_OUTCOME]

export const CALL_OUTCOMES = Object.values(CALL_OUTCOME) as readonly CallOutcome[]

/**
 * Resultados que cualifican un lead — la definición de "resultado de llamada
 * válido" de `docs/xarly/ads.md` §4.4.
 *
 * Deliberadamente NO incluye `interested` de forma implícita por ser positivo:
 * está aquí porque el lead conversó y expresó intención. Lo que queda fuera es
 * todo aquello donde no hubo conversación con una persona.
 */
export const QUALIFYING_CALL_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.TRANSFERRED_TO_HUMAN,
  CALL_OUTCOME.INTERESTED,
] as const

/** Hubo conversación y el lead dijo que no: contactado, no cualificado. */
export const REJECTING_CALL_OUTCOMES = [CALL_OUTCOME.NOT_INTERESTED] as const

/**
 * No hubo conversación con una persona. Importante para el embudo: una campaña
 * cuyos leads solo alcanzan buzones de voz no tiene un problema de anuncio,
 * tiene un problema de contactabilidad.
 */
export const NO_CONTACT_CALL_OUTCOMES = [
  CALL_OUTCOME.NONE,
  CALL_OUTCOME.VOICEMAIL,
  CALL_OUTCOME.IVR,
  CALL_OUTCOME.FAX_OR_NOISE,
  CALL_OUTCOME.UNKNOWN,
] as const

/**
 * Valores que otras versiones del producto escribieron o leyeron y que siguen
 * apareciendo en integraciones antiguas. Se normalizan en la ingesta para que
 * un proveedor externo no reintroduzca vocabulario muerto.
 */
const LEGACY_OUTCOME_ALIASES: Record<string, CallOutcome> = {
  // Estados internos del motor, por si un cliente los envía sin mapear.
  demo_agendada: CALL_OUTCOME.MEETING_SCHEDULED,
  transferido: CALL_OUTCOME.TRANSFERRED_TO_HUMAN,
  callback: CALL_OUTCOME.TRANSFERRED_TO_HUMAN,
  rechazado: CALL_OUTCOME.NOT_INTERESTED,
  rejected: CALL_OUTCOME.NOT_INTERESTED,
  optout: CALL_OUTCOME.NOT_INTERESTED,
  opt_out: CALL_OUTCOME.NOT_INTERESTED,
  en_curso: CALL_OUTCOME.NONE,
  // `qualified` era el valor que leía voiceExperiment.ts; nunca se escribió.
  qualified: CALL_OUTCOME.INTERESTED,
}

export function isValidCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === 'string' && (CALL_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Devuelve el valor canónico, o `null` si no se reconoce. `null` significa
 * "no sé qué es esto", nunca se degrada silenciosamente a `none`: perder el
 * resultado de una llamada falsea el embudo entero.
 */
export function normalizeCallOutcome(value: unknown): CallOutcome | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim().toLowerCase()
  if (!candidate) return null
  if (isValidCallOutcome(candidate)) return candidate
  return LEGACY_OUTCOME_ALIASES[candidate] ?? null
}

/** ¿Este resultado de llamada cualifica al lead? */
export function isQualifyingOutcome(value: unknown): boolean {
  const outcome = normalizeCallOutcome(value)
  return outcome != null && (QUALIFYING_CALL_OUTCOMES as readonly string[]).includes(outcome)
}

/** ¿Hubo conversación con una persona, sea cual sea el desenlace? */
export function isHumanConversation(value: unknown): boolean {
  const outcome = normalizeCallOutcome(value)
  return outcome != null && !(NO_CONTACT_CALL_OUTCOMES as readonly string[]).includes(outcome)
}
