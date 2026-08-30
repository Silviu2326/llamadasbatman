/**
 * Espejo de `backend/src/voice/agentPlaybooks.ts` para la interfaz.
 *
 * Los dos ficheros deben cambiar a la vez: no hay paquete compartido entre el
 * backend y el frontend (mismo acuerdo que `src/lib/callOutcome.js`).
 *
 * Aquí solo vive lo que la interfaz necesita para explicar cada tipo. El guion
 * real —objetivo, fases, política de transferencia— lo aplica el backend.
 */
export const AGENT_PLAYBOOKS = [
  {
    type: 'sales',
    label: 'Comercial',
    summary: 'Llama en frío, descubre la necesidad y consigue una reunión.',
    directions: ['outbound'],
    detail: 'Abre, pregunta antes de vender y cierra con día y hora. Es el que usarías para prospección.',
  },
  {
    type: 'receptionist',
    label: 'Recepción',
    summary: 'Atiende a quien llama y lo dirige a la persona correcta.',
    directions: ['inbound'],
    detail: 'No vende: identifica qué necesitan y pasa la llamada en cuanto hace falta una persona.',
  },
  {
    type: 'qualification',
    label: 'Calificación',
    summary: 'Comprueba si un lead encaja antes de gastarle tiempo a un comercial.',
    directions: ['inbound', 'outbound'],
    detail: 'Pregunta por tamaño, situación, plazos y quién decide. Si no encaja, lo dice y cierra.',
  },
  {
    type: 'appointment',
    label: 'Agenda',
    summary: 'Confirma, recuerda o reprograma reuniones ya existentes.',
    directions: ['inbound', 'outbound'],
    detail: 'Llamada de menos de un minuto. Si no les viene bien, ofrece dos alternativas concretas.',
  },
  {
    type: 'support',
    label: 'Soporte',
    summary: 'Resuelve dudas de clientes y escala lo que no puede resolver.',
    directions: ['inbound'],
    detail: 'Solo responde con lo que hay en la base de conocimiento. Si no está, lo admite y escala.',
  },
  {
    type: 'collections',
    label: 'Recobro',
    summary: 'Recuerda un pago pendiente y acuerda cuándo se paga.',
    directions: ['outbound'],
    detail: 'Verifica identidad antes de hablar de dinero, nunca presiona y jamás transfiere.',
  },
  {
    type: 'handoff',
    label: 'Filtro',
    summary: 'Identifica quién llama y pasa con una persona cuanto antes.',
    directions: ['inbound'],
    detail: 'Dos preguntas y transfiere. Sirve para que quien coja el teléfono ya sepa de qué va.',
  },
]

export const CALL_DIRECTIONS = [
  { value: 'outbound', label: 'Saliente (nosotros llamamos)' },
  { value: 'inbound', label: 'Entrante (nos llaman)' },
  { value: 'both', label: 'Ambas' },
]

export function playbookFor(type) {
  return AGENT_PLAYBOOKS.find(playbook => playbook.type === type) ?? AGENT_PLAYBOOKS[0]
}

/** Tipos que tienen sentido para la dirección elegida. */
export function playbooksForDirection(direction) {
  if (!direction || direction === 'both') return AGENT_PLAYBOOKS
  return AGENT_PLAYBOOKS.filter(playbook => playbook.directions.includes(direction))
}

/** Avisa cuando el tipo elegido no encaja con la dirección: el backend usará el saludo de la dirección real. */
export function directionMismatch(type, direction) {
  if (!direction || direction === 'both') return null
  const playbook = playbookFor(type)
  if (playbook.directions.includes(direction)) return null
  return `"${playbook.label}" está pensado para llamadas ${playbook.directions.includes('inbound') ? 'entrantes' : 'salientes'}.`
}
