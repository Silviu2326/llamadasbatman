// Protocolo de la cabina Vendrava (puerto de vendrava-voice-lab/shared/protocol.ts).
// El frontend recibe estos eventos dentro de {type:'voice_event', event:{payload}}
// del WebSocket /voice-sim/live, así que ambos lados comparten esta forma.
export type ProviderName = 'deepgram' | 'cartesia' | 'cerebras' | 'groq' | 'deepseek' | 'fish' | 'minimax'
export type PipelineStage = 'browser' | ProviderName
export type StageStatus = 'idle' | 'connecting' | 'active' | 'complete' | 'error'

export interface SessionSettings {
  speculative: boolean
  voiceId: string
  ttsModel: 's2.1-pro'
  speed: number
}

export const DEFAULT_SETTINGS: SessionSettings = {
  speculative: true,
  voiceId: '',
  ttsModel: 's2.1-pro',
  speed: 1.08,
}

/**
 * Cómo sonó el interlocutor en su último turno. `source` marca de dónde viene la
 * señal, para que un modelo real de prosodia sustituya a la derivada sin tocar el guru.
 */
export interface EmotionReading {
  source: 'derived' | 'hume'
  /** 0–1, proxy de volumen. Alto = agitado o enfático; bajo = cansado o desenganchado. */
  arousal: number
  /** Palabras por minuto del turno. ~150 es neutro en inglés. */
  wordsPerMinute: number
  /** Silencio entre el fin de Carlos y el inicio del interlocutor. Sin valor en el primer turno. */
  replyDelayMs?: number
  /** Interrupciones acumuladas en la sesión. */
  interruptions: number
  /** Resumen en lenguaje llano que reciben el guru y Carlos. */
  label: string
}

/**
 * Fish Audio emite PCM a esta frecuencia. 24 kHz es lo que ya esperan el puente de
 * Twilio (`AudioBridge.geminiToTwilioFrames`) y el simulador de navegador.
 */
export const TTS_SAMPLE_RATE = 24_000

export const DEFAULT_GREETING =
  'Hi—this is Carlos from Vendrava. (breath) I’ll be quick: how’s your day going?'

export interface TurnSegment {
  stage: PipelineStage
  startMs: number
  endMs: number
}

export type CabinEvent =
  | { type: 'session.status'; status: 'idle' | 'connecting' | 'live' | 'demo' | 'stopped'; message?: string }
  | { type: 'provider.status'; provider: ProviderName; status: StageStatus }
  | { type: 'pipeline.stage'; stage: PipelineStage; status: StageStatus; latencyMs?: number }
  | {
      type: 'stt.event'
      event: 'turn.start' | 'turn.update' | 'turn.eager_end' | 'turn.resume' | 'turn.end'
      transcript?: string
    }
  | { type: 'transcript'; id: string; speaker: 'user' | 'assistant'; text: string; final: boolean; speculative?: boolean }
  | { type: 'audio.start'; responseId: string; sampleRate: number; encoding: 'pcm_s16le' }
  | { type: 'audio.end'; responseId: string }
  | { type: 'audio.clear'; reason: string }
  | { type: 'latency.update'; stt?: number; llm?: number; tts?: number; total?: number; record?: boolean }
  | { type: 'turn.metrics'; turnId: string; speculative: boolean; targetMs: number; spanMs: number; segments: TurnSegment[] }
  | { type: 'trace'; id: string; at: number; label: string; stage: PipelineStage | 'system'; durationMs?: number }
  | { type: 'response.cancelled'; responseId: string; reason: string }
  | { type: 'emotion.update'; emotion: EmotionReading }
  | { type: 'guru.update'; read: string; directive: string }
  | { type: 'error'; code: string; message: string; fatal?: boolean }
  // Señales que consume el juez (callJudge.ts) y la telefonía. Se emiten
  // además de las anteriores para que ningún pipeline tenga que inferirlas.
  | { type: 'turn.user_finished'; text: string }
  | { type: 'barge_in.detected'; reason: string }
  | { type: 'audio.output_started'; responseId: string }
  | { type: 'silence.reprompt'; silentMs: number }
  /** El agente se despidió o el prospecto lleva demasiado callado: la telefonía debe colgar tras `drainMs`. */
  | { type: 'call.end_requested'; reason: 'agent_farewell' | 'silence_timeout' | 'end_marker'; drainMs: number }

/**
 * Marca que el modelo añade al final de su último turno cuando la conversación
 * ha terminado. Se retira del texto hablado y mostrado; solo dispara el fin.
 */
export const END_CALL_MARKER = '[FIN_LLAMADA]'

export interface SilencePolicy {
  /** Sin habla del prospecto tras el turno del agente: una repregunta breve. */
  repromptMs: number
  /** Sin habla en total: despedida y colgar. */
  hangupMs: number
  /** Margen tras una despedida sin marca para que el prospecto pueda responder. */
  farewellGraceMs: number
}

const DEFAULT_SILENCE: SilencePolicy = { repromptMs: 12_000, hangupMs: 25_000, farewellGraceMs: 4_000 }

function boundedMs(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.round(parsed) : fallback
}

/** Env por despliegue, `behavior` por agente. Fuera de rango se ignora. */
export function resolveSilencePolicy(behavior?: Record<string, unknown> | null, env: NodeJS.ProcessEnv = process.env): SilencePolicy {
  const repromptMs = boundedMs(behavior?.silenceRepromptMs ?? env.VOICE_SILENCE_REPROMPT_MS, DEFAULT_SILENCE.repromptMs, 3_000, 60_000)
  const hangupMs = Math.max(repromptMs + 3_000, boundedMs(behavior?.silenceHangupMs ?? env.VOICE_SILENCE_HANGUP_MS, DEFAULT_SILENCE.hangupMs, 6_000, 180_000))
  const farewellGraceMs = boundedMs(behavior?.farewellGraceMs ?? env.VOICE_FAREWELL_GRACE_MS, DEFAULT_SILENCE.farewellGraceMs, 1_000, 20_000)
  return { repromptMs, hangupMs, farewellGraceMs }
}

const FAREWELL_PATTERNS: RegExp[] = [
  /\bhasta (luego|pronto|la pr[oó]xima|otro d[ií]a)\b/i,
  /\b(adi[oó]s|que (tenga|tengas|teng[aá]is|vaya|te vaya|le vaya) (un |una )?(buen|buena|feliz) (d[ií]a|tarde|noche|jornada|semana))\b/i,
  /\bgracias por (su|tu|vuestro) tiempo\b/i,
  /\b(good ?bye|bye for now|have a (great|good|nice|wonderful) (day|afternoon|evening|week)|talk (to you )?soon|thanks for your time)\b/i,
]

/** ¿Este turno del agente cierra la conversación? Solo si además no pregunta nada. */
export function looksLikeFarewell(text: string): boolean {
  const clean = text.trim()
  if (!clean || clean.includes('?') || clean.includes('¿')) return false
  return FAREWELL_PATTERNS.some(pattern => pattern.test(clean))
}

/** Quita la marca de fin (entera o cortada por el chunker) del texto hablado o mostrado. */
export function stripEndMarker(text: string): string {
  return text
    .replace(/\[\s*FIN_?LLAMADA\s*\]/gi, '')
    .replace(/\[\s*FIN(?:_?L(?:L(?:A(?:M(?:A(?:D(?:A)?)?)?)?)?)?)?\s*\]?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function hasEndMarker(text: string): boolean {
  return /\[\s*FIN_?LLAMADA\s*\]/i.test(text)
}
