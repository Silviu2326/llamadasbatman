import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GREETING,
  DEFAULT_SETTINGS,
  type EmotionReading,
  type HealthResponse,
  type PipelineStage,
  type ProviderName,
  type ServerEvent,
  type SessionSettings,
  type StageStatus,
  type TurnSegment,
} from "./protocol";
import { BrowserMicrophone } from "./lib/microphone";
import { PcmQueuePlayer } from "./lib/pcmPlayer";

export type VoiceMode = "idle" | "connecting" | "live" | "demo" | "stopped" | "error";
export type VoicePhase = "ready" | "connecting" | "listening" | "thinking" | "speaking" | "demo";

export interface TranscriptItem {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  final: boolean;
  at: number;
}

export interface TraceItem {
  id: string;
  at: number;
  label: string;
  stage: PipelineStage | "system";
  durationMs?: number;
}

interface StageView {
  status: StageStatus;
  latencyMs?: number;
}

export interface LatencySnapshot {
  id: string;
  at: number;
  stt?: number;
  llm?: number;
  tts?: number;
  total: number;
  overlapSaved: number;
  simulated: boolean;
}

export interface TurnTimelineView {
  turnId: string;
  speculative: boolean;
  targetMs: number;
  spanMs: number;
  segments: TurnSegment[];
}

export interface VoiceSessionView {
  mode: VoiceMode;
  phase: VoicePhase;
  statusMessage: string;
  health?: HealthResponse;
  providers: Record<ProviderName, StageStatus>;
  pipeline: Record<PipelineStage, StageView>;
  transcript: TranscriptItem[];
  traces: TraceItem[];
  latency: { stt?: number; llm?: number; tts?: number; total?: number };
  latencyHistory: LatencySnapshot[];
  timeline?: TurnTimelineView;
  inputLevel: number;
  inputPeak: number;
  outputLevel: number;
  outputBufferMs: number;
  clipping: boolean;
  micMuted: boolean;
  speakerMuted: boolean;
  interruptions: number;
  emotion?: EmotionReading;
  guru?: { read: string; directive: string; at: number };
  error?: string;
  startedAt?: number;
}

const initialPipeline: Record<PipelineStage, StageView> = {
  browser: { status: "idle" },
  deepgram: { status: "idle" },
  cartesia: { status: "idle" },
  cerebras: { status: "idle" },
  groq: { status: "idle" },
  deepseek: { status: "idle" },
  fish: { status: "idle" },
  minimax: { status: "idle" },
};

const initialProviders: Record<ProviderName, StageStatus> = {
  deepgram: "idle",
  cartesia: "idle",
  cerebras: "idle",
  groq: "idle",
  deepseek: "idle",
  fish: "idle",
  minimax: "idle",
};

/**
 * Las claves viven en el servidor y el navegador no puede comprobarlas sin
 * gastar una llamada: se asume disponible y el backend responde con un error
 * explícito ("Faltan claves del stack Vendrava") si no lo está.
 */
const SERVER_SIDE_HEALTH: HealthResponse = {
  configured: { deepgram: true, cartesia: true, cerebras: true, groq: true, deepseek: true, fish: true, minimax: true },
  models: { stt: "flux-general-multi", llm: "gpt-oss-120b", tts: "s2.1-pro" },
  defaultVoiceId: DEFAULT_SETTINGS.voiceId,
  liveReady: true,
};

const initialView: VoiceSessionView = {
  mode: "idle",
  phase: "ready",
  statusMessage: "Ready to call",
  health: SERVER_SIDE_HEALTH,
  providers: initialProviders,
  pipeline: initialPipeline,
  transcript: [],
  traces: [],
  latency: {},
  latencyHistory: [],
  inputLevel: 0,
  inputPeak: 0,
  outputLevel: 0,
  outputBufferMs: 0,
  clipping: false,
  micMuted: false,
  speakerMuted: false,
  interruptions: 0,
};

const isProd =
  window.location.hostname === "llamadasspidermanback-production.up.railway.app"
  || window.location.hostname.startsWith("app.");
const WS_URL = isProd
  ? "wss://llamadasspidermanback-production.up.railway.app/voice-sim/live"
  : `ws://${window.location.hostname}:3000/voice-sim/live`;

function overlapSaved(stt: number | undefined, llm: number | undefined, tts: number | undefined, total: number): number {
  return Math.max(0, Math.round(18 + (stt ?? 0) + (llm ?? 0) + (tts ?? 0) - total));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function demoHistory(now: number): LatencySnapshot[] {
  const totals = [612, 498, 566, 483, 531, 604, 487];
  return totals.map((total, index) => {
    const stt = 74 + ((index * 11) % 28);
    const llm = 192 + ((index * 23) % 72);
    const tts = 149 + ((index * 17) % 48);
    return {
      id: `demo-history-${index}`,
      at: now - (totals.length - index) * 24_000,
      stt,
      llm,
      tts,
      total,
      overlapSaved: overlapSaved(stt, llm, tts, total),
      simulated: true,
    };
  });
}

export function useVoiceSession(options: { token?: string | null; agentId?: string }) {
  const { token, agentId } = options;
  const [view, setView] = useState<VoiceSessionView>(initialView);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [phoneAudio, setPhoneAudio] = useState(false);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const microphoneRef = useRef<BrowserMicrophone | undefined>(undefined);
  const playerRef = useRef<PcmQueuePlayer | undefined>(undefined);
  const micMutedRef = useRef(false);
  const speakerMutedRef = useRef(false);
  const lastInputPaintRef = useRef(0);
  const demoRunRef = useRef(0);

  if (!playerRef.current) {
    playerRef.current = new PcmQueuePlayer(({ active, bufferedMs, level }) => {
      setView((current) => ({
        ...current,
        phase: active ? "speaking" : current.mode === "live" ? "listening" : current.phase,
        outputBufferMs: bufferedMs,
        outputLevel: active ? level : 0,
      }));
    });
  }

  useEffect(() => {
    playerRef.current?.setPhoneFilter(phoneAudio);
  }, [phoneAudio]);

  useEffect(() => () => {
    microphoneRef.current?.stop();
    socketRef.current?.close();
    playerRef.current?.close();
  }, []);

  const handleServerEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "session.status":
        setView((current) => ({
          ...current,
          mode: event.status,
          phase:
            event.status === "connecting"
              ? "connecting"
              : event.status === "live"
                ? "listening"
                : event.status === "demo"
                  ? "demo"
                  : "ready",
          statusMessage: event.message ?? event.status,
          startedAt:
            event.status === "live" || event.status === "demo"
              ? current.startedAt ?? Date.now()
              : current.startedAt,
        }));
        break;
      case "provider.status":
        setView((current) => ({
          ...current,
          providers: { ...current.providers, [event.provider]: event.status },
        }));
        break;
      case "pipeline.stage":
        setView((current) => ({
          ...current,
          pipeline: {
            ...current.pipeline,
            [event.stage]: { status: event.status, latencyMs: event.latencyMs },
          },
        }));
        break;
      case "stt.event":
        if (event.event === "turn.start" || event.event === "turn.resume") {
          playerRef.current?.clear();
          setView((current) => ({
            ...current,
            phase: "listening",
            latency: {},
            timeline: undefined,
          }));
        } else if (event.event === "turn.eager_end" || event.event === "turn.end") {
          setView((current) => ({ ...current, phase: "thinking" }));
        }
        break;
      case "transcript":
        setView((current) => {
          let transcript = current.transcript;
          if (event.speaker === "user" && event.final) {
            transcript = transcript.filter((item) => item.id !== "active-user-turn");
          }
          const existing = transcript.findIndex((item) => item.id === event.id);
          const item: TranscriptItem = { ...event, at: Date.now() };
          transcript =
            existing >= 0
              ? transcript.map((entry, index) => (index === existing ? { ...entry, ...item } : entry))
              : [...transcript, item];
          return {
            ...current,
            phase:
              current.mode === "demo" && event.speaker === "assistant" && event.final
                ? "demo"
                : current.phase,
            transcript: transcript.slice(-24),
          };
        });
        break;
      case "audio.start":
        playerRef.current?.configure(event.sampleRate);
        setView((current) => ({ ...current, phase: "speaking" }));
        break;
      case "audio.clear":
        playerRef.current?.clear();
        break;
      case "latency.update": {
        const { type: _type, record: shouldRecord, ...metrics } = event;
        void _type;
        setView((current) => {
          const latency = { ...current.latency, ...metrics };
          if (metrics.total === undefined || shouldRecord === false) return { ...current, latency };
          const snapshot: LatencySnapshot = {
            id: `${Date.now()}-${current.latencyHistory.length}`,
            at: Date.now(),
            stt: latency.stt,
            llm: latency.llm,
            tts: latency.tts,
            total: metrics.total,
            overlapSaved: overlapSaved(latency.stt, latency.llm, latency.tts, metrics.total),
            simulated: current.mode === "demo",
          };
          return {
            ...current,
            latency,
            latencyHistory: [...current.latencyHistory, snapshot].slice(-12),
          };
        });
        break;
      }
      case "turn.metrics":
        setView((current) => {
          const serialWork = event.segments.reduce(
            (sum, segment) => sum + Math.max(0, segment.endMs - segment.startMs),
            0,
          );
          const firstStart = Math.min(...event.segments.map((segment) => segment.startMs));
          const finalEnd = Math.max(...event.segments.map((segment) => segment.endMs));
          const parallelSaved = Math.max(0, Math.round(serialWork - (finalEnd - firstStart)));
          const latencyHistory = current.latencyHistory.map((snapshot, index, snapshots) =>
            index === snapshots.length - 1 ? { ...snapshot, overlapSaved: parallelSaved } : snapshot,
          );
          return {
            ...current,
            latencyHistory,
            timeline: {
              turnId: event.turnId,
              speculative: event.speculative,
              targetMs: event.targetMs,
              spanMs: event.spanMs,
              segments: event.segments,
            },
          };
        });
        break;
      case "trace":
        setView((current) => ({ ...current, traces: [event, ...current.traces].slice(0, 30) }));
        break;
      case "emotion.update":
        setView((current) => ({ ...current, emotion: event.emotion }));
        break;
      case "guru.update":
        setView((current) => ({
          ...current,
          guru: { read: event.read, directive: event.directive, at: Date.now() },
        }));
        break;
      case "response.cancelled":
        setView((current) => ({
          ...current,
          interruptions:
            event.reason === "manual interrupt" ? current.interruptions : current.interruptions + 1,
          transcript: current.transcript.map((item) =>
            item.id === event.responseId ? { ...item, final: true } : item,
          ),
        }));
        break;
      case "demo.speak": {
        if ("speechSynthesis" in window && !speakerMutedRef.current) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(event.text);
          utterance.lang = "en-US";
          utterance.rate = 1.08;
          window.speechSynthesis.speak(utterance);
        }
        break;
      }
      case "error":
        setView((current) => ({
          ...current,
          mode: event.fatal ? "error" : current.mode,
          phase: event.fatal ? "ready" : current.phase,
          error: event.message,
        }));
        if (event.fatal) {
          microphoneRef.current?.stop();
          microphoneRef.current = undefined;
        }
        break;
      case "audio.end":
        break;
    }
  }, []);

  /**
   * El simulador del CRM envuelve cada evento del pipeline en
   * {type:'voice_event', event:{payload}}. El resto de mensajes (partial,
   * transcript, status) son los del simulador clásico y aquí llegan duplicados.
   */
  const handleSimMessage = useCallback((raw: string) => {
    const message = JSON.parse(raw) as { type: string; event?: { payload?: ServerEvent }; message?: string };
    if (message.type === "voice_event" && message.event?.payload?.type) {
      handleServerEvent(message.event.payload);
      return;
    }
    if (message.type === "error") {
      handleServerEvent({ type: "error", code: "sim_error", message: message.message ?? "Error de sesión.", fatal: true });
      return;
    }
    if (message.type === "interrupt") playerRef.current?.clear();
  }, [handleServerEvent]);

  const openSocket = useCallback(async (): Promise<WebSocket> => {
    const existing = socketRef.current;
    if (existing?.readyState === WebSocket.OPEN) return existing;
    existing?.close();
    if (!token) throw new Error("Tu sesión ha caducado. Inicia sesión de nuevo.");

    const socket = new WebSocket(WS_URL, ["vendrava", token]);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    socket.onmessage = (message) => {
      if (message.data instanceof ArrayBuffer) {
        if (!speakerMutedRef.current) playerRef.current?.enqueue(message.data);
        return;
      }
      try {
        handleSimMessage(String(message.data));
      } catch {
        setView((current) => ({ ...current, error: "Received an unreadable server event." }));
      }
    };
    socket.onclose = () => {
      setView((current) =>
        current.mode === "live" || current.mode === "connecting"
          ? { ...current, mode: "error", phase: "ready", error: "Voice socket closed." }
          : current,
      );
    };

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Could not open the voice socket."));
    });
    return socket;
  }, [handleSimMessage, token]);

  const startLive = useCallback(async () => {
    try {
      demoRunRef.current += 1;
      micMutedRef.current = false;
      speakerMutedRef.current = false;
      playerRef.current?.setMuted(false);
      setView((current) => ({
        ...initialView,
        health: current.health,
        mode: "connecting",
        phase: "connecting",
        statusMessage: "Requesting microphone",
        startedAt: Date.now(),
      }));
      await playerRef.current?.resume();
      const socket = await openSocket();
      socket.send(JSON.stringify({ type: "start", engine: "vendrava", agentId: agentId || undefined, settings }));

      const microphone = new BrowserMicrophone({
        onAudio: (frame) => {
          if (!micMutedRef.current && socket.readyState === WebSocket.OPEN) socket.send(frame);
        },
        onLevel: (telemetry) => {
          const now = performance.now();
          if (now - lastInputPaintRef.current < 50) return;
          lastInputPaintRef.current = now;
          setView((current) => ({
            ...current,
            inputLevel: micMutedRef.current ? 0 : telemetry.level,
            inputPeak: micMutedRef.current ? 0 : telemetry.peak,
            clipping: !micMutedRef.current && telemetry.clipped,
            pipeline: {
              ...current.pipeline,
              browser: {
                status: !micMutedRef.current && telemetry.level > 0.03 ? "active" : "complete",
                latencyMs: 18,
              },
            },
          }));
        },
      });
      microphoneRef.current = microphone;
      await microphone.start();
    } catch (error) {
      microphoneRef.current?.stop();
      microphoneRef.current = undefined;
      setView((current) => ({
        ...current,
        mode: "error",
        phase: "ready",
        error: (error as Error).message,
      }));
    }
  }, [agentId, openSocket, settings]);

  const stop = useCallback(() => {
    demoRunRef.current += 1;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    }
    socketRef.current?.close();
    socketRef.current = undefined;
    microphoneRef.current?.stop();
    microphoneRef.current = undefined;
    playerRef.current?.clear();
    window.speechSynthesis?.cancel();
    setView((current) => ({
      ...current,
      mode: "stopped",
      phase: "ready",
      inputLevel: 0,
      inputPeak: 0,
      outputLevel: 0,
      outputBufferMs: 0,
      clipping: false,
    }));
  }, []);

  /**
   * Demo de interfaz: no toca proveedores ni backend. Reproduce un turno con
   * la voz del sistema operativo para verificar la cabina sin gastar APIs.
   */
  const runDemo = useCallback(async () => {
    stop();
    const run = demoRunRef.current + 1;
    demoRunRef.current = run;
    const alive = () => demoRunRef.current === run;
    const now = Date.now();
    setView(() => ({
      ...initialView,
      mode: "demo",
      phase: "demo",
      statusMessage: "Simulated UI turn",
      startedAt: now,
      latencyHistory: demoHistory(now),
    }));
    for (const provider of ["deepgram", "cerebras", "fish"] as const) {
      handleServerEvent({ type: "provider.status", provider, status: "active" });
    }

    const question = "Hi Carlos, I only have a minute—what is this about?";
    handleServerEvent({ type: "transcript", id: "demo-greeting", speaker: "assistant", text: DEFAULT_GREETING, final: true });
    handleServerEvent({ type: "demo.speak", text: DEFAULT_GREETING });
    await delay(450);
    if (!alive()) return;

    handleServerEvent({ type: "stt.event", event: "turn.start" });
    handleServerEvent({ type: "pipeline.stage", stage: "browser", status: "active", latencyMs: 18 });
    handleServerEvent({ type: "transcript", id: "demo-user", speaker: "user", text: question, final: false });
    await delay(320);
    if (!alive()) return;
    handleServerEvent({ type: "stt.event", event: "turn.eager_end", transcript: question });
    handleServerEvent({ type: "pipeline.stage", stage: "cerebras", status: "active" });
    handleServerEvent({ type: "pipeline.stage", stage: "fish", status: "connecting" });
    await delay(190);
    if (!alive()) return;
    handleServerEvent({ type: "stt.event", event: "turn.end", transcript: question });
    handleServerEvent({ type: "transcript", id: "demo-user", speaker: "user", text: question, final: true });
    handleServerEvent({ type: "pipeline.stage", stage: "deepgram", status: "complete", latencyMs: 84 });
    handleServerEvent({ type: "latency.update", stt: 84 });
    await delay(95);
    if (!alive()) return;
    handleServerEvent({ type: "pipeline.stage", stage: "cerebras", status: "complete", latencyMs: 218 });
    handleServerEvent({ type: "latency.update", llm: 218 });
    handleServerEvent({ type: "transcript", id: "demo-carlos", speaker: "assistant", text: "Absolutely—I’ll keep it brief.", final: false });
    await delay(115);
    if (!alive()) return;
    const answer = "Absolutely—I’ll keep it brief. I’m calling from Vendrava to see whether a faster voice workflow could help your team.";
    handleServerEvent({ type: "transcript", id: "demo-carlos", speaker: "assistant", text: answer, final: true });
    handleServerEvent({ type: "demo.speak", text: answer });
    handleServerEvent({ type: "pipeline.stage", stage: "fish", status: "complete", latencyMs: 176 });
    handleServerEvent({ type: "latency.update", tts: 176, total: 489, record: true });
    handleServerEvent({
      type: "turn.metrics",
      turnId: "demo-turn",
      speculative: true,
      targetMs: 650,
      spanMs: 406,
      segments: [
        { stage: "browser", startMs: 0, endMs: 18 },
        { stage: "deepgram", startMs: 44, endMs: 128 },
        { stage: "cerebras", startMs: 90, endMs: 308 },
        { stage: "fish", startMs: 230, endMs: 406 },
      ],
    });
    handleServerEvent({ type: "trace", id: "demo-trace", at: Date.now(), label: "Demo response ready", stage: "fish", durationMs: 489 });
  }, [handleServerEvent, stop]);

  const sendText = useCallback((text: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      setView((current) => ({ ...current, latency: {}, timeline: undefined }));
      socketRef.current.send(JSON.stringify({ type: "text", text }));
    }
  }, []);

  const toggleMicrophone = useCallback(() => {
    setView((current) => {
      if (current.mode !== "live") return current;
      const micMuted = !current.micMuted;
      micMutedRef.current = micMuted;
      return {
        ...current,
        micMuted,
        inputLevel: micMuted ? 0 : current.inputLevel,
        inputPeak: micMuted ? 0 : current.inputPeak,
        clipping: micMuted ? false : current.clipping,
      };
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setView((current) => {
      const speakerMuted = !current.speakerMuted;
      speakerMutedRef.current = speakerMuted;
      playerRef.current?.setMuted(speakerMuted);
      if (speakerMuted) window.speechSynthesis?.cancel();
      return { ...current, speakerMuted };
    });
  }, []);

  const interrupt = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    playerRef.current?.clear();
    window.speechSynthesis?.cancel();
    setView((current) => ({
      ...current,
      phase: current.mode === "live" ? "listening" : current.phase,
      interruptions: current.interruptions + 1,
    }));
  }, []);

  const clearError = useCallback(() => {
    setView((current) => ({ ...current, error: undefined }));
  }, []);

  return {
    view,
    settings,
    setSettings,
    phoneAudio,
    setPhoneAudio,
    startLive,
    stop,
    runDemo,
    sendText,
    toggleMicrophone,
    toggleSpeaker,
    interrupt,
    clearError,
  };
}
