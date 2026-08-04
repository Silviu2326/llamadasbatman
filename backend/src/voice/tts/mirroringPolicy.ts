// Capa de decision del mirroring: señales del prospecto -> objetivo de voz.
// Tabla determinista (entrainment clasico): al lento se le habla lento, al tenso
// con calma y pausas, al enérgico con ritmo. Sin LLM, coste cero.

export interface TurnSignals {
  emocion: string        // neutro | interesado | molesto | agitado | confundido | tenso | sarcastico | plano | energico
  acustico: string       // agitado | energico | tenso | calmado | plano | desconocido
  wpm?: number
}

export interface TurnStyle {
  voice: 'default' | 'calm' | 'energetic' | 'empathetic'
  rate: number             // time-stretch del audio TTS (1 = sin cambio)
  preResponsePauseMs: number
}

const RATE_MIN = 0.88
const RATE_MAX = 1.12

export function mirrorPolicy(s: TurnSignals): TurnStyle {
  let style: TurnStyle
  if (s.emocion === 'molesto' || s.emocion === 'agitado' || s.acustico === 'agitado') {
    style = { voice: 'calm', rate: 0.94, preResponsePauseMs: 500 }
  } else if (s.emocion === 'confundido') {
    style = { voice: 'empathetic', rate: 0.92, preResponsePauseMs: 400 }
  } else if (s.emocion === 'tenso' || s.acustico === 'tenso') {
    style = { voice: 'calm', rate: 0.95, preResponsePauseMs: 350 }
  } else if (s.emocion === 'sarcastico') {
    style = { voice: 'calm', rate: 0.97, preResponsePauseMs: 300 }
  } else if (s.emocion === 'interesado' || s.emocion === 'energico' || s.acustico === 'energico') {
    style = { voice: 'energetic', rate: 1.06, preResponsePauseMs: 120 }
  } else if (s.emocion === 'plano' || s.acustico === 'plano') {
    // prospecto apagado: subir energia un punto para despertar sin atropellar
    style = { voice: 'energetic', rate: 1.02, preResponsePauseMs: 200 }
  } else {
    style = { voice: 'default', rate: 1.0, preResponsePauseMs: 200 }
  }

  // Mirroring de ritmo: acercarse a la velocidad del prospecto
  if (s.wpm !== undefined && s.wpm > 0) {
    if (s.wpm > 190) style.rate += 0.05
    else if (s.wpm < 120) style.rate -= 0.05
  }
  style.rate = Math.min(RATE_MAX, Math.max(RATE_MIN, +style.rate.toFixed(3)))
  return style
}

// Etiquetas del SER -> vocabulario de emocion del sistema.
// Claves cortas: wav2vec2-base-superb-er (IEMOCAP). Claves largas: emotion2vec+ (9 emociones).
const SER_MAP: Record<string, string> = {
  ang: 'molesto', hap: 'interesado', sad: 'confundido', neu: 'neutro',
  angry: 'molesto', disgusted: 'molesto', fearful: 'confundido', happy: 'interesado',
  neutral: 'neutro', surprised: 'interesado', other: 'neutro', unknown: 'neutro',
}

export function serToEmocion(label: string): string {
  return SER_MAP[label] ?? 'neutro'
}
