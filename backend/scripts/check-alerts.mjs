#!/usr/bin/env node
/**
 * Vigilante operativo: consulta /health/workers y avisa si algo va mal.
 *
 * Existe por el fallo más caro de esta operación, que además es silencioso: si
 * el worker no está vivo o falta Redis, `enqueueLeadCall` devuelve `false` sin
 * ruido, no se llama a nadie, y la API sigue respondiendo que todo está bien.
 * Se descubre contando cero llamadas al final del día.
 *
 * `evaluateOperationalAlerts` ya calcula las alertas —incluidas
 * WORKER_HEARTBEAT_MISSING y WORKER_HEARTBEAT_STALE—, pero solo cuando alguien
 * pregunta. Esto es lo que pregunta cada pocos minutos.
 *
 * Sale con código 1 si hay alguna alerta crítica, así que sirve tal cual para
 * cron, para un monitor externo o para el healthcheck del proveedor.
 *
 * Uso:
 *   node scripts/check-alerts.mjs
 *   node scripts/check-alerts.mjs --url https://api.ejemplo.com --quiet
 *
 * Variables:
 *   OBSERVABILITY_URL    base de la API (por defecto http://localhost:3000)
 *   OBSERVABILITY_TOKEN  el mismo que protege /health/*
 *   ALERT_WEBHOOK_URL    opcional; si está, se le envía un JSON en cada crítica
 */
const args = process.argv.slice(2)
const flag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

const baseUrl = (flag('--url') || process.env.OBSERVABILITY_URL || 'http://localhost:3000').replace(/\/$/, '')
const token = (flag('--token') || process.env.OBSERVABILITY_TOKEN || '').trim()
const webhook = (process.env.ALERT_WEBHOOK_URL || '').trim()
const quiet = args.includes('--quiet')
const timeoutMs = Number(flag('--timeout') || 10_000)

const say = (...parts) => { if (!quiet) console.log(...parts) }

/** Un fallo de red es una alerta, no una excepción: el monitor tiene que verlo. */
async function fetchHealth() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/health/workers`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (response.status === 401) {
      return { error: 'OBSERVABILITY_TOKEN incorrecto o ausente (401).' }
    }
    if (!response.ok && response.status !== 503) {
      return { error: `La API respondió ${response.status}.` }
    }
    return { body: await response.json() }
  } catch (error) {
    const reason = error.name === 'AbortError' ? `sin respuesta en ${timeoutMs} ms` : error.message
    return { error: `No se pudo consultar ${baseUrl}/health/workers: ${reason}` }
  } finally {
    clearTimeout(timer)
  }
}

async function notify(payload) {
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    // Que falle el aviso no puede cambiar el diagnóstico: se deja constancia y
    // el código de salida sigue reflejando el estado real del sistema.
    console.error(`[check-alerts] No se pudo avisar al webhook: ${error.message}`)
  }
}

const { body, error } = await fetchHealth()

if (error) {
  console.error(`\n✗ ${error}\n`)
  await notify({ severity: 'critical', code: 'HEALTH_UNREACHABLE', summary: error, checkedAt: new Date().toISOString() })
  process.exit(1)
}

const alerts = Array.isArray(body.alertDetails) ? body.alertDetails : []
const critical = alerts.filter(alert => alert.severity === 'critical')
const warnings = alerts.filter(alert => alert.severity !== 'critical')

say(`\n${baseUrl}  ·  ${body.status}  ·  ${body.checkedAt}`)
say(`worker: ${body.worker?.heartbeat ?? '—'}  ·  redis: ${body.dependencies?.redis?.status ?? '—'}  ·  base: ${body.dependencies?.database?.status ?? '—'}\n`)

for (const alert of critical) {
  console.error(`  ✗ [${alert.code}] ${alert.summary}`)
  console.error(`      → ${alert.action}`)
}
for (const alert of warnings) {
  say(`  ! [${alert.code}] ${alert.summary}`)
  say(`      → ${alert.action}`)
}

if (critical.length) {
  await notify({
    severity: 'critical',
    checkedAt: body.checkedAt,
    status: body.status,
    heartbeat: body.worker?.heartbeat,
    alerts: critical.map(alert => ({ code: alert.code, summary: alert.summary, action: alert.action })),
  })
  console.error(`\n${critical.length} alertas críticas. No se está despachando trabajo con normalidad.\n`)
  process.exit(1)
}

if (warnings.length) {
  say(`\n${warnings.length} avisos, ninguna crítica.\n`)
} else {
  say('Sin alertas.\n')
}
