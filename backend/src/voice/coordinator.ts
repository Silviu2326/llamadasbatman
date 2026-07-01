import { VoiceProfile, getProfile } from './tts/voiceProfiles'

export const FORMAT_STT_CONFIG: Record<string, { eotTimeoutMs: number; eotThreshold: number; eagerEotThreshold: number }> = {
  directo:      { eotTimeoutMs: 2000, eotThreshold: 0.65, eagerEotThreshold: 0.45 },
  cercano:      { eotTimeoutMs: 2500, eotThreshold: 0.70, eagerEotThreshold: 0.50 },
  consultivo:   { eotTimeoutMs: 3200, eotThreshold: 0.74, eagerEotThreshold: 0.55 },
  challenger:   { eotTimeoutMs: 2200, eotThreshold: 0.67, eagerEotThreshold: 0.47 },
  storyteller:  { eotTimeoutMs: 2800, eotThreshold: 0.71, eagerEotThreshold: 0.52 },
  snap:         { eotTimeoutMs: 1800, eotThreshold: 0.62, eagerEotThreshold: 0.42 },
  empatico:     { eotTimeoutMs: 3500, eotThreshold: 0.76, eagerEotThreshold: 0.58 },
  urgente:      { eotTimeoutMs: 1800, eotThreshold: 0.62, eagerEotThreshold: 0.42 },
  tecnico:      { eotTimeoutMs: 3000, eotThreshold: 0.73, eagerEotThreshold: 0.54 },
  social_proof: { eotTimeoutMs: 2500, eotThreshold: 0.69, eagerEotThreshold: 0.50 },
  mini_closer:  { eotTimeoutMs: 3200, eotThreshold: 0.75, eagerEotThreshold: 0.56 },
}

const DEFAULT_STT = FORMAT_STT_CONFIG.cercano

export function sttConfigForFormat(formato: string) {
  return FORMAT_STT_CONFIG[formato] ?? DEFAULT_STT
}

export interface CallRhythm {
  prospectWordCounts: number[]
  agentWordCounts: number[]
  interruptionCount: number
  ttsCompletions: number
  prospectSpeakingRates: number[]
}

export function createRhythm(): CallRhythm {
  return { prospectWordCounts: [], agentWordCounts: [], interruptionCount: 0, ttsCompletions: 0, prospectSpeakingRates: [] }
}

export function rhythmAvgProspectWords(r: CallRhythm): number {
  return r.prospectWordCounts.length ? r.prospectWordCounts.reduce((a, b) => a + b, 0) / r.prospectWordCounts.length : 12
}

export function rhythmInterruptionRate(r: CallRhythm): number {
  const total = r.interruptionCount + r.ttsCompletions
  return total > 0 ? r.interruptionCount / total : 0
}

export function suggestedMaxFrases(rhythm: CallRhythm, currentMax: number): number {
  if (rhythmInterruptionRate(rhythm) > 0.40) return 1
  const avg = rhythmAvgProspectWords(rhythm)
  if (avg < 6) return Math.min(currentMax, 2)
  if (avg > 30) return Math.min(currentMax + 1, 4)
  return currentMax
}

export function formatForInterruptionLevel(count: number, currentFormat: string): string | null {
  if (count >= 4) return 'snap'
  if (count >= 2 && !['snap', 'directo', 'urgente'].includes(currentFormat)) return 'directo'
  return null
}

const CLOSING_Q_RE = /\b(cuando te va bien|te parece bien|lo empezamos|lo arrancamos|quedamos|te apunto|agendamos|te confirmo|nos ponemos|lo probáis|lo probamos|empezar esta semana)\b/i
const DISCOVERY_Q_RE = /\b(cómo|cuántos|cuántas|qué tal|actualmente|ahora mismo|gestionáis|usáis|tenéis|hacéis|manejáis|cuánto)\b/i
const STORY_RE = /\b(teníamos|tenía una|había una|un cliente que|una clínica que|un caso de|lo que hicimos|el resultado fue|y lo que pasó)\b/i
const STAT_RE = /\d+\s*(?:%|euros|€|ausencias|citas|meses|horas|pacientes)/i
const CHALLENGE_RE = /\b(la mayoría|el \d+% de|lo curioso es|lo que nadie|resulta que|lo que encontramos|pocas clínicas|casi nadie)\b/i

export type UtteranceType = 'closing_question' | 'challenge' | 'story' | 'data' | 'discovery_question' | 'statement'

export function classifyUtterance(text: string): UtteranceType {
  const hasQ = text.includes('?')
  if (hasQ && CLOSING_Q_RE.test(text)) return 'closing_question'
  if (CHALLENGE_RE.test(text)) return 'challenge'
  if (STORY_RE.test(text)) return 'story'
  if (STAT_RE.test(text)) return 'data'
  if (hasQ && DISCOVERY_Q_RE.test(text)) return 'discovery_question'
  return 'statement'
}

const SPEED_DELTA: Record<string, number> = { closing_question: -0.06, challenge: 0.02, story: -0.04, data: -0.03 }
const STYLE_DELTA: Record<string, number> = { closing_question: -0.05, challenge: 0.08, story: 0.06, data: 0.03 }
const STAB_DELTA: Record<string, number> = { closing_question: 0.08, challenge: -0.05, story: -0.03 }

export function utteranceVoiceOverlay(base: VoiceProfile, type: UtteranceType): VoiceProfile {
  const sd = SPEED_DELTA[type] ?? 0
  const sy = STYLE_DELTA[type] ?? 0
  const sb = STAB_DELTA[type] ?? 0
  if (sd === 0 && sy === 0 && sb === 0) return base
  let pq = base.pauseAfterQMs
  if (type === 'closing_question') pq = Math.min(900, Math.round(pq * 1.4))
  else if (type === 'discovery_question') pq = Math.min(700, Math.round(pq * 1.1))
  return {
    stability: Math.max(0.10, Math.min(0.90, base.stability + sb)),
    similarityBoost: base.similarityBoost,
    style: Math.max(0.05, Math.min(0.95, base.style + sy)),
    speed: Math.max(0.72, Math.min(1.25, base.speed + sd)),
    pauseAfterQMs: pq,
    pauseStoryBeatMs: base.pauseStoryBeatMs,
  }
}
