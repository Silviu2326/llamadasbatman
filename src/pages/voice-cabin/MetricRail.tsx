import { Activity, Layers3, SignalHigh, TimerReset, Workflow } from "./icons";
import type { VoiceSessionView } from "./useVoiceSession";
import { percentile } from "./lib/voiceMetrics";

interface MetricRailProps {
  view: VoiceSessionView;
}

export function MetricRail({ view }: MetricRailProps) {
  const totals = view.latencyHistory.map((item) => item.total);
  const p95 = percentile(totals, 0.95);
  const latest = view.latencyHistory.at(-1);
  const total = view.latency.total ?? latest?.total;
  const underTarget = totals.filter((value) => value < 650).length;
  const signal = view.micMuted
    ? "MUTED"
    : view.clipping
      ? "CLIPPING"
      : view.mode === "live" || view.mode === "demo"
        ? "CLEAN"
        : "STANDBY";

  const metrics = [
    {
      label: "Response",
      value: total === undefined ? "—" : Math.round(total),
      unit: total === undefined ? "" : "ms",
      detail: total === undefined ? "Waiting for first PCM" : `target <650 · ${Math.max(0, 650 - Math.round(total))} ms headroom`,
      icon: TimerReset,
      tone: total !== undefined && total >= 650 ? "warn" : "primary",
    },
    {
      label: "P95",
      value: p95 === undefined ? "—" : Math.round(p95),
      unit: p95 === undefined ? "" : "ms",
      detail: totals.length ? `${underTarget}/${totals.length} turns under target` : "Builds across this session",
      icon: Activity,
      tone: p95 !== undefined && p95 >= 650 ? "warn" : "neutral",
    },
    {
      label: "Turns",
      value: String(totals.length).padStart(2, "0"),
      unit: "",
      detail: `${view.interruptions} interruption${view.interruptions === 1 ? "" : "s"}`,
      icon: Layers3,
      tone: "neutral",
    },
    {
      label: "Parallel saved",
      value: latest ? latest.overlapSaved : "—",
      unit: latest ? "ms" : "",
      detail: latest ? "vs. serial stage estimate" : "Speculative overlap enabled",
      icon: Workflow,
      tone: "primary",
    },
    {
      label: "Signal",
      value: signal,
      unit: "",
      detail: view.mode === "demo" ? "simulated input path" : view.clipping ? "lower input gain" : "AEC + noise suppression",
      icon: SignalHigh,
      tone: view.clipping ? "warn" : signal === "CLEAN" ? "signal" : "neutral",
    },
  ] as const;

  return (
    <section className="metric-rail" aria-label="Session performance overview">
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
