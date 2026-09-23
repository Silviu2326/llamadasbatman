import { Activity, Layers3, SignalHigh, TimerReset, Workflow } from "./icons";
import type { VoiceSessionView } from "./useVoiceSession";
import { percentile } from "./lib/voiceMetrics";
import { useI18n } from "../../i18n";

interface MetricRailProps {
  view: VoiceSessionView;
}

export function MetricRail({ view }: MetricRailProps) {
  const { locale } = useI18n();
  const es = locale !== "en";
  const totals = view.latencyHistory.map((item) => item.total);
  const p95 = percentile(totals, 0.95);
  const latest = view.latencyHistory.at(-1);
  const total = view.latency.total ?? latest?.total;
  const underTarget = totals.filter((value) => value < 650).length;
  const signal = view.micMuted
    ? (es ? "SILENCIADO" : "MUTED")
    : view.clipping
      ? (es ? "SATURADA" : "CLIPPING")
      : view.mode === "live" || view.mode === "demo"
        ? (es ? "LIMPIA" : "CLEAN")
        : (es ? "EN ESPERA" : "STANDBY");

  const metrics = [
    {
      label: es ? "Respuesta" : "Response",
      value: total === undefined ? "—" : Math.round(total),
      unit: total === undefined ? "" : "ms",
      detail: total === undefined ? (es ? "Esperando el primer audio" : "Waiting for first PCM") : `${es ? "objetivo <650 · margen" : "target <650 ·"} ${Math.max(0, 650 - Math.round(total))} ms`,
      icon: TimerReset,
      tone: total !== undefined && total >= 650 ? "warn" : "primary",
    },
    {
      label: "P95",
      value: p95 === undefined ? "—" : Math.round(p95),
      unit: p95 === undefined ? "" : "ms",
      detail: totals.length ? `${underTarget}/${totals.length} ${es ? "turnos en objetivo" : "turns under target"}` : (es ? "Se calcula en esta sesión" : "Builds across this session"),
      icon: Activity,
      tone: p95 !== undefined && p95 >= 650 ? "warn" : "neutral",
    },
    {
      label: es ? "Turnos" : "Turns",
      value: String(totals.length).padStart(2, "0"),
      unit: "",
      detail: `${view.interruptions} ${es ? (view.interruptions === 1 ? "interrupción" : "interrupciones") : `interruption${view.interruptions === 1 ? "" : "s"}`}`,
      icon: Layers3,
      tone: "neutral",
    },
    {
      label: es ? "Ahorro paralelo" : "Parallel saved",
      value: latest ? latest.overlapSaved : "—",
      unit: latest ? "ms" : "",
      detail: latest ? (es ? "frente a ejecución secuencial" : "vs. serial stage estimate") : (es ? "Solapamiento especulativo activo" : "Speculative overlap enabled"),
      icon: Workflow,
      tone: "primary",
    },
    {
      label: es ? "Señal" : "Signal",
      value: signal,
      unit: "",
      detail: view.mode === "demo" ? (es ? "entrada simulada" : "simulated input path") : view.clipping ? (es ? "baja la ganancia de entrada" : "lower input gain") : (es ? "AEC + supresión de ruido" : "AEC + noise suppression"),
      icon: SignalHigh,
      tone: view.clipping ? "warn" : (view.mode === "live" || view.mode === "demo") && !view.micMuted ? "signal" : "neutral",
    },
  ] as const;

  return (
    <section className="metric-rail" aria-label={es ? "Resumen de rendimiento de la sesión" : "Session performance overview"}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className={`metric-cell metric-${metric.tone}`} key={metric.label}>
            <div className="metric-label"><Icon size={14} /> {metric.label}</div>
            <div className="metric-value"><strong>{metric.value}</strong><span>{metric.unit}</span></div>
            <small>{metric.detail}</small>
          </article>
        );
      })}
    </section>
  );
}
