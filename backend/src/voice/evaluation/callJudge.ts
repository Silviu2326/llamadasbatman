export type JudgeEvent = {
  type: string
  atMs?: number
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
    voiceNaturalness: number | null
    discovery: number | null
    objectionHandling: number | null
    compliance: number
    crmAccuracy: number
  }
  criticalErrors: string[]
  evidence: Array<{ dimension: string; atMs: number; reason: string }>
  trainingTag: string
}

/** Objetivo de latencia del pipeline: un turno por encima suena a espera. */
const TURN_TARGET_MS = 650

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
function agentQuestions(transcript?: string | null): { turns: number; questions: number } {
  if (!transcript) return { turns: 0, questions: 0 }
  const agentLines = transcript
    .split('\n')
    .filter(line => line.toLowerCase().startsWith('agente:'))
    .map(line => line.slice(line.indexOf(':') + 1).trim())
    .filter(Boolean)
  return { turns: agentLines.length, questions: agentLines.filter(line => line.includes('?')).length }
}

export function scoreCall(events: JudgeEvent[], call: { outcome?: string | null; transcript?: string | null }): CallJudgeResult {
  const bargeIns = count(events, 'barge_in.detected')
  const userTurns = count(events, 'turn.user_finished')
  const cancelled = count(events, 'audio.clear')
  const totals = turnTotals(events)
  const { turns: agentTurns, questions } = agentQuestions(call.transcript)

  const optOutIndex = events.findIndex(event => event.type === 'compliance.opt_out')
  const postOptOutSpeech = optOutIndex >= 0 && events.slice(optOutIndex + 1).some(event =>
    event.type === 'audio.output_started' || (event.type === 'transcript.final' && event.payload?.role === 'agente'))
  const criticalErrors = postOptOutSpeech ? ['assistant_spoke_after_opt_out'] : []

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
  if (criticalErrors.length) {
    evidence.push({ dimension: 'compliance', atMs: events[optOutIndex]?.atMs ?? 0, reason: 'se detectó audio posterior al opt-out' })
  }

  const dimensions: CallJudgeResult['dimensions'] = {
    // Interrumpir es normal; interrumpir en cada turno es que el agente no calla.
    turnTaking: userTurns > 0 ? clamp(100 - (bargeIns / userTurns) * 60) : null,
    // Naturalidad medible hoy: cuántos turnos respetaron el objetivo de latencia,
    // penalizando el audio que hubo que cortar a medias.
    voiceNaturalness: totals.length
      ? clamp((totals.filter(total => total <= TURN_TARGET_MS).length / totals.length) * 100 - cancelled * 5)
      : null,
    // Sin banco de aperturas ni salesBrain, la señal es el transcripto.
    discovery: agentTurns > 0 ? clamp((questions / agentTurns) * 200) : null,
    // Requiere clasificar objeciones, que hoy no hace nadie en el camino de la llamada.
    objectionHandling: null,
    compliance: criticalErrors.length ? 0 : 100,
    crmAccuracy: call.outcome && call.outcome !== 'none' ? 92 : 78,
  }

  const measured = Object.values(dimensions).filter((value): value is number => value !== null)
  const overall = measured.length ? clamp(measured.reduce((sum, value) => sum + value, 0) / measured.length) : 0
  const trainingTag = criticalErrors.length
    ? 'critical_error'
    : !measured.length ? 'not_measurable' : overall >= 85 ? 'good_call' : overall >= 65 ? 'needs_review' : 'poor_call'
  return { overall, dimensions, criticalErrors, evidence, trainingTag }
}
