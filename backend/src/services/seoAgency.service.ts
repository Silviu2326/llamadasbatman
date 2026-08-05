/**
 * "Agencia SEO" bajo demanda: reutiliza la auditoría heurística de
 * digitalAudit.service (un fetch al HTML público) y añade la capa que haría
 * una agencia — checklist técnico priorizado, estudio de keywords, plan de
 * contenidos y SEO local — redactada por Claude. Sin CLAUDE_API_KEY degrada
 * a un plan determinista basado en plantillas por sector/ciudad.
 */
import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import tls from 'node:tls'
import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { auditBusiness, DigitalAuditResult } from './digitalAudit.service'
import { createKnowledgeBase, updateKnowledgeBase } from './knowledge.service'
import { querySearchAnalytics } from './organicGoogleIntegration.service'
import { ingestLead } from './leadIngestion.service'

export interface SeoReportInput {
  url: string
  business?: string
  sector?: string
  city?: string
}

export interface SeoChecklistItem {
  id: string
  label: string
  ok: boolean
  hint: string
}

const keywordSchema = z.object({
  keyword: z.string().min(2).max(80),
  intent: z.enum(['informacional', 'comercial', 'transaccional', 'local']),
  difficulty: z.enum(['baja', 'media', 'alta']),
  rationale: z.string().min(5).max(280),
})

const aiPlanSchema = z.object({
  summary: z.string().min(20).max(800),
  keywords: z.array(keywordSchema).min(5).max(20),
  contentPlan: z.array(z.object({
    title: z.string().min(5).max(160),
    keyword: z.string().min(2).max(80),
    format: z.string().min(3).max(60),
  })).min(3).max(10),
  technicalFixes: z.array(z.object({
    title: z.string().min(5).max(140),
    severity: z.enum(['alta', 'media', 'baja']),
    howTo: z.string().min(10).max(320),
  })).max(10),
  localSeo: z.array(z.string().min(5).max(220)).max(8),
})

export type SeoAiPlan = z.infer<typeof aiPlanSchema>

export interface SeoReport extends SeoAiPlan {
  url: string
  webAlive: boolean
  score: number
  checklist: SeoChecklistItem[]
  site?: SiteCrawl | null
  webVitals?: WebVitals | null
  provider: 'claude' | 'fallback'
  model: string
  generatedAt: string
}

let anthropicClient: Anthropic | null = null

function getAnthropicClient() {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) return null
  if (!anthropicClient) {
    const timeoutSeconds = Number(process.env.CLAUDE_TIMEOUT_SECONDS ?? 30)
    anthropicClient = new Anthropic({ apiKey, timeout: timeoutSeconds * 1000 })
  }
  return anthropicClient
}

export function buildChecklist(audit: DigitalAuditResult): SeoChecklistItem[] {
  const seo = audit.seo
  const info = audit.webInfo
  if (!audit.webAlive || !seo) return []
  const loadMs = info?.loadMs ?? null
  return [
    { id: 'https', label: 'HTTPS activo', ok: !!info?.isHttps, hint: 'Migra a HTTPS: Google penaliza las webs sin certificado y el navegador marca la web como no segura.' },
    { id: 'speed', label: `Velocidad de carga${loadMs != null ? ` (${loadMs} ms)` : ''}`, ok: loadMs != null && loadMs < 2500, hint: 'Optimiza imágenes, activa caché/CDN y lazy loading para bajar de 2,5 s.' },
    { id: 'title', label: 'Title optimizado (15–70 caracteres)', ok: !!seo.title && seo.titleLen >= 15 && seo.titleLen <= 70, hint: 'El title es el factor on-page más importante: incluye la keyword principal y la marca.' },
    { id: 'metaDescription', label: 'Meta description (50–170 caracteres)', ok: !!seo.metaDescription && seo.metaDescriptionLen >= 50 && seo.metaDescriptionLen <= 170, hint: 'No posiciona directamente pero decide el CTR en Google: redacta una promesa clara con llamada a la acción.' },
    { id: 'viewport', label: 'Diseño móvil (meta viewport)', ok: seo.hasViewport, hint: 'Google indexa primero la versión móvil: sin viewport la web se considera no responsive.' },
    { id: 'canonical', label: 'URL canónica', ok: seo.hasCanonical, hint: 'Evita contenido duplicado indicando a Google la URL preferida de cada página.' },
    { id: 'schema', label: 'Datos estructurados (Schema.org)', ok: seo.hasSchemaJsonld, hint: 'El marcado JSON-LD habilita rich snippets (estrellas, FAQ, negocio local) y mejora el CTR.' },
    { id: 'ogImage', label: 'Imagen Open Graph', ok: seo.hasOgImage, hint: 'Controla cómo se ve la web al compartirla en redes y WhatsApp.' },
    { id: 'analytics', label: 'Analytics instalado', ok: seo.hasAnalytics, hint: 'Sin medición no hay SEO: instala GA4 y Google Search Console para saber qué keywords traen tráfico.' },
  ]
}

export function scoreFromChecklist(checklist: SeoChecklistItem[]): number {
  if (!checklist.length) return 0
  return Math.round((checklist.filter((c) => c.ok).length / checklist.length) * 100)
}

function hostnameOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function buildFallbackPlan(input: SeoReportInput, checklist: SeoChecklistItem[]): SeoAiPlan {
  const negocio = input.business?.trim() || input.sector?.trim() || hostnameOf(input.url)
  const sector = input.sector?.trim() || negocio
  const city = input.city?.trim()
  const local = (suffix: string) => (city ? `${suffix} en ${city}` : suffix)

  const keywords: SeoAiPlan['keywords'] = [
    { keyword: local(sector), intent: 'comercial', difficulty: 'media', rationale: 'Keyword principal del negocio: es la búsqueda más directa de un cliente que ya sabe qué necesita.' },
    { keyword: local(`mejor ${sector}`), intent: 'comercial', difficulty: 'media', rationale: 'Búsqueda de comparación con alta intención de compra.' },
    { keyword: `${sector} precio`, intent: 'transaccional', difficulty: 'baja', rationale: 'Quien busca precio está en la fase final de decisión.' },
    { keyword: `${sector} opiniones`, intent: 'comercial', difficulty: 'baja', rationale: 'Valida la reputación: una página propia de reseñas captura esta búsqueda.' },
    { keyword: `cómo elegir ${sector}`, intent: 'informacional', difficulty: 'baja', rationale: 'Contenido educativo que capta al cliente antes que la competencia.' },
    { keyword: `qué hace un ${sector}`, intent: 'informacional', difficulty: 'baja', rationale: 'Atrae tráfico de descubrimiento en la parte alta del embudo.' },
  ]
  if (city) {
    keywords.push({ keyword: `${sector} cerca de mí`, intent: 'local', difficulty: 'media', rationale: 'Búsqueda móvil dominante en negocios locales: la ficha de Google Business decide quién aparece.' })
  }

  return {
    summary: `Plan SEO inicial para ${negocio}: la web pasa ${checklist.filter((c) => c.ok).length} de ${checklist.length || 9} comprobaciones técnicas. Prioriza corregir los puntos técnicos marcados en rojo, publica contenido para las keywords propuestas y trabaja la presencia local en Google Business. Este plan es determinista; con la IA activada obtendrás keywords y contenidos adaptados a tu negocio concreto.`,
    keywords,
    contentPlan: [
      { title: `Guía completa: cómo elegir ${sector}${city ? ` en ${city}` : ''}`, keyword: `cómo elegir ${sector}`, format: 'Guía / artículo largo' },
      { title: `Precios de ${sector}: qué incluye y qué evitar`, keyword: `${sector} precio`, format: 'Artículo comparativo' },
      { title: `Preguntas frecuentes sobre ${sector}`, keyword: `qué hace un ${sector}`, format: 'Página FAQ con Schema' },
    ],
    technicalFixes: checklist
      .filter((c) => !c.ok)
      .slice(0, 6)
      .map((c) => ({ title: c.label, severity: 'media' as const, howTo: c.hint })),
    localSeo: [
      'Da de alta y completa la ficha de Google Business Profile: categoría, horarios, fotos y zona de servicio.',
      'Pide reseñas a cada cliente satisfecho con un enlace directo tras el servicio.',
      city ? `Incluye "${city}" en el title, la H1 y la página de contacto para las búsquedas locales.` : 'Incluye tu ciudad o zona de servicio en el title y la H1.',
      'Consigue menciones en directorios locales relevantes con el mismo nombre, dirección y teléfono (NAP).',
    ],
  }
}

function parseJsonObject(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('La respuesta IA no contiene JSON válido')
  return JSON.parse(text.slice(start, end + 1)) as unknown
}

async function enhanceWithClaude(
  input: SeoReportInput,
  audit: DigitalAuditResult,
  checklist: SeoChecklistItem[],
  fallback: SeoAiPlan
): Promise<{ plan: SeoAiPlan; provider: 'claude' | 'fallback'; model: string }> {
  const client = getAnthropicClient()
  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'
  if (!client) return { plan: fallback, provider: 'fallback', model: 'deterministic-v1' }

  const failed = checklist.filter((c) => !c.ok).map((c) => c.label)
  const prompt = `
Eres el consultor SEO senior de Vendrava. Devuelve únicamente JSON válido, sin markdown.
Elabora el plan SEO de una agencia completa para este negocio:
- web: ${input.url}
- negocio: ${input.business?.trim() || 'no indicado'}
- sector: ${input.sector?.trim() || 'no indicado'}
- ciudad: ${input.city?.trim() || 'no indicada'}
- title actual: ${audit.seo?.title ?? 'ausente'}
- meta description actual: ${audit.seo?.metaDescription ?? 'ausente'}
- comprobaciones técnicas fallidas: ${failed.length ? failed.join('; ') : 'ninguna'}

Devuelve exactamente esta estructura (todo en español):
{
  "summary": "diagnóstico ejecutivo de 2-4 frases con las 2 prioridades principales",
  "keywords": [8-14 objetos {"keyword":"...","intent":"informacional|comercial|transaccional|local","difficulty":"baja|media|alta","rationale":"por qué esta keyword"}],
  "contentPlan": [4-8 objetos {"title":"título del contenido","keyword":"keyword objetivo","format":"Guía|Artículo|Página de servicio|FAQ|Caso de éxito"}],
  "technicalFixes": [hasta 8 objetos {"title":"...","severity":"alta|media|baja","howTo":"cómo arreglarlo en 1-2 frases"}],
  "localSeo": [3-6 acciones concretas de SEO local como strings]
}
Las keywords deben ser realistas para un negocio pequeño (long-tail incluida), sin volúmenes inventados. No prometas posiciones ni plazos garantizados.
`

  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    system: 'Responde en español y valida mentalmente que el JSON cumple la estructura pedida.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content.find((block) => block.type === 'text')?.text ?? ''
  const plan = aiPlanSchema.parse(parseJsonObject(text))
  return { plan, provider: 'claude', model }
}

// ---------------------------------------------------------------------------
// Guardia anti-SSRF para URLs que llegan de visitantes anónimos: el motor de
// auditoría hace fetch de lo que le pidan, así que el endpoint público debe
// rechazar hosts que resuelvan a rangos privados o loopback.
// ---------------------------------------------------------------------------

export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  const parts = v4.split('.')
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

export class UnsafeUrlError extends Error {
  code = 'UNSAFE_URL'
  constructor() {
    super('La URL indicada no es una web pública auditable.')
  }
}

export async function assertPublicUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    throw new UnsafeUrlError()
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new UnsafeUrlError()
  const host = parsed.hostname
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new UnsafeUrlError()
  try {
    const addresses = await lookup(host, { all: true })
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new UnsafeUrlError()
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error
    throw new UnsafeUrlError() // no resuelve → tampoco es auditable
  }
}

/**
 * Días restantes del certificado TLS, o null si no aplica / no se pudo medir.
 * Un handshake ligero — no descarga la página.
 */
export function checkSslDaysRemaining(url: string, timeoutMs = 5000): Promise<number | null> {
  let host: string
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
  } catch {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      if (!cert || !cert.valid_to) return resolve(null)
      const expires = Date.parse(cert.valid_to)
      resolve(Number.isFinite(expires) ? Math.floor((expires - Date.now()) / 86_400_000) : null)
    })
    socket.on('error', () => resolve(null))
    socket.on('timeout', () => { socket.destroy(); resolve(null) })
  })
}

// ---------------------------------------------------------------------------
// Crawl del sitio: robots.txt + sitemap.xml + auditoría on-page de las URLs
// principales. Convierte la auditoría de "portada" en "sitio".
// ---------------------------------------------------------------------------

export interface CrawledPage {
  url: string
  title: string | null
  hasMetaDescription: boolean
  hasH1: boolean
  imgsWithoutAlt: number
}

export interface SiteCrawl {
  robotsFound: boolean
  robotsBlocksAll: boolean
  sitemapFound: boolean
  sitemapUrlCount: number
  pagesAudited: number
  duplicateTitles: string[]
  missingTitle: number
  missingMeta: number
  missingH1: number
  imgsWithoutAlt: number
  pages: CrawledPage[]
}

const MAX_CRAWL_PAGES = 12

export function extractSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map((m) => m[1].trim())
    .filter((u) => /^https?:\/\//i.test(u))
}

/** Análisis puro de páginas rastreadas — separado para poder testearlo. */
export function analyzeCrawledPages(pages: CrawledPage[]): Pick<SiteCrawl, 'duplicateTitles' | 'missingTitle' | 'missingMeta' | 'missingH1' | 'imgsWithoutAlt'> {
  const titleCounts = new Map<string, number>()
  for (const page of pages) {
    if (page.title) titleCounts.set(page.title, (titleCounts.get(page.title) ?? 0) + 1)
  }
  return {
    duplicateTitles: [...titleCounts.entries()].filter(([, n]) => n > 1).map(([t]) => t).slice(0, 5),
    missingTitle: pages.filter((p) => !p.title).length,
    missingMeta: pages.filter((p) => !p.hasMetaDescription).length,
    missingH1: pages.filter((p) => !p.hasH1).length,
    imgsWithoutAlt: pages.reduce((sum, p) => sum + p.imgsWithoutAlt, 0),
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function auditPageHtml(url: string, html: string): CrawledPage {
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  return {
    url,
    title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null,
    hasMetaDescription: /<meta\s+name=["']description["']/i.test(html),
    hasH1: /<h1[\s>]/i.test(html),
    imgsWithoutAlt: imgs.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length,
  }
}

export async function crawlSite(url: string): Promise<SiteCrawl> {
  const base = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  const origin = base.origin

  const robots = await fetchText(`${origin}/robots.txt`)
  const robotsBlocksAll = !!robots && /User-agent:\s*\*\s*[\r\n]+\s*Disallow:\s*\/\s*$/im.test(robots)
  const sitemapFromRobots = robots?.match(/Sitemap:\s*(\S+)/i)?.[1] ?? null

  const sitemapXml = await fetchText(sitemapFromRobots ?? `${origin}/sitemap.xml`)
  let locs = sitemapXml ? extractSitemapLocs(sitemapXml) : []
  // Índice de sitemaps: un nivel de indirección basta para el 99% de las webs.
  if (locs.length && sitemapXml && /<sitemapindex/i.test(sitemapXml)) {
    const first = await fetchText(locs[0])
    locs = first ? extractSitemapLocs(first) : []
  }
  const sameHost = locs.filter((u) => { try { return new URL(u).hostname === base.hostname } catch { return false } })
  const targets = [...new Set([base.href, ...sameHost])].slice(0, MAX_CRAWL_PAGES)

  const pages: CrawledPage[] = []
  // Concurrencia 4: suficiente para 12 páginas sin castigar la web auditada.
  for (let i = 0; i < targets.length; i += 4) {
    const batch = await Promise.all(targets.slice(i, i + 4).map(async (target) => {
      const html = await fetchText(target)
      return html && html.length > 200 ? auditPageHtml(target, html) : null
    }))
    pages.push(...batch.filter((p): p is CrawledPage => !!p))
  }

  return {
    robotsFound: robots != null,
    robotsBlocksAll,
    sitemapFound: !!sitemapXml && locs.length > 0,
    sitemapUrlCount: sameHost.length,
    pagesAudited: pages.length,
    ...analyzeCrawledPages(pages),
    pages,
  }
}

// ---------------------------------------------------------------------------
// Core Web Vitals reales vía PageSpeed Insights (API gratuita de Google).
// Datos de campo (CrUX) cuando existen; si la web tiene poco tráfico Google
// no publica métricas de campo y devolvemos null.
// ---------------------------------------------------------------------------

export interface WebVitals {
  lcpMs: number | null
  cls: number | null
  inpMs: number | null
  category: string | null
}

export async function fetchCoreWebVitals(url: string): Promise<WebVitals | null> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  api.searchParams.set('url', target)
  api.searchParams.set('strategy', 'mobile')
  if (process.env.PSI_API_KEY) api.searchParams.set('key', process.env.PSI_API_KEY)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 35_000)
    const res = await fetch(api, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json() as Record<string, any>
    const metrics = data.loadingExperience?.metrics
    if (!metrics) return null
    return {
      lcpMs: metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
      cls: metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null
        ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
        : null,
      inpMs: metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
      category: data.loadingExperience?.overall_category ?? null,
    }
  } catch {
    return null
  }
}

export async function generateSeoReport(input: SeoReportInput, opts: { skipAi?: boolean } = {}): Promise<SeoReport> {
  const audit = await auditBusiness({
    name: hostnameOf(input.url),
    website: input.url,
    sector: input.sector ?? null,
    city: input.city ?? null,
  })

  const checklist = buildChecklist(audit)
  let site: SiteCrawl | null = null
  let webVitals: WebVitals | null = null
  if (checklist.length) {
    // SSL, crawl del sitio y Core Web Vitals en paralelo: el crawl y PSI son
    // los pasos lentos y no dependen entre sí.
    const [sslDays, crawled, vitals] = await Promise.all([
      checkSslDaysRemaining(input.url),
      crawlSite(input.url).catch(() => null),
      fetchCoreWebVitals(input.url),
    ])
    site = crawled
    webVitals = vitals
    if (sslDays != null) {
      checklist.push({
        id: 'ssl',
        label: `Certificado SSL vigente (${sslDays} días restantes)`,
        ok: sslDays > 14,
        hint: 'El certificado caduca pronto: renuévalo antes de que el navegador bloquee la web con un aviso de seguridad.',
      })
    }
    if (site) {
      checklist.push({
        id: 'robots',
        label: site.robotsBlocksAll ? 'robots.txt bloquea TODO el sitio' : 'robots.txt presente',
        ok: site.robotsFound && !site.robotsBlocksAll,
        hint: site.robotsBlocksAll
          ? 'Tu robots.txt tiene "Disallow: /" para todos los bots: Google no puede indexar nada. Corrígelo ya.'
          : 'Publica un robots.txt básico que apunte a tu sitemap.',
      })
      checklist.push({
        id: 'sitemap',
        label: site.sitemapFound ? `Sitemap.xml con ${site.sitemapUrlCount} URLs` : 'Sitemap.xml',
        ok: site.sitemapFound,
        hint: 'Sin sitemap Google descubre tus páginas más lento. Genera uno y decláralo en Search Console.',
      })
    }
    if (webVitals?.category) {
      checklist.push({
        id: 'cwv',
        label: `Core Web Vitals (${webVitals.category}${webVitals.lcpMs != null ? ` · LCP ${(webVitals.lcpMs / 1000).toFixed(1)}s` : ''})`,
        ok: webVitals.category !== 'SLOW',
        hint: 'Datos reales de usuarios de Google (CrUX): optimiza LCP/CLS/INP — afectan directamente al ranking.',
      })
    }
  }
  const fallback = buildFallbackPlan(input, checklist)

  let plan = fallback
  let provider: 'claude' | 'fallback' = 'fallback'
  let model = 'deterministic-v1'
  if (!opts.skipAi) {
    try {
      const enhanced = await enhanceWithClaude(input, audit, checklist, fallback)
      plan = enhanced.plan
      provider = enhanced.provider
      model = enhanced.model
    } catch (error) {
      console.warn('[SeoAgency] Claude no disponible; usando plan determinista:', (error as Error).message)
    }
  }

  return {
    ...plan,
    url: input.url,
    webAlive: audit.webAlive,
    score: scoreFromChecklist(checklist),
    checklist,
    site,
    webVitals,
    provider,
    model,
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Historial (SeoReport en BD): cada análisis se guarda; el refresco semanal
// del worker guarda con auto=true para poder distinguirlo en la gráfica.
// ---------------------------------------------------------------------------

export async function saveReport(orgId: string, report: SeoReport, auto = false) {
  return prisma.seoReport.create({
    data: {
      orgId,
      url: report.url,
      score: report.score,
      auto,
      report: report as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, createdAt: true },
  })
}

/**
 * Último informe completo de la organización.
 *
 * La pantalla guardaba el informe en `localStorage` del navegador, así que el
 * mismo negocio veía cosas distintas en dos ordenadores y el trabajo se perdía
 * al limpiar el almacenamiento. El informe ya se persistía en `SeoReport` desde
 * el primer día: solo faltaba una forma de leerlo (`organico.md` §7.3).
 */
export async function latestReport(orgId: string, url?: string): Promise<SeoReport | null> {
  const row = await prisma.seoReport.findFirst({
    where: { orgId, ...(url ? { url } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, report: true, createdAt: true },
  })
  if (!row?.report) return null
  return row.report as unknown as SeoReport
}

/** Un informe concreto del historial, para poder volver a uno anterior. */
export async function reportById(orgId: string, id: string): Promise<SeoReport | null> {
  const row = await prisma.seoReport.findFirst({
    where: { id, orgId },
    select: { report: true },
  })
  if (!row?.report) return null
  return row.report as unknown as SeoReport
}

export async function listHistory(orgId: string, url?: string) {
  const items = await prisma.seoReport.findMany({
    where: { orgId, ...(url ? { url } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true, url: true, score: true, auto: true, createdAt: true },
  })
  return items.reverse()
}

// ---------------------------------------------------------------------------
// Competidores: misma auditoría heurística sobre webs rivales, solo lectura.
// ---------------------------------------------------------------------------

export interface CompetitorResult {
  url: string
  webAlive: boolean
  score: number
  passed: number
  total: number
  failedLabels: string[]
}

export async function compareCompetitors(urls: string[]): Promise<CompetitorResult[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 3)
  return Promise.all(unique.map(async (url) => {
    const audit = await auditBusiness({ name: hostnameOf(url), website: url })
    const checklist = buildChecklist(audit)
    return {
      url,
      webAlive: audit.webAlive,
      score: scoreFromChecklist(checklist),
      passed: checklist.filter((c) => c.ok).length,
      total: checklist.length,
      failedLabels: checklist.filter((c) => !c.ok).map((c) => c.label).slice(0, 4),
    }
  }))
}

// ---------------------------------------------------------------------------
// Search Console: cruce de las keywords del informe con las búsquedas reales
// ya sincronizadas en /organic (OrganicOpportunity, source=search_console).
// No lanza sync — leer es gratis; sincronizar se hace desde Captación orgánica.
// ---------------------------------------------------------------------------

interface SearchConsoleRow {
  query: string
  clicks: number
  impressions: number
  position: number | null
}

function rowFromOpportunity(metadata: Prisma.JsonValue, query: string): SearchConsoleRow {
  const meta = (metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    query,
    clicks: num(meta.clicks) ?? 0,
    impressions: num(meta.impressions) ?? 0,
    position: num(meta.position),
  }
}

export async function searchConsolePerformance(orgId: string, keywords: string[]) {
  const integration = await prisma.organicIntegration.findFirst({
    where: { orgId, provider: 'search_console', status: 'connected' },
    select: { id: true, lastSyncedAt: true },
  })
  const opportunities = await prisma.organicOpportunity.findMany({
    where: { orgId, source: 'search_console' },
    select: { query: true, metadata: true },
    take: 5000,
  })
  const rows = opportunities
    .filter((o) => o.query)
    .map((o) => rowFromOpportunity(o.metadata, o.query as string))

  const normalized = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
  const matched = normalized.map((keyword) => ({
    keyword,
    rows: rows
      .filter((r) => r.query.toLowerCase().includes(keyword) || keyword.includes(r.query.toLowerCase()))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 3),
  }))
  const topQueries = [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 10)

  return {
    connected: !!integration,
    lastSyncedAt: integration?.lastSyncedAt ?? null,
    totalQueries: rows.length,
    matched,
    topQueries,
  }
}

// ---------------------------------------------------------------------------
// Redacción de contenidos: convierte un item del plan en un artículo SEO
// completo y lo guarda en la Knowledge Base. Requiere IA — un artículo de
// plantilla no aporta nada, así que sin API key se devuelve error accionable.
// ---------------------------------------------------------------------------

export class SeoAiUnavailable extends Error {
  code = 'SEO_AI_NOT_CONFIGURED'
  constructor() {
    super('La redacción de contenidos necesita la IA configurada (CLAUDE_API_KEY).')
  }
}

export interface SeoArticleInput {
  title: string
  keyword: string
  format?: string
  business?: string
  sector?: string
  city?: string
}

export async function generateSeoArticle(orgId: string, input: SeoArticleInput) {
  const client = getAnthropicClient()
  if (!client) throw new SeoAiUnavailable()
  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

  // Enlazado interno: la IA conoce los artículos ya publicados y sugiere
  // cómo enlazarlos entre sí — el interlinking es de lo que más posiciona.
  const existing = await prisma.knowledgeBase.findMany({
    where: { orgId, type: 'seo-article', isActive: true },
    select: { name: true },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })

  const prompt = `
Eres el redactor SEO senior de Vendrava. Escribe un artículo completo en español, en Markdown.
- Título: ${input.title}
- Keyword principal: ${input.keyword}
- Formato: ${input.format || 'Artículo'}
- Negocio: ${input.business || 'no indicado'}
- Sector: ${input.sector || 'no indicado'}
- Ciudad: ${input.city || 'no indicada'}
${existing.length ? `- Otros artículos ya publicados del mismo negocio: ${existing.map((a) => `"${a.name}"`).join(', ')}` : ''}

Requisitos:
- 700-1100 palabras, estructura H2/H3, párrafos cortos.
- La keyword principal en el primer párrafo, en al menos un H2 y de forma natural (sin keyword stuffing).
- Cierra con una llamada a la acción hacia el negocio.
${existing.length ? '- Termina con una sección "## Enlaces internos sugeridos" que liste a qué artículos ya publicados enlazar desde este texto y con qué anchor text.' : ''}
- Empieza con una línea "META: <meta description de 120-155 caracteres>" y después el artículo.
- No inventes datos, estadísticas con fuente ni testimonios.
`

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: 'Responde solo con la línea META y el artículo en Markdown, sin comentarios adicionales.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content.find((block) => block.type === 'text')?.text?.trim() ?? ''
  if (text.length < 300) throw new Error('La IA devolvió un artículo demasiado corto')

  const metaMatch = text.match(/^META:\s*(.+)$/m)
  const metaDescription = metaMatch?.[1]?.trim() ?? null
  const content = text.replace(/^META:.*$/m, '').trim()

  const article = await createKnowledgeBase(orgId, {
    name: input.title,
    type: 'seo-article',
    content,
  })
  return { articleId: article.id, name: article.name, metaDescription, model }
}

// ---------------------------------------------------------------------------
// SEO on-page aplicado a landings propias: guarda title/meta en adAssets.seo;
// la landing pública los aplica al <head> al renderizar.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Proyectos SEO: contexto persistente por web vigilada. Multi-proyecto para
// agencias; el refresco diario itera sobre esto (con sector/ciudad) en vez
// de adivinar desde el último informe.
// ---------------------------------------------------------------------------

export async function upsertProject(orgId: string, input: SeoReportInput & { competitors?: string[] }) {
  const data = {
    business: input.business?.trim() || null,
    sector: input.sector?.trim() || null,
    city: input.city?.trim() || null,
    ...(input.competitors ? { competitors: input.competitors.map((c) => c.trim()).filter(Boolean).slice(0, 3) } : {}),
  }
  return prisma.seoProject.upsert({
    where: { orgId_url: { orgId, url: input.url } },
    create: { orgId, url: input.url, ...data },
    update: data,
  })
}

export async function listProjects(orgId: string) {
  return prisma.seoProject.findMany({
    where: { orgId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, url: true, business: true, sector: true, city: true, competitors: true, updatedAt: true },
  })
}

export async function allProjects() {
  return prisma.seoProject.findMany({
    select: { orgId: true, url: true, business: true, sector: true, city: true, competitors: true },
  })
}

// ---------------------------------------------------------------------------
// Blog público: publica un artículo de la Knowledge Base en la landing de la
// organización (/l/:slug/blog/:articleSlug). Sin publicar, el contenido no
// posiciona — esto cierra el ciclo plan → artículo → web indexable.
// ---------------------------------------------------------------------------

export function slugifyTitle(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'articulo'
}

export async function publishArticle(orgId: string, articleId: string) {
  const article = await prisma.knowledgeBase.findFirst({
    where: { id: articleId, orgId, type: 'seo-article', isActive: true },
    select: { id: true, name: true, slug: true },
  })
  if (!article) return null
  let slug = article.slug ?? slugifyTitle(article.name)
  if (!article.slug) {
    const clash = await prisma.knowledgeBase.findFirst({ where: { orgId, slug }, select: { id: true } })
    if (clash) slug = `${slug}-${randomBytes(3).toString('hex')}`
  }
  await prisma.knowledgeBase.update({
    where: { id: article.id },
    data: { slug, publishedAt: new Date() },
  })
  return { articleId: article.id, slug }
}

async function orgIdFromLandingSlug(landingSlug: string): Promise<string | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug, status: 'active' },
    select: { orgId: true },
  })
  return campaign?.orgId ?? null
}

export async function listPublishedArticles(landingSlug: string) {
  const orgId = await orgIdFromLandingSlug(landingSlug)
  if (!orgId) return null
  return prisma.knowledgeBase.findMany({
    where: { orgId, type: 'seo-article', isActive: true, publishedAt: { not: null } },
    select: { name: true, slug: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  })
}

export async function getPublishedArticle(landingSlug: string, articleSlug: string) {
  const orgId = await orgIdFromLandingSlug(landingSlug)
  if (!orgId) return null
  return prisma.knowledgeBase.findFirst({
    where: { orgId, slug: articleSlug, type: 'seo-article', isActive: true, publishedAt: { not: null } },
    select: { name: true, content: true, publishedAt: true, updatedAt: true },
  })
}

// ---------------------------------------------------------------------------
// Rank tracking: foto semanal de la posición real de cada keyword del plan
// (Search Console, últimos 7 días). Una serie por keyword para pintar la
// evolución "publicamos → subió".
// ---------------------------------------------------------------------------

export async function captureKeywordRanks(orgId: string, url: string) {
  const last = await prisma.seoKeywordRank.findFirst({
    where: { orgId, url },
    orderBy: { capturedAt: 'desc' },
    select: { capturedAt: true },
  })
  if (last && Date.now() - last.capturedAt.getTime() < 6 * 86_400_000) return 0

  const manual = await prisma.seoReport.findFirst({
    where: { orgId, url, auto: false },
    orderBy: { createdAt: 'desc' },
    select: { report: true },
  })
  const keywords = ((manual?.report as unknown as SeoReport | undefined)?.keywords ?? []).map((k) => k.keyword).slice(0, 20)
  if (!keywords.length) return 0

  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  let rows: Awaited<ReturnType<typeof querySearchAnalytics>>
  try {
    rows = await querySearchAnalytics(orgId, {
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ['query'],
      rowLimit: 5000,
    })
  } catch {
    return 0 // Search Console sin conectar: no hay serie que capturar.
  }

  const capturedAt = new Date()
  let stored = 0
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase()
    const match = rows.find((r) => r.keys[0]?.toLowerCase() === lower)
      ?? rows.filter((r) => r.keys[0]?.toLowerCase().includes(lower)).sort((a, b) => b.clicks - a.clicks)[0]
      ?? null
    await prisma.seoKeywordRank.create({
      data: {
        orgId,
        url,
        keyword,
        position: match?.position ?? null,
        clicks: match?.clicks ?? 0,
        impressions: match?.impressions ?? 0,
        capturedAt,
      },
    })
    stored += 1
  }
  return stored
}

export async function rankHistory(orgId: string, url: string) {
  const rows = await prisma.seoKeywordRank.findMany({
    where: { orgId, url },
    orderBy: { capturedAt: 'asc' },
    take: 500,
    select: { keyword: true, position: true, clicks: true, capturedAt: true },
  })
  const byKeyword = new Map<string, Array<{ position: number | null; clicks: number; capturedAt: Date }>>()
  for (const row of rows) {
    const list = byKeyword.get(row.keyword) ?? []
    list.push({ position: row.position, clicks: row.clicks, capturedAt: row.capturedAt })
    byKeyword.set(row.keyword, list)
  }
  return [...byKeyword.entries()].map(([keyword, points]) => ({ keyword, points: points.slice(-12) }))
}

// ---------------------------------------------------------------------------
// Informe compartible: enlace público de solo lectura con token opaco.
// ---------------------------------------------------------------------------

export async function createShareToken(orgId: string, reportId: string) {
  const existing = await prisma.seoReport.findFirst({
    where: { id: reportId, orgId },
    select: { id: true, shareToken: true },
  })
  if (!existing) return null
  if (existing.shareToken) return existing.shareToken
  const token = randomBytes(24).toString('hex')
  await prisma.seoReport.update({ where: { id: existing.id }, data: { shareToken: token } })
  return token
}

export async function getSharedReport(token: string) {
  if (!token || token.length > 64) return null
  const row = await prisma.seoReport.findUnique({
    where: { shareToken: token },
    select: { url: true, score: true, createdAt: true, report: true },
  })
  if (!row) return null
  return { ...(row.report as unknown as SeoReport), createdAt: row.createdAt }
}

// ---------------------------------------------------------------------------
// Imán de leads: auditoría pública ligada a la landing de una campaña. El
// visitante deja su web y su contacto → entra como lead con el informe
// guardado y el comercial llama con la auditoría delante. Sin IA (skipAi):
// un endpoint público no puede gastar LLM por visita.
// ---------------------------------------------------------------------------

export async function publicAuditForCampaign(slug: string, input: {
  url: string
  name: string
  email?: string
  phone?: string
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { landingSlug: slug, status: 'active' },
    select: { id: true, orgId: true },
  })
  if (!campaign) return null

  // La URL viene de un visitante anónimo: nunca auditar hosts privados.
  await assertPublicUrl(input.url)

  const report = await generateSeoReport({ url: input.url }, { skipAi: true })
  const saved = await saveReport(campaign.orgId, report).catch(() => null)

  await ingestLead(campaign.orgId, {
    name: input.name,
    email: input.email || undefined,
    phone: input.phone || undefined,
    campaignId: campaign.id,
    source: 'seo_audit',
    externalLeadId: `seo-audit:${campaign.id}:${(input.email || input.phone || input.name).toLowerCase()}`,
    customFields: {
      website: input.url,
      seoScore: report.score,
      seoReportId: saved?.id ?? null,
      seoSummary: report.summary,
    },
  }).catch((error) => {
    console.warn('[SeoAudit] no se pudo crear el lead:', (error as Error).message)
  })

  return report
}

// ---------------------------------------------------------------------------
// Keyword gap: qué atacan los competidores (title/meta/H1-H3 de sus webs)
// que tu plan no cubre. Requiere IA para el análisis semántico.
// ---------------------------------------------------------------------------

interface CompetitorSignals {
  url: string
  title: string | null
  metaDescription: string | null
  headings: string[]
}

const HEADING_RE = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi
const TAG_RE = /<[^>]+>/g

async function fetchCompetitorSignals(url: string): Promise<CompetitorSignals> {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const empty: CompetitorSignals = { url, title: null, metaDescription: null, headings: [] }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(normalized, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    clearTimeout(timer)
    if (!res.ok) return empty
    const html = await res.text()
    const headings = [...html.matchAll(HEADING_RE)]
      .map((m) => m[1].replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim())
      .filter((h) => h.length > 2 && h.length < 120)
      .slice(0, 15)
    return {
      url,
      title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null,
      metaDescription: html.match(/<meta\s+name=["']description["']\s+content=["']([^"']{1,300})/i)?.[1]?.trim() ?? null,
      headings,
    }
  } catch {
    return empty
  }
}

const keywordGapSchema = z.object({
  gaps: z.array(z.object({
    keyword: z.string().min(2).max(90),
    competitor: z.string().min(2).max(120),
    rationale: z.string().min(5).max(280),
  })).max(15),
})

export async function keywordGap(ownKeywords: string[], competitorUrls: string[]) {
  const client = getAnthropicClient()
  if (!client) throw new SeoAiUnavailable()
  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

  const signals = await Promise.all(
    [...new Set(competitorUrls.map((u) => u.trim()).filter(Boolean))].slice(0, 3).map(fetchCompetitorSignals)
  )
  const usable = signals.filter((s) => s.title || s.headings.length)
  if (!usable.length) return { gaps: [] }

  const prompt = `
Eres el consultor SEO de Vendrava. Devuelve únicamente JSON válido, sin markdown.
Keywords que ya cubre el cliente: ${ownKeywords.join('; ') || 'ninguna'}

Señales on-page de sus competidores:
${usable.map((s) => `- ${s.url}\n  title: ${s.title ?? '—'}\n  meta: ${s.metaDescription ?? '—'}\n  encabezados: ${s.headings.join(' | ')}`).join('\n')}

Identifica hasta 12 keywords o temas que los competidores atacan y el cliente NO cubre.
Devuelve exactamente: {"gaps":[{"keyword":"...","competitor":"dominio del competidor","rationale":"por qué es una oportunidad"}]}
Solo keywords realistas deducibles de las señales — no inventes datos de volumen.
`
  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: 'Responde en español con el JSON pedido.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content.find((block) => block.type === 'text')?.text ?? ''
  return keywordGapSchema.parse(parseJsonObject(text))
}

// ---------------------------------------------------------------------------
// Canibalización: misma búsqueda posicionando con varias páginas a la vez.
// Consulta viva a Search Console (query+page), sin persistir.
// ---------------------------------------------------------------------------

export interface CannibalizationRow {
  query: string
  totalClicks: number
  pages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>
}

/** Agrupación pura, separada para poder testearla sin Search Console. */
export function groupCannibalization(
  rows: Array<{ keys: string[]; clicks: number; impressions: number; position: number | null }>
): CannibalizationRow[] {
  const byQuery = new Map<string, CannibalizationRow>()
  for (const row of rows) {
    const [query, page] = row.keys
    if (!query || !page || row.impressions <= 0) continue
    const entry = byQuery.get(query) ?? { query, totalClicks: 0, pages: [] }
    entry.pages.push({ page, clicks: row.clicks, impressions: row.impressions, position: row.position })
    entry.totalClicks += row.clicks
    byQuery.set(query, entry)
  }
  return [...byQuery.values()]
    .filter((entry) => entry.pages.length >= 2)
    .sort((a, b) => b.totalClicks - a.totalClicks)
    .slice(0, 15)
    .map((entry) => ({
      ...entry,
      pages: entry.pages.sort((a, b) => b.clicks - a.clicks).slice(0, 4),
    }))
}

export async function detectCannibalization(orgId: string) {
  const end = new Date()
  const start = new Date(end.getTime() - 28 * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const rows = await querySearchAnalytics(orgId, {
    startDate: fmt(start),
    endDate: fmt(end),
    dimensions: ['query', 'page'],
    rowLimit: 5000,
  })
  return groupCannibalization(rows)
}

// ---------------------------------------------------------------------------
// Contenido caducado: artículos SEO sin tocar en 90+ días → refresco con IA.
// ---------------------------------------------------------------------------

const STALE_DAYS = 90

export async function listStaleArticles(orgId: string) {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000)
  return prisma.knowledgeBase.findMany({
    where: { orgId, type: 'seo-article', isActive: true, updatedAt: { lt: cutoff } },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  })
}

export async function refreshArticle(orgId: string, articleId: string) {
  const client = getAnthropicClient()
  if (!client) throw new SeoAiUnavailable()
  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

  const article = await prisma.knowledgeBase.findFirst({
    where: { id: articleId, orgId, type: 'seo-article', isActive: true },
    select: { id: true, name: true, content: true },
  })
  if (!article?.content) return null

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: 'Responde solo con el artículo actualizado en Markdown, sin comentarios adicionales.',
    messages: [{
      role: 'user',
      content: `Actualiza este artículo SEO para que vuelva a estar fresco: revisa afirmaciones que suenen desactualizadas, mejora la estructura si hace falta y mantén la keyword y el tono. Conserva el idioma original.\n\n# ${article.name}\n\n${article.content.slice(0, 12_000)}`,
    }],
  })
  const text = response.content.find((block) => block.type === 'text')?.text?.trim() ?? ''
  if (text.length < 300) throw new Error('La IA devolvió un refresco demasiado corto')

  await updateKnowledgeBase(orgId, article.id, { content: text })
  return { articleId: article.id, name: article.name }
}

// ---------------------------------------------------------------------------
// Alertas: derivadas del historial al leer — sin tabla de incidencias.
// ponytail: aviso solo en la página; alertas por email necesitan un proveedor
// transaccional (SMTP/Resend) que el proyecto no tiene configurado.
// ---------------------------------------------------------------------------

export interface SeoAlert {
  type: 'score_drop' | 'web_down' | 'ssl_expiring'
  message: string
  at: string
}

export async function computeAlerts(orgId: string, url?: string): Promise<SeoAlert[]> {
  const latest = await prisma.seoReport.findFirst({
    where: { orgId, ...(url ? { url } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { score: true, createdAt: true, report: true },
  })
  if (!latest) return []
  const alerts: SeoAlert[] = []
  const report = latest.report as unknown as SeoReport
  const at = latest.createdAt.toISOString()

  if (!report.webAlive) {
    alerts.push({ type: 'web_down', message: 'La web no respondió en la última auditoría: puede estar caída o bloqueando el análisis.', at })
  }
  const ssl = report.checklist?.find((c) => c.id === 'ssl')
  if (ssl && !ssl.ok) {
    alerts.push({ type: 'ssl_expiring', message: ssl.label, at })
  }
  const previous = await prisma.seoReport.findFirst({
    where: { orgId, url: report.url, createdAt: { lt: latest.createdAt } },
    orderBy: { createdAt: 'desc' },
    select: { score: true },
  })
  if (previous && latest.score < previous.score) {
    alerts.push({ type: 'score_drop', message: `El score SEO bajó de ${previous.score} a ${latest.score}.`, at })
  }
  return alerts
}

export async function applySeoToLanding(orgId: string, input: { campaignId: string; title: string; metaDescription: string }) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, orgId, landingSlug: { not: null } },
    select: { id: true, landingSlug: true, adAssets: true },
  })
  if (!campaign) return null

  const assets = campaign.adAssets && typeof campaign.adAssets === 'object' && !Array.isArray(campaign.adAssets)
    ? campaign.adAssets as Record<string, unknown>
    : {}
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      adAssets: {
        ...assets,
        seo: { title: input.title.slice(0, 70), metaDescription: input.metaDescription.slice(0, 170) },
      } as Prisma.InputJsonValue,
    },
  })
  return { campaignId: campaign.id, landingSlug: campaign.landingSlug }
}
