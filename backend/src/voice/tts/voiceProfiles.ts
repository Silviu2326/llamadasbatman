export interface VoiceProfile {
  readonly stability: number
  readonly similarityBoost: number
  readonly style: number
  readonly speed: number
  readonly pauseAfterQMs: number
  readonly pauseStoryBeatMs: number
}

// eleven_v3 is trained with native expressiveness — style > 0.20 causes theatrical
// "performance" rather than natural speech. Keep style low; use stability to control
// variability (lower = more natural pitch/rhythm variation).
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  directo:      { stability: 0.25, similarityBoost: 0.80, style: 0.10, speed: 1.05, pauseAfterQMs: 0,   pauseStoryBeatMs: 150 },
  cercano:      { stability: 0.15, similarityBoost: 0.80, style: 0.07, speed: 0.92, pauseAfterQMs: 300, pauseStoryBeatMs: 200 },
  consultivo:   { stability: 0.40, similarityBoost: 0.78, style: 0.08, speed: 0.88, pauseAfterQMs: 500, pauseStoryBeatMs: 350 },
  challenger:   { stability: 0.12, similarityBoost: 0.82, style: 0.18, speed: 0.97, pauseAfterQMs: 250, pauseStoryBeatMs: 300 },
  storyteller:  { stability: 0.10, similarityBoost: 0.82, style: 0.22, speed: 0.87, pauseAfterQMs: 400, pauseStoryBeatMs: 450 },
  snap:         { stability: 0.28, similarityBoost: 0.80, style: 0.10, speed: 1.12, pauseAfterQMs: 80,  pauseStoryBeatMs: 80  },
  empatico:     { stability: 0.50, similarityBoost: 0.78, style: 0.06, speed: 0.83, pauseAfterQMs: 600, pauseStoryBeatMs: 450 },
  urgente:      { stability: 0.12, similarityBoost: 0.82, style: 0.20, speed: 1.10, pauseAfterQMs: 100, pauseStoryBeatMs: 80  },
  tecnico:      { stability: 0.55, similarityBoost: 0.75, style: 0.05, speed: 0.90, pauseAfterQMs: 450, pauseStoryBeatMs: 300 },
  social_proof: { stability: 0.18, similarityBoost: 0.80, style: 0.12, speed: 0.95, pauseAfterQMs: 300, pauseStoryBeatMs: 280 },
  mini_closer:  { stability: 0.22, similarityBoost: 0.80, style: 0.13, speed: 0.93, pauseAfterQMs: 500, pauseStoryBeatMs: 250 },
}

export const DEFAULT_PROFILE = VOICE_PROFILES['cercano']

export function getProfile(formato: string): VoiceProfile {
  return VOICE_PROFILES[formato] ?? DEFAULT_PROFILE
}

const EMOTION_SPEED: Record<string, number> = {
  agitado: -0.12, molesto: -0.10, confundido: -0.07, tenso: -0.05,
  interesado: 0.05, energico: 0.04, sarcastico: -0.08, plano: 0.03,
}
const EMOTION_STYLE: Record<string, number> = {
  agitado: -0.05, molesto: -0.05, confundido: -0.03,
  interesado: 0.05, plano: 0.06, sarcastico: -0.04,
}
const ACOUSTIC_SPEED: Record<string, number> = {
  agitado: -0.08, tenso: -0.05, plano: 0.04,
}

export function applyModifiers(base: VoiceProfile, emocion = 'neutro', estadoAcustico = 'desconocido'): VoiceProfile {
  const speedDelta = (EMOTION_SPEED[emocion] ?? 0) + (ACOUSTIC_SPEED[estadoAcustico] ?? 0)
  const styleDelta = EMOTION_STYLE[emocion] ?? 0
  const stabilityBump = ['molesto', 'agitado', 'sarcastico'].includes(emocion) ? 0.10 : 0

  return {
    stability: Math.max(0.08, Math.min(0.90, +(base.stability + stabilityBump).toFixed(3))),
    similarityBoost: base.similarityBoost,
    style: Math.max(0.03, Math.min(0.30, +(base.style + styleDelta).toFixed(3))),
    speed: Math.max(0.72, Math.min(1.25, +(base.speed + speedDelta).toFixed(3))),
    pauseAfterQMs: base.pauseAfterQMs,
    pauseStoryBeatMs: base.pauseStoryBeatMs,
  }
}

const REVEAL_RE = /\b(y el resultado|y lo que paso|y la realidad es|lo que nadie sabe|el dato es|lo curioso es|resulta que|lo que encontraron|y eso se traduce en|la clave es|lo que marca la diferencia)\b/gi
const STAT_RE = /(\b(?:un |el |del |unos |más de )?\d+(?:\.\d+)?\s*(?:%|euros?|€|meses?|ausencias?|citas?|horas?))/gi

export function preprocessText(text: string, profile: VoiceProfile): string {
  if (!text.trim()) return text
  let r = text
  if (profile.pauseStoryBeatMs >= 400) r = r.replace(REVEAL_RE, '... $1')
  if (profile.pauseStoryBeatMs >= 300) r = r.replace(STAT_RE, ', $1')
  if (profile.pauseAfterQMs >= 400) r = r.replace(/\?(\s+)([A-ZÀ-ÿ¿])/g, '?... $2')
  r = r.replace(/\.{4,}/g, '...').replace(/\s{2,}/g, ' ').trim()
  return r
}
