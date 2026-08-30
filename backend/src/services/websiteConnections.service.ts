import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { assertAuditablePublicUrl, fetchHtml, normalizeUrl } from './digitalAudit.service'

export const WEBSITE_CONNECTION_MODES = ['script', 'plugin', 'api', 'git', 'sftp', 'edge'] as const
export type WebsiteConnectionMode = typeof WEBSITE_CONNECTION_MODES[number]

type Capability = {
  id: string
  label: string
  detail: string
  available: boolean
  via: string
}

const TECHNOLOGY_LABELS: Record<string, string> = {
  wordpress: 'WordPress',
  shopify: 'Shopify',
  webflow: 'Webflow',
  wix: 'Wix',
  squarespace: 'Squarespace',
  framer: 'Framer',
  nextjs: 'Next.js / código propio',
  static: 'Web estática o HTML propio',
  unknown: 'Tecnología no identificada',
}

const AVAILABLE_MODES: Record<string, WebsiteConnectionMode[]> = {
  wordpress: ['plugin', 'script', 'sftp', 'edge'],
  shopify: ['api', 'script', 'edge'],
  webflow: ['api', 'script', 'edge'],
  wix: ['api', 'script', 'edge'],
  squarespace: ['api', 'script', 'edge'],
  framer: ['script', 'edge'],
  nextjs: ['git', 'script', 'sftp', 'edge'],
  static: ['git', 'script', 'sftp', 'edge'],
  unknown: ['script', 'sftp', 'edge'],
}

const RECOMMENDED_MODES: Record<string, WebsiteConnectionMode> = {
  wordpress: 'plugin',
  shopify: 'api',
  webflow: 'api',
  wix: 'api',
  squarespace: 'api',
  framer: 'script',
  nextjs: 'git',
  static: 'script',
  unknown: 'script',
}

function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
}

function detectTechnology(html: string, headers: Headers): string {
  const haystack = `${html.slice(0, 2_000_000)} ${headers.get('server') ?? ''} ${headers.get('x-powered-by') ?? ''}`.toLowerCase()
  if (/wp-content|wp-includes|wordpress/.test(haystack)) return 'wordpress'
  if (/cdn\.shopify\.com|shopify\.theme|shopify-section|shopify/.test(haystack)) return 'shopify'
  if (/webflow\.com|w-webflow|data-wf-page/.test(haystack)) return 'webflow'
  if (/static\.wixstatic\.com|wixstatic|_wix_/.test(haystack)) return 'wix'
  if (/squarespace\.com|static1\.squarespace\.com/.test(haystack)) return 'squarespace'
  if (/framer\.com|framerusercontent\.com|data-framer/.test(haystack)) return 'framer'
  if (/_next\/static|__next_data__/.test(haystack)) return 'nextjs'
  if (/<html|<!doctype html/.test(haystack)) return 'static'
  return 'unknown'
}

function capabilitiesFor(technology: string, mode: WebsiteConnectionMode): Capability[] {
  const deep = mode !== 'script'
  return [
    { id: 'capture', label: 'Captación de leads', detail: 'Formularios, chat, agente y eventos de conversión.', available: true, via: 'script universal' },
    { id: 'analytics', label: 'Analítica y tracking', detail: 'Visitas, fuentes, conversiones y experimentos.', available: true, via: 'script universal' },
    { id: 'content', label: 'Cambiar contenido', detail: 'Editar textos, bloques y páginas sin copiar la web.', available: deep || ['wordpress', 'shopify', 'webflow', 'wix'].includes(technology), via: deep ? 'conector de edición' : 'conector recomendado' },
    { id: 'seo', label: 'SEO técnico', detail: 'Metadatos, sitemap, indexación y estructura.', available: deep || technology === 'wordpress', via: deep ? 'conector de edición' : 'plugin WordPress' },
    { id: 'publish', label: 'Publicar cambios', detail: 'Vista previa, aprobación y rollback.', available: deep, via: deep ? 'canal de publicación' : 'requiere conectar un canal de escritura' },
  ]
}

function scriptInstall(siteKey: string) {
  const scriptUrl = process.env.VENDRAVA_WEB_CLIENT_URL?.trim() || 'https://cdn.vendrava.com/web-client.js'
  const eventUrl = process.env.VENDRAVA_WEB_EVENTS_URL?.trim()
    || `${process.env.PUBLIC_HOST?.trim() || 'https://api.vendrava.com'}/api/web-events/collect`
  return {
    scriptUrl,
    eventUrl,
    snippet: `<script defer src="${scriptUrl}" data-vendrava-site="${siteKey}" data-vendrava-endpoint="${eventUrl}"></script>`,
  }
}

function view(connection: any) {
  const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities : []
  return {
    id: connection.id,
    name: connection.name,
    websiteUrl: connection.websiteUrl,
    domain: connection.domain,
    technology: connection.technology,
    technologyLabel: connection.technologyLabel,
    status: connection.status,
    connectionMode: connection.connectionMode,
    recommendedMode: connection.recommendedMode,
    availableModes: AVAILABLE_MODES[connection.technology] ?? AVAILABLE_MODES.unknown,
    capabilities,
    detection: connection.detection,
    lastCheckedAt: connection.lastCheckedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    install: scriptInstall(connection.siteKey),
  }
}

export async function listWebsiteConnections(orgId: string) {
  const rows = await prisma.websiteConnection.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } })
  return rows.map(view)
}

export async function discoverWebsiteConnection(params: { orgId: string; website: string }) {
  const normalized = normalizeUrl(params.website)
  if (!normalized) throw new Error('WEB_CONNECTION_URL_REQUIRED')
  await assertAuditablePublicUrl(normalized)

  const result = await fetchHtml(normalized, 15_000)
  if (!result.html || result.status < 200 || result.status >= 400) throw new Error('WEB_CONNECTION_SITE_UNREACHABLE')

  const finalUrl = result.info.finalUrl || normalized
  const domain = domainOf(finalUrl)
  const technology = detectTechnology(result.html, new Headers())
  const recommendedMode = RECOMMENDED_MODES[technology] ?? 'script'
  const existing = await prisma.websiteConnection.findUnique({ where: { orgId_domain: { orgId: params.orgId, domain } } })
  const connection = await prisma.websiteConnection.upsert({
    where: { orgId_domain: { orgId: params.orgId, domain } },
    create: {
      orgId: params.orgId,
      name: domain,
      websiteUrl: finalUrl,
      domain,
      technology,
      technologyLabel: TECHNOLOGY_LABELS[technology] ?? TECHNOLOGY_LABELS.unknown,
      status: 'setup_required',
      connectionMode: recommendedMode,
      recommendedMode,
      siteKey: `wk_${randomBytes(18).toString('base64url')}`,
      capabilities: capabilitiesFor(technology, recommendedMode) as unknown as Prisma.InputJsonValue,
      detection: { httpStatus: result.status, isHttps: result.info.isHttps, loadMs: result.info.loadMs, finalUrl },
      lastCheckedAt: new Date(),
    },
    update: {
      websiteUrl: finalUrl,
      technology,
      technologyLabel: TECHNOLOGY_LABELS[technology] ?? TECHNOLOGY_LABELS.unknown,
      recommendedMode,
      capabilities: capabilitiesFor(technology, existing?.connectionMode as WebsiteConnectionMode || recommendedMode) as unknown as Prisma.InputJsonValue,
      detection: { httpStatus: result.status, isHttps: result.info.isHttps, loadMs: result.info.loadMs, finalUrl },
      lastCheckedAt: new Date(),
    },
  })
  return view(connection)
}

export async function updateWebsiteConnection(params: { orgId: string; id: string; mode?: WebsiteConnectionMode; status?: 'setup_required' | 'verification_pending' | 'connected' | 'degraded' | 'disconnected' }) {
  const current = await prisma.websiteConnection.findFirst({ where: { id: params.id, orgId: params.orgId } })
  if (!current) return null
  const mode = params.mode ?? current.connectionMode as WebsiteConnectionMode
  const updated = await prisma.websiteConnection.update({
    where: { id: current.id },
    data: {
      connectionMode: mode,
      status: params.status ?? current.status,
      capabilities: capabilitiesFor(current.technology, mode) as unknown as Prisma.InputJsonValue,
    },
  })
  return view(updated)
}

export function isWebsiteConnectionMode(value: unknown): value is WebsiteConnectionMode {
  return typeof value === 'string' && (WEBSITE_CONNECTION_MODES as readonly string[]).includes(value)
}

export async function recordWebsiteEvent(input: { siteKey: string; eventName: string; path?: string; referrer?: string; origin?: string }) {
  const connection = await prisma.websiteConnection.findUnique({ where: { siteKey: input.siteKey }, select: { id: true, domain: true } })
  if (!connection) return false
  if (input.origin) {
    try {
      if (domainOf(input.origin) !== connection.domain) return false
    } catch {
      return false
    }
  }
  await prisma.websiteEvent.create({
    data: {
      connectionId: connection.id,
      eventName: input.eventName.slice(0, 80),
      path: input.path?.slice(0, 1_000) || null,
      referrer: input.referrer?.slice(0, 1_000) || null,
    },
  })
  return true
}
