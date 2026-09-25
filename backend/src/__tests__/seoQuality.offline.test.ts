// Quality gate SEO: función pura y 422 en la publicación.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.REDIS_ENABLED = 'false'
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { prisma } from '../lib/prisma'
import { articleFromMarkdown, evaluateSeoArticleQuality } from '../services/seoQuality'
import { seoRoutes } from '../routes/seo'

const good = {
  title: 'Fisioterapia deportiva en Madrid | Clínica Movimiento',
  metaDescription: 'Descubre cómo la fisioterapia deportiva en Madrid puede ayudarte a recuperar movilidad, prevenir lesiones y volver a entrenar con seguridad.',
  h1: 'Fisioterapia deportiva en Madrid para deportistas',
  outline: ['Qué incluye', 'Cómo trabajamos', 'Ventajas', 'FAQ', 'Pide cita'],
  keyword: 'fisioterapia deportiva',
  audience: 'deportistas amateur',
  cta: 'pide cita',
  mode: 'activa',
}

test('evaluateSeoArticleQuality aprueba un artículo completo y señala cada fallo', () => {
  assert.equal(good.title.length >= 50 && good.title.length <= 60, true)
  const ok = evaluateSeoArticleQuality(good)
  assert.equal(ok.passed, true)
  assert.equal(ok.checks.length, 7)
  const bad = evaluateSeoArticleQuality({ ...good, title: 'Corto', keyword: 'otra cosa', outline: ['a'], audience: '', cta: '' })
  assert.equal(bad.passed, false)
  assert.deepEqual(bad.checks.filter((c) => !c.ok).map((c) => c.id), ['title', 'keyword', 'outline', 'audience', 'cta'])
  assert.equal(bad.checks.find((c) => c.id === 'title')?.value, '5/60')
  assert.equal(bad.checks.find((c) => c.id === 'outline')?.value, '1')
})

test('articleFromMarkdown saca H1 y esquema del contenido y deja el contexto al cliente', () => {
  const article = articleFromMarkdown('Nombre', '# Título H1\n\nPrimer párrafo.\n\n## Uno\n## Dos\n### Sub\n## Tres', { keyword: 'k', metaDescription: 'meta' })
  assert.equal(article.h1, 'Título H1')
  assert.deepEqual(article.outline, ['Uno', 'Dos', 'Tres'])
  assert.equal(article.metaDescription, 'meta')
  assert.equal(article.keyword, 'k')
  assert.equal(article.title, 'Nombre')
})

// `authenticate` y los permisos consultan Prisma: se les da una organización
// mínima en memoria, como en authorizationRoutes.test.ts.
async function buildApp(content: string | null) {
  const saved: Array<[any, string, any]> = []
  const patch = (target: any, key: string, fn: any) => { saved.push([target, key, target[key]]); target[key] = fn }
  patch(prisma.knowledgeBase, 'findFirst', async () => ({ id: 'a1', name: good.title, content, slug: null }))
  patch(prisma.knowledgeBase, 'update', async () => ({}))
  patch(prisma.agencyClient, 'findMany', async () => [])
  patch(prisma.organization, 'findUnique', async ({ where }: any) => ({ id: where.id, plan: 'pro', metricoolEnabled: false }))
  for (const model of ['user', 'lead', 'campaign', 'agent', 'automation']) patch((prisma as any)[model], 'count', async () => 0)
  patch(prisma.authSession, 'findFirst', async () => ({ id: 's1', activeOrgId: 'org', user: { id: 'u', orgId: 'org', role: 'owner' } }))
  patch(prisma.organizationMembership, 'findUnique', async () => ({ role: 'owner', status: 'active' }))
  const app = Fastify()
  await app.register(jwt, { secret: 'seo-quality-test-secret' })
  await app.register(seoRoutes, { prefix: '/api/seo' })
  await app.ready()
  const token = app.jwt.sign({ userId: 'u', orgId: 'org', role: 'owner', email: 'a@b.c', tokenType: 'access', sessionId: 's1' })
  return { app, headers: { authorization: `Bearer ${token}` }, restore: () => { for (const [target, key, value] of saved.reverse()) target[key] = value } }
}

test('POST /content/:id/publish responde 422 QUALITY_CHECKS_FAILED cuando el gate no pasa', async (t) => {
  const { app, headers, restore } = await buildApp('# Solo título\n\n## Uno')
  t.after(async () => { restore(); await app.close() })
  const response = await app.inject({ method: 'POST', url: '/api/seo/content/a1/publish', headers, payload: { keyword: 'fisioterapia deportiva' } })
  assert.equal(response.statusCode, 422, response.body)
  const body = response.json()
  assert.equal(body.code, 'QUALITY_CHECKS_FAILED')
  assert.equal(Array.isArray(body.checks), true)
  assert.equal(body.checks.some((c: any) => c.id === 'outline' && !c.ok), true)
})

test('POST /content/:id/publish publica cuando el gate pasa y GET /quality devuelve los checks', async (t) => {
  const markdown = `# ${good.h1}\n\n${good.metaDescription}\n\n${good.outline.map((h) => `## ${h}`).join('\n')}`
  const { app, headers, restore } = await buildApp(markdown)
  t.after(async () => { restore(); await app.close() })
  const context = { keyword: good.keyword, audience: good.audience, cta: good.cta, mode: 'activa', metaDescription: good.metaDescription }
  const quality = await app.inject({ method: 'GET', url: '/api/seo/content/a1/quality', headers, query: context })
  assert.equal(quality.statusCode, 200, quality.body)
  assert.equal(quality.json().data.passed, true)
  const response = await app.inject({ method: 'POST', url: '/api/seo/content/a1/publish', headers, payload: context })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().data.articleId, 'a1')
})
