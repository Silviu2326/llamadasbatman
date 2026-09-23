process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/offline'
import test from 'node:test'
import assert from 'node:assert/strict'
import { crawlSitemaps, sitemapLocations, robotsAllows } from '../services/sitemapCrawler'
import { nextWebsiteAuditAt, enqueueWebsiteAudit, auditJobView, WEBSITE_AUDIT_INTERVAL } from '../services/websiteSeo.service'
import { crawlSite, searchPropertyMatchesUrl } from '../services/seoAgency.service'
import { dispatchPendingJobs } from '../jobs/jobDispatcher'
import { prisma } from '../lib/prisma'

function stub(t: any, obj: any, key: string, fn: any) { const original = obj[key]; obj[key] = fn; t.after(() => { obj[key] = original }) }

test('walks every child sitemap, ignores foreign domains and stops cycles', async () => {
  const documents: Record<string, string> = {
    'https://example.com/sitemap.xml': '<sitemapindex><loc>https://example.com/a.xml</loc><loc>https://example.com/b.xml</loc><loc>https://foreign.test/map.xml</loc></sitemapindex>',
    'https://example.com/a.xml': '<sitemapindex><loc>https://example.com/sitemap.xml</loc><loc>https://example.com/pages.xml</loc></sitemapindex>',
    'https://example.com/b.xml': '<urlset><loc>https://example.com/b</loc></urlset>',
    'https://example.com/pages.xml': '<urlset><loc>https://example.com/a</loc><loc>https://foreign.test/private</loc></urlset>',
  }
  const requested: string[] = []
  const result = await crawlSitemaps('https://example.com', null, async url => { requested.push(url); return documents[url] || null })
  assert.deepEqual(result.urls.sort(), ['https://example.com/a','https://example.com/b'])
  assert.equal(result.sitemapCount, 4)
  assert.equal(result.truncated, false)
  assert.equal(requested.length, 4)
})
test('respects declared sitemaps and reports a bounded partial crawl', async () => {
  const result = await crawlSitemaps('https://example.com', 'Sitemap: https://example.com/custom.xml', async url =>
    url.endsWith('custom.xml') ? '<urlset><loc>https://example.com/a</loc><loc>https://example.com/b</loc><loc>https://example.com/c</loc></urlset>' : null, 20, 2)
  assert.equal(result.urls.length, 2)
  assert.equal(result.truncated, true)
})
test('parses CDATA and XML escaped query strings', () => {
  assert.deepEqual(sitemapLocations('<urlset><loc><![CDATA[https://example.com/a?x=1&y=2]]></loc><loc>https://example.com/b?x=1&amp;y=2</loc></urlset>'),
    ['https://example.com/a?x=1&y=2', 'https://example.com/b?x=1&y=2'])
})
test('robots generic groups support longest allow and exact or wildcard rules', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nUser-agent: special\nDisallow: /'
  assert.equal(robotsAllows(robots, 'https://example.com/private/a'), false)
  assert.equal(robotsAllows(robots, 'https://example.com/private/public/a'), true)
  assert.equal(robotsAllows(robots, 'https://example.com/a.pdf'), false)
  assert.equal(robotsAllows(robots, 'https://example.com/a.pdf/ok'), true)
  assert.equal(robotsAllows(robots, 'https://example.com/'), true)
})
test('an unreadable sitemap is failure evidence, not discovered pages', async () => {
  const result = await crawlSitemaps('https://example.com', null, async () => '<html>404</html>')
  assert.equal(result.sitemapCount, 0)
  assert.equal(result.urls.length, 0)
  assert.equal(result.failed.length, 1)
})
test('next audit respects both last successful audit and last attempt', () => {
  const first = new Date('2026-09-20T10:00:00Z'), attempt = new Date('2026-09-20T11:00:00Z')
  assert.equal(nextWebsiteAuditAt(first, attempt).getTime(), attempt.getTime() + WEBSITE_AUDIT_INTERVAL)
})
test('cannot enqueue another organisation website', async t => {
  stub(t, prisma.websiteConnection, 'findFirst', async (args: any) => {
    assert.deepEqual(args.where, { id: 'foreign-site', orgId: 'org-a' })
    return null
  })
  stub(t, prisma.job, 'findFirst', async () => { throw new Error('must not query jobs') })
  assert.equal(await enqueueWebsiteAudit('org-a', 'foreign-site'), null)
})
test('active audit is reused and is scoped to organisation and connection', async t => {
  stub(t, prisma.websiteConnection, 'findFirst', async () => ({ id: 'site-a', status: 'connected' }))
  const active = { id: 'job-a', status: 'running' }
  stub(t, prisma.job, 'findFirst', async (args: any) => {
    assert.equal(args.where.orgId, 'org-a')
    assert.equal(args.where.input.equals, 'site-a')
    return active
  })
  assert.equal(await enqueueWebsiteAudit('org-a', 'site-a'), active)
})
test('disconnected sites cannot launch audits and job errors are redacted', async t => {
  stub(t, prisma.websiteConnection, 'findFirst', async () => ({ id: 'site-a', status: 'disconnected' }))
  assert.equal(await enqueueWebsiteAudit('org-a', 'site-a'), null)
  assert.equal(JSON.stringify(auditJobView({ id: 'j', status: 'failed', error: 'SECRET' } as any)).includes('SECRET'), false)
})

test('Search Console domain and URL-prefix properties cannot mix unrelated sites', () => {
  assert.equal(searchPropertyMatchesUrl('sc-domain:example.com', 'https://www.example.com/page'), true)
  assert.equal(searchPropertyMatchesUrl('sc-domain:example.com', 'https://badexample.com/page'), false)
  assert.equal(searchPropertyMatchesUrl('https://example.com/blog/', 'https://example.com/blog/article'), true)
  assert.equal(searchPropertyMatchesUrl('https://example.com/blog/', 'https://example.com/shop/'), false)
  assert.equal(searchPropertyMatchesUrl(null, 'https://example.com'), false)
})
test('dedicated dispatcher queries only its allowed job kinds', async t => {
  let calls = 0
  stub(t, prisma.job, 'findMany', async (args: any) => {
    calls++
    assert.deepEqual(args.where.kind, { in: ['website.seo.audit'] })
    return []
  })
  await dispatchPendingJobs(['website.seo.audit'])
  assert.equal(calls, 1)
})

test('crawler respects exclusions and deduplicates redirected pages', async t => {
  const host = 'https://93.184.216.34'
  stub(t, globalThis, 'fetch', async (input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /hidden')
    if (url.endsWith('/sitemap.xml')) return new Response('<urlset><loc>' + host + '/real</loc><loc>' + host + '/hidden</loc></urlset>')
    if (url === host + '/') return new Response(null, {status: 301, headers: {location: host + '/real'}})
    if (url === host + '/hidden') throw new Error('Excluded URL must not be fetched')
    return new Response('<html><head><title>Example</title></head><body><h1>Example</h1>' + 'content '.repeat(30) + '</body></html>')
  })
  const result = await crawlSite(host + '/')
  assert.equal(result.pagesAudited, 1)
  assert.deepEqual(result.duplicateTitles, [])
  assert.deepEqual(result.excludedUrls, [host + '/hidden'])
  assert.equal(result.redirects?.[host + '/'], host + '/real')
})
test('manual retry persists a new job after a failed attempt', async t => {
  stub(t, prisma.websiteConnection, 'findFirst', async () => ({id: 'site-a', status:'connected'}))
  let reads = 0
  stub(t, prisma.job, 'findFirst', async () => ++reads === 1 ? null : {id: 'failed-job'})
  stub(t, prisma.job, 'create', async ({data}: any) => {
    assert.equal(data.orgId, 'org-a')
    assert.equal(data.kind, 'website.seo.audit')
    assert.equal(data.input.connectionId, 'site-a')
    assert.equal(data.input.source, 'manual')
    assert.equal(data.maxAttempts, 2)
    assert.equal(data.idempotencyKey, 'manual:site-a:after:failed-job')
    return {id: 'retry-job', ...data}
  })
  const job = await enqueueWebsiteAudit('org-a','site-a','manual')
  assert.equal(job?.id, 'retry-job')
})
