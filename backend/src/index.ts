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
import { campaignsRoutes } from './routes/campaigns'
import { meetingsRoutes } from './routes/meetings'
import { pipelineRoutes } from './routes/pipeline'
import { playbooksRoutes } from './routes/playbooks'
import { automationsRoutes } from './routes/automations'
import { knowledgeRoutes } from './routes/knowledge'
import { dashboardRoutes } from './routes/dashboard'
import { voiceRoutes } from './routes/voice'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; orgId: string; role: string; email: string }
    user:    { userId: string; orgId: string; role: string; email: string }
  }
}

async function build() {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'changeme_secret' })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  // x-www-form-urlencoded para Twilio webhooks
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)))
  })

  await app.register(authRoutes,       { prefix: '/api/auth' })
  await app.register(agentsRoutes,     { prefix: '/api/agents' })
  await app.register(callsRoutes,      { prefix: '/api/calls' })
  await app.register(leadsRoutes,      { prefix: '/api/leads' })
  await app.register(campaignsRoutes,  { prefix: '/api/campaigns' })
  await app.register(meetingsRoutes,   { prefix: '/api/meetings' })
  await app.register(pipelineRoutes,   { prefix: '/api/pipeline' })
  await app.register(playbooksRoutes,  { prefix: '/api/playbooks' })
  await app.register(automationsRoutes,{ prefix: '/api/automations' })
  await app.register(knowledgeRoutes,  { prefix: '/api/knowledge' })
  await app.register(dashboardRoutes,  { prefix: '/api/dashboard' })
  await app.register(voiceRoutes,      { prefix: '/api/voice' })

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
