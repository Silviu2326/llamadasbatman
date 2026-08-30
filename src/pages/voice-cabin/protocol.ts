// Espejo de backend/src/voice/pipelines/vendravaProtocol.ts. Los eventos llegan
// dentro de {type:'voice_event', event:{payload}} por /voice-sim/live.
export type ProviderName = "deepgram" | "cartesia" | "cerebras" | "groq" | "deepseek" | "fish" | "minimax";
export type PipelineStage = "browser" | ProviderName;
export type StageStatus = "idle" | "connecting" | "active" | "complete" | "error";

export interface SessionSettings {
  speculative: boolean;
  voiceId: string;
  ttsModel: "s2.1-pro";
  speed: number;
}

export const DEFAULT_SETTINGS: SessionSettings = {
  speculative: true,
  voiceId: "",
  ttsModel: "s2.1-pro",
  speed: 1.08,
};

export interface EmotionReading {
  source: "derived" | "hume";
  arousal: number;
  wordsPerMinute: number;
  replyDelayMs?: number;
  interruptions: number;
  label: string;
}

/** El simulador entrega el audio del agente ya en Float32 a 24 kHz. */
export const TTS_SAMPLE_RATE = 24_000;

export const DEFAULT_GREETING =
  "Hi—this is Carlos from Vendrava. I’ll be quick: how’s your day going?";

export interface TurnSegment {
  stage: PipelineStage;
  startMs: number;
  endMs: number;
}

export type ServerEvent =
  | { type: "session.status"; status: "idle" | "connecting" | "live" | "demo" | "stopped"; message?: string }
  | { type: "provider.status"; provider: ProviderName; status: StageStatus }
  | { type: "pipeline.stage"; stage: PipelineStage; status: StageStatus; latencyMs?: number }
  | {
      type: "stt.event";
      event: "turn.start" | "turn.update" | "turn.eager_end" | "turn.resume" | "turn.end";
      transcript?: string;
    }
  | { type: "transcript"; id: string; speaker: "user" | "assistant"; text: string; final: boolean; speculative?: boolean }
  | { type: "audio.start"; responseId: string; sampleRate: number; encoding: "pcm_s16le" }
  | { type: "audio.end"; responseId: string }
  | { type: "audio.clear"; reason: string }
  | { type: "latency.update"; stt?: number; llm?: number; tts?: number; total?: number; record?: boolean }
  | { type: "turn.metrics"; turnId: string; speculative: boolean; targetMs: number; spanMs: number; segments: TurnSegment[] }
  | { type: "trace"; id: string; at: number; label: string; stage: PipelineStage | "system"; durationMs?: number }
  | { type: "response.cancelled"; responseId: string; reason: string }
  | { type: "demo.speak"; text: string }
  | { type: "emotion.update"; emotion: EmotionReading }
  | { type: "guru.update"; read: string; directive: string }
  | { type: "error"; code: string; message: string; fatal?: boolean };

export interface HealthResponse {
  configured: Record<ProviderName, boolean>;
  models: { stt: string; llm: string; tts: string };
  defaultVoiceId: string;
  liveReady: boolean;
}
