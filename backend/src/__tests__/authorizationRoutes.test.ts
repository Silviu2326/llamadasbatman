import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { agentsRoutes } from '../routes/agents'
import { campaignsRoutes } from '../routes/campaigns'
import { metaAccountsRoutes } from '../routes/metaAccounts'
import { metricoolRoutes } from '../routes/metricool'
import { whatsappRoutes } from '../routes/whatsapp'
import { prospectsRoutes } from '../routes/prospects'
import { adsRoutes } from '../routes/ads'
import { funnelsRoutes } from '../routes/funnels'
import { conversationsRoutes } from '../routes/conversations'
import { callsRoutes } from '../routes/calls'
import { knowledgeRoutes } from '../routes/knowledge'
import { playbooksRoutes } from '../routes/playbooks'
import { marketingCampaignsRoutes } from '../routes/marketingCampaigns'
import { settingsRoutes } from '../routes/settings'

/**
 * Estas pruebas no usan Prisma: verifican que el preHandler corta la petición
 * antes de que el controlador pueda crear datos, llamar a IA o tocar un
 * proveedor. Así cubren las rutas que históricamente solo exigían JWT.
 */
async function buildViewerApp() {
  const app = Fastify()
  await app.register(jwt, { secret: 'authorization-route-test-secret' })

  await app.register(agentsRoutes, { prefix: '/agents' })
  await app.register(campaignsRoutes, { prefix: '/campaigns' })
  await app.register(metaAccountsRoutes, { prefix: '/meta/accounts' })
  await app.register(metricoolRoutes, { prefix: '/metricool' })
  await app.register(whatsappRoutes, { prefix: '/whatsapp' })
  await app.register(prospectsRoutes, { prefix: '/prospects' })
  await app.register(adsRoutes, { prefix: '/ads' })
  await app.register(funnelsRoutes, { prefix: '/funnels' })
  await app.register(conversationsRoutes, { prefix: '/conversations' })
  await app.register(callsRoutes, { prefix: '/calls' })
  await app.register(knowledgeRoutes, { prefix: '/knowledge' })
  await app.register(playbooksRoutes, { prefix: '/playbooks' })
  await app.register(marketingCampaignsRoutes, { prefix: '/marketing-campaigns' })
  await app.register(settingsRoutes, { prefix: '/settings' })
  await app.ready()
  return app
}

test('un viewer no puede mutar ni iniciar operaciones que generan coste', async () => {
  const app = await buildViewerApp()
  try {
    const token = app.jwt.sign({
      userId: 'viewer-user',
      orgId: 'viewer-org',
      role: 'viewer',
      email: 'viewer@example.test',
      tokenType: 'access',
      sessionId: 'viewer-session',
    })
    const headers = { authorization: `Bearer ${token}` }
    const protectedOperations = [
      { method: 'POST' as const, url: '/agents' },
      { method: 'POST' as const, url: '/campaigns' },
      { method: 'GET' as const, url: '/meta/accounts/oauth/start-url' },
      { method: 'PUT' as const, url: '/meta/accounts/account-id/budget-cap' },
      { method: 'POST' as const, url: '/metricool/connect' },
      { method: 'POST' as const, url: '/metricool/ai/generate' },
      { method: 'POST' as const, url: '/whatsapp/send' },
      { method: 'POST' as const, url: '/prospects/search' },
      { method: 'POST' as const, url: '/prospects/import' },
      { method: 'POST' as const, url: '/ads/strategy' },
      { method: 'PUT' as const, url: '/ads/draft' },
      { method: 'POST' as const, url: '/ads/wizard' },
      { method: 'POST' as const, url: '/funnels' },
      { method: 'PATCH' as const, url: '/funnels/funnel-id/status' },
      { method: 'POST' as const, url: '/conversations/conversation-id/messages' },
      { method: 'POST' as const, url: '/calls/bulk-actions' },
      { method: 'POST' as const, url: '/calls/tts-latency-demo' },
      { method: 'POST' as const, url: '/knowledge' },
      { method: 'POST' as const, url: '/playbooks' },
      { method: 'GET' as const, url: '/marketing-campaigns/campaign-id/reconcile' },
      { method: 'PUT' as const, url: '/settings/organization' },
    ]

    for (const operation of protectedOperations) {
      const response = await app.inject({ ...operation, headers })
      assert.equal(response.statusCode, 403, `${operation.method} ${operation.url} debe rechazar viewer`)
      assert.deepEqual(response.json(), { error: 'Forbidden' })
    }
  } finally {
    await app.close()
  }
})

test('admin y agent pasan la barrera de autorización de mutaciones', async () => {
  const app = await buildViewerApp()
  try {
    for (const role of ['admin', 'agent']) {
      const token = app.jwt.sign({
        userId: `${role}-user`,
        orgId: 'org',
        role,
        email: `${role}@example.test`,
        tokenType: 'access',
        sessionId: `${role}-session`,
      })
      const response = await app.inject({
        method: 'POST',
        url: '/agents',
        headers: { authorization: `Bearer ${token}` },
      })
      // El controller recibe la petición y la valida (400), pero no se bloquea
      // por rol. Un 403 indicaría que el permiso rompió admin/agent.
      assert.notEqual(response.statusCode, 403, `${role} debe poder llegar al controlador`)
    }
  } finally {
    await app.close()
  }
})
