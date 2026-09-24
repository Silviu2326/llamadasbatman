export type JudgeEvent = {
  type: string
  atMs?: number
  role?: string
  payload?: Record<string, unknown>
}

/**
 * Una dimensión vale `null` cuando la llamada no dejó señal para medirla. Antes
 * devolvían una constante disfrazada de nota; una nota inventada es peor que
 * ninguna, porque nadie sabe cuál de las dos es.
 */
export type CallJudgeResult = {
  overall: number
  dimensions: {
    turnTaking: number | null
    greeting: number | null
    voiceNaturalness: number | null
    discovery: number | null
    objectionHandling: number | null
    closing: number | null
    compliance: number
    crmAccuracy: number
  }
  criticalErrors: string[]
  evidence: Array<{ dimension: string; atMs: number; reason: string }>
  trainingTag: string
}

/** Objetivo de latencia del pipeline: un turno por encima suena a espera. */
const TURN_TARGET_MS = 650

/** Nota máxima cuando el interlocutor no dijo nada: no hay conversación que aprobar. */
const NO_PROSPECT_CAP = 40

export type JudgeTurn = { role: string; text: string; atMs?: number }

export type JudgeCall = {
  outcome?: string | null
  transcript?: string | null
  /** Transcripción por turnos, si existe. Gana al texto plano. */
  transcriptTurns?: unknown
}

const AGENT_ROLES = new Set(['agente', 'assistant', 'agent', 'asistente', 'ia', 'ai', 'bot', 'carlos'])
const USER_ROLES = new Set(['prospecto', 'cliente', 'usuario', 'lead', 'user', 'prospect', 'customer', 'contacto', 'contact'])

export type JudgeRole = 'agent' | 'user' | 'other'

/** Todos los pipelines etiquetan distinto; el juez reduce a agente/interlocutor. */
export function normalizeJudgeRole(role: unknown): JudgeRole {
  const key = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (AGENT_ROLES.has(key)) return 'agent'
  if (USER_ROLES.has(key)) return 'user'
  return 'other'
}

type Line = { role: JudgeRole; text: string }

/** Turnos desde el JSON por turnos o, en su defecto, desde el texto plano "rol: texto". */
export function judgeLines(call: JudgeCall): Line[] {
  if (Array.isArray(call.transcriptTurns)) {
    const turns = (call.transcriptTurns as JudgeTurn[])
      .filter(turn => turn && typeof turn === 'object' && typeof turn.text === 'string' && turn.text.trim())
      .map(turn => ({ role: normalizeJudgeRole(turn.role), text: turn.text.trim().toLowerCase() }))
    if (turns.length) return turns
  }
  return (call.transcript || '')
    .split('\n')
    .map(line => {
      const separator = line.indexOf(':')
      if (separator < 0) return { role: 'other' as JudgeRole, text: line.trim().toLowerCase() }
      return { role: normalizeJudgeRole(line.slice(0, separator)), text: line.slice(separator + 1).trim().toLowerCase() }
    })
    .filter(line => line.text)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function count(events: JudgeEvent[], type: string): number {
  return events.filter(event => event.type === type).length
}

/** Totales por turno que el pipeline registra en `latency.update` con `record`. */
function turnTotals(events: JudgeEvent[]): number[] {
  return events
    .filter(event => event.type === 'latency.update' && event.payload?.record === true)
    .map(event => Number(event.payload?.total))
    .filter(total => Number.isFinite(total) && total > 0)
}

/** Preguntas del agente en el transcripto: la única señal de descubrimiento que queda. */
function agentQuestions(lines: Line[]): { turns: number; questions: number } {
  const agentLines = lines.filter(line => line.role === 'agent')
  return { turns: agentLines.length, questions: agentLines.filter(line => line.text.includes('?')).length }
}

function conversationSignals(lines: Line[]) {
  const agentLines = lines.filter(line => line.role === 'agent')
  const first = agentLines[0]?.text || ''
  const last = agentLines.at(-1)?.text || ''
  const objectionWords = ['caro', 'precio', 'no me interesa', 'no interesa', 'ya tenemos', 'no tengo tiempo', 'ahora no']
  const objectionIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.role === 'user' && objectionWords.some(word => line.text.includes(word)))
  const handled = objectionIndexes.filter(({ index }) => lines.slice(index + 1, index + 3).some(line => line.role === 'agent' && line.text.length > 20)).length
  const greetingHits = [/(hola|buenos días|buenas tardes)/, /(soy|mi nombre es)/, /(llamo|contacto)/].filter(pattern => pattern.test(first)).length
  const closingHits = [/(reunión|agendar|reservar|siguiente paso)/, /(día|hora|cuándo)/, /(gracias|encantado|hasta luego)/].filter(pattern => pattern.test(last) || pattern.test(agentLines.slice(-2).map(line => line.text).join(' '))).length
  return { greeting: agentLines.length ? clamp(40 + greetingHits * 20) : null, objections: objectionIndexes.length ? clamp(handled / objectionIndexes.length * 100) : null, closing: agentLines.length ? clamp(25 + closingHits * 25) : null }
}

/** Rol del emisor de un evento de transcripción, venga como `role`, `speaker` o el rol del evento. */
function eventSpeaker(event: JudgeEvent): JudgeRole {
  const payload = event.payload ?? {}
  return normalizeJudgeRole(payload.role ?? payload.speaker ?? event.role)
}

export function scoreCall(events: JudgeEvent[], call: JudgeCall): CallJudgeResult {
  const lines = judgeLines(call)
  const bargeIns = count(events, 'barge_in.detected')
  // Zadarma emite `turn.user_finished`; los pipelines antiguos solo dejan la
  // transcripción. Se toma la señal más alta para no castigar por omisión.
  const userTurns = Math.max(count(events, 'turn.user_finished'), lines.filter(line => line.role === 'user').length)
  const cancelled = count(events, 'audio.clear')
  const totals = turnTotals(events)
  const { turns: agentTurns, questions } = agentQuestions(lines)
  const signals = conversationSignals(lines)

  const optOutIndex = events.findIndex(event => event.type === 'compliance.opt_out')
  const postOptOutSpeech = optOutIndex >= 0 && events.slice(optOutIndex + 1).some(event =>
    event.type === 'audio.output_started' || (event.type === 'transcript.final' && eventSpeaker(event) === 'agent'))
  const criticalErrors = postOptOutSpeech ? ['assistant_spoke_after_opt_out'] : []
  // Una llamada en la que solo habló el agente no demuestra nada: ni turnos,
  // ni descubrimiento, ni cierre. No puede aprobar.
  const noProspect = userTurns === 0
  if (noProspect) criticalErrors.push('no_prospect_turns')

  const evidence: CallJudgeResult['evidence'] = []
  if (bargeIns > 0) {
    const first = events.find(event => event.type === 'barge_in.detected')
    evidence.push({ dimension: 'turnTaking', atMs: first?.atMs ?? 0, reason: `el prospecto interrumpió ${bargeIns} ${bargeIns === 1 ? 'vez' : 'veces'}` })
  }
  if (totals.length) {
    const slow = totals.filter(total => total > TURN_TARGET_MS).length
    evidence.push({ dimension: 'voiceNaturalness', atMs: 0, reason: `${slow} de ${totals.length} turnos por encima de ${TURN_TARGET_MS} ms` })
  }
  if (agentTurns > 0) {
    evidence.push({ dimension: 'discovery', atMs: 0, reason: `${questions} preguntas en ${agentTurns} turnos del agente` })
  }
  if (postOptOutSpeech) {
    evidence.push({ dimension: 'compliance', atMs: events[optOutIndex]?.atMs ?? 0, reason: 'se detectó audio posterior al opt-out' })
  }
  if (noProspect) {
    evidence.push({ dimension: 'turnTaking', atMs: 0, reason: 'el interlocutor no intervino en ningún momento' })
  }

  const dimensions: CallJudgeResult['dimensions'] = {
    // Interrumpir es normal; interrumpir en cada turno es que el agente no calla.
    // Sin ningún turno del interlocutor no hay turnos que respetar: 0, no null.
    turnTaking: userTurns > 0 ? clamp(100 - (bargeIns / userTurns) * 60) : 0,
    greeting: signals.greeting,
    // Naturalidad medible hoy: cuántos turnos respetaron el objetivo de latencia,
    // penalizando el audio que hubo que cortar a medias.
    voiceNaturalness: totals.length
      ? clamp((totals.filter(total => total <= TURN_TARGET_MS).length / totals.length) * 100 - cancelled * 5)
      : null,
    // Sin banco de aperturas ni salesBrain, la señal es el transcripto.
    discovery: agentTurns > 0 ? clamp((questions / agentTurns) * 200) : null,
    // Requiere clasificar objeciones, que hoy no hace nadie en el camino de la llamada.
    objectionHandling: signals.objections,
    closing: call.outcome === 'meeting_scheduled' ? 100 : signals.closing,
    compliance: postOptOutSpeech ? 0 : 100,
    crmAccuracy: call.outcome && call.outcome !== 'none' ? 92 : 78,
  }

  const measured = Object.values(dimensions).filter((value): value is number => value !== null)
  const average = measured.length ? clamp(measured.reduce((sum, value) => sum + value, 0) / measured.length) : 0
  const overall = noProspect ? Math.min(average, NO_PROSPECT_CAP) : average
  const trainingTag = postOptOutSpeech
    ? 'critical_error'
    : noProspect ? 'not_measurable' : !measured.length ? 'not_measurable' : overall >= 85 ? 'good_call' : overall >= 65 ? 'needs_review' : 'poor_call'
  return { overall, dimensions, criticalErrors, evidence, trainingTag }
}
