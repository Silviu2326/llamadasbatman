import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import http from 'http'
import { WebSocketServer } from 'ws'

import { initWebSockets } from './websockets/index'
import { handleMediaStream } from './voice/telephony/mediaStream'
import { handleSimStream } from './voice/telephony/simStream'

// Routes
import { authRoutes } from './routes/auth'
import { agentsRoutes } from './routes/agents'
import { callsRoutes } from './routes/calls'
import { leadsRoutes } from './routes/leads'
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
import { postizRoutes } from './routes/postiz'
import { automationsRoutes } from './routes/automations'
import { knowledgeRoutes } from './routes/knowledge'
import { dashboardRoutes } from './routes/dashboard'
import { voiceRoutes } from './routes/voice'
import { landingRoutes } from './routes/landing'
import { campaignShareRoutes } from './routes/campaignShare'
import { settingsRoutes } from './routes/settings'
import { conversationsRoutes } from './routes/conversations'
import { whatsappRoutes } from './routes/whatsapp'
import { getOrCreateCorrelationId } from './lib/correlationId'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; orgId: string; role: string; email: string }
    user:    { userId: string; orgId: string; role: string; email: string }
  }
}

// FND-06: correlationId por request, disponible en toda la cadena de handlers.
declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string
  }
}

async function build() {
  // bodyLimit por encima del default (1MB) porque los archivos de lead se
  // suben como base64 en el body JSON (sin @fastify/multipart nuevo)
  const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 })

  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'changeme_secret' })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  // x-www-form-urlencoded para Twilio webhooks
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)))
  })

  // FND-06: asigna/propaga un correlationId por request para poder rastrear
  // una petición a través de logs, AutomationRun y OutboxEvent.
  app.addHook('onRequest', async (request, reply) => {
    request.correlationId = getOrCreateCorrelationId(request)
    reply.header('x-correlation-id', request.correlationId)
  })

  await app.register(authRoutes,       { prefix: '/api/auth' })
  await app.register(agentsRoutes,     { prefix: '/api/agents' })
  await app.register(callsRoutes,      { prefix: '/api/calls' })
  await app.register(leadsRoutes,      { prefix: '/api/leads' })
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
  await app.register(postizRoutes,     { prefix: '/api/postiz' })
  await app.register(automationsRoutes,{ prefix: '/api/automations' })
  await app.register(knowledgeRoutes,  { prefix: '/api/knowledge' })
  await app.register(dashboardRoutes,  { prefix: '/api/dashboard' })
  await app.register(voiceRoutes,      { prefix: '/api/voice' })
  await app.register(landingRoutes,    { prefix: '/api/public/landing' })
  await app.register(campaignShareRoutes, { prefix: '/api/public/campaigns' })
  await app.register(settingsRoutes,   { prefix: '/api/settings' })
  await app.register(conversationsRoutes, { prefix: '/api/conversations' })
  await app.register(whatsappRoutes,   { prefix: '/api/whatsapp' })

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  return app
}

async function main() {
  const app  = await build()
  const PORT = parseInt(process.env.PORT ?? '3000', 10)

  await app.listen({ port: PORT, host: '0.0.0.0' })

  const httpServer = app.server as unknown as http.Server

  // noServer mode: un único listener de upgrade, ruteamos por path.
  // Con { server } múltiple cada WSS llama socket.destroy() para rutas ajenas.
  const mediaWss = new WebSocketServer({ noServer: true })
  const simWss   = new WebSocketServer({ noServer: true })

  mediaWss.on('connection', (ws) => handleMediaStream(ws))
  simWss.on('connection',   (ws) => handleSimStream(ws).catch(console.error))

  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/media') {
      mediaWss.handleUpgrade(req, socket as any, head, (ws) => mediaWss.emit('connection', ws, req))
    } else if (path === '/voice-sim/live') {
      simWss.handleUpgrade(req, socket as any, head, (ws) => simWss.emit('connection', ws, req))
    }
    // resto (ej. /socket.io) lo maneja socket.io abajo
  })

  initWebSockets(httpServer)
  console.log(`[Vozia] Server running on port ${PORT}`)
}

main().catch((err) => {
  console.error('[Vozia] Fatal error:', err)
  process.exit(1)
})
