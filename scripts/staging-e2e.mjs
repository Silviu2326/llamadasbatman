#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  STAGING_CONFIRMATION,
  PROVIDER_CONFIRMATION,
  PROVIDER_PROBE_CONFIRMATION,
  StagingHarnessError,
  assertSafeStagingConfig,
  containsAll,
  createRunId,
  extractArray,
  extractEntityId,
  makeArtifactPaths,
  makeFixtureProspect,
  normalizePathForEvidence,
  parseArgs,
  isDryRun,
  readJsonFile,
  readState,
  redactText,
  shortHash,
  ensureArtifactDir,
  writeJson,
} from './staging-e2e-lib.mjs'

const SCRIPT_FILE = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(SCRIPT_FILE), '..')
const DEFAULT_FIXTURE = path.join(ROOT, 'fixtures', 'staging-e2e', 'prospect.json')
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_POLL_MS = 2_000
const DEFAULT_POLL_ATTEMPTS = 30

function help() {
  console.log(`
Arnés E2E mutante de staging — Vendrava

Por defecto no muta ni hace llamadas de red. Para ejecutar:

  node scripts/staging-e2e.mjs --run --confirm-staging-mutations

Variables obligatorias:
  STAGING_E2E_BASE_URL
  STAGING_E2E_TOKEN
  STAGING_E2E_DATABASE_URL
  STAGING_E2E_DATABASE_ISOLATED=YES
  STAGING_E2E_FIXTURE_NAMESPACE=staging-<identificador>
  STAGING_E2E_WORKSPACE_ID
  STAGING_E2E_CONFIRM=${STAGING_CONFIRMATION}
  STAGING_E2E_DATABASE_TARGET_HASH=<shortHash(host:port/database)> para mutaciones
  STAGING_E2E_OBSERVABILITY_TOKEN=<token de lectura de observabilidad> (opcional)
  STAGING_E2E_PROVIDER_PROBE_CONFIRM=${PROVIDER_PROBE_CONFIRMATION} (solo con --probe-providers)

Opciones:
  --flow all|ads|organic|prospect|knowledge
  --run                              habilita mutaciones
  --confirm-staging-mutations        confirmación CLI obligatoria
  --preflight                        comprueba API, workspace, colas e integraciones sin mutar
  --probe-providers                  probe externo de solo lectura (requiere confirmación separada)
  --with-provider-mutations          solo cuenta de proveedor de staging
  --keep-fixtures                    no limpia al terminar (explícito)
  --cleanup <state.json>             limpia un run anterior y no crea datos
  --rollback <state.json>            ejecuta el plan reversible guardado de un run interrumpido
  --state <path>                     ruta de estado opcional
  --fixture <path>                   fixture de Prospect Finder opcional
`)
}

function nowIso() {
  return new Date().toISOString()
}

function safeError(error, secrets = []) {
  if (error instanceof StagingHarnessError) {
    return { code: error.code, message: redactText(error.message, secrets) }
  }
  return {
    code: error?.code || error?.name || 'ERROR',
    message: redactText(error?.message || 'Error desconocido', secrets),
  }
}

function assert(condition, message, details = {}) {
  if (!condition) throw new StagingHarnessError('ASSERTION_FAILED', message, details)
}

function bodyId(body, fallbackKeys = []) {
  if (!body || typeof body !== 'object') return null
  const fromGeneric = extractEntityId(body)
  if (fromGeneric) return fromGeneric
  for (const key of fallbackKeys) {
    if (typeof body[key] === 'string' && body[key].trim()) return body[key]
  }
  return null
}

function describeResource(resource) {
  return {
    kind: resource.kind,
    id: resource.id,
    cleanup: resource.cleanup,
    immutable: Boolean(resource.immutable),
    flow: resource.flow,
  }
}

class StagingE2EHarness {
  constructor(config, args, paths, fixtureFile) {
    this.config = config
    this.args = args
    this.paths = paths
    this.fixtureFile = fixtureFile
    this.runId = paths.stateFile ? path.basename(paths.stateFile).replace(/\.state\.json$/, '') : createRunId(config.fixtureNamespace)
    this.secrets = [process.env.STAGING_E2E_TOKEN, process.env.STAGING_E2E_VOICE_SERVICE_SECRET, process.env.STAGING_E2E_DATABASE_URL]
    this.state = {
      harness: 'vendrava-staging-e2e',
      schemaVersion: 2,
      runId: this.runId,
      startedAt: nowIso(),
      baseOrigin: new URL(config.baseUrl).origin,
      publicOrigin: new URL(config.publicBaseUrl).origin,
      workspaceId: config.workspaceId,
      fixtureNamespace: config.fixtureNamespace,
      fixtureFile: path.relative(ROOT, fixtureFile),
      flows: args.flows,
      resources: [],
      requests: [],
      assertions: [],
      cleanup: [],
      residuals: [],
      logs: [],
      alerts: [],
      rollbackPlan: [],
      preflight: { status: 'not_run', checks: [], providerChecks: [] },
      status: 'running',
    }
    this.flowResults = []
  }

  saveState() {
    ensureArtifactDir(this.paths)
    writeJson(this.paths.stateFile, this.state)
  }

  log(level, event, details = {}) {
    const allowed = {}
    for (const [key, value] of Object.entries(details)) {
      if (/(token|secret|password|authorization|cookie|body|payload|transcript|content)/i.test(key)) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) allowed[key] = value
    }
    this.state.logs.push({ at: nowIso(), level, event, ...allowed })
    this.saveState()
  }

  alert(code, severity, action, details = {}) {
    const item = { code, severity, action, at: nowIso(), ...details }
    this.state.alerts.push(item)
    this.log(severity === 'critical' ? 'error' : 'warn', `alert.${code}`, { severity, action, ...details })
    return item
  }

  register(kind, id, options = {}) {
    if (!id || typeof id !== 'string') return null
    const resource = {
      runId: this.runId,
      workspaceId: this.config.workspaceId,
      fixtureNamespace: this.config.fixtureNamespace,
      kind,
      id,
      flow: options.flow || null,
      cleanup: options.cleanup || 'manual_review',
      immutable: Boolean(options.immutable),
      metadata: options.metadata || {},
      expectedResidual: Boolean(options.expectedResidual || options.immutable),
      rollback: options.rollback || null,
      registeredAt: nowIso(),
    }
    if (!this.state.resources.some(item => item.kind === kind && item.id === id)) {
      this.state.resources.push(resource)
      this.state.rollbackPlan.push({ kind, id, flow: resource.flow, cleanup: resource.cleanup, expectedResidual: resource.expectedResidual, rollback: resource.rollback })
      this.saveState()
    }
    return id
  }

  evidenceAssertion(label, passed, details = {}) {
    this.state.assertions.push({ label, passed: Boolean(passed), at: nowIso(), ...details })
    this.saveState()
    if (!passed) throw new StagingHarnessError('ASSERTION_FAILED', label, details)
  }

  async request(method, requestPath, body, options = {}) {
    const url = new URL(requestPath, this.config.baseUrl)
    if (url.origin !== new URL(this.config.baseUrl).origin) {
      throw new StagingHarnessError('CROSS_ORIGIN_BLOCKED', 'El arnés no permite peticiones fuera del origen de staging.')
    }
    const operation = options.operation || `${method} ${url.pathname}`
    const started = Date.now()
    const headers = {
      accept: 'application/json',
      'x-staging-e2e-run': this.runId,
      'x-staging-e2e-workspace': this.config.workspaceId,
      'x-correlation-id': `staging-e2e-${this.runId}-${shortHash(operation)}`,
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (options.voice) headers['x-voice-service-secret'] = this.config.voiceServiceSecret
    else if (options.observability && this.config.observabilityToken) headers.authorization = `Bearer ${this.config.observabilityToken}`
    else if (!options.public) headers.authorization = `Bearer ${process.env.STAGING_E2E_TOKEN}`
    if (!options.public && !options.voice) headers['idempotency-key'] = `staging-e2e:${this.runId}:${shortHash(operation)}:${method}`

    let response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
        redirect: 'error',
      })
    } catch (error) {
      const record = {
        operation,
        method,
        path: normalizePathForEvidence(requestPath),
        status: 'network_error',
        durationMs: Date.now() - started,
        error: safeError(error, this.secrets),
      }
      this.state.requests.push(record)
      this.log('error', 'http.network_error', { operation, method, path: record.path, durationMs: record.durationMs, errorCode: record.error.code })
      this.alert('STAGING_HTTP_NETWORK_ERROR', 'critical', 'Revisar DNS, TLS, firewall y disponibilidad del backend de staging.', { operation, path: record.path })
      this.saveState()
      throw new StagingHarnessError('REQUEST_FAILED', `${operation} no pudo completarse.`, { cause: record.error })
    }

    const contentType = response.headers.get('content-type') || ''
    const raw = await response.text()
    let parsed = null
    if (raw && contentType.toLowerCase().includes('json')) {
      try { parsed = JSON.parse(raw) } catch { parsed = null }
    }
    const expected = options.expected || null
    const expectedOk = expected ? expected.includes(response.status) : response.status >= 200 && response.status < 300
    const record = {
      operation,
      method,
      path: normalizePathForEvidence(requestPath),
      status: expectedOk ? 'pass' : 'fail',
      httpStatus: response.status,
      contentType,
      durationMs: Date.now() - started,
    }
    this.state.requests.push(record)
    this.log(expectedOk ? 'info' : 'error', 'http.response', { operation, method, path: record.path, httpStatus: response.status, durationMs: record.durationMs, status: record.status })
    this.saveState()
    if (!expectedOk && !options.allowFailure) {
      const providerCode = parsed && typeof parsed === 'object' && typeof parsed.code === 'string' ? parsed.code : undefined
      this.alert('STAGING_HTTP_UNEXPECTED', 'critical', 'Revisar el endpoint y el correlationId antes de continuar con el flujo.', { operation, httpStatus: response.status, providerCode })
      throw new StagingHarnessError('HTTP_UNEXPECTED', `${operation} respondió HTTP ${response.status}.`, { httpStatus: response.status, providerCode })
    }
    return { status: response.status, body: parsed ?? raw, contentType, ok: expectedOk }
  }

  async get(pathname, options) { return this.request('GET', pathname, undefined, options) }
  async post(pathname, body, options) { return this.request('POST', pathname, body, options) }
  async put(pathname, body, options) { return this.request('PUT', pathname, body, options) }
  async patch(pathname, body, options) { return this.request('PATCH', pathname, body, options) }

  async publicRequest(method, pathname, body, options = {}) {
    const original = this.config.baseUrl
    this.config.baseUrl = this.config.publicBaseUrl
    try { return await this.request(method, pathname, body, { ...options, public: true }) }
    finally { this.config.baseUrl = original }
  }

  async poll(label, fn, predicate, options = {}) {
    const attempts = options.attempts || DEFAULT_POLL_ATTEMPTS
    const intervalMs = options.intervalMs || DEFAULT_POLL_MS
    let lastValue
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      lastValue = await fn()
      if (predicate(lastValue)) return lastValue
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new StagingHarnessError('POLL_TIMEOUT', `${label} no alcanzó el estado esperado.`, { attempts, lastValue: typeof lastValue === 'object' ? { present: true } : String(lastValue) })
  }

  async verifyWorkspace() {
    const response = await this.get('/api/settings/organization', { operation: 'verificar workspace de staging' })
    const organizationId = response.body && typeof response.body === 'object' ? response.body.id : null
    this.evidenceAssertion('El token resuelve el workspace de staging esperado', organizationId === this.config.workspaceId, { resource: 'Organization' })
  }

  async preflight() {
    const checks = []
    const check = (name, passed, details = {}) => {
      checks.push({ name, passed: Boolean(passed), at: nowIso(), ...details })
      if (!passed) this.alert('STAGING_PREFLIGHT_FAILED', 'critical', 'Corregir el prerrequisito y repetir el preflight antes de mutar.', { check: name })
      return passed
    }
    this.log('info', 'preflight.started', { requiredProviders: this.config.requiredProviders.join(',') || 'none' })
    const live = await this.publicRequest('GET', '/health/live', undefined, { operation: 'preflight liveness', expected: [200], allowFailure: true })
    check('health.live', live.status === 200, { status: live.status })
    const ready = await this.publicRequest('GET', '/health/ready', undefined, { operation: 'preflight readiness', expected: [200, 503], allowFailure: true })
    check('health.ready', ready.status === 200 && ready.body?.status === 'ready', { status: ready.status, readiness: ready.body?.status })
    if (ready.status !== 200 || ready.body?.status !== 'ready') this.alert('STAGING_NOT_READY', 'critical', 'Arrancar/reparar API, Redis, worker y colas antes de ejecutar el E2E.', { readiness: ready.body?.status || ready.status })

    const integrationHealth = await this.publicRequest('GET', '/health/integrations', undefined, { operation: 'preflight integration health', expected: [200], allowFailure: true })
    check('health.integrations', integrationHealth.status === 200, { status: integrationHealth.status })

    if (this.config.observabilityToken) {
      const [workers, queues] = await Promise.all([
        this.request('GET', '/health/workers', undefined, { operation: 'preflight worker health', observability: true, expected: [200, 503], allowFailure: true }),
        this.request('GET', '/health/queues', undefined, { operation: 'preflight queue health', observability: true, expected: [200, 503], allowFailure: true }),
      ])
      check('health.workers', workers.status === 200 && workers.body?.status !== 'not_ready', { status: workers.status, workerStatus: workers.body?.status })
      check('health.queues', queues.status === 200 && queues.body?.queues?.databaseQueriesAvailable !== false, { status: queues.status, databaseQueriesAvailable: queues.body?.queues?.databaseQueriesAvailable })
    } else {
      this.log('warn', 'preflight.observability_skipped', { reason: 'STAGING_E2E_OBSERVABILITY_TOKEN no configurado' })
      checks.push({ name: 'health.workers/queues', passed: null, skipped: true, reason: 'observability token missing', at: nowIso() })
    }

    await this.verifyWorkspace()
    const integrations = await this.get('/api/settings/integrations', { operation: 'preflight estado de integraciones por workspace', expected: [200, 403], allowFailure: true })
    check('workspace.integrations', integrations.status === 200, { status: integrations.status })

    if (this.config.providerProbes) {
      const probed = await this.publicRequest('GET', '/health/integrations?probe=true', undefined, { operation: 'preflight probes externos de proveedores', expected: [200, 503], allowFailure: true })
      const raw = probed.body?.integrations || probed.body?.providers || probed.body?.data || probed.body
      const serialized = JSON.stringify(raw ?? null)
      const providerChecks = this.config.requiredProviders.map(provider => ({
        provider,
        passed: probed.status === 200 && serialized.toLowerCase().includes(provider),
      }))
      this.state.preflight.providerChecks = providerChecks
      for (const providerCheck of providerChecks) check(`provider.${providerCheck.provider}`, providerCheck.passed, { provider: providerCheck.provider })
    }
    const passed = checks.every(item => item.passed === true || item.skipped === true)
    this.state.preflight = { status: passed ? 'passed' : 'failed', checks, providerChecks: this.state.preflight.providerChecks || [], finishedAt: nowIso() }
    this.log(passed ? 'info' : 'error', 'preflight.finished', { status: this.state.preflight.status, checks: checks.length })
    this.saveState()
    if (!passed) throw new StagingHarnessError('PREFLIGHT_FAILED', 'El preflight no está listo; no se habilitan mutaciones.', { checks: checks.filter(item => !item.passed && !item.skipped).map(item => item.name) })
    return this.state.preflight
  }

  async createCampaign(flow, label, options = {}) {
    const slug = `${this.runId}-${flow}-${shortHash(label)}`.slice(0, 150).toLowerCase()
    const response = await this.post('/api/campaigns', {
      name: `[STAGING E2E] ${label} ${this.runId}`.slice(0, 140),
      objective: `staging-e2e:${flow}`,
      landingSlug: slug,
      budgetCents: 1,
      goal: 'fixture-only; no production spend',
      adAssets: {
        offer: 'Fixture de staging — no publicar en producción',
        landingTemplateId: 'e2e-fixture-v1',
        e2e: { runId: this.runId, flow, fixture: true },
      },
      settings: { e2e: { runId: this.runId, flow, fixture: true, ...options.settings } },
    }, { operation: `${flow}: crear campaña fixture` })
    const id = bodyId(response.body, ['campaignId'])
    assert(id, `${flow}: la API no devolvió campaignId.`)
    this.register('campaign', id, { flow, cleanup: 'campaign_to_draft', metadata: { landingSlug: slug } })
    return { id, slug, body: response.body }
  }

  async activateLocalCampaign(campaign, flow) {
    await this.put(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { status: 'active' }, { operation: `${flow}: activar landing local de staging` })
    const landing = await this.publicRequest('GET', `/api/public/landing/${encodeURIComponent(campaign.slug)}`, undefined, { operation: `${flow}: comprobar landing pública de staging` })
    assert(landing.status === 200 && landing.body && landing.body.campaignId === campaign.id, `${flow}: la landing no pertenece a la campaña fixture.`)
    return landing.body
  }

  async submitLandingLead(campaign, flow, source, medium) {
    const runHash = shortHash(`${this.runId}:${flow}`)
    const phone = `346${runHash.slice(0, 9)}`
    const email = `${this.runId}.${flow}@staging.invalid`.slice(0, 250)
    const response = await this.publicRequest('POST', `/api/public/landing/${encodeURIComponent(campaign.slug)}/lead`, {
      name: `[STAGING E2E] ${flow}`,
      phone,
      email,
      consent: true,
      consentVersion: 'staging-e2e-v1',
      source,
      medium,
      utm_source: source,
      utm_medium: medium,
      utm_campaign: this.runId,
      externalKey: `staging-e2e:${this.runId}:${flow}`,
      sessionId: `staging-e2e-session:${this.runId}:${flow}`,
    }, { operation: `${flow}: enviar lead fixture por landing` })
    assert(response.status === 201, `${flow}: la landing no aceptó el lead fixture.`)
    const list = await this.get(`/api/leads?campaignId=${encodeURIComponent(campaign.id)}&search=${encodeURIComponent(this.runId)}&limit=50`, { operation: `${flow}: localizar lead fixture` })
    const rows = extractArray(list.body)
    const lead = rows.find(item => item && (item.email === email || String(item.name || '').includes(this.runId)))
    assert(lead?.id, `${flow}: el lead fixture no apareció en el CRM.`)
    this.register('lead', lead.id, { flow, cleanup: 'lead_to_unqualified', immutable: true })
    return { ...lead, email, phone }
  }

  async createAndWinOpportunity(flow, lead, name) {
    const created = await this.post('/api/pipeline', {
      leadId: lead.id,
      name: `[STAGING E2E] ${name} ${this.runId}`.slice(0, 200),
      value: 1,
      currency: 'EUR',
      probability: 100,
      expectedCloseDate: new Date(Date.now() + 86_400_000).toISOString(),
      notes: `fixture-only ${this.runId}`,
    }, { operation: `${flow}: crear oportunidad fixture` })
    const opportunityId = bodyId(created.body, ['opportunityId'])
    assert(opportunityId, `${flow}: la API no devolvió opportunityId.`)
    this.register('opportunity', opportunityId, { flow, cleanup: 'opportunity_to_lost' })
    const won = await this.post(`/api/pipeline/${encodeURIComponent(opportunityId)}/mark-won`, {
      actualCloseDate: new Date().toISOString(),
      finalValue: 1,
    }, { operation: `${flow}: marcar oportunidad fixture como ganada` })
    assert(containsAll(won.body, [opportunityId]), `${flow}: la respuesta de cierre no contiene la oportunidad.`)
    const readBack = await this.get(`/api/pipeline/${encodeURIComponent(opportunityId)}`, { operation: `${flow}: comprobar cierre de oportunidad` })
    this.evidenceAssertion(`${flow}: la oportunidad queda en closed_won`, readBack.body?.stage === 'closed_won', { resource: 'Opportunity', resourceId: opportunityId })
    return opportunityId
  }

  async recordAttribution(flow, campaignId, leadId) {
    const [timeline, activity, stats] = await Promise.all([
      this.get(`/api/leads/${encodeURIComponent(leadId)}/timeline`, { operation: `${flow}: evidencia de timeline y atribución` }),
      this.get(`/api/campaigns/${encodeURIComponent(campaignId)}/activity`, { operation: `${flow}: evidencia de actividad de campaña` }),
      this.get(`/api/campaigns/${encodeURIComponent(campaignId)}/stats`, { operation: `${flow}: evidencia de estadísticas de campaña` }),
    ])
    const hasLead = containsAll(timeline.body, [leadId]) || containsAll(activity.body, [leadId])
    this.evidenceAssertion(`${flow}: existe evidencia CRM de lead y campaña`, hasLead, { resource: 'AcquisitionEvent/SalesActivity', campaignId, leadId })
    return { timeline: timeline.body, activity: activity.body, stats: stats.body }
  }

  async runAds() {
    const flow = 'ads'
    const campaign = await this.createCampaign(flow, 'Ads attribution')
    await this.activateLocalCampaign(campaign, flow)
    const lead = await this.submitLandingLead(campaign, flow, 'facebook', 'paid_social')
    const meetingResponse = await this.post('/api/meetings', {
      leadId: lead.id,
      title: `[STAGING E2E] reunión Ads ${this.runId}`,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
      notes: `fixture-only ${this.runId}`,
    }, { operation: `${flow}: crear reunión fixture` })
    const meetingId = bodyId(meetingResponse.body, ['meetingId'])
    assert(meetingId, `${flow}: la API no devolvió meetingId.`)
    this.register('meeting', meetingId, { flow, cleanup: 'meeting_cancelled' })
    const opportunityId = await this.createAndWinOpportunity(flow, lead, 'Ads sale')
    await this.recordAttribution(flow, campaign.id, lead.id)
    this.evidenceAssertion(`${flow}: el recorrido llegó a venta atribuible`, Boolean(campaign.id && lead.id && meetingId && opportunityId), { campaignId: campaign.id, leadId: lead.id, meetingId, opportunityId })
    return { campaignId: campaign.id, leadId: lead.id, meetingId, opportunityId }
  }

  async runOrganic() {
    const flow = 'organic'
    const projectResponse = await this.post('/api/organic/project', {
      name: `[STAGING E2E] Organic ${this.runId}`.slice(0, 160),
      website: 'https://staging-e2e.example.invalid',
      services: ['fixture-service'],
      locations: ['fixture-location'],
      averageLeadValueCents: 1,
      currency: 'EUR',
      config: { e2e: { runId: this.runId, flow, fixture: true } },
    }, { operation: `${flow}: crear proyecto Organic fixture` })
    const projectId = bodyId(projectResponse.body, ['projectId'])
    assert(projectId, `${flow}: la API no devolvió projectId.`)
    this.register('organic_project', projectId, { flow, cleanup: 'organic_project_inactive' })

    const campaign = await this.createCampaign(flow, 'Organic landing', { settings: { organicProjectId: projectId } })
    await this.activateLocalCampaign(campaign, flow)
    const assetResponse = await this.post('/api/organic/assets', {
      projectId,
      type: 'landing',
      title: `[STAGING E2E] Landing orgánica ${this.runId}`.slice(0, 240),
      content: { e2e: { runId: this.runId, flow, fixture: true }, campaignId: campaign.id },
      targetUrl: `${this.config.publicBaseUrl}/api/public/landing/${encodeURIComponent(campaign.slug)}`,
    }, { operation: `${flow}: crear activo landing orgánica fixture` })
    const assetId = bodyId(assetResponse.body, ['assetId'])
    if (assetId) this.register('organic_asset', assetId, { flow, cleanup: 'retained_under_inactive_project', immutable: true })

    const lead = await this.submitLandingLead(campaign, flow, 'google', 'organic')
    const opportunityId = await this.createAndWinOpportunity(flow, lead, 'Organic sale')
    const projectRead = await this.get('/api/organic/project', { operation: `${flow}: comprobar proyecto y activo orgánico` })
    this.evidenceAssertion(`${flow}: el proyecto orgánico de staging queda accesible`, containsAll(projectRead.body, [projectId]), { resource: 'OrganicProject', resourceId: projectId })
    await this.recordAttribution(flow, campaign.id, lead.id)
    this.evidenceAssertion(`${flow}: el recorrido llegó a venta`, Boolean(projectId && assetId && lead.id && opportunityId), { projectId, assetId, leadId: lead.id, opportunityId })
    return { projectId, assetId, campaignId: campaign.id, leadId: lead.id, opportunityId }
  }

  async runProspect() {
    const flow = 'prospect'
    const campaign = await this.createCampaign(flow, 'Prospect Finder sequence')
    const fixture = makeFixtureProspect(readJsonFile(this.fixtureFile), this.runId)
    const imported = await this.post('/api/prospects/import', {
      campaignId: campaign.id,
      sector: 'staging-fixture',
      city: 'staging-fixture',
      enrich: false,
      autoAudit: false,
      autoCall: false,
      items: [fixture],
    }, { operation: `${flow}: importar prospecto fixture` })
    assert(imported.body?.imported === 1 || imported.body?.imported === undefined && imported.status >= 200, `${flow}: el importador no aceptó el prospecto fixture.`)
    const list = await this.get(`/api/leads?campaignId=${encodeURIComponent(campaign.id)}&search=${encodeURIComponent(this.runId)}&limit=50`, { operation: `${flow}: localizar prospecto importado` })
    const lead = extractArray(list.body).find(item => item && String(item.name || '').includes(this.runId))
    assert(lead?.id, `${flow}: no apareció el prospecto importado.`)
    this.register('lead', lead.id, { flow, cleanup: 'lead_to_unqualified', immutable: true })

    const current = await this.get(`/api/leads/${encodeURIComponent(lead.id)}`, { operation: `${flow}: leer prospecto antes del enriquecimiento fixture` })
    const existingCustomFields = current.body?.customFields && typeof current.body.customFields === 'object' ? current.body.customFields : {}
    const enriched = await this.put(`/api/leads/${encodeURIComponent(lead.id)}`, {
      customFields: {
        ...existingCustomFields,
        e2eEnrichment: {
          mode: 'isolated-fixture',
          provider: 'fixture',
          runId: this.runId,
          websiteChecked: Boolean(fixture.website),
          enrichedAt: nowIso(),
        },
      },
    }, { operation: `${flow}: persistir resultado de enriquecimiento fixture` })
    assert(enriched.ok, `${flow}: no se pudo persistir el enriquecimiento fixture.`)
    const enrichedRead = await this.get(`/api/leads/${encodeURIComponent(lead.id)}`, { operation: `${flow}: comprobar enriquecimiento fixture` })
    assert(enrichedRead.body?.customFields?.e2eEnrichment?.runId === this.runId, `${flow}: el enriquecimiento fixture no quedó persistido.`)

    const programResponse = await this.post('/api/growth-programs', {
      type: 'sales_sequence',
      name: `[STAGING E2E] Sequence ${this.runId}`.slice(0, 160),
      description: 'Fixture-only sequence; no email provider is called.',
      config: {
        e2e: { runId: this.runId, flow, fixture: true },
        leadIds: [lead.id],
        steps: [{ key: 'meeting-fixture', type: 'meeting', delayDays: 0, title: `[STAGING E2E] reunión Prospect ${this.runId}`.slice(0, 200), durationMinutes: 30 }],
      },
    }, { operation: `${flow}: crear secuencia fixture` })
    const programId = bodyId(programResponse.body, ['programId'])
    assert(programId, `${flow}: la API no devolvió programId.`)
    this.register('growth_program', programId, { flow, cleanup: 'sequence_stop_and_archive' })
    const enrollmentResponse = await this.post(`/api/growth-programs/${encodeURIComponent(programId)}/enroll`, { leadIds: [lead.id] }, { operation: `${flow}: matricular prospecto en secuencia` })
    assert(enrollmentResponse.status === 201, `${flow}: no se pudo matricular el prospecto.`)
    const enrollment = await this.poll(`${flow}: worker de secuencia`, async () => {
      const response = await this.get(`/api/growth-programs/${encodeURIComponent(programId)}/enrollments`, { operation: `${flow}: comprobar ejecución de secuencia` })
      return extractArray(response.body)
    }, rows => rows.some(row => row?.leadId === lead.id && row?.steps?.some(step => step.status === 'succeeded' && step.meetingId)))
    const row = enrollment.find(item => item?.leadId === lead.id)
    const step = row?.steps?.find(item => item.status === 'succeeded' && item.meetingId)
    assert(step?.meetingId, `${flow}: la secuencia no creó una reunión.`)
    this.register('meeting', step.meetingId, { flow, cleanup: 'meeting_cancelled' })
    const meeting = await this.get(`/api/meetings/${encodeURIComponent(step.meetingId)}`, { operation: `${flow}: comprobar reunión de secuencia` })
    this.evidenceAssertion(`${flow}: el prospecto enriquecido llegó a reunión`, meeting.body?.leadId === lead.id, { leadId: lead.id, programId, meetingId: step.meetingId })
    return { campaignId: campaign.id, leadId: lead.id, programId, enrollmentId: row.id, meetingId: step.meetingId }
  }

  async runKnowledge() {
    const flow = 'knowledge'
    const leadResponse = await this.post('/api/leads', {
      name: `[STAGING E2E] Knowledge lead ${this.runId}`.slice(0, 160),
      phone: `346${shortHash(`${this.runId}:knowledge`).slice(0, 9)}`,
      source: 'staging_e2e',
      customFields: { e2e: { runId: this.runId, flow, fixture: true } },
    }, { operation: `${flow}: crear lead fixture` })
    const leadId = bodyId(leadResponse.body, ['leadId'])
    assert(leadId, `${flow}: la API no devolvió leadId.`)
    this.register('lead', leadId, { flow, cleanup: 'lead_to_unqualified', immutable: true })

    const knowledgeResponse = await this.post('/api/knowledge', {
      name: `[STAGING E2E] Knowledge ${this.runId}`.slice(0, 160),
      type: 'document',
      content: `Fixture de staging ${this.runId}. No contiene información real.`,
    }, { operation: `${flow}: crear documento de Knowledge Base fixture` })
    const knowledgeId = bodyId(knowledgeResponse.body, ['knowledgeBaseId'])
    assert(knowledgeId, `${flow}: la API no devolvió knowledgeBaseId.`)
    this.register('knowledge', knowledgeId, { flow, cleanup: 'knowledge_inactive' })

    const agentResponse = await this.post('/api/agents', {
      name: `[STAGING E2E] Agent ${this.runId}`.slice(0, 160),
      role: 'staging_e2e_agent',
      personality: 'fixture-only',
      language: 'es',
      systemPrompt: `Usa exclusivamente el documento de staging knowledgeBaseId=${knowledgeId}; runId=${this.runId}.`,
    }, { operation: `${flow}: crear agente fixture` })
    const agentId = bodyId(agentResponse.body, ['agentId'])
    assert(agentId, `${flow}: la API no devolvió agentId.`)
    this.register('agent', agentId, { flow, cleanup: 'agent_deactivated' })
    const agent = await this.get(`/api/agents/${encodeURIComponent(agentId)}`, { operation: `${flow}: comprobar agente vinculado al conocimiento fixture` })
    this.evidenceAssertion(`${flow}: el agente referencia el Knowledge Base fixture`, String(agent.body?.systemPrompt || '').includes(knowledgeId), { knowledgeId, agentId })

    const externalCallId = `staging-e2e:${this.runId}:call`
    const callResponse = await this.post('/api/calls/ingest', {
      orgId: this.config.workspaceId,
      externalCallId,
      leadId,
      agentId,
      duration: 18,
      transcript: `Fixture de llamada ${this.runId}`,
      summary: `Cierre de prueba ${this.runId}`,
      outcome: 'resolved',
      startedAt: new Date(Date.now() - 20_000).toISOString(),
      endedAt: nowIso(),
    }, { operation: `${flow}: ingerir llamada fixture`, voice: true })
    const callId = bodyId(callResponse.body, ['callId'])
    assert(callId, `${flow}: la API no devolvió callId.`)
    this.register('call', callId, { flow, cleanup: 'immutable_audit_record', immutable: true })

    const taskResponse = await this.post(`/api/calls/${encodeURIComponent(callId)}/tasks`, {
      title: `[STAGING E2E] cerrar seguimiento ${this.runId}`.slice(0, 200),
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    }, { operation: `${flow}: crear tarea de llamada fixture` })
    const taskId = bodyId(taskResponse.body, ['taskId'])
    assert(taskId, `${flow}: la API no devolvió taskId.`)
    this.register('call_task', taskId, { flow, cleanup: 'call_task_done' })
    await this.put(`/api/calls/${encodeURIComponent(callId)}/tasks/${encodeURIComponent(taskId)}`, { done: true }, { operation: `${flow}: cerrar tarea de llamada fixture` })

    const [callRead, tasksRead] = await Promise.all([
      this.get(`/api/calls/${encodeURIComponent(callId)}`, { operation: `${flow}: comprobar llamada completada` }),
      this.get(`/api/calls/${encodeURIComponent(callId)}/tasks`, { operation: `${flow}: comprobar tarea cerrada` }),
    ])
    this.evidenceAssertion(`${flow}: llamada completada y tarea cerrada`, callRead.body?.status === 'completed' && extractArray(tasksRead.body).some(task => task.id === taskId && task.done === true), { callId, taskId, agentId, knowledgeId })
    return { leadId, knowledgeId, agentId, callId, taskId }
  }

  async cleanupRequest(resource, requestFn) {
    const response = await requestFn()
    if (!response.ok && response.status !== 404) {
      throw new StagingHarnessError('CLEANUP_HTTP_UNEXPECTED', `La limpieza de ${resource.kind}/${resource.id} respondió HTTP ${response.status}.`, { status: response.status })
    }
    return response
  }

  async cleanupResource(resource) {
    const id = encodeURIComponent(resource.id)
    try {
      if (resource.cleanup === 'campaign_to_draft') await this.put(`/api/campaigns/${id}`, { status: 'draft' }, { operation: `cleanup campaña ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      else if (resource.cleanup === 'organic_project_inactive') {
        const current = await this.get('/api/organic/project', { operation: `cleanup comprobar proyecto orgánico ${resource.id}`, expected: [200, 404], allowFailure: true })
        const currentId = bodyId(current.body, ['projectId'])
        if (currentId && currentId !== resource.id) {
          this.state.residuals.push({ ...describeResource(resource), expected: false, reason: 'El proyecto activo no coincide con el ID del fixture; no se realizó un patch amplio.' })
          this.alert('CLEANUP_SCOPE_MISMATCH', 'critical', 'Revisar manualmente el proyecto y no repetir un patch sin confirmar el ID.', { kind: resource.kind, resourceId: resource.id, currentId })
        } else {
          await this.patch('/api/organic/project', { isActive: false }, { operation: `cleanup proyecto orgánico ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
        }
      }
      else if (resource.cleanup === 'knowledge_inactive') await this.request('DELETE', `/api/knowledge/${id}`, undefined, { operation: `cleanup knowledge ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      else if (resource.cleanup === 'agent_deactivated') await this.request('DELETE', `/api/agents/${id}`, undefined, { operation: `cleanup agente ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      else if (resource.cleanup === 'meeting_cancelled') await this.put(`/api/meetings/${id}`, { status: 'cancelled', notes: `staging-e2e cleanup ${this.runId}` }, { operation: `cleanup reunión ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      else if (resource.cleanup === 'lead_to_unqualified') await this.put(`/api/leads/${id}`, { status: 'unqualified' }, { operation: `cleanup lead ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      else if (resource.cleanup === 'call_task_done') {
        const call = this.state.resources.find(item => item.kind === 'call' && item.flow === resource.flow)
        if (call) await this.put(`/api/calls/${encodeURIComponent(call.id)}/tasks/${id}`, { done: true }, { operation: `cleanup tarea de llamada ${resource.id}`, expected: [200, 204, 404], allowFailure: true })
      } else if (resource.cleanup === 'sequence_stop_and_archive') {
        await this.post(`/api/growth-programs/${id}/stop`, { reason: 'manual' }, { operation: `cleanup detener secuencia ${resource.id}`, expected: [200, 404], allowFailure: true })
        await this.post(`/api/growth-programs/${id}/archive`, undefined, { operation: `cleanup archivar secuencia ${resource.id}`, expected: [200, 404], allowFailure: true })
      } else if (resource.cleanup === 'opportunity_to_lost') {
        const read = await this.get(`/api/pipeline/${id}`, { operation: `cleanup leer oportunidad ${resource.id}`, expected: [200, 404], allowFailure: true })
        if (read.status === 200 && read.body?.stage === 'closed_won') {
          await this.post(`/api/pipeline/${id}/reopen`, { toStage: 'qualified' }, { operation: `cleanup reabrir oportunidad ${resource.id}`, expected: [200, 400, 403, 404], allowFailure: true })
        }
        await this.post(`/api/pipeline/${id}/mark-lost`, { reason: `staging-e2e cleanup ${this.runId}` }, { operation: `cleanup marcar oportunidad perdida ${resource.id}`, expected: [200, 400, 404], allowFailure: true })
      } else {
        this.state.residuals.push({ ...describeResource(resource), expected: Boolean(resource.expectedResidual), reason: 'Recurso inmutable o sin endpoint de borrado reversible.' })
      }
      this.state.cleanup.push({ resource: describeResource(resource), status: 'attempted', at: nowIso() })
    } catch (error) {
      this.state.cleanup.push({ resource: describeResource(resource), status: 'failed', at: nowIso(), error: safeError(error, this.secrets) })
      this.state.residuals.push({ ...describeResource(resource), expected: false, reason: 'La limpieza reversible falló; requiere revisión de staging.' })
      this.alert('CLEANUP_FAILED', 'critical', 'Ejecutar --rollback con el estado guardado y revisar el residual antes de cerrar el incidente.', { kind: resource.kind, resourceId: resource.id })
    }
    this.saveState()
  }

  async cleanup() {
    for (const resource of [...this.state.resources].reverse()) await this.cleanupResource(resource)
    this.state.cleanupFinishedAt = nowIso()
    this.saveState()
  }

  async runFlow(name) {
    const startedAt = nowIso()
    try {
      const result = name === 'ads' ? await this.runAds()
        : name === 'organic' ? await this.runOrganic()
          : name === 'prospect' ? await this.runProspect()
            : await this.runKnowledge()
      const record = { flow: name, status: 'passed', startedAt, finishedAt: nowIso(), resources: result }
      this.flowResults.push(record)
      return record
    } catch (error) {
      const record = { flow: name, status: 'failed', startedAt, finishedAt: nowIso(), error: safeError(error, this.secrets) }
      this.flowResults.push(record)
      return record
    }
  }

  report() {
    const failed = this.flowResults.filter(item => item.status === 'failed')
    const blockingResiduals = this.state.residuals.filter(item => item.expected !== true)
    const report = {
      schemaVersion: 1,
      runId: this.runId,
      status: failed.length ? 'failed' : blockingResiduals.length ? 'passed_with_residuals' : this.state.residuals.length ? 'passed_with_audit_residuals' : 'passed',
      startedAt: this.state.startedAt,
      finishedAt: nowIso(),
      target: {
        baseOrigin: this.state.baseOrigin,
        publicOrigin: this.state.publicOrigin,
        workspaceId: this.config.workspaceId,
        fixtureNamespace: this.config.fixtureNamespace,
        database: { hostname: this.config.database.hostname, port: this.config.database.port, databaseName: this.config.database.databaseName },
        productionGuards: { runtime: 'non-production', providerMode: this.config.providerMutations ? 'staging-test-account' : 'not-called' },
      },
      flows: this.flowResults,
      counts: {
        requests: this.state.requests.length,
        assertions: this.state.assertions.length,
        resources: this.state.resources.length,
        cleanupAttempts: this.state.cleanup.length,
        residuals: this.state.residuals.length,
        blockingResiduals: blockingResiduals.length,
      },
      evidence: this.state.assertions,
      cleanup: this.state.cleanup,
      residuals: this.state.residuals,
      blockingResiduals,
      alerts: this.state.alerts,
      logs: this.state.logs,
      preflight: this.state.preflight,
      rollbackPlan: this.state.rollbackPlan,
      requestSummary: this.state.requests,
      noSecretsWritten: true,
    }
    writeJson(this.paths.reportFile, report)
    const lines = [
      `# Informe E2E de staging — ${this.runId}`,
      '',
      `- Estado: **${report.status}**`,
      `- Ventana: ${report.startedAt} → ${report.finishedAt}`,
      `- API: ${report.target.baseOrigin}`,
      `- Workspace: ${report.target.workspaceId}`,
      `- Namespace de fixtures: ${report.target.fixtureNamespace}`,
      `- Base de datos: ${report.target.database.hostname}:${report.target.database.port}/${report.target.database.databaseName}`,
      `- Proveedores externos: **${report.target.productionGuards.providerMode}**`,
      '',
      '## Flujos',
      '',
      ...report.flows.map(flow => `- ${flow.flow}: **${flow.status}**${flow.error ? ` — ${flow.error.code}` : ''}`),
      '',
      '## Limpieza',
      '',
      `- Intentos: ${report.counts.cleanupAttempts}`,
      `- Residuales: ${report.counts.residuals}`,
      ...(report.residuals.length ? report.residuals.map(item => `- ${item.expected ? 'Residual de auditoría' : 'Residual bloqueante/revisión'}: ${item.kind || 'unknown'} ${item.id || ''} — ${item.reason}`) : ['- No quedan residuales declarados.']),
      `- Residuales bloqueantes: ${report.blockingResiduals.length}`,
      '',
      '## Evidencias',
      '',
      ...report.evidence.map(item => `- ${item.passed ? '✅' : '❌'} ${item.label}`),
      '',
      '> Este informe no contiene tokens, URLs con credenciales ni cuerpos completos de proveedores.',
    ]
    fs.writeFileSync(this.paths.markdownFile, `${lines.join('\n')}\n`, 'utf8')
    this.state.status = report.status
    this.state.finishedAt = report.finishedAt
    this.saveState()
    return report
  }
}

function makePaths(args, runId) {
  const paths = makeArtifactPaths(ROOT, runId)
  if (args.stateFile) {
    paths.stateFile = path.resolve(ROOT, args.stateFile)
    paths.artifactDir = path.dirname(paths.stateFile)
    paths.reportFile = paths.stateFile.replace(/\.state\.json$/i, '.report.json')
    paths.markdownFile = paths.stateFile.replace(/\.state\.json$/i, '.report.md')
  }
  return paths
}

async function cleanExistingState(args) {
  const artifactsRoot = path.resolve(ROOT, '.artifacts', 'staging-e2e')
  const statePath = path.resolve(ROOT, args.cleanup)
  if (statePath !== artifactsRoot && !statePath.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new StagingHarnessError('STATE_PATH_UNSAFE', 'El estado de rollback debe vivir dentro de .artifacts/staging-e2e.')
  }
  const state = readState(statePath)
  if (state.harness !== 'vendrava-staging-e2e' || state.schemaVersion < 2) {
    throw new StagingHarnessError('STATE_UNTRUSTED', 'El estado no pertenece a la versión segura del arnés actual; no se ejecuta cleanup automático.')
  }
  const runId = state.runId
  const config = assertSafeStagingConfig(process.env, { ...args, run: false, cleanup: statePath, rollback: null, providerMutations: false, flows: state.flows || ['ads', 'organic', 'prospect', 'knowledge'] })
  if (new URL(config.baseUrl).origin !== state.baseOrigin) throw new StagingHarnessError('STATE_ORIGIN_MISMATCH', 'La URL actual no coincide con el origen guardado en el estado.')
  if (config.workspaceId !== state.workspaceId || config.fixtureNamespace !== state.fixtureNamespace) throw new StagingHarnessError('STATE_SCOPE_MISMATCH', 'El workspace o namespace actual no coincide con el estado guardado.')
  if (state.resources.some(resource => resource.runId !== runId || resource.workspaceId !== state.workspaceId || resource.fixtureNamespace !== state.fixtureNamespace)) {
    throw new StagingHarnessError('STATE_RESOURCE_SCOPE_INVALID', 'El estado contiene recursos fuera del workspace/namespace del run; cleanup bloqueado.')
  }
  const paths = makePaths(args, runId)
  const harness = new StagingE2EHarness(config, { ...args, run: true, flows: state.flows || [] }, paths, DEFAULT_FIXTURE)
  harness.state = state
  await harness.cleanup()
  const report = harness.report()
  console.log(`Limpieza terminada. Informe: ${paths.markdownFile}`)
  return report.blockingResiduals.length ? 1 : 0
}

async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) }
  catch (error) { console.error(`[${error.code || 'CLI_ERROR'}] ${error.message}`); return 2 }
  if (args.help) { help(); return 0 }

  if (args.cleanup || args.rollback) {
    try { return await cleanExistingState({ ...args, cleanup: args.cleanup || args.rollback }) }
    catch (error) { console.error(`[${error.code || 'CLEANUP_ERROR'}] ${safeError(error, [process.env.STAGING_E2E_TOKEN, process.env.STAGING_E2E_DATABASE_URL]).message}`); return 2 }
  }

  let config
  try { config = assertSafeStagingConfig(process.env, args) }
  catch (error) { console.error(`[${error.code || 'CONFIG_ERROR'}] ${safeError(error, [process.env.STAGING_E2E_TOKEN, process.env.STAGING_E2E_DATABASE_URL]).message}`); return 2 }

  const fixtureFile = path.resolve(ROOT, args.fixtureFile || process.env.STAGING_E2E_FIXTURE_FILE || DEFAULT_FIXTURE)
  if (!fs.existsSync(fixtureFile)) {
    console.error(`[FIXTURE_MISSING] No existe el fixture ${path.relative(ROOT, fixtureFile)}.`)
    return 2
  }
  const runId = createRunId(config.fixtureNamespace)
  const paths = makePaths(args, runId)
  const harness = new StagingE2EHarness(config, args, paths, fixtureFile)
  harness.saveState()

  if (isDryRun(args)) {
    harness.state.status = 'dry_run'
    harness.state.finishedAt = nowIso()
    harness.state.dryRun = true
    harness.saveState()
    const report = harness.report()
    console.log(`Dry-run seguro: no se hicieron peticiones ni mutaciones. Informe: ${paths.markdownFile}`)
    return report.status === 'failed' ? 1 : 0
  }

  try {
    await harness.preflight()
    if (args.run) {
      for (const flow of args.flows) {
        const result = await harness.runFlow(flow)
        if (result.status === 'failed') break
      }
    }
  } finally {
    if (!args.keepFixtures) await harness.cleanup()
    else harness.state.residuals.push({ reason: '--keep-fixtures fue solicitado explícitamente.', resources: harness.state.resources.map(describeResource) })
    const report = harness.report()
    console.log(`Informe E2E: ${paths.markdownFile}`)
    console.log(`Estado: ${report.status}; flujos fallidos: ${report.flows.filter(item => item.status === 'failed').length}; residuales: ${report.residuals.length}`)
    if (report.status === 'failed' || report.blockingResiduals.length) process.exitCode = 1
  }
  return process.exitCode || 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  const exitCode = await main()
  if (exitCode) process.exitCode = exitCode
}

export { StagingE2EHarness, main }
