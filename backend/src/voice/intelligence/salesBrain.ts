export type ProspectStage =
  | 'opening'
  | 'permission'
  | 'discovery'
  | 'qualification'
  | 'value'
  | 'objection'
  | 'scheduling'
  | 'closing'
  | 'opt_out'
  | 'not_interested'
  | 'wrong_number'

export type SalesAction =
  | 'ASK_PERMISSION'
  | 'ASK_DISCOVERY_QUESTION'
  | 'REFLECT_AND_CONFIRM'
  | 'ANSWER_WITH_APPROVED_EVIDENCE'
  | 'HANDLE_OBJECTION'
  | 'PROPOSE_MEETING'
  | 'CONFIRM_MEETING'
  | 'TRANSFER_TO_HUMAN'
  | 'END_POLITELY'

export type ProspectState = {
  stage: ProspectStage
  needs: string[]
  painPoints: string[]
  objections: Array<{ label: string; confidence: number; resolved: boolean }>
  constraints: string[]
  nextBestAction: SalesAction
  evidence: Array<{ source: 'user' | 'crm' | 'tool'; text: string; atMs: number }>
}

export type SalesDecision = {
  state: ProspectState
  action: SalesAction
  signal?: string
}

export function createProspectState(): ProspectState {
  return {
    stage: 'opening',
    needs: [],
    painPoints: [],
    objections: [],
    constraints: [],
    nextBestAction: 'ASK_PERMISSION',
    evidence: [],
  }
}

function hasAny(text: string, values: string[]): boolean {
  return values.some(value => text.includes(value))
}

function addUnique(values: string[], value: string, max = 12): string[] {
  if (!value || values.includes(value)) return values
  return [...values, value].slice(-max)
}

/**
 * Deterministic guardrail around the LLM. It does not write the response; it
 * chooses the next permitted commercial action and records evidence.
 */
export function decideNextAction(previous: ProspectState, input: string, atMs = Date.now()): SalesDecision {
  const text = input.trim().toLowerCase()
  if (!text) return { state: previous, action: previous.nextBestAction }

  const evidence = [...previous.evidence, { source: 'user' as const, text: input.slice(0, 500), atMs }].slice(-30)
  let state: ProspectState = { ...previous, evidence }
  let action: SalesAction = previous.nextBestAction
  let signal: string | undefined

  if (hasAny(text, ['no me llames', 'no llamar', 'borradme', 'eliminar mis datos', 'no quiero llamadas'])) {
    state = { ...state, stage: 'opt_out', nextBestAction: 'END_POLITELY', constraints: addUnique(state.constraints, 'opt_out') }
    return { state, action: 'END_POLITELY', signal: 'opt_out' }
  }

  if (hasAny(text, ['no me interesa', 'no nos interesa', 'no lo necesito', 'equivocado', 'número equivocado'])) {
    const wrongNumber = hasAny(text, ['equivocado', 'número equivocado'])
    state = { ...state, stage: wrongNumber ? 'wrong_number' : 'not_interested', nextBestAction: 'END_POLITELY' }
    return { state, action: 'END_POLITELY', signal: wrongNumber ? 'wrong_number' : 'not_interested' }
  }

  const objection = hasAny(text, ['caro', 'precio', 'presupuesto', 'no tengo tiempo', 'envíame', 'mandame', 'ya tenemos'])
    ? (hasAny(text, ['caro', 'precio', 'presupuesto']) ? 'price' : hasAny(text, ['tiempo']) ? 'time' : hasAny(text, ['envíame', 'mandame']) ? 'send_info' : 'existing_solution')
    : ''
  if (objection) {
    const objections = state.objections.filter(item => item.label !== objection)
    state = {
      ...state,
      stage: 'objection',
      objections: [...objections, { label: objection, confidence: 0.8, resolved: false }].slice(-8),
      nextBestAction: 'HANDLE_OBJECTION',
    }
    return { state, action: 'HANDLE_OBJECTION', signal: objection }
  }

  if (hasAny(text, ['sí, dime', 'te escucho', 'cuéntame', 'dime', 'adelante'])) {
    state = { ...state, stage: 'discovery', nextBestAction: 'ASK_DISCOVERY_QUESTION' }
    action = 'ASK_DISCOVERY_QUESTION'
    signal = 'permission_granted'
  } else if (hasAny(text, ['reunión', 'demo', 'agendar', 'calendario', 'jueves', 'mañana'])) {
    state = { ...state, stage: 'scheduling', nextBestAction: 'CONFIRM_MEETING' }
    action = 'CONFIRM_MEETING'
    signal = 'scheduling_intent'
  } else if (hasAny(text, ['cómo funciona', 'qué hacéis', 'información', 'precio'])) {
    state = { ...state, stage: 'value', nextBestAction: 'ANSWER_WITH_APPROVED_EVIDENCE' }
    action = 'ANSWER_WITH_APPROVED_EVIDENCE'
    signal = 'value_question'
  } else if (previous.stage === 'opening') {
    state = { ...state, stage: 'permission', nextBestAction: 'ASK_PERMISSION' }
    action = 'ASK_PERMISSION'
  } else {
    state = { ...state, stage: 'discovery', nextBestAction: 'ASK_DISCOVERY_QUESTION' }
    action = 'ASK_DISCOVERY_QUESTION'
  }

  return { state: { ...state, nextBestAction: action }, action, signal }
}
