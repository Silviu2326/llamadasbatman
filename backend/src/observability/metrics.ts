import { redactProviderError } from '../lib/integrationRuntime'

export type MetricLabels = Record<string, string | number | boolean | undefined | null>

export type MetricsSnapshot = {
  generatedAt: string
  uptimeSeconds: number
  counters: Array<{ name: string; labels: Record<string, string>; value: number }>
  gauges: Array<{ name: string; labels: Record<string, string>; value: number }>
  histograms: Array<{
    name: string
    labels: Record<string, string>
    buckets: Array<{ le: number | '+Inf'; value: number }>
    sum: number
    count: number
  }>
}

const startedAt = Date.now()
const counters = new Map<string, { name: string; labels: Record<string, string>; value: number }>()
const gauges = new Map<string, { name: string; labels: Record<string, string>; value: number }>()
const histograms = new Map<string, {
  name: string
  labels: Record<string, string>
  buckets: Map<number | '+Inf', number>
  sum: number
  count: number
}>()

function safeLabel(value: unknown): string {
  return String(value ?? 'unknown').replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80) || 'unknown'
}

function safeMetricName(value: string): string {
  return value.replace(/[^A-Za-z0-9_:]/g, '_').replace(/^[^A-Za-z_:]+/, '_').slice(0, 120) || 'vendrava_unknown_total'
}

function normalizeLabels(labels: MetricLabels): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [safeMetricName(key), safeLabel(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

function keyFor(name: string, labels: Record<string, string>): string {
  return `${name}|${Object.entries(labels).map(([key, value]) => `${key}=${value}`).join('|')}`
}

export function incrementMetric(name: string, labels: MetricLabels = {}, amount = 1): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const metricName = safeMetricName(name)
  const normalizedLabels = normalizeLabels(labels)
  const key = keyFor(metricName, normalizedLabels)
  const current = counters.get(key)
  if (current) current.value += amount
  else counters.set(key, { name: metricName, labels: normalizedLabels, value: amount })
}

export function setGaugeMetric(name: string, labels: MetricLabels = {}, value: number): void {
  if (!Number.isFinite(value)) return
  const metricName = safeMetricName(name)
  const normalizedLabels = normalizeLabels(labels)
  const key = keyFor(metricName, normalizedLabels)
  gauges.set(key, { name: metricName, labels: normalizedLabels, value })
}

export function recordHistogram(
  name: string,
  labels: MetricLabels,
  value: number,
  boundaries = [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
): void {
  if (!Number.isFinite(value) || value < 0) return
  const metricName = safeMetricName(name)
  const normalizedLabels = normalizeLabels(labels)
  const key = keyFor(metricName, normalizedLabels)
  let histogram = histograms.get(key)
  if (!histogram) {
    const buckets = new Map<number | '+Inf', number>()
    for (const boundary of boundaries.filter(Number.isFinite).sort((a, b) => a - b)) buckets.set(boundary, 0)
    buckets.set('+Inf', 0)
    histogram = { name: metricName, labels: normalizedLabels, buckets, sum: 0, count: 0 }
    histograms.set(key, histogram)
  }
  histogram.sum += value
  histogram.count += 1
  for (const [boundary, count] of histogram.buckets) {
    if (boundary === '+Inf' || value <= boundary) histogram.buckets.set(boundary, count + 1)
  }
}

export function recordHttpRequest(input: {
  method: string
  route: string
  statusCode: number
  durationMs: number
}): void {
  const statusFamily = `${Math.floor(input.statusCode / 100)}xx`
  const labels = { method: input.method.toUpperCase(), route: input.route, status_family: statusFamily }
  incrementMetric('vendrava_http_requests_total', labels)
  recordHistogram('vendrava_http_request_duration_ms', { method: input.method.toUpperCase(), route: input.route }, input.durationMs)
  if (input.statusCode >= 500) incrementMetric('vendrava_http_errors_total', labels)
}

export function recordWebhookRequest(input: {
  provider: string
  channel: string
  outcome: 'accepted' | 'rejected' | 'retry'
}): void {
  incrementMetric('vendrava_webhook_requests_total', input)
}

export function recordWebhookLifecycle(input: {
  provider: string
  channel: string
  outcome: 'received' | 'duplicate' | 'processed' | 'failed' | 'dead_letter'
}): void {
  incrementMetric('vendrava_webhook_events_total', input)
}

export function recordQueueEvent(input: {
  queue: string
  outcome: 'claimed' | 'processed' | 'retry' | 'dead_letter' | 'lease_lost' | 'claim_conflict' | 'tick_error'
}): void {
  incrementMetric('vendrava_queue_events_total', input)
}

export function setQueueGauge(queue: string, metric: string, value: number | null): void {
  if (value === null) return
  setGaugeMetric(`vendrava_queue_${metric}`, { queue }, value)
}

export function webhookIdentity(path: string): { provider: string; channel: string } | null {
  if (path.startsWith('/api/meta/webhooks')) return { provider: 'meta', channel: 'leadgen' }
  if (path.startsWith('/api/voice/webhook')) return { provider: 'twilio', channel: 'voice' }
  if (path.startsWith('/api/whatsapp')) return { provider: 'twilio', channel: 'whatsapp' }
  return null
}

export function snapshotMetrics(now = Date.now()): MetricsSnapshot {
  return {
    generatedAt: new Date(now).toISOString(),
    uptimeSeconds: Math.max(0, Math.round((now - startedAt) / 1_000)),
    counters: [...counters.values()].map(item => ({ ...item, labels: { ...item.labels } })),
    gauges: [...gauges.values()].map(item => ({ ...item, labels: { ...item.labels } })),
    histograms: [...histograms.values()].map(item => ({
      name: item.name,
      labels: { ...item.labels },
      buckets: [...item.buckets.entries()].map(([le, value]) => ({ le, value })),
      sum: item.sum,
      count: item.count,
    })),
  }
}

function renderLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')
}

export function renderPrometheus(snapshot = snapshotMetrics()): string {
  const lines = [
    '# HELP vendrava_process_uptime_seconds Process uptime in seconds.',
    '# TYPE vendrava_process_uptime_seconds gauge',
    `vendrava_process_uptime_seconds ${snapshot.uptimeSeconds}`,
  ]
  const typed = new Set<string>()
  for (const counter of snapshot.counters) {
    if (!typed.has(counter.name)) { lines.push(`# TYPE ${counter.name} counter`); typed.add(counter.name) }
    const labels = renderLabels(counter.labels)
    lines.push(`${counter.name}${labels ? `{${labels}}` : ''} ${counter.value}`)
  }
  for (const gauge of snapshot.gauges) {
    if (!typed.has(gauge.name)) { lines.push(`# TYPE ${gauge.name} gauge`); typed.add(gauge.name) }
    const labels = renderLabels(gauge.labels)
    lines.push(`${gauge.name}${labels ? `{${labels}}` : ''} ${gauge.value}`)
  }
  for (const histogram of snapshot.histograms) {
    if (!typed.has(histogram.name)) { lines.push(`# TYPE ${histogram.name} histogram`); typed.add(histogram.name) }
    for (const bucket of histogram.buckets) {
      const labels = renderLabels({ ...histogram.labels, le: String(bucket.le) })
      lines.push(`${histogram.name}_bucket{${labels}} ${bucket.value}`)
    }
    const baseLabels = renderLabels(histogram.labels)
    lines.push(`${histogram.name}_sum${baseLabels ? `{${baseLabels}}` : ''} ${histogram.sum}`)
    lines.push(`${histogram.name}_count${baseLabels ? `{${baseLabels}}` : ''} ${histogram.count}`)
  }
  return `${lines.join('\n')}\n`
}

export function resetMetricsForTests(): void {
  counters.clear()
  gauges.clear()
  histograms.clear()
}

/** Safe error code for compatibility with existing callers. */
export function safeErrorCode(error: unknown): string {
  return redactProviderError(error).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120)
}
