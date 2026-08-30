/**
 * Qué hace cada tipo de agente en una llamada.
 *
 * `Agent.agentType` y `Agent.callDirection` existían en la base y en la
 * interfaz desde el principio, pero eran decorativos: el prompt, el saludo y el
 * objetivo eran idénticos para un recepcionista que atiende y para un comercial
 * que llama en frío. Este catálogo es lo que los hace distintos de verdad.
 *
 * Todo el texto está en inglés porque el motor de voz solo habla inglés
 * (decisión del 11/08/2026). Ver docs/ARQUITECTURA_VOZ.md §9.
 */

export type CallDirection = 'inbound' | 'outbound'

/** Mismos identificadores que ya valida `agents.controller.ts`. */
export const AGENT_TYPES = ['sales', 'receptionist', 'qualification', 'appointment', 'support', 'collections', 'handoff'] as const
export type AgentType = (typeof AGENT_TYPES)[number]

export type TransferPolicy =
  /** Solo si el interlocutor lo pide o se enfada. Es el comportamiento histórico. */
  | 'on_request'
  /** Transferir en cuanto haya intención clara: el humano cierra mejor. */
  | 'on_intent'
  /** Nunca transferir: no hay nadie al otro lado (fuera de horario, cobros). */
  | 'never'

export interface AgentPlaybook {
  type: AgentType
  /** Cómo se presenta la ficha en la interfaz. */
  label: string
  /** Para qué sirve, en una frase, en la interfaz. */
  summary: string
  /** Direcciones en las que este tipo tiene sentido. */
  directions: readonly CallDirection[]
  /** Objetivo único de la llamada. Va al prompt y al guru. */
  objective: string
  /** Fases de la conversación, ya redactadas para el LLM. */
  phases: string
  /** Cuántas frases puede gastar el agente antes de ir al grano. */
  maxTurnsHint: number
  transferPolicy: TransferPolicy
  /** Si el objetivo es agendar, el motor prioriza cerrar hora. */
  booksMeetings: boolean
}

const SALES: AgentPlaybook = {
  type: 'sales',
  label: 'Comercial',
  summary: 'Llama en frío, descubre la necesidad y consigue una reunión.',
  directions: ['outbound'],
  objective: 'Get the prospect to accept a short discovery meeting.',
  phases: `CONVERSATION PHASES (follow them in order, do not skip):
1. Opening: introduce yourself and earn permission to talk. Ten seconds, no more.
2. Discovery: understand need, situation and urgency by asking. Do not pitch yet.
3. Objections: answer using the BUSINESS KNOWLEDGE section only, never invent.
4. Close: propose a specific day and time for a short meeting once the need is clear.
Never try to close before you have uncovered the need.`,
  maxTurnsHint: 12,
  transferPolicy: 'on_request',
  booksMeetings: true,
}

const RECEPTIONIST: AgentPlaybook = {
  type: 'receptionist',
  label: 'Recepción',
  summary: 'Atiende quien llama, entiende qué necesita y lo dirige a la persona correcta.',
  directions: ['inbound'],
  objective: 'Understand what the caller needs and route them correctly, fast.',
  phases: `CONVERSATION PHASES:
1. Greet and thank them for calling. Ask how you can help. Do not pitch anything.
2. Identify: who they are and what they need, in as few questions as possible.
3. Route: if they need a person, say you are putting them through. If it is a
   simple question you can answer from BUSINESS KNOWLEDGE, answer it.
4. Close: confirm what will happen next and who will contact them.
The caller took the trouble to call you. Never keep them waiting with small talk.`,
  maxTurnsHint: 8,
  transferPolicy: 'on_intent',
  booksMeetings: false,
}

const QUALIFICATION: AgentPlaybook = {
  type: 'qualification',
  label: 'Calificación',
  summary: 'Comprueba si un lead encaja antes de que un comercial le dedique tiempo.',
  directions: ['inbound', 'outbound'],
  objective: 'Decide whether this lead is a fit, and record why.',
  phases: `CONVERSATION PHASES:
1. Opening: say why you are calling in one sentence.
2. Fit: ask about size, current situation, timing and who decides. One question at a time.
3. Honesty: if they are clearly not a fit, say so politely and close the call. Do not
   push a meeting to hit a number — a wasted meeting costs more than a lost lead.
4. Close: if they fit, propose the next step with the sales team.`,
  maxTurnsHint: 10,
  transferPolicy: 'on_intent',
  booksMeetings: true,
}

const APPOINTMENT: AgentPlaybook = {
  type: 'appointment',
  label: 'Agenda',
  summary: 'Confirma, recuerda o reprograma reuniones ya existentes.',
  directions: ['inbound', 'outbound'],
  objective: 'Confirm, move or recover a scheduled appointment.',
  phases: `CONVERSATION PHASES:
1. Opening: say which appointment you are calling about, with its day and time.
2. Confirm: ask whether it still works for them.
3. Rescue: if it does not, offer two concrete alternatives instead of asking
   "when suits you?" — an open question here loses the booking.
4. Close: repeat the agreed day and time out loud so there is no doubt.
Keep it under a minute. This is a confirmation, not a sales call.`,
  maxTurnsHint: 6,
  transferPolicy: 'on_request',
  booksMeetings: true,
}

const SUPPORT: AgentPlaybook = {
  type: 'support',
  label: 'Soporte',
  summary: 'Resuelve dudas de clientes y escala lo que no puede resolver.',
  directions: ['inbound'],
  objective: 'Resolve the customer issue or escalate it with the full context.',
  phases: `CONVERSATION PHASES:
1. Listen: let them explain the problem without interrupting.
2. Confirm: repeat the problem back in one sentence so they know you got it.
3. Resolve: answer only from BUSINESS KNOWLEDGE. If it is not there, say so.
4. Escalate: if you cannot solve it, say who will follow up and when.
Never guess at a fix. A wrong answer to a customer costs more than a transfer.`,
  maxTurnsHint: 12,
  transferPolicy: 'on_intent',
  booksMeetings: false,
}

const COLLECTIONS: AgentPlaybook = {
  type: 'collections',
  label: 'Recobro',
  summary: 'Recuerda un pago pendiente y acuerda cómo y cuándo se paga.',
  directions: ['outbound'],
  objective: 'Agree a concrete payment date without damaging the relationship.',
  phases: `CONVERSATION PHASES:
1. Identify: confirm you are speaking with the right person before saying anything
   about money. Never discuss a debt with a third party.
2. State: mention the pending payment factually, with its amount and date. No pressure.
3. Understand: ask if there is a reason for the delay. Often there is, and it matters.
4. Agree: get a specific date, and repeat it back.
Never threaten, never imply legal consequences, never raise your voice.`,
  maxTurnsHint: 8,
  transferPolicy: 'never',
  booksMeetings: false,
}

const HANDOFF: AgentPlaybook = {
  type: 'handoff',
  label: 'Filtro',
  summary: 'Solo identifica y pasa la llamada a una persona lo antes posible.',
  directions: ['inbound'],
  objective: 'Identify the caller and hand them to a human quickly.',
  phases: `CONVERSATION PHASES:
1. Greet, ask their name and what it is about. Two questions, no more.
2. Hand over: tell them you are putting them through to a person now.
Do not sell, do not qualify, do not answer product questions. Your only job is
to make sure the human who picks up already knows who is calling and why.`,
  maxTurnsHint: 4,
  transferPolicy: 'on_intent',
  booksMeetings: false,
}

export const AGENT_PLAYBOOKS: Readonly<Record<AgentType, AgentPlaybook>> = Object.freeze({
  sales: SALES,
  receptionist: RECEPTIONIST,
  qualification: QUALIFICATION,
  appointment: APPOINTMENT,
  support: SUPPORT,
  collections: COLLECTIONS,
  handoff: HANDOFF,
})

export function agentPlaybook(type: string | null | undefined): AgentPlaybook {
  const key = String(type ?? '').trim() as AgentType
  return AGENT_PLAYBOOKS[key] ?? SALES
}

/**
 * Saludo de apertura. En saliente el agente interrumpe a alguien que no
 * esperaba la llamada y tiene que justificarse en una frase; en entrante el
 * interlocutor ya ha hecho el esfuerzo de llamar y lo que quiere es que le
 * atiendan. Usar el mismo saludo para las dos cosas suena a robot.
 */
export function playbookGreeting(
  playbook: AgentPlaybook,
  direction: CallDirection,
  identity: { agentName: string; companyName?: string },
): string {
  const company = identity.companyName?.trim()
  const from = company ? ` from ${company}` : ''
  const at = company ? ` ${company}` : ''

  if (direction === 'inbound') {
    switch (playbook.type) {
      case 'support':
        return `Thanks for calling${at}. This is ${identity.agentName}. What can I help you with?`
      case 'handoff':
        return `Thanks for calling${at}. This is ${identity.agentName}. Who am I speaking with, and what is it about?`
      case 'appointment':
        return `Thanks for calling${at}. This is ${identity.agentName}. Are you calling about your appointment?`
      default:
        return `Thanks for calling${at}. This is ${identity.agentName}. How can I help?`
    }
  }

  switch (playbook.type) {
    case 'appointment':
      return `Hi, this is ${identity.agentName}${from}. I'm calling about your upcoming appointment — is now an okay moment?`
    case 'collections':
      return `Hi, this is ${identity.agentName}${from}. I'm calling about an outstanding invoice — am I speaking with the right person?`
    case 'qualification':
      return `Hi, this is ${identity.agentName}${from}. I'll be quick: I just need a couple of things to see whether we're a fit.`
    default:
      return `Hi, this is ${identity.agentName}${from}. I'll be quick: how's your day going?`
  }
}

/** Bloque que se añade al prompt para fijar objetivo, fases y límites. */
export function playbookDirective(playbook: AgentPlaybook, direction: CallDirection): string {
  const transfer = playbook.transferPolicy === 'never'
    ? 'Do not offer to transfer the call.'
    : playbook.transferPolicy === 'on_intent'
      ? 'Offer to put them through to a person as soon as it is clear a human is needed.'
      : 'Only offer a transfer if they ask for a person or get frustrated.'

  return `YOUR ROLE: ${playbook.label} · ${direction === 'inbound' ? 'the caller phoned you' : 'you phoned them'}.
GOAL OF THIS CALL: ${playbook.objective}
${playbook.phases}
${transfer}
${playbook.booksMeetings ? 'When they agree, settle on a specific day and time; do not leave it open.' : 'Do not try to book a meeting.'}
Aim to finish in about ${playbook.maxTurnsHint} turns.`
}
