import { AudioWaveform, BrainCircuit, CircleGauge, Compass, Mic, RadioTower, Volume2, Workflow } from "./icons";
import type { PipelineStage } from "./protocol";
import type { LatencySnapshot, VoiceSessionView } from "./useVoiceSession";
import { formatLatency, percentile, toDb } from "./lib/voiceMetrics";

const baseStageMeta: Array<{
  id: PipelineStage;
  label: string;
  compact: string;
  icon: typeof Mic;
}> = [
  { id: "browser", label: "Browser capture", compact: "Browser", icon: Mic },
];

export interface RuntimeProviderView {
  stt: string;
  llm: string;
  tts: string;
  models: { stt: string; llm: string; tts: string };
}

function stageMeta(runtime: RuntimeProviderView, locale = "es") {
  const es = locale !== "en";
  return [
    { ...baseStageMeta[0], label: es ? "Captura del navegador" : baseStageMeta[0].label, compact: es ? "Navegador" : baseStageMeta[0].compact },
    { id: runtime.stt as PipelineStage, label: `${runtime.models.stt} STT`, compact: runtime.stt, icon: AudioWaveform },
    { id: runtime.llm as PipelineStage, label: `${runtime.models.llm} LLM`, compact: runtime.llm, icon: BrainCircuit },
    { id: runtime.tts as PipelineStage, label: `${runtime.models.tts} TTS`, compact: runtime.tts, icon: Volume2 },
  ];
}

function stageLatency(view: VoiceSessionView, stage: PipelineStage, runtime: RuntimeProviderView): number | undefined {
  if (stage === "browser") return view.pipeline.browser.latencyMs ?? 18;
  if (stage === runtime.stt) return view.latency.stt ?? view.pipeline[stage]?.latencyMs;
  if (stage === runtime.llm) return view.latency.llm ?? view.pipeline[stage]?.latencyMs;
  return view.latency.tts ?? view.pipeline[stage]?.latencyMs;
}

function fallbackSegment(view: VoiceSessionView, stage: PipelineStage, runtime: RuntimeProviderView, index: number) {
  const latency = stageLatency(view, stage, runtime) ?? 0;
  const start = index === 0 ? 0 : index === 1 ? 44 : index === 2 ? 92 : 232;
  return { stage, startMs: start, endMs: start + latency };
}

function CurrentTurn({ view, runtime, locale = "es" }: { view: VoiceSessionView; runtime: RuntimeProviderView; locale?: string }) {
  const es = locale !== "en";
  const stages = stageMeta(runtime, locale);
  const target = view.timeline?.targetMs ?? 650;
  const scale = Math.max(target, view.timeline?.spanMs ?? 0, view.latency.total ?? 0);
  const targetPosition = Math.min(100, (target / scale) * 100);
  const ruler = [0, 130, 260, 390, 520, 650];

  return (
    <section className="turn-module" aria-labelledby="current-turn-title">
      <div className="telemetry-heading">
        <div>
          <span className="eyebrow">{es ? "Turno actual" : "Current turn"}</span>
          <div className="turn-total"><strong id="current-turn-title">{view.latency.total === undefined ? "—" : Math.round(view.latency.total)}</strong><span>{view.latency.total === undefined ? (es ? "Esperando" : "Waiting") : "ms"}</span></div>
        </div>
        <div className="target-readout"><span>{es ? "Objetivo" : "Target"}</span><b>&lt;650 ms</b></div>
      </div>

      <div className="turn-ruler" aria-hidden="true">
        <span />
        <div>{ruler.map((mark) => <i key={mark} style={{ left: `${(mark / scale) * 100}%` }}>{mark}</i>)}</div>
        <span />
      </div>

      <div className="timeline-grid">
        <i className="target-line" style={{ left: `calc(116px + (100% - 184px) * ${targetPosition / 100})` }} aria-hidden="true" />
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const segment = view.timeline?.segments.find((item) => item.stage === stage.id) ?? fallbackSegment(view, stage.id, runtime, index);
          const start = Math.max(0, Math.min(100, (segment.startMs / scale) * 100));
          const width = Math.max(stageLatency(view, stage.id, runtime) ? 1.6 : 0, Math.min(100 - start, ((segment.endMs - segment.startMs) / scale) * 100));
          const status = view.pipeline[stage.id]?.status ?? "idle";
          return (
            <div className={`timeline-lane timeline-${stage.id} lane-${status}`} key={stage.id}>
              <span className="lane-name"><Icon size={15} /> {stage.label}</span>
              <div className="lane-track">
                <i style={{ left: `${start}%`, width: `${width}%` }} />
              </div>
              <b>{formatLatency(stageLatency(view, stage.id, runtime))}</b>
            </div>
          );
        })}
      </div>

      <div className="pipeline-strip">
        <span><Workflow size={14} /> {view.timeline?.speculative === false ? (es ? "Turno final" : "Final-only turn") : (es ? "Solapamiento especulativo" : "Speculative overlap")}</span>
        {stages.map((stage) => (
          <i className={`pipeline-chip chip-${view.pipeline[stage.id]?.status ?? "idle"}`} key={stage.id}>{stage.compact}</i>
        ))}
      </div>
    </section>
  );
}

function RecentTurns({ history, locale = "es" }: { history: LatencySnapshot[]; locale?: string }) {
  const es = locale !== "en";
  const data = history.slice(-8);
  const values = data.map((item) => item.total);
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const width = 382;
  const height = 148;
  const padX = 20;
  const padTop = 18;
  const padBottom = 24;
  const minY = 350;
  const maxY = 700;
  const chartHeight = height - padTop - padBottom;
  const x = (index: number) => padX + (index * (width - padX * 2)) / Math.max(1, data.length - 1);
  const y = (value: number) => padTop + ((maxY - value) / (maxY - minY)) * chartHeight;
  const points = data.map((item, index) => `${x(index)},${y(item.total)}`).join(" ");

  return (
    <section className="analytics-module recent-turns" aria-labelledby="recent-turns-title">
      <div className="analytics-heading">
        <div><span className="eyebrow">{es ? "Turnos recientes" : "Recent turns"}</span><h2 id="recent-turns-title">{es ? "Tendencia de respuesta" : "Response trend"}</h2></div>
        <div className="percentiles"><span>P50 <b>{p50 === undefined ? "—" : Math.round(p50)}</b></span><span>P95 <b>{p95 === undefined ? "—" : Math.round(p95)}</b></span></div>
      </div>
      {data.length ? (
        <svg className="turn-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Recent response latency, P50 ${p50 ? Math.round(p50) : "unavailable"} milliseconds`}>
          {[350, 500, 650].map((tick) => (
            <g key={tick}>
              <line className={tick === 650 ? "chart-target" : "chart-grid"} x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} />
              <text className="chart-y-label" x={0} y={y(tick) + 3}>{tick}</text>
            </g>
          ))}
          <polyline className="chart-line" points={points} />
          {data.map((item, index) => (
            <g key={item.id}>
              <circle className="chart-dot" cx={x(index)} cy={y(item.total)} r="4" />
              <text className="chart-value" x={x(index)} y={y(item.total) - 9}>{Math.round(item.total)}</text>
              <text className="chart-x-label" x={x(index)} y={height - 5}>{index + 1}</text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="chart-empty"><CircleGauge size={20} /> {es ? "Completa un turno para ver la tendencia." : "Complete a turn to build the latency trend."}</div>
      )}
      <div className="chart-caption"><i /> {es ? "Total del turno" : "Turn total"} <span /> {es ? "Objetivo 650 ms" : "Target 650 ms"} {data.some((item) => item.simulated) && <em>{es ? "SIMULADO" : "SIMULATED"}</em>}</div>
    </section>
  );
}

function LevelMeter({ value, label }: { value: number; label: string }) {
  return (
    <div className="signal-meter" aria-label={`${label}: ${Math.round(toDb(Math.max(value, 0.001)))} decibels full scale`}>
      <div>{Array.from({ length: 18 }, (_, index) => <i className={value * 18 > index ? (index > 14 ? "hot" : "on") : ""} key={index} />)}</div>
      <span><b>-60</b><b>-30</b><b>-12</b><b>0</b></span>
    </div>
  );
}

function SignalHealth({ view, locale = "es" }: { view: VoiceSessionView; locale?: string }) {
  const es = locale !== "en";
  return (
    <section className="analytics-module signal-health" aria-labelledby="signal-health-title">
      <div className="analytics-heading">
        <div><span className="eyebrow">{es ? "Salud de la señal" : "Signal health"}</span><h2 id="signal-health-title">{es ? "Ruta de audio" : "Audio path"}</h2></div>
        <RadioTower size={18} />
      </div>
      <div className="signal-readouts">
        <div><span>{es ? "Entrada PCM" : "PCM input"}</span><b>16 kHz</b></div>
        <div><span>{es ? "Salida TTS" : "TTS output"}</span><b>24 kHz</b></div>
        <div><span>{es ? "Buffer de salida" : "Playout buffer"}</span><b>{Math.round(view.outputBufferMs)} ms</b></div>
        <div><span>{es ? "Saturación" : "Clipping"}</span><b className={view.clipping ? "bad-signal" : "good-signal"}>{view.clipping ? (es ? "Detectada" : "Detected") : (es ? "Ninguna" : "None")}</b></div>
      </div>
      <div className="meter-block"><span>{es ? "Pico de entrada" : "Input peak"} <b>{Math.round(toDb(Math.max(view.inputPeak, 0.001)))} dBFS</b></span><LevelMeter value={view.inputPeak} label={es ? "Pico de entrada" : "Input peak"} /></div>
      <div className="meter-block"><span>{es ? "Energía de salida" : "Output energy"} <b>{Math.round(toDb(Math.max(view.outputLevel, 0.001)))} dBFS</b></span><LevelMeter value={view.outputLevel} label={es ? "Energía de salida" : "Output energy"} /></div>
      <div className="transport-row"><span>AEC + NS</span><b>{es ? "ACTIVO" : "ON"}</b><span>{es ? "Transporte" : "Transport"}</span><b>{es ? "WS ORDENADO" : "ORDERED WS"}</b></div>
    </section>
  );
}

function ConversationRead({ view, locale = "es" }: { view: VoiceSessionView; locale?: string }) {
  const es = locale !== "en";
  const { emotion, guru } = view;
  if (!emotion && !guru) return null;

  return (
    <section className="analytics-module conversation-read" aria-labelledby="conversation-read-title">
        <div className="analytics-heading">
        <div><span className="eyebrow">{es ? "Lectura de conversación" : "Off the hot path"}</span><h2 id="conversation-read-title">{es ? "Contexto de conversación" : "Conversation read"}</h2></div>
        <Compass size={18} />
      </div>

      {emotion && (
        <>
          <p className="read-label">{emotion.label}</p>
          <div className="signal-readouts">
            <div><span>{es ? "Ritmo" : "Tempo"}</span><b>{emotion.wordsPerMinute || "—"} {es ? "ppm" : "wpm"}</b></div>
            <div><span>{es ? "Activación" : "Arousal"}</span><b>{Math.round(emotion.arousal * 100)}%</b></div>
            <div><span>{es ? "Espera" : "Reply delay"}</span><b>{emotion.replyDelayMs === undefined ? "—" : `${emotion.replyDelayMs} ms`}</b></div>
            <div><span>{es ? "Interrupciones" : "Cut-ins"}</span><b>{emotion.interruptions}</b></div>
          </div>
        </>
      )}

      {guru ? (
        <div className="guru-advice">
          <p><span>{es ? "Lectura" : "Read"}</span>{guru.read}</p>
          <p><span>{es ? "Siguiente turno" : "Next turn"}</span><b>{guru.directive}</b></p>
        </div>
      ) : (
        <div className="guru-advice pending">{es ? "El estratega prepara la siguiente respuesta." : "The strategist plans during the next reply."}</div>
      )}
    </section>
  );
}

export function TelemetryPanel({ view, runtime, locale = "es" }: { view: VoiceSessionView; runtime: RuntimeProviderView; locale?: string }) {
  return (
    <aside className="telemetry-panel surface" aria-label={locale !== "en" ? "Telemetría de voz" : "Voice telemetry"}>
      <CurrentTurn view={view} runtime={runtime} locale={locale} />
      <div className="analytics-grid">
        <RecentTurns history={view.latencyHistory} locale={locale} />
        <SignalHealth view={view} locale={locale} />
      </div>
      <ConversationRead view={view} locale={locale} />
    </aside>
  );
}
