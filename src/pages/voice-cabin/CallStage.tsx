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
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  onStart,
  onStop,
  onDemo,
  onSendText,
  onToggleMicrophone,
  onToggleSpeaker,
  onInterrupt,
}: CallStageProps) {
  const [typedText, setTypedText] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isActive = view.mode === "live" || view.mode === "connecting" || view.mode === "demo";
  const isLive = view.mode === "live";
  const currentPhase = phaseCopy[view.phase];

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
          {view.mode === "demo" && <span className="simulation-tag">SIMULATION · NO APIS</span>}
          <span>{view.statusMessage}</span>
        </div>
      </header>

      <div className={`voice-field phase-${view.phase}`}>
        <div className="channel-readout channel-user">
          <span>User</span>
          <b>{view.micMuted ? "MUTED" : `${Math.round(toDb(Math.max(view.inputPeak, 0.001)))} dBFS`}</b>
          <div className="micro-meter" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <i className={view.inputLevel * 10 > index ? "on" : ""} key={index} />)}
          </div>
        </div>

        <div className="voice-visual" aria-label={`Voice activity: ${currentPhase.title}`}>
          <span className="orbit orbit-user" />
          <span className="orbit orbit-ai" />
          <span className="voice-axis" />
          <div className="voice-bars" aria-hidden="true">
            {waveform.map((bar, index) => (
              <i
                className="voice-column"
                key={index}
                style={{ "--user-bar": `${bar.user * 64}px`, "--ai-bar": `${bar.ai * 64}px` } as CSSProperties}
              >
                <span className="bar-user" />
                <span className="bar-ai" />
              </i>
            ))}
          </div>
          <div className="voice-state"><AudioLines size={15} /> {currentPhase.title}</div>
        </div>

        <div className="channel-readout channel-ai">
          <span>AI · Carlos</span>
          <b>{view.speakerMuted ? "MUTED" : view.phase === "speaking" ? "OUTPUT LIVE" : "ARMED"}</b>
          <div className="micro-meter ai-meter" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <i className={view.outputLevel * 10 > index || (view.phase === "speaking" && index < 4) ? "on" : ""} key={index} />)}
          </div>
        </div>
      </div>

      <div className="call-action-bar">
        {!isActive ? (
          <button className="call-action start-action" type="button" onClick={() => void onStart()} disabled={!view.health?.liveReady}>
            <Mic size={18} /> <span><b>Start live call</b><small>Browser microphone</small></span>
          </button>
        ) : (
          <button className={`call-action ${view.micMuted ? "is-toggled" : ""}`} type="button" onClick={onToggleMicrophone} disabled={!isLive}>
            {view.micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            <span><b>{view.micMuted ? "Unmute" : "Mute"}</b><small>Microphone</small></span>
          </button>
        )}

        <button className={`call-action output-action ${view.speakerMuted ? "is-toggled" : ""}`} type="button" onClick={onToggleSpeaker} disabled={!isActive}>
          {view.speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span><b>{view.speakerMuted ? "Output off" : "Output on"}</b><small>Browser audio</small></span>
        </button>

        <button className="call-action interrupt-action" type="button" onClick={onInterrupt} disabled={!isActive}>
          <Zap size={18} /> <span><b>Interrupt Carlos</b><small>Immediate barge-in</small></span>
        </button>

        <button className="call-action end-action" type="button" onClick={onStop} disabled={!isActive}>
          <PhoneOff size={18} /> <span><b>End call</b><small>Clear audio queue</small></span>
        </button>

        <button className="demo-action" type="button" onClick={() => void onDemo()}>
          {isActive ? <Sparkles size={15} /> : <Play size={15} />} Run demo
        </button>
      </div>

      {!view.health?.liveReady && !isActive && (
        <div className="call-lock-note">
          <Radio size={14} /> Live mode needs the three server-side keys. The simulated demo is ready now.
        </div>
      )}

      <div className="transcript-module">
        <div className="module-title-row">
          <span className="eyebrow">Transcript</span>
          <span className="privacy-copy"><Radio size={12} /> Ephemeral session</span>
        </div>
        <div className="transcript-feed" ref={transcriptRef} aria-live="polite">
          {view.transcript.length === 0 ? (
            <div className="transcript-empty">
              <MessageSquareText size={20} />
              <span>Carlos introduces himself first. Start the line or run the demo.</span>
            </div>
          ) : (
            view.transcript.map((item) => (
              <article className={`transcript-entry ${item.speaker}`} key={item.id}>
                <span className="speaker-mark">{item.speaker === "assistant" ? "C" : "Y"}</span>
                <div className="transcript-speaker">
                  <b>{item.speaker === "assistant" ? "Carlos" : "You"}</b>
                  {item.speaker === "assistant" && <em>AI</em>}
                </div>
                <p>{item.text || "…"}</p>
                <time>{formatClock(item.at)}</time>
                {!item.final && <span className="streaming-dot" title="Streaming" />}
              </article>
            ))
          )}
        </div>
        <form className="typed-reply" onSubmit={submitTyped}>
          <Keyboard size={16} />
          <input
            value={typedText}
            onChange={(event) => setTypedText(event.target.value)}
            placeholder={isLive ? "Type your reply to test a turn…" : "Start a live call to send a typed turn"}
            disabled={!isLive}
            aria-label="Typed test turn"
          />
          <span>ENTER</span>
          <button type="submit" disabled={!isLive || !typedText.trim()} aria-label="Send typed turn"><Send size={17} /></button>
        </form>
      </div>
    </section>
  );
}
