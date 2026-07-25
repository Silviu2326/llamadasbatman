export type JudgeEvent = {
  type: string
  atMs?: number
  payload?: Record<string, unknown>
}

export type CallJudgeResult = {
  overall: number
  dimensions: {
    turnTaking: number
    voiceNaturalness: number
    discovery: number
    objectionHandling: number
    compliance: number
    crmAccuracy: number
  }
  criticalErrors: string[]
  evidence: Array<{ dimension: string; atMs: number; reason: string }>
  trainingTag: string
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function count(events: JudgeEvent[], type: string): number {
  return events.filter(event => event.type === type).length
}

export function scoreCall(events: JudgeEvent[], call: { outcome?: string | null; transcript?: string | null }): CallJudgeResult {
  const interruptions = count(events, 'turn.interruption') + count(events, 'barge_in.detected')
  const discoveryActions = events.filter(event => event.type === 'sales_action.selected' && event.payload?.action === 'ASK_DISCOVERY_QUESTION')
  const objectionActions = events.filter(event => event.type === 'sales_action.selected' && event.payload?.action === 'HANDLE_OBJECTION')
  const optOutIndex = events.findIndex(event => event.type === 'compliance.opt_out')
  const postOptOutSpeech = optOutIndex >= 0 && events.slice(optOutIndex + 1).some(event => event.type === 'audio.output_started' || event.type === 'transcript.final' && event.payload?.role === 'agente')
  const criticalErrors = postOptOutSpeech ? ['assistant_spoke_after_opt_out'] : []

  const evidence: CallJudgeResult['evidence'] = []
  if (discoveryActions[0]) evidence.push({ dimension: 'discovery', atMs: discoveryActions[0].atMs ?? 0, reason: 'se realizó una pregunta de descubrimiento' })
  if (objectionActions[0]) evidence.push({ dimension: 'objectionHandling', atMs: objectionActions[0].atMs ?? 0, reason: 'se activó una acción específica para la objeción' })
  if (criticalErrors.length) evidence.push({ dimension: 'compliance', atMs: events[optOutIndex]?.atMs ?? 0, reason: 'se detectó audio posterior al opt-out' })

  const dimensions = {
    turnTaking: clamp(100 - interruptions * 8 + Math.min(10, count(events, 'turn.user_finished'))),
    voiceNaturalness: clamp(78 + Math.min(18, count(events, 'tts.first_audio')) - Math.min(20, count(events, 'audio.output_cancelled'))),
    discovery: clamp(40 + discoveryActions.length * 20),
    objectionHandling: clamp(55 + objectionActions.length * 15),
    compliance: criticalErrors.length ? 0 : 100,
    crmAccuracy: call.outcome && call.outcome !== 'none' ? 92 : 78,
  }
  const overall = clamp(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.values(dimensions).length)
  const trainingTag = criticalErrors.length ? 'critical_error' : overall >= 85 ? 'good_call' : overall >= 65 ? 'needs_review' : 'poor_call'
  return { overall, dimensions, criticalErrors, evidence, trainingTag }
}
