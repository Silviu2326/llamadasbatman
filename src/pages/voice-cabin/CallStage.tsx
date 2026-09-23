import {
  AudioLines,
  Keyboard,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  Radio,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from "./icons";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { VoiceSessionView } from "./useVoiceSession";
import { formatClock, toDb } from "./lib/voiceMetrics";

const phaseCopy = {
  ready: { kicker: "READY", title: "Ready for a live call" },
  connecting: { kicker: "CONNECTING", title: "Opening the voice line" },
  listening: { kicker: "USER CHANNEL", title: "Listening to you" },
  thinking: { kicker: "TURN DETECTED", title: "Carlos is composing" },
  speaking: { kicker: "CARLOS · LIVE", title: "Carlos is speaking" },
  demo: { kicker: "SIMULATED TURN", title: "Demo telemetry active" },
} as const;

interface CallStageProps {
  view: VoiceSessionView;
  locale?: string;
  onStart: () => Promise<void>;
  onStop: () => void;
  onDemo: () => Promise<void>;
  onSendText: (text: string) => void;
  onToggleMicrophone: () => void;
  onToggleSpeaker: () => void;
  onInterrupt: () => void;
}

export function CallStage({
  view,
  locale = "es",
  onStart,
  onStop,
  onDemo,
  onSendText,
  onToggleMicrophone,
  onToggleSpeaker,
  onInterrupt,
}: CallStageProps) {
  const es = locale !== "en";
  const [typedText, setTypedText] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isActive = view.mode === "live" || view.mode === "connecting" || view.mode === "demo";
  const isLive = view.mode === "live";
  const currentPhase = es ? {
    ready: { kicker: "LISTO", title: "Listo para una llamada" },
    connecting: { kicker: "CONECTANDO", title: "Abriendo la línea de voz" },
    listening: { kicker: "TU CANAL", title: "Te estamos escuchando" },
    thinking: { kicker: "TURNO DETECTADO", title: "Isa está preparando la respuesta" },
    speaking: { kicker: "ISA · EN VIVO", title: "Isa está hablando" },
    demo: { kicker: "TURNO SIMULADO", title: "Telemetría de demostración" },
  }[view.phase] : phaseCopy[view.phase];

  const waveform = useMemo(
    () =>
      Array.from({ length: 58 }, (_, index) => {
        const harmonic = Math.abs(Math.sin(index * 1.37) * 0.56 + Math.sin(index * 0.37) * 0.32);
        const userEnergy = view.phase === "listening" ? 0.18 + view.inputLevel * (0.45 + (index % 6) / 10) : 0.1;
        const aiEnergy = view.phase === "speaking" || view.phase === "demo" ? 0.24 + view.outputLevel * 0.5 : 0.09;
        return {
          user: Math.min(1, 0.06 + harmonic * 0.22 + userEnergy),
          ai: Math.min(1, 0.05 + Math.abs(Math.cos(index * 1.11)) * 0.22 + aiEnergy),
        };
      }),
    [view.inputLevel, view.outputLevel, view.phase],
  );

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [view.transcript]);

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    const clean = typedText.trim();
    if (!clean || !isLive) return;
    onSendText(clean);
    setTypedText("");
  };

  return (
    <section className="call-stage surface" aria-labelledby="call-title">
      <header className="surface-header call-heading">
        <div>
          <span className={`eyebrow phase-ink-${view.phase}`}><i /> {currentPhase.kicker}</span>
          <h1 id="call-title">{currentPhase.title}</h1>
        </div>
        <div className="call-heading-meta">
          {view.mode === "demo" && <span className="simulation-tag">{es ? "SIMULACIÓN · SIN APIS" : "SIMULATION · NO APIS"}</span>}
          <span>{view.statusMessage}</span>
        </div>
      </header>

      <div className={`interaction-view phase-${view.phase}`}>
        <div className="interaction-intro">
          <div>
            <span className="eyebrow"><AudioLines size={12} /> {es ? "Interacción continua" : "Continuous interaction"}</span>
            <p>{es ? "Mira cómo escucha y responde el agente en cada turno." : "See how the agent listens and responds on every turn."}</p>
          </div>
          <div className="interaction-latency">
            <b>{view.latency.total === undefined ? "—" : `${Math.round(view.latency.total)} ms`}</b>
            <span>{es ? "tiempo de respuesta" : "response time"}</span>
          </div>
        </div>

        <div className="interaction-track interaction-track-user">
          <button className="track-play" type="button" onClick={() => void onStart()} disabled={!view.health?.liveReady && !isActive} aria-label={es ? "Iniciar escucha" : "Start listening"}>
            <Play size={15} fill="currentColor" />
          </button>
          <div className="track-label"><b>{es ? "Tú" : "User"}</b><small>{es ? "Entrada de voz" : "Voice input"}</small></div>
          <div className="track-wave" aria-label={`${es ? "Actividad de entrada" : "Input activity"}: ${Math.round(toDb(Math.max(view.inputPeak, 0.001)))} dBFS`}>
            {waveform.map((bar, index) => <i key={index} style={{ height: `${Math.max(5, bar.user * 88)}%` }} />)}
          </div>
          <div className="track-meta"><span>{view.micMuted ? (es ? "SILENCIADO" : "MUTED") : (es ? "ESCUCHANDO" : "LISTENING")}</span><b>{Math.round(toDb(Math.max(view.inputPeak, 0.001)))} dBFS</b></div>
        </div>

        <div className="interaction-track interaction-track-ai">
          <button className="track-play" type="button" onClick={() => void onDemo()} aria-label={es ? "Probar respuesta" : "Test response"}>
            <Play size={15} fill="currentColor" />
          </button>
          <div className="track-label"><b>{es ? "Isa" : "GPT-Live-1"}</b><small>{es ? "Respuesta de voz" : "Voice response"}</small></div>
          <div className="track-wave" aria-label={`${es ? "Actividad de salida" : "Output activity"}: ${view.latency.tts === undefined ? "—" : `${Math.round(view.latency.tts)} ms`}`}>
            {waveform.map((bar, index) => <i key={index} style={{ height: `${Math.max(5, bar.ai * 88)}%` }} />)}
          </div>
          <div className="track-meta"><span>{view.phase === "speaking" ? (es ? "RESPONDIENDO" : "SPEAKING") : (es ? "PREPARADA" : "READY")}</span><b>{view.latency.tts === undefined ? "—" : `${Math.round(view.latency.tts)} ms`}</b></div>
        </div>
      </div>

      <div className="call-action-bar">
        {!isActive ? (
          <button className="call-action start-action" type="button" onClick={() => void onStart()} disabled={!view.health?.liveReady}>
            <Mic size={18} /> <span><b>{es ? "Iniciar llamada" : "Start live call"}</b><small>{es ? "Micrófono del navegador" : "Browser microphone"}</small></span>
          </button>
        ) : (
          <button className={`call-action ${view.micMuted ? "is-toggled" : ""}`} type="button" onClick={onToggleMicrophone} disabled={!isLive}>
            {view.micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            <span><b>{view.micMuted ? (es ? "Activar micrófono" : "Unmute") : (es ? "Silenciar" : "Mute")}</b><small>{es ? "Micrófono" : "Microphone"}</small></span>
          </button>
        )}

        <button className={`call-action output-action ${view.speakerMuted ? "is-toggled" : ""}`} type="button" onClick={onToggleSpeaker} disabled={!isActive}>
          {view.speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span><b>{view.speakerMuted ? (es ? "Audio apagado" : "Output off") : (es ? "Audio activado" : "Output on")}</b><small>{es ? "Audio del navegador" : "Browser audio"}</small></span>
        </button>

        <button className="call-action interrupt-action" type="button" onClick={onInterrupt} disabled={!isActive}>
          <Zap size={18} /> <span><b>{es ? "Interrumpir a Isa" : "Interrupt Carlos"}</b><small>{es ? "Interrupción inmediata" : "Immediate barge-in"}</small></span>
        </button>

        <button className="call-action end-action" type="button" onClick={onStop} disabled={!isActive}>
          <PhoneOff size={18} /> <span><b>{es ? "Terminar llamada" : "End call"}</b><small>{es ? "Vaciar audio" : "Clear audio queue"}</small></span>
        </button>

        <button className="demo-action" type="button" onClick={() => void onDemo()}>
          {isActive ? <Sparkles size={15} /> : <Play size={15} />} {es ? "Probar demo" : "Run demo"}
        </button>
      </div>

      {!view.health?.liveReady && !isActive && (
        <div className="call-lock-note">
          <Radio size={14} /> {es ? "El modo en vivo necesita las tres claves del servidor. La demo simulada está disponible." : "Live mode needs the three server-side keys. The simulated demo is ready now."}
        </div>
      )}

      <div className="transcript-module">
        <div className="module-title-row">
          <span className="eyebrow">{es ? "Transcripción" : "Transcript"}</span>
          <span className="privacy-copy"><Radio size={12} /> {es ? "Sesión privada" : "Ephemeral session"}</span>
        </div>
        <div className="transcript-feed" ref={transcriptRef} aria-live="polite">
          {view.transcript.length === 0 ? (
            <div className="transcript-empty">
              <MessageSquareText size={20} />
              <span>{es ? "Isa se presenta primero. Inicia la llamada o prueba la demo." : "Carlos introduces himself first. Start the line or run the demo."}</span>
            </div>
          ) : (
            view.transcript.map((item) => (
              <article className={`transcript-entry ${item.speaker}`} key={item.id}>
                <span className="speaker-mark">{item.speaker === "assistant" ? "C" : "Y"}</span>
                <div className="transcript-speaker">
                  <b>{item.speaker === "assistant" ? (es ? "Isa" : "Carlos") : (es ? "Tú" : "You")}</b>
                  {item.speaker === "assistant" && <em>AI</em>}
                </div>
                <p>{item.text || "…"}</p>
                <time>{formatClock(item.at)}</time>
                {!item.final && <span className="streaming-dot" title={es ? "En directo" : "Streaming"} />}
              </article>
            ))
          )}
        </div>
        <form className="typed-reply" onSubmit={submitTyped}>
          <Keyboard size={16} />
          <input
            value={typedText}
            onChange={(event) => setTypedText(event.target.value)}
            placeholder={isLive ? (es ? "Escribe una respuesta para probar…" : "Type your reply to test a turn…") : (es ? "Inicia una llamada para escribir un turno" : "Start a live call to send a typed turn")}
            disabled={!isLive}
            aria-label={es ? "Turno escrito de prueba" : "Typed test turn"}
          />
          <span>ENTER</span>
          <button type="submit" disabled={!isLive || !typedText.trim()} aria-label={es ? "Enviar turno escrito" : "Send typed turn"}><Send size={17} /></button>
        </form>
      </div>
    </section>
  );
}
