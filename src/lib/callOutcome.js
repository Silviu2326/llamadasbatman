// Espejo de `backend/src/lib/callOutcome.ts`. No hay paquete compartido entre
// el frontend y el backend, así que los dos ficheros cambian a la vez.
//
// Antes de existir esto, tres pantallas etiquetaban `rejected` y `callback`,
// valores que el backend no escribe nunca: el filtro "Seguimiento" de Llamadas
// enviaba `outcome=callback` a la API y devolvía siempre cero resultados.

export const CALL_OUTCOME = {
  MEETING_SCHEDULED: 'meeting_scheduled',
  // Heredado: significa "transferido a una persona", no "llámame luego".
  TRANSFERRED_TO_HUMAN: 'callback_requested',
  NOT_INTERESTED: 'not_interested',
  INTERESTED: 'interested',
  NONE: 'none',
  VOICEMAIL: 'voicemail',
  IVR: 'ivr',
  FAX_OR_NOISE: 'fax_or_noise',
  UNKNOWN: 'unknown',
}

/** Resultados que cualifican un lead (docs/vendrava/ads.md §4.4). */
export const QUALIFYING_CALL_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.TRANSFERRED_TO_HUMAN,
  CALL_OUTCOME.INTERESTED,
]

const LABELS_ES = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'Reunión agendada',
  [CALL_OUTCOME.TRANSFERRED_TO_HUMAN]: 'Transferida a una persona',
  [CALL_OUTCOME.INTERESTED]: 'Interesado',
  [CALL_OUTCOME.NOT_INTERESTED]: 'No interesado',
  [CALL_OUTCOME.NONE]: 'Sin resultado',
  [CALL_OUTCOME.VOICEMAIL]: 'Buzón de voz',
  [CALL_OUTCOME.IVR]: 'Centralita',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'Fax o ruido',
  [CALL_OUTCOME.UNKNOWN]: 'Sin clasificar',
}

const LABELS_EN = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'Meeting booked',
  [CALL_OUTCOME.TRANSFERRED_TO_HUMAN]: 'Transferred to a person',
  [CALL_OUTCOME.INTERESTED]: 'Interested',
  [CALL_OUTCOME.NOT_INTERESTED]: 'Not interested',
  [CALL_OUTCOME.NONE]: 'No outcome',
  [CALL_OUTCOME.VOICEMAIL]: 'Voicemail',
  [CALL_OUTCOME.IVR]: 'Auto attendant',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'Fax or noise',
  [CALL_OUTCOME.UNKNOWN]: 'Unclassified',
}

/** Color por resultado; una sola fuente para listas, detalles y desgloses. */
export const OUTCOME_COLOR = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'var(--success)',
  [CALL_OUTCOME.TRANSFERRED_TO_HUMAN]: 'var(--violet)',
  [CALL_OUTCOME.INTERESTED]: 'var(--info)',
  [CALL_OUTCOME.NOT_INTERESTED]: 'var(--danger-soft)',
  [CALL_OUTCOME.NONE]: 'var(--muted)',
  [CALL_OUTCOME.VOICEMAIL]: 'var(--dim)',
  [CALL_OUTCOME.IVR]: 'var(--dim)',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'var(--dim)',
  [CALL_OUTCOME.UNKNOWN]: 'var(--dim)',
}

/** Icono por resultado, usado en el desglose de la lista de llamadas. */
export const OUTCOME_ICON = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: '●',
  [CALL_OUTCOME.TRANSFERRED_TO_HUMAN]: '↗',
  [CALL_OUTCOME.INTERESTED]: '◆',
  [CALL_OUTCOME.NOT_INTERESTED]: '×',
  [CALL_OUTCOME.NONE]: '—',
  [CALL_OUTCOME.VOICEMAIL]: '◐',
  [CALL_OUTCOME.IVR]: '◐',
  [CALL_OUTCOME.FAX_OR_NOISE]: '◐',
  [CALL_OUTCOME.UNKNOWN]: '◐',
}

/**
 * Resultados que se ofrecen como filtro. Se dejan fuera los de máquina
 * (buzón, centralita, fax) porque son ruido operativo: quien filtra llamadas
 * busca conversaciones, no intentos fallidos.
 */
export const FILTERABLE_OUTCOMES = [
  CALL_OUTCOME.MEETING_SCHEDULED,
  CALL_OUTCOME.TRANSFERRED_TO_HUMAN,
  CALL_OUTCOME.INTERESTED,
  CALL_OUTCOME.NOT_INTERESTED,
]

export function outcomeLabel(outcome, locale = 'es') {
  const labels = locale === 'en' ? LABELS_EN : LABELS_ES
  return labels[outcome] ?? labels[CALL_OUTCOME.NONE]
}

export function isQualifyingOutcome(outcome) {
  return QUALIFYING_CALL_OUTCOMES.includes(outcome)
}
