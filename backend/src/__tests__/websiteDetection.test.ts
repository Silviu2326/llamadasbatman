process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectWebsiteConnection, detectWebsiteTechnology, discoverWebsiteConnection, WebsiteDetectionError } from '../services/websiteConnections.service'
import { prisma } from '../lib/prisma'

test('identifica recursos técnicos de CMS, constructores y código propio', () => {
  const fixtures = [
    ['wordpress', '<link href="/wp-content/themes/site/style.css">'],
    ['wordpress', '<meta content="WordPress 6.8" name="generator">'],
    ['shopify', '<script src="https://cdn.shopify.com/s/files/theme.js"></script>'],
    ['webflow', '<html data-wf-site="123">'],
    ['wix', '<script src="https://static.wixstatic.com/site.js"></script>'],
    ['squarespace', '<img src="https://images.squarespace.com/content/site.jpg">'],
    ['framer', '<main data-framer-name="Page">'],
    ['nextjs', '<!DOCTYPE html><link rel="stylesheet" href="/_next/static/chunks/site.css"><script src="/_next/static/chunks/app.js"></script>'],
  ]
  for (const [expected, html] of fixtures) {
    const result = detectWebsiteTechnology(html)
    assert.equal(result.technology, expected)
    assert.ok(result.evidence.length)
  }
})

test('no confunde menciones comerciales ni HTML genérico con una plataforma confirmada', () => {
  const result = detectWebsiteTechnology('<!doctype html><html><h1>Migramos WordPress, Shopify y Webflow</h1></html>')
  assert.equal(result.technology, 'unknown')
  assert.deepEqual(result.evidence, [])
  assert.equal(detectWebsiteTechnology('<html></html>', new Headers({ 'x-powered-by': 'Next.js' })).technology, 'nextjs')
})

test('detecta sin base de datos, normaliza dominios y recomienda solo canales implementados', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async url => {
    assert.equal(String(url), 'https://93.184.216.34/')
    return new Response('<html><script src="/_next/static/chunks/app.js"></script></html>', { headers: { 'content-type': 'text/html' } })
  }) as typeof fetch
  try {
    const preview = await detectWebsiteConnection('93.184.216.34')
    assert.equal(preview.technology, 'nextjs')
    assert.equal(preview.recommendedMode, 'git')
    assert.deepEqual(preview.availableModes, ['git'])
    assert.equal('id' in preview, false)
    assert.equal('install' in preview, false)
  } finally { globalThis.fetch = original }
})

test('explica bloqueos de red, HTTP y respuestas que no son páginas', async () => {
  const original = globalThis.fetch
  const cases: Array<[() => Promise<Response>, RegExp]> = [
    [async () => { throw new TypeError('fetch failed', { cause: { code: 'EACCES' } }) }, /servidor de Vendrava no tiene permiso/],
    [async () => new Response('Forbidden', { status: 403 }), /bloqueado la detección/],
    [async () => new Response('{}', { headers: { 'content-type': 'application/json' } }), /no devuelve una página HTML/],
  ]
  try {
    for (const [response, expected] of cases) {
      globalThis.fetch = response as typeof fetch
      await assert.rejects(() => detectWebsiteConnection('https://93.184.216.34/'), error => error instanceof WebsiteDetectionError && expected.test(error.message))
    }
  } finally { globalThis.fetch = original }
})

test('la detección conserva el bloqueo de destinos privados y redirecciones internas', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
  }) as typeof fetch
  try {
    await assert.rejects(() => detectWebsiteConnection('http://127.0.0.1/'), /dirección web pública/)
    assert.equal(calls, 0)
    await assert.rejects(() => detectWebsiteConnection('https://93.184.216.34/'), /dirección web pública/)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})

test('confirmar prepara el método elegido; repetir la detección conserva un conector verificado', async () => {
  const originalFetch = globalThis.fetch
  const originalFind = prisma.websiteConnection.findUnique
  const originalUpsert = prisma.websiteConnection.upsert
  const originalSignals = prisma.websiteEvent.groupBy
  const originalAuditConnection = prisma.websiteConnection.findFirst
  prisma.websiteConnection.findFirst = (async () => null) as any
  let existing: any = null
  let saved: any
  globalThis.fetch = (async () => new Response('<html><script src="/_next/static/app.js"></script></html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch
  prisma.websiteConnection.findUnique = (async () => existing) as any
  prisma.websiteConnection.upsert = (async (args: any) => {
    saved = existing ? { ...existing, ...args.update } : args.create
    return { id: 'test-connection', ...saved }
  }) as any
  prisma.websiteEvent.groupBy = (async () => []) as any
  try {
    const created = await discoverWebsiteConnection({ orgId: 'test-org', website: 'https://93.184.216.34/', mode: 'git' })
    assert.equal(created.connectionMode, 'git')
    assert.equal(created.status, 'setup_required')
    assert.equal(created.signals.verified, false)
    assert.ok(created.install.snippet)
    const connector = { kind: 'git', provider: 'github', owner: 'example', repo: 'site', defaultBranch: 'main', canPush: true }
    existing = { ...saved, connectionMode: 'git', status: 'connected', detection: { connector } }
    const refreshed = await discoverWebsiteConnection({ orgId: 'test-org', website: 'https://93.184.216.34/', mode: 'git' })
    assert.equal(refreshed.connectionMode, 'git')
    assert.equal(refreshed.status, 'connected')
    assert.equal(refreshed.connector?.kind, 'git')
    await assert.rejects(() => discoverWebsiteConnection({ orgId: 'test-org', website: 'https://93.184.216.34/', mode: 'plugin' }), /método no está disponible/)
  } finally {
    globalThis.fetch = originalFetch
    prisma.websiteConnection.findUnique = originalFind
    prisma.websiteConnection.upsert = originalUpsert
    prisma.websiteEvent.groupBy = originalSignals
    prisma.websiteConnection.findFirst = originalAuditConnection
  }
})
