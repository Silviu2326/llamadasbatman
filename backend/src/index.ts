import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import http from 'http'
import { WebSocketServer } from 'ws'

import { initWebSockets, isRealtimeOriginAllowed } from './websockets/index'
import { handleMediaStream } from './voice/telephony/mediaStream'
import { handleSimStream, type VoiceSimulationPrincipal } from './voice/telephony/simStream'
import { verifyMediaStreamTokenForOrg } from './voice/telephony/streamAuth'

// Routes
import { authRoutes } from './routes/auth'
import { agentsRoutes } from './routes/agents'
import { callsRoutes } from './routes/calls'
import { leadsRoutes } from './routes/leads'
import { accountsRoutes } from './routes/accounts'
import { prospectsRoutes } from './routes/prospects'
import { campaignsRoutes } from './routes/campaigns'
import { meetingsRoutes } from './routes/meetings'
import { pipelineRoutes } from './routes/pipeline'
import { tasksRoutes } from './routes/tasks'
import { playbooksRoutes } from './routes/playbooks'
import { adPlaybooksRoutes } from './routes/adPlaybooks'
import { adsRoutes } from './routes/ads'
import { funnelsRoutes } from './routes/funnels'
import { metaAccountsRoutes } from './routes/metaAccounts'
import { metaWebhooksRoutes } from './routes/metaWebhooks'
import { mauticWebhooksRoutes } from './routes/mauticWebhooks'
import { mauticRoutes } from './routes/mautic'
import { metricoolRoutes } from './routes/metricool'
import { publicMediaRoutes } from './routes/publicMedia'
import { automationsRoutes } from './routes/automations'
import { knowledgeRoutes } from './routes/knowledge'
import { dashboardRoutes } from './routes/dashboard'
import { voiceRoutes } from './routes/voice'
import { landingRoutes } from './routes/landing'
import { campaignShareRoutes } from './routes/campaignShare'
import { settingsRoutes } from './routes/settings'
import { billingRoutes, billingWebhookRoutes } from './routes/billing'
import { conversationsRoutes } from './routes/conversations'
import { whatsappRoutes } from './routes/whatsapp'
import { emailMetricsRoutes } from './routes/emailMetrics'
import { marketingCampaignsRoutes } from './routes/marketingCampaigns'
import { growthProgramsRoutes } from './routes/growthPrograms'
import { revenueIntelligenceRoutes } from './routes/revenueIntelligence'
import { accessControlRoutes } from './routes/accessControl'
import { organicRoutes } from './routes/organic'
import { actionCenterRoutes } from './routes/actionCenter'
import { orchestrationRoutes } from './routes/orchestration'
import { integrationHealthRoutes } from './routes/integrationHealth'
import { integrationCredentialsRoutes } from './routes/integrationCredentials'
import { observabilityRoutes } from './routes/observability'
import { getOrCreateCorrelationId } from './lib/correlationId'
import { getCorsOrigins, requireStrongSecret } from './lib/securityConfig'
import { recordHttpRequest, recordWebhookRequest, webhookIdentity } from './observability/metrics'
import { safeOperationalError } from './observability/operationalLog'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; orgId: string; role: string; email: string; tokenType: 'access'; sessionId: string; workspaceScope?: 'own' | 'team' | 'org'; workspaceGrants?: Array<{ workspaceId: string; role: string; scope: 'own' | 'team' | 'org'; source: 'primary' | 'agency_config'; agencyOrgId?: string }> }
    user:    { userId: string; orgId: string; role: string; email: string; tokenType: 'access'; sessionId: string; workspaceScope?: 'own' | 'team' | 'org'; workspaceGrants?: Array<{ workspaceId: string; role: string; scope: 'own' | 'team' | 'org'; source: 'primary' | 'agency_config'; agencyOrgId?: string }> }
  }
}

// FND-06: correlationId por request, disponible en toda la cadena de handlers.
declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string
    observabilityStartedAt?: bigint
  }
}

async function build() {
  // bodyLimit por encima del default (1MB) porque los archivos de lead se
  // suben como base64 en el body JSON (sin @fastify/multipart nuevo)
  const app = Fastify({
    logger: true,
    bodyLimit: 15 * 1024 * 1024,
    // No aceptar X-Forwarded-For salvo en despliegues que lo declaren.
    trustProxy: process.env.TRUST_PROXY === 'true',
  })

  const corsOrigins = getCorsOrigins()
  const jwtSecret = requireStrongSecret('JWT_SECRET')
  // El estado OAuth no comparte secreto con las sesiones de usuario.
  requireStrongSecret('OAUTH_STATE_SECRET')

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      // Requests server-to-server no necesitan cabeceras CORS. Un navegador
      // solo recibe una respuesta compartible si su origen es explícito.
      callback(null, Boolean(origin && corsOrigins.has(origin)))
    },
  })
  await app.register(jwt, { secret: jwtSecret })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  // x-www-form-urlencoded para Twilio webhooks
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)))
  })

  // FND-06: asigna/propaga un correlationId por request para poder rastrear
  // una petición a través de logs, AutomationRun y OutboxEvent.
  app.addHook('onRequest', async (request, reply) => {
    request.correlationId = getOrCreateCorrelationId(request)
    request.observabilityStartedAt = process.hrtime.bigint()
    // Fastify/Pino mantiene el correlationId en todos los logs automáticos y
    // en los logs explícitos del handler sin registrar bodies ni credenciales.
    request.log = request.log.child({ correlationId: request.correlationId })
    reply.header('x-correlation-id', request.correlationId)
  })

  app.addHook('onError', async (request, _reply, error) => {
    const classified = safeOperationalError(error)
    request.log.error({
      event: 'http.request.error',
      correlationId: request.correlationId,
      errorCode: classified.code,
      remediation: classified.remediation,
    }, classified.safeMessage)
  })

  // Métricas de transporte solamente: método, ruta normalizada, estado y
  // duración. Nunca se inspeccionan query params, headers, bodies ni tokens.
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = request.observabilityStartedAt
    const durationMs = startedAt === undefined
      ? 0
      : Number(process.hrtime.bigint() - startedAt) / 1_000_000
    const path = request.url.split('?')[0] || '/'
    const route = request.routeOptions.url || path

    recordHttpRequest({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs,
    })
    request.log.info({
      event: 'http.request.completed',
      correlationId: request.correlationId,
      route,
      method: request.method,
      statusCode: reply.statusCode,
      durationMs: Math.round(durationMs),
    }, 'HTTP request completed')

    const webhook = webhookIdentity(path)
    if (webhook) {
      const outcome = reply.statusCode >= 500
        ? 'retry'
        : reply.statusCode >= 400
          ? 'rejected'
          : 'accepted'
      recordWebhookRequest({ ...webhook, outcome })
    }
  })

  await app.register(authRoutes,       { prefix: '/api/auth' })
  await app.register(agentsRoutes,     { prefix: '/api/agents' })
  await app.register(callsRoutes,      { prefix: '/api/calls' })
  await app.register(leadsRoutes,      { prefix: '/api/leads' })
  await app.register(accountsRoutes,   { prefix: '/api/accounts' })
  await app.register(prospectsRoutes,  { prefix: '/api/prospects' })
  await app.register(campaignsRoutes,  { prefix: '/api/campaigns' })
  await app.register(meetingsRoutes,   { prefix: '/api/meetings' })
  await app.register(pipelineRoutes,   { prefix: '/api/pipeline' })
  await app.register(tasksRoutes,      { prefix: '/api/tasks' })
  await app.register(playbooksRoutes,  { prefix: '/api/playbooks' })
  await app.register(adPlaybooksRoutes,{ prefix: '/api/ad-playbooks' })
  await app.register(adsRoutes,        { prefix: '/api/ads' })
  await app.register(funnelsRoutes,    { prefix: '/api/funnels' })
  await app.register(metaAccountsRoutes,{ prefix: '/api/meta/accounts' })
  await app.register(metaWebhooksRoutes,{ prefix: '/api/meta/webhooks' })
  await app.register(mauticWebhooksRoutes,{ prefix: '/api/webhooks/mautic' })
  await app.register(mauticRoutes,     { prefix: '/api/mautic' })
  await app.register(metricoolRoutes,  { prefix: '/api/metricool' })
  await app.register(publicMediaRoutes,{ prefix: '/api/public/media' })
  await app.register(automationsRoutes,{ prefix: '/api/automations' })
  await app.register(knowledgeRoutes,  { prefix: '/api/knowledge' })
  await app.register(dashboardRoutes,  { prefix: '/api/dashboard' })
  await app.register(actionCenterRoutes, { prefix: '/api/dashboard' })
  await app.register(orchestrationRoutes, { prefix: '/api/orchestration' })
  await app.register(voiceRoutes,      { prefix: '/api/voice' })
  await app.register(landingRoutes,    { prefix: '/api/public/landing' })
  await app.register(campaignShareRoutes, { prefix: '/api/public/campaigns' })
  await app.register(settingsRoutes,   { prefix: '/api/settings' })
  await app.register(billingRoutes,    { prefix: '/api/billing' })
  await app.register(billingWebhookRoutes, { prefix: '/api/billing/webhook' })
  await app.register(conversationsRoutes, { prefix: '/api/conversations' })
  await app.register(whatsappRoutes,   { prefix: '/api/whatsapp' })
  await app.register(emailMetricsRoutes, { prefix: '/api/email' })
  await app.register(marketingCampaignsRoutes, { prefix: '/api/marketing-campaigns' })
  await app.register(growthProgramsRoutes, { prefix: '/api/growth-programs' })
  await app.register(revenueIntelligenceRoutes, { prefix: '/api/revenue-intelligence' })
  await app.register(accessControlRoutes, { prefix: '/api/access-control' })
  await app.register(organicRoutes, { prefix: '/api/organic' })

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
  await app.register(integrationHealthRoutes, { prefix: '/health' })
  await app.register(integrationCredentialsRoutes, { prefix: '/api/integration-credentials' })
  await app.register(observabilityRoutes, { prefix: '/health' })

  return app
}

async function main() {
  const app  = await build()
  const PORT = parseInt(process.env.PORT ?? '3000', 10)

  await app.listen({ port: PORT, host: '0.0.0.0' })

  const httpServer = app.server as unknown as http.Server

  // noServer mode: un único listener de upgrade, ruteamos por path.
  // Con { server } múltiple cada WSS llama socket.destroy() para rutas ajenas.
  const mediaWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })
  const simWss   = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    // The client sends ['vozia', jwt]. Never reflect the JWT in the response.
    handleProtocols: protocols => protocols.has('vozia') ? 'vozia' : false,
  })

  const validPrincipal = (value: unknown): value is VoiceSimulationPrincipal => {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<VoiceSimulationPrincipal>
    return [candidate.userId, candidate.orgId, candidate.role, candidate.email]
      .every(field => typeof field === 'string' && field.trim().length > 0 && field.length <= 256)
  }

  const protocolToken = (req: http.IncomingMessage): string | null => {
    const header = req.headers['sec-websocket-protocol']
    const raw = Array.isArray(header) ? header[0] : header
    if (!raw) return null
    const protocols = raw.split(',').map((value: string) => value.trim()).filter(Boolean)
    const marker = protocols.indexOf('vozia')
    const token = marker >= 0 ? protocols[marker + 1] : null
    return token && /^[A-Za-z0-9._-]{1,4096}$/.test(token) ? token : null
  }

  const rejectUpgrade = (socket: { write: (data: string) => boolean; destroy: () => void }, status: 401 | 403): void => {
    socket.write(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (path === '/media') {
      void verifyMediaStreamTokenForOrg(url.searchParams.get('token')).then(claims => {
        if (!claims) return rejectUpgrade(socket, 401)
        mediaWss.handleUpgrade(req, socket, head, (ws) => {
          handleMediaStream(ws, claims).catch(error => {
            console.error('[MEDIA] Failed to initialise stream:', error)
            ws.close(1011, 'Media initialisation failed')
          })
        })
      }).catch(() => rejectUpgrade(socket, 401))
    } else if (path === '/voice-sim/live') {
      const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
      if (!isRealtimeOriginAllowed(origin)) return rejectUpgrade(socket, 403)
      const token = protocolToken(req)
      if (!token) return rejectUpgrade(socket, 401)
      try {
        const principal = app.jwt.verify<VoiceSimulationPrincipal>(token)
        if (!validPrincipal(principal)) return rejectUpgrade(socket, 401)
        simWss.handleUpgrade(req, socket, head, (ws) => {
          handleSimStream(ws, principal).catch(error => {
            console.error('[SIM] Failed to initialise stream:', error)
            ws.close(1011, 'Simulation initialisation failed')
          })
        })
      } catch {
        return rejectUpgrade(socket, 401)
      }
    }
    // resto (ej. /socket.io) lo maneja socket.io abajo
  })

  initWebSockets(httpServer, token => app.jwt.verify(token))
  console.log(`[Vozia] Server running on port ${PORT}`)
}

main().catch((err) => {
  console.error('[Vozia] Fatal error:', err)
  process.exit(1)
})
