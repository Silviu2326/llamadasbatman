// Espejo de `backend/src/lib/callOutcome.ts`. No hay paquete compartido entre
// el frontend y el backend, así que los dos ficheros cambian a la vez.
//
// Antes de existir esto, tres pantallas etiquetaban `rejected` y `callback`,
// valores que el backend no escribe nunca: el filtro "Seguimiento" de Llamadas
// enviaba `outcome=callback` a la API y devolvía siempre cero resultados.

export const CALL_OUTCOME = {
  MEETING_SCHEDULED: 'meeting_scheduled',
  // El lead pidió hablar con una persona del equipo (cualifica).
  HUMAN_REQUESTED: 'human_requested',
  // El lead pidió que le llamen en otro momento concreto (con callbackAt).
  CALLBACK_REQUESTED: 'callback_requested',
  NOT_INTERESTED: 'not_interested',
  INTERESTED: 'interested',
  NONE: 'none',
  VOICEMAIL: 'voicemail',
  IVR: 'ivr',
  FAX_OR_NOISE: 'fax_or_noise',
  UNKNOWN: 'unknown',
  NO_ANSWER: 'no_answer',
  BUSY: 'busy',
  WRONG_NUMBER: 'wrong_number',
}

/** Resultados que cualifican un lead (docs/vendrava/ads.md §4.4). */
export const QUALIFYING_CALL_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.HUMAN_REQUESTED,
  CALL_OUTCOME.INTERESTED,
]

const LABELS_ES = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'Reunión agendada',
  [CALL_OUTCOME.HUMAN_REQUESTED]: 'Pidió hablar con una persona',
  [CALL_OUTCOME.CALLBACK_REQUESTED]: 'Pidió que le llamen después',
  [CALL_OUTCOME.INTERESTED]: 'Interesado',
  [CALL_OUTCOME.NOT_INTERESTED]: 'No interesado',
  [CALL_OUTCOME.NONE]: 'Sin resultado',
  [CALL_OUTCOME.VOICEMAIL]: 'Buzón de voz',
  [CALL_OUTCOME.IVR]: 'Centralita',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'Fax o ruido',
  [CALL_OUTCOME.UNKNOWN]: 'Sin clasificar',
  [CALL_OUTCOME.NO_ANSWER]: 'No contesta',
  [CALL_OUTCOME.BUSY]: 'Ocupado',
  [CALL_OUTCOME.WRONG_NUMBER]: 'Número equivocado',
  failed: 'Marcado fallido',
}

const LABELS_EN = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'Meeting booked',
  [CALL_OUTCOME.HUMAN_REQUESTED]: 'Asked for a person',
  [CALL_OUTCOME.CALLBACK_REQUESTED]: 'Asked to be called back',
  [CALL_OUTCOME.INTERESTED]: 'Interested',
  [CALL_OUTCOME.NOT_INTERESTED]: 'Not interested',
  [CALL_OUTCOME.NONE]: 'No outcome',
  [CALL_OUTCOME.VOICEMAIL]: 'Voicemail',
  [CALL_OUTCOME.IVR]: 'Auto attendant',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'Fax or noise',
  [CALL_OUTCOME.UNKNOWN]: 'Unclassified',
  [CALL_OUTCOME.NO_ANSWER]: 'No answer',
  [CALL_OUTCOME.BUSY]: 'Busy',
  [CALL_OUTCOME.WRONG_NUMBER]: 'Wrong number',
  failed: 'Dial failed',
}

/** Color por resultado; una sola fuente para listas, detalles y desgloses. */
export const OUTCOME_COLOR = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'var(--success)',
  [CALL_OUTCOME.HUMAN_REQUESTED]: 'var(--violet)',
  [CALL_OUTCOME.CALLBACK_REQUESTED]: 'var(--info)',
  [CALL_OUTCOME.INTERESTED]: 'var(--info)',
  [CALL_OUTCOME.NOT_INTERESTED]: 'var(--danger-soft)',
  [CALL_OUTCOME.NONE]: 'var(--muted)',
  [CALL_OUTCOME.VOICEMAIL]: 'var(--dim)',
  [CALL_OUTCOME.IVR]: 'var(--dim)',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'var(--dim)',
  [CALL_OUTCOME.UNKNOWN]: 'var(--dim)',
  [CALL_OUTCOME.NO_ANSWER]: 'var(--dim)',
  [CALL_OUTCOME.BUSY]: 'var(--dim)',
  [CALL_OUTCOME.WRONG_NUMBER]: 'var(--danger-soft)',
}

/** Icono por resultado, usado en el desglose de la lista de llamadas. */
export const OUTCOME_ICON = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: '●',
  [CALL_OUTCOME.HUMAN_REQUESTED]: '↗',
  [CALL_OUTCOME.CALLBACK_REQUESTED]: '↻',
  [CALL_OUTCOME.INTERESTED]: '◆',
  [CALL_OUTCOME.NOT_INTERESTED]: '×',
  [CALL_OUTCOME.NONE]: '—',
  [CALL_OUTCOME.VOICEMAIL]: '◐',
  [CALL_OUTCOME.IVR]: '◐',
  [CALL_OUTCOME.FAX_OR_NOISE]: '◐',
  [CALL_OUTCOME.UNKNOWN]: '◐',
  [CALL_OUTCOME.NO_ANSWER]: '○',
  [CALL_OUTCOME.BUSY]: '○',
  [CALL_OUTCOME.WRONG_NUMBER]: '×',
}

/**
 * Resultados que se ofrecen como filtro. Se dejan fuera los de máquina
 * (buzón, centralita, fax) porque son ruido operativo: quien filtra llamadas
 * busca conversaciones, no intentos fallidos.
 */
export const FILTERABLE_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.HUMAN_REQUESTED,
  CALL_OUTCOME.CALLBACK_REQUESTED,
  CALL_OUTCOME.INTERESTED,
  CALL_OUTCOME.NOT_INTERESTED,
]

/**
 * Resultados que un usuario puede fijar a mano desde la ficha de la llamada
 * (PATCH /api/calls/:id). Los de máquina se dejan porque corrigen falsos
 * positivos del clasificador (p. ej. buzón detectado como conversación).
 */
export const EDITABLE_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.INTERESTED,
  CALL_OUTCOME.HUMAN_REQUESTED,
  CALL_OUTCOME.CALLBACK_REQUESTED,
  CALL_OUTCOME.NOT_INTERESTED,
  CALL_OUTCOME.WRONG_NUMBER,
  CALL_OUTCOME.NO_ANSWER,
  CALL_OUTCOME.BUSY,
  CALL_OUTCOME.VOICEMAIL,
  CALL_OUTCOME.IVR,
  CALL_OUTCOME.NONE,
]

/**
 * Estados de `Call.status` de un intento que no llegó a conversación. El
 * despacho de llamadas crea estas filas sin pasar por la ingesta, con
 * `outcome: 'none'`; para la interfaz el estado es el resultado.
 */
const STATUS_AS_OUTCOME = {
  no_answer: CALL_OUTCOME.NO_ANSWER,
  busy: CALL_OUTCOME.BUSY,
}

/** Resultado que se muestra: el `outcome`, o el `status` cuando nadie contestó. */
export function displayOutcome(call) {
  if (!call) return CALL_OUTCOME.NONE
  const outcome = call.outcome || CALL_OUTCOME.NONE
  if (outcome !== CALL_OUTCOME.NONE) return outcome
  return STATUS_AS_OUTCOME[call.status] ?? (call.status === 'failed' ? 'failed' : outcome)
}

export function outcomeLabel(outcome, locale = 'es') {
  const labels = locale === 'en' ? LABELS_EN : LABELS_ES
  return labels[outcome] ?? labels[CALL_OUTCOME.NONE]
}

export function isQualifyingOutcome(outcome) {
  return QUALIFYING_CALL_OUTCOMES.includes(outcome)
}
