#!/usr/bin/env node

/**
 * Read-only smoke test for a deployed Vendrava API.
 *
 * The script deliberately does not create leads, campaigns, calls or tasks.
 * Those mutations require an isolated staging dataset and a separate E2E
 * suite with explicit fixtures. This command verifies that the read surfaces
 * needed by the four commercial journeys are reachable, authenticated and
 * returning a usable contract.
 */

const baseUrl = process.env.SMOKE_BASE_URL?.trim()
const bearer = process.env.SMOKE_BEARER_TOKEN?.trim()
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 8_000)
const strict = process.argv.includes('--strict')

if (!baseUrl) {
  console.error('Falta SMOKE_BASE_URL (por ejemplo https://api.staging.example.com).')
  process.exit(2)
}
if (!bearer) {
  console.error('Falta SMOKE_BEARER_TOKEN. El token nunca se imprime.')
  process.exit(2)
}

let parsedBase
try {
  parsedBase = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsedBase.protocol)) throw new Error('protocolo')
} catch {
  console.error('SMOKE_BASE_URL debe ser una URL HTTP(S) válida.')
  process.exit(2)
}

const results = []

async function check(label, path, options = {}) {
  const url = new URL(path, parsedBase).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${bearer}` },
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    const httpOk = response.status >= 200 && response.status < 300
    const contractOk = httpOk && contentType.toLowerCase().includes('application/json')
    const status = response.status === 401 || response.status === 403
      ? 'blocked'
      : contractOk
        ? 'pass'
        : 'fail'
    results.push({ label, path, status, httpStatus: response.status, contentType })
    if (!contractOk && !options.optional) {
      console.error(`[${status.toUpperCase()}] ${label}: ${httpOk ? `content-type ${contentType || 'missing'}` : `HTTP ${response.status}`}`)
    }
    return contractOk
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'timeout' : 'network_error'
    results.push({ label, path, status: 'fail', error: message })
    if (!options.optional) console.error(`[FAIL] ${label}: ${message}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function run() {
  await check('readiness operativo', '/health/ready')
  await check('worker de fondo', '/health/workers', { optional: true })

  // Ads → lead → meeting → pipeline → sale → attribution.
  await check('Ads overview', '/api/ads/overview')
  await check('dashboard y atribución agregada', '/api/dashboard/stats')
  await check('actividad comercial', '/api/dashboard/activity')
  if (process.env.SMOKE_CAMPAIGN_ID) {
    const id = encodeURIComponent(process.env.SMOKE_CAMPAIGN_ID)
    await check('estado de campaña Ads', `/api/ads/campaigns/${id}/status`)
    await check('insights de campaña Ads', `/api/ads/campaigns/${id}/insights`)
  } else {
    console.warn('[INFO] Ads: define SMOKE_CAMPAIGN_ID para validar estado e insights de una campaña concreta.')
  }

  // Search Console → opportunity → content/landing → lead.
  await check('Organic Leads overview', '/api/organic/overview')
  await check('proyecto Organic Leads', '/api/organic/project')
  await check('estado de integraciones orgánicas', '/api/organic/integrations')

  // Prospect Finder → import → sequence → meeting.
  // No existe un GET de búsqueda: buscar/importar tiene coste y por eso queda
  // fuera de este smoke read-only. El endpoint de campañas comprueba que el
  // destino CRM de la prospección está operativo.
  await check('campañas disponibles para Prospect Finder', '/api/campaigns?page=1&limit=1')
  console.warn('[INFO] Prospect Finder: la búsqueda/importación y el alta en secuencia requieren E2E de staging con fixtures.')

  // Knowledge Base → agent → call → task → close.
  await check('base de conocimiento', '/api/knowledge')
  await check('agentes', '/api/agents')
  await check('llamadas', '/api/calls?page=1&limit=1')
  await check('tareas de seguimiento', '/api/tasks?page=1&limit=1')
  await check('pipeline comercial', '/api/pipeline/insights')

  const failed = results.filter(item => item.status === 'fail')
  const blocked = results.filter(item => item.status === 'blocked')
  const passed = results.filter(item => item.status === 'pass')
  console.log(JSON.stringify({
    baseUrl: parsedBase.origin,
    readOnly: true,
    passed: passed.length,
    blocked: blocked.length,
    failed: failed.length,
    results,
  }, null, 2))

  if (failed.length || (strict && blocked.length)) process.exitCode = 1
}

await run()
