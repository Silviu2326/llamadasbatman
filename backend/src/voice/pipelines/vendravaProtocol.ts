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
