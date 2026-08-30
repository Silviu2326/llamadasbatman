import type { AgentType, CallDirection } from './agentPlaybooks'

export const CALL_STRATEGY_IDS = [
  'permission_diagnosis',
  'warm_reactivation',
  'objection_to_evidence',
  'meeting_recovery',
  'fast_qualification',
  'inbound_triage',
  'renewal_value',
  'payment_commitment',
] as const

export type CallStrategyId = (typeof CALL_STRATEGY_IDS)[number]

export interface CallStrategyStage {
  label: string
  instruction: string
}

export interface CallStrategy {
  id: CallStrategyId
  label: string
  summary: string
  agentTypes: readonly AgentType[]
  directions: readonly CallDirection[]
  objective: string
  stages: readonly CallStrategyStage[]
  questions: readonly string[]
  objectionRule: string
  close: string
  expectedOutcome: string
}

const strategies: readonly CallStrategy[] = [
  {
    id: 'permission_diagnosis',
    label: 'Permiso y diagnóstico',
    summary: 'Gana permiso, descubre el problema y acuerda un siguiente paso.',
    agentTypes: ['sales', 'qualification'],
    directions: ['outbound'],
    objective: 'Earn permission, diagnose one meaningful problem and agree a concrete next step.',
    stages: [
      { label: 'Permission', instruction: 'State why you called in one sentence and ask for a brief moment.' },
      { label: 'Diagnosis', instruction: 'Ask one question at a time until the current problem and its impact are clear.' },
      { label: 'Evidence', instruction: 'Connect only the most relevant company proof or offer to what they said.' },
      { label: 'Next step', instruction: 'Propose one concrete next step with a day and time.' },
    ],
    questions: ['What are you doing today?', 'Where does that process break down?', 'What happens if it stays that way?'],
    objectionRule: 'Treat an objection as missing information. Clarify it before answering; never debate.',
    close: 'Offer a specific short meeting only after the problem and impact are explicit.',
    expectedOutcome: 'A discovery meeting with a specific day and time, or a clear reason not to continue.',
  },
  {
    id: 'warm_reactivation',
    label: 'Reactivación cálida',
    summary: 'Retoma una conversación con contexto y una razón concreta.',
    agentTypes: ['sales', 'qualification', 'appointment'],
    directions: ['outbound'],
    objective: 'Restart a stalled conversation without pretending it is a first contact.',
    stages: [
      { label: 'Context', instruction: 'Reference the last real interaction or CRM fact in one sentence.' },
      { label: 'Reason now', instruction: 'Give one relevant reason for calling again today.' },
      { label: 'Update', instruction: 'Ask what changed since the previous conversation.' },
      { label: 'Restart', instruction: 'Agree the smallest useful next action.' },
    ],
    questions: ['Has the priority changed since we last spoke?', 'What stopped this from moving forward?', 'Is this still worth solving now?'],
    objectionRule: 'Acknowledge the pause directly. Never imply they owe you a reply.',
    close: 'Offer to restart, defer to a specific date, or close the loop cleanly.',
    expectedOutcome: 'A restarted next step, a dated follow-up, or an explicit no.',
  },
  {
    id: 'objection_to_evidence',
    label: 'Objeción a evidencia',
    summary: 'Convierte una objeción en una pregunta y responde con pruebas.',
    agentTypes: ['sales', 'qualification', 'support'],
    directions: ['inbound', 'outbound'],
    objective: 'Understand the real concern and answer it with the smallest relevant piece of evidence.',
    stages: [
      { label: 'Acknowledge', instruction: 'Show that you heard the concern without agreeing or pushing back.' },
      { label: 'Clarify', instruction: 'Ask one question to locate the real risk behind the objection.' },
      { label: 'Evidence', instruction: 'Use only verified company information or Knowledge Base content.' },
      { label: 'Check', instruction: 'Ask whether that resolves the concern before continuing.' },
    ],
    questions: ['What part worries you most?', 'Compared with what alternative?', 'What would you need to see to feel comfortable?'],
    objectionRule: 'Never fire multiple rebuttals. One clarified concern gets one concise evidence-based answer.',
    close: 'Return to the next step only if the person confirms the concern is resolved.',
    expectedOutcome: 'A resolved concern, a precise unanswered question for follow-up, or a respectful stop.',
  },
  {
    id: 'meeting_recovery',
    label: 'Recuperación de cita',
    summary: 'Recupera una reunión caída con dos alternativas concretas.',
    agentTypes: ['sales', 'appointment'],
    directions: ['outbound'],
    objective: 'Recover a missed or cancelled meeting with minimum friction.',
    stages: [
      { label: 'Reference', instruction: 'Name the missed or cancelled appointment without blame.' },
      { label: 'Check', instruction: 'Confirm whether the topic is still relevant.' },
      { label: 'Options', instruction: 'Offer exactly two concrete alternatives.' },
      { label: 'Confirm', instruction: 'Repeat the chosen day, time and next action.' },
    ],
    questions: ['Is this still something you want to address?', 'Would the first or second time work better?'],
    objectionRule: 'Do not reopen the full sales pitch. Reduce effort and make rescheduling easy.',
    close: 'Confirm one of two proposed slots or agree a dated follow-up.',
    expectedOutcome: 'A rescheduled meeting with a specific day and time.',
  },
  {
    id: 'fast_qualification',
    label: 'Cualificación rápida',
    summary: 'Valida encaje, urgencia y decisión sin alargar la llamada.',
    agentTypes: ['qualification', 'sales'],
    directions: ['inbound', 'outbound'],
    objective: 'Determine fit quickly and protect both teams from a low-value meeting.',
    stages: [
      { label: 'Situation', instruction: 'Understand the current process or problem.' },
      { label: 'Fit', instruction: 'Check scale, use case and minimum requirements.' },
      { label: 'Timing', instruction: 'Identify urgency and the cost of waiting.' },
      { label: 'Decision', instruction: 'Confirm who participates in the decision and choose the next step.' },
    ],
    questions: ['How many people or interactions does this affect?', 'Why is this a priority now?', 'Who else needs to be involved?'],
    objectionRule: 'If the lead is not a fit, say so clearly and helpfully instead of forcing a meeting.',
    close: 'Book only qualified leads; otherwise record the reason and close politely.',
    expectedOutcome: 'A qualified meeting or a documented disqualification reason.',
  },
  {
    id: 'inbound_triage',
    label: 'Triaje entrante',
    summary: 'Entiende la urgencia, resuelve lo simple y deriva con contexto.',
    agentTypes: ['receptionist', 'support', 'handoff'],
    directions: ['inbound'],
    objective: 'Resolve or route an inbound request quickly without making the caller repeat themselves.',
    stages: [
      { label: 'Listen', instruction: 'Let the caller explain the request before narrowing it down.' },
      { label: 'Classify', instruction: 'Identify intent, urgency and the right owner.' },
      { label: 'Resolve', instruction: 'Answer only when the verified sources contain the answer.' },
      { label: 'Route', instruction: 'Transfer or create a follow-up with a concise context summary.' },
    ],
    questions: ['What do you need help with today?', 'Is anything blocked or time-sensitive?', 'What has already been tried?'],
    objectionRule: 'Do not defend the company. Focus on ownership, clarity and the next action.',
    close: 'Confirm who owns the request and what will happen next.',
    expectedOutcome: 'Resolved on the call or routed once with complete context.',
  },
  {
    id: 'renewal_value',
    label: 'Renovación por valor',
    summary: 'Revisa resultados, detecta riesgo y acuerda la renovación.',
    agentTypes: ['sales', 'collections', 'support'],
    directions: ['outbound'],
    objective: 'Make the renewal decision about verified value, future needs and explicit risk.',
    stages: [
      { label: 'Outcome', instruction: 'Ask what value or result they have actually seen.' },
      { label: 'Risk', instruction: 'Surface dissatisfaction or adoption gaps before discussing renewal.' },
      { label: 'Fit next', instruction: 'Connect the next period only to confirmed needs.' },
      { label: 'Commit', instruction: 'Agree renewal, remediation or a dated decision step.' },
    ],
    questions: ['What has been most valuable?', 'What has not met expectations?', 'What needs to be true for renewal to make sense?'],
    objectionRule: 'Never hide dissatisfaction behind a discount. Diagnose value and risk first.',
    close: 'Confirm the renewal path, owner and decision date.',
    expectedOutcome: 'Renewal commitment, recovery plan or explicit risk with an owner and date.',
  },
  {
    id: 'payment_commitment',
    label: 'Compromiso de pago',
    summary: 'Aclara el retraso y acuerda una fecha de pago verificable.',
    agentTypes: ['collections'],
    directions: ['outbound'],
    objective: 'Agree a realistic payment date while preserving the relationship and legal safety.',
    stages: [
      { label: 'Identity', instruction: 'Verify the right person before mentioning any payment detail.' },
      { label: 'Fact', instruction: 'State the verified invoice amount and due date neutrally.' },
      { label: 'Reason', instruction: 'Ask what is preventing payment and listen without judgement.' },
      { label: 'Commitment', instruction: 'Agree a specific realistic date and repeat it.' },
    ],
    questions: ['Is there an issue with the invoice?', 'What date is realistic for payment?', 'Do you need the invoice sent again?'],
    objectionRule: 'Never threaten, shame, improvise legal consequences or disclose debt to a third party.',
    close: 'Repeat the amount, agreed date and any document that will be resent.',
    expectedOutcome: 'A specific payment date or a documented issue requiring human follow-up.',
  },
]

export const CALL_STRATEGIES: readonly CallStrategy[] = Object.freeze(strategies)

const STRATEGY_BY_ID = new Map(CALL_STRATEGIES.map(strategy => [strategy.id, strategy]))

const DEFAULT_BY_AGENT_TYPE: Readonly<Record<AgentType, CallStrategyId>> = {
  sales: 'permission_diagnosis',
  receptionist: 'inbound_triage',
  qualification: 'fast_qualification',
  appointment: 'meeting_recovery',
  support: 'inbound_triage',
  collections: 'payment_commitment',
  handoff: 'inbound_triage',
}

export function strategiesForAgent(agentType: string | null | undefined, direction: CallDirection): readonly CallStrategy[] {
  return CALL_STRATEGIES.filter(strategy =>
    strategy.agentTypes.includes(agentType as AgentType) && strategy.directions.includes(direction))
}

export function callStrategy(
  strategyId: string | null | undefined,
  agentType: string | null | undefined,
  direction: CallDirection,
): CallStrategy {
  const requested = STRATEGY_BY_ID.get(String(strategyId ?? '') as CallStrategyId)
  if (requested && requested.agentTypes.includes(agentType as AgentType) && requested.directions.includes(direction)) return requested

  const defaultId = DEFAULT_BY_AGENT_TYPE[agentType as AgentType] ?? 'permission_diagnosis'
  const preferred = STRATEGY_BY_ID.get(defaultId)
  if (preferred?.directions.includes(direction)) return preferred

  return strategiesForAgent(agentType, direction)[0]
    ?? preferred
    ?? CALL_STRATEGIES.find(strategy => strategy.directions.includes(direction))
    ?? CALL_STRATEGIES[0]
}

export function strategyDirective(strategy: CallStrategy): string {
  return `CALL STRATEGY: ${strategy.label}
STRATEGY GOAL: ${strategy.objective}
STAGES:
${strategy.stages.map((stage, index) => `${index + 1}. ${stage.label}: ${stage.instruction}`).join('\n')}
USEFUL QUESTIONS (choose only what fits; never run them as a checklist):
${strategy.questions.map(question => `- ${question}`).join('\n')}
OBJECTION RULE: ${strategy.objectionRule}
CLOSE: ${strategy.close}
EXPECTED OUTCOME: ${strategy.expectedOutcome}`
}

export function publicCallStrategies(): Array<Omit<CallStrategy, 'objective' | 'questions' | 'objectionRule' | 'close'> & { isDefaultFor: AgentType[] }> {
  return CALL_STRATEGIES.map(strategy => ({
    id: strategy.id,
    label: strategy.label,
    summary: strategy.summary,
    agentTypes: strategy.agentTypes,
    directions: strategy.directions,
    stages: strategy.stages,
    expectedOutcome: strategy.expectedOutcome,
    isDefaultFor: (Object.entries(DEFAULT_BY_AGENT_TYPE) as Array<[AgentType, CallStrategyId]>)
      .filter(([, strategyId]) => strategyId === strategy.id)
      .map(([agentType]) => agentType),
  }))
}
