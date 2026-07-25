export type ProsodyStyle = 'warm' | 'professional' | 'empathetic' | 'energetic' | 'neutral'
export type ProsodyPace = 'slow' | 'normal' | 'fast'

export type ProsodyPlan = {
  text: string
  style: ProsodyStyle
  pace: ProsodyPace
  pauseBeforeMs?: number
  pauseAfterMs?: number
  emphasis?: string[]
  pronunciationHints?: Array<{ surface: string; spoken: string }>
  maxDurationMs?: number
  interruptible: boolean
}

const DIGITS: Record<string, string> = {
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
  '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
}

const PRONUNCIATIONS: Array<[RegExp, string]> = [
  [/\bCRM\b/gi, 'ce erre eme'],
  [/\bIA\b/gi, 'inteligencia artificial'],
  [/\bROI\b/gi, 'erre o i'],
  [/\bAPI\b/gi, 'api'],
]

export function normalizeForSpeech(input: string): string {
  let text = input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S+/gi, 'el enlace')
    .replace(/\s+/g, ' ')
    .trim()

  text = text.replace(/\b(?:\+34\s?)?(\d[\s.-]?){8}\d\b/g, match => {
    const digits = match.replace(/\D/g, '')
    return digits.split('').map(digit => DIGITS[digit] ?? digit).join(' ')
  })
  for (const [pattern, replacement] of PRONUNCIATIONS) text = text.replace(pattern, replacement)
  return text
}

export function buildProsodyPlan(text: string, signals: { emotion?: string; acoustic?: string; maxDurationMs?: number } = {}): ProsodyPlan {
  const normalized = normalizeForSpeech(text)
  const tense = ['molesto', 'agitado', 'frustrado', 'tenso'].includes(signals.emotion ?? '') || signals.acoustic === 'agitado'
  const interested = signals.emotion === 'interesado'
  return {
    text: normalized,
    style: tense ? 'empathetic' : interested ? 'energetic' : 'warm',
    pace: tense ? 'slow' : 'normal',
    pauseAfterMs: tense ? 350 : 180,
    maxDurationMs: signals.maxDurationMs ?? 12_000,
    interruptible: true,
  }
}

export type TtsRoute = 'cache' | 'local_fast' | 'local_quality' | 'remote_quality' | 'fallback'

export function selectTtsRoute(text: string, options: { localReady?: boolean; remoteReady?: boolean } = {}): TtsRoute {
  const normalized = normalizeForSpeech(text)
  if (normalized.length <= 18 && options.localReady) return 'cache'
  if (/(tel[eé]fono|direcci[oó]n|c[oó]digo|\b\d{5}\b)/i.test(normalized)) return options.localReady ? 'local_fast' : 'fallback'
  if (options.remoteReady) return 'remote_quality'
  if (options.localReady) return 'local_quality'
  return 'fallback'
}
