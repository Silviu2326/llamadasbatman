export function formatLatency(value?: number): string {
  return value === undefined ? "—" : `${Math.round(value)} ms`;
}

export function percentile(values: number[], quantile: number): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(quantile * ordered.length) - 1));
  return ordered[index];
}

export function formatClock(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(value);
}

export function toDb(value: number): number {
  if (value <= 0) return -60;
  return Math.max(-60, Math.min(0, 20 * Math.log10(value)));
}
