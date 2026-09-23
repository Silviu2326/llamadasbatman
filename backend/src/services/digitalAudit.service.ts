/**
 * Auditoría digital heurística de un negocio (no Lighthouse): un fetch al HTML
 * público + regex sobre SEO/redes/tecnología/conversión → score 0-100,
 * benchmark frente al sector, impacto comercial y pitch de venta.
 * Puerto directo de digital_audit.py (sprintmarkt-crm) + extensiones propias.
 */
import { searchProspects, ProspectingUnavailable } from './prospecting.service'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { readResponseBufferLimited } from '../lib/integrationRuntime'

interface WebInfo {
  isHttps: boolean
  finalUrl: string
  loadMs: number | null
  httpStatus: number
}

interface SeoSignals {
  title: string | null
  titleLen: number
  metaDescription: string | null
  metaDescriptionLen: number
  hasViewport: boolean
  hasCanonical: boolean
  hasOgImage: boolean
  hasSchemaJsonld: boolean
  hasAnalytics: boolean
  hasMetaPixel: boolean
}

interface TechSignals {
  booking: boolean
  ecommerce: boolean
  payment: boolean
  chat: boolean
  diyBuilder: boolean
}

interface ConversionSignals {
  hasContactForm: boolean
  hasClickToCall: boolean
  hasWhatsappCta: boolean
  hasCtaButton: boolean
}

export type ImpactLevel = 'ALTO' | 'MEDIO' | 'BAJO'

export interface Opportunity {
  title: string
  severity: 'low' | 'medium' | 'high'
  product: 'web' | 'seo' | 'marketing' | 'ia' | 'software'
  pitch: string
  impact: ImpactLevel
}

export interface SectorBenchmark {
  sector: string
  city: string
  sampleSize: number
  avgRating: number | null
  avgReviews: number | null
  pctWithWebsite: number | null
  ratingDiffPct: number | null
  reviewsDiffPct: number | null
}

export interface DigitalAuditResult {
  name: string
  website: string | null
  webAlive: boolean
  webReachable: boolean
  webInfo: WebInfo | null
  seo: SeoSignals | null
  socials: Record<string, string>
  tech: TechSignals | null
  conversion: ConversionSignals | null
  publicScore: number
  opsScore: number | null
  opportunity: number
  leadOpportunityScore: number
  tier: 'HOT' | 'WARM' | 'COLD'
  opportunities: Opportunity[]
  benchmark: SectorBenchmark | null
  commercialPitch: string
  summary: string
  auditedAt: string
}

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  instagram: /instagram\.com\/([A-Za-z0-9_.]{2,40})/,
  facebook: /facebook\.com\/([A-Za-z0-9.\-_/]{2,80})/,
  linkedin: /linkedin\.com\/(company|in)\/([A-Za-z0-9.\-_/]{2,80})/,
  tiktok: /tiktok\.com\/@([A-Za-z0-9._]{2,40})/,
  youtube: /youtube\.com\/(@?[A-Za-z0-9.\-_/]{2,80})/,
  twitter: /(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/,
  whatsapp: /wa\.me\/(\+?\d{6,15})/,
}

const META_DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']{1,200})/i
const TITLE_RE = /<title[^>]*>([^<]{1,200})<\/title>/i
const VIEWPORT_RE = /<meta\s+name=["']viewport["']/i
const CANONICAL_RE = /<link[^>]+rel=["']canonical["']/i
const OG_IMG_RE = /<meta[^>]+property=["']og:image["']/i
const SCHEMA_RE = /application\/ld\+json/i
const GA_RE = /(googletagmanager\.com|google-analytics\.com|gtag\()/i
const META_PIXEL_RE = /connect\.facebook\.net.*?fbq/i

const TECH_PATTERNS: Record<keyof TechSignals, RegExp> = {
  booking: /(thefork|eltenedor|covermanager|opentable|resos|mozrest|booksy|simplybook|calendly|dineout|restoo|reservandonos|cita\s*previa|reservar\s*(mesa|cita|hora)|book(ing)?\s*now|widget[-_]?reserv)/i,
  ecommerce: /(shopify|woocommerce|prestashop|magento|bigcommerce|squarespace[-_]?commerce|a[ñn]adir\s*al\s*carrito|add\s*to\s*cart|\/carrito|\/cart|\/checkout|tienda[-_]?online)/i,
  payment: /(stripe\.com|js\.stripe|paypal\.com\/sdk|redsys|bizum|checkout\.stripe)/i,
  chat: /(intercom|tawk\.to|crisp\.chat|zendesk|drift\.com|tidio|livechatinc|hubspot.*conversations|whatsapp.*float|chatbot|widget[-_]?chat)/i,
  diyBuilder: /(\.wixsite\.com|wix\.com|squarespace|godaddysites|websitebuilder|jimdo|weebly|webnode|sitebuilder)/i,
}

// Señales de captación de leads: formulario, click-to-call, CTA de WhatsApp y
// texto de llamada a la acción típico. No sustituye a un análisis de UX real,
// solo indica si existe ALGÚN mecanismo de conversión visible en el HTML.
const CONTACT_FORM_RE = /<form[^>]*>/i
const CLICK_TO_CALL_RE = /href=["']tel:/i
const CTA_TEXT_RE = /(solicitar\s*presupuesto|pide\s*(tu\s*)?cita|contactar\s*ahora|ll[aá]manos|reservar\s*ahora|cont[aá]ctanos|get\s*a\s*quote|book\s*now|contact\s*us|request\s*a\s*quote)/i

const BOOKING_SECTORS = new Set(['restaurantes', 'dental', 'clinicas', 'clinica', 'belleza', 'peluqueria', 'fisioterapia', 'estetica', 'salud', 'veterinaria', 'hoteles', 'spa'])
const ECOMMERCE_SECTORS = new Set(['retail', 'tiendas', 'moda', 'comercio', 'alimentacion', 'floristeria'])

// Impacto comercial = severidad técnica × valor del producto (IA/software se
// venden por tickets más altos que un ajuste SEO puntual). Eje independiente
// de la severidad para que el comercial priorice por rentabilidad, no solo
// por "qué tan roto está".
const PRODUCT_WEIGHT: Record<Opportunity['product'], number> = { ia: 3, software: 3, web: 2, marketing: 2, seo: 1 }
const SEVERITY_WEIGHT: Record<Opportunity['severity'], number> = { high: 3, medium: 2, low: 1 }
const IMPACT_RANK: Record<ImpactLevel, number> = { ALTO: 3, MEDIO: 2, BAJO: 1 }

function impactFor(product: Opportunity['product'], severity: Opportunity['severity']): ImpactLevel {
  const score = PRODUCT_WEIGHT[product] * SEVERITY_WEIGHT[severity]
  if (score >= 6) return 'ALTO'
  if (score >= 3) return 'MEDIO'
  return 'BAJO'
}

function opp(o: Omit<Opportunity, 'impact'>): Opportunity {
  return { ...o, impact: impactFor(o.product, o.severity) }
}

const MAILTO_RE = /mailto:([\w.+-]+@[\w-]+\.[\w.-]+)/i
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/

function extractEmail(html: string): string | null {
  return html.match(MAILTO_RE)?.[1] ?? html.match(EMAIL_RE)?.[0] ?? null
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const MAX_AUDIT_REDIRECTS = 5
const MAX_AUDIT_HTML_BYTES = 2_000_000

function privateAuditAddress(address: string): boolean {
  const value = address.toLowerCase().split('%')[0]
  if (isIP(value) === 6) {
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
      || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
  }
  if (isIP(value) !== 4) return false
  const [a, b] = value.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

export async function assertAuditablePublicUrl(value: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('AUDIT_URL_BLOCKED')
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !host
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('AUDIT_URL_BLOCKED')
  }
  if (isIP(host)) {
    if (privateAuditAddress(host)) throw new Error('AUDIT_URL_BLOCKED')
    return parsed
  }
  const addresses = await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(address => privateAuditAddress(address.address))) {
    throw new Error('AUDIT_URL_BLOCKED')
  }
  return parsed
}

export async function fetchHtml(url: string, timeoutMs = 10000): Promise<{ status: number; html: string; info: WebInfo; headers?: Headers; errorCode?: string }> {
  const info: WebInfo = { isHttps: false, finalUrl: url, loadMs: null, httpStatus: 0 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const t0 = Date.now()
    let current = await assertAuditablePublicUrl(url)
    let res: Response | null = null
    for (let redirects = 0; redirects <= MAX_AUDIT_REDIRECTS; redirects += 1) {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
      })
      if (res.status < 300 || res.status >= 400) break
      const location = res.headers.get('location')
      if (!location || redirects === MAX_AUDIT_REDIRECTS) throw new Error('AUDIT_REDIRECT_BLOCKED')
      // Cada salto vuelve a validar protocolo, credenciales, hostname y DNS.
      current = await assertAuditablePublicUrl(new URL(location, current).toString())
    }
    if (!res) throw new Error('AUDIT_FETCH_FAILED')
    info.loadMs = Date.now() - t0
    info.finalUrl = current.toString()
    info.isHttps = info.finalUrl.startsWith('https://')
    info.httpStatus = res.status
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('AUDIT_CONTENT_TYPE_BLOCKED')
    }
    const html = (await readResponseBufferLimited(res, MAX_AUDIT_HTML_BYTES, timeoutMs)).toString('utf8')
    return { status: res.status, html, info, headers: res.headers }
  } catch (error) {
    // Conservamos la causa para distinguir un bloqueo local de una web caída.
    const failure = error as { message?: string; cause?: { code?: string } }
    const errorCode = controller.signal.aborted ? 'AUDIT_TIMEOUT' : failure.cause?.code || failure.message || 'AUDIT_FETCH_FAILED'
    return { status: 0, html: '', info, errorCode }
  } finally {
    clearTimeout(timer)
  }
}

function detectSocials(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, rx] of Object.entries(SOCIAL_PATTERNS)) {
    const m = html.match(rx)
    if (m) out[name] = m[0]
  }
  return out
}

function seoSignals(html: string): SeoSignals {
  const title = html.match(TITLE_RE)?.[1]?.trim() ?? null
  const desc = html.match(META_DESC_RE)?.[1]?.trim() ?? null
  return {
    title,
    titleLen: title?.length ?? 0,
    metaDescription: desc,
    metaDescriptionLen: desc?.length ?? 0,
    hasViewport: VIEWPORT_RE.test(html),
    hasCanonical: CANONICAL_RE.test(html),
    hasOgImage: OG_IMG_RE.test(html),
    hasSchemaJsonld: SCHEMA_RE.test(html),
    hasAnalytics: GA_RE.test(html),
    hasMetaPixel: META_PIXEL_RE.test(html),
  }
}

function techSignals(html: string): TechSignals {
  return {
    booking: TECH_PATTERNS.booking.test(html),
    ecommerce: TECH_PATTERNS.ecommerce.test(html),
    payment: TECH_PATTERNS.payment.test(html),
    chat: TECH_PATTERNS.chat.test(html),
    diyBuilder: TECH_PATTERNS.diyBuilder.test(html),
  }
}

function conversionSignals(html: string, socials: Record<string, string>): ConversionSignals {
  return {
    hasContactForm: CONTACT_FORM_RE.test(html),
    hasClickToCall: CLICK_TO_CALL_RE.test(html),
    hasWhatsappCta: !!socials.whatsapp,
    hasCtaButton: CTA_TEXT_RE.test(html),
  }
}

function opsMaturity(tech: TechSignals, webAlive: boolean, sector?: string): { score: number | null; opps: Opportunity[] } {
  if (!webAlive) return { score: null, opps: [] }

  const sec = (sector ?? '').toLowerCase()
  const consumerFacing = BOOKING_SECTORS.has(sec) || ECOMMERCE_SECTORS.has(sec)
  let score = 30
  const opps: Opportunity[] = []

  if (tech.booking) {
    score += 25
  } else if (BOOKING_SECTORS.has(sec)) {
    opps.push(opp({ title: 'Sin reservas / citas online (gestión manual)', severity: 'high', product: 'ia', pitch: 'Reservas y citas automatizadas 24/7 + recordatorios — menos llamadas, menos no-shows.' }))
  }

  if (tech.ecommerce || tech.payment) {
    score += 25
  } else if (ECOMMERCE_SECTORS.has(sec)) {
    opps.push(opp({ title: 'Sin venta / pago online', severity: 'high', product: 'web', pitch: 'Tienda online + pasarela de pago: nuevo canal de ingresos directo.' }))
  }

  if (tech.chat) {
    score += 20
  } else if (consumerFacing) {
    opps.push(opp({ title: 'Sin asistente IA / chatbot detectado', severity: 'medium', product: 'ia', pitch: 'Chatbot IA 24/7 que responde, capta leads y reserva fuera de horario.' }))
  }

  if (tech.diyBuilder) {
    score -= 15
    opps.push(opp({ title: 'Web en plantilla DIY (Wix/Squarespace/…)', severity: 'medium', product: 'software', pitch: 'Plataforma limitada y no escalable. Migración a desarrollo a medida con automatizaciones.' }))
  }

  return { score: Math.max(0, Math.min(100, score)), opps }
}

function conversionOpportunities(conv: ConversionSignals | null, webAlive: boolean): Opportunity[] {
  if (!webAlive || !conv) return []
  const hasAnyCapture = conv.hasContactForm || conv.hasClickToCall || conv.hasWhatsappCta
  const opps: Opportunity[] = []
  if (!hasAnyCapture) {
    opps.push(opp({
      title: 'Sin formulario, click-to-call ni WhatsApp — no hay forma clara de convertir',
      severity: 'high',
      product: 'web',
      pitch: 'Cada visita se pierde sin captar el contacto. Formulario + botón de llamada + WhatsApp flotante son el mínimo para no perder tráfico.',
    }))
  } else if (!conv.hasCtaButton) {
    opps.push(opp({
      title: 'Sin llamada a la acción (CTA) clara en la web',
      severity: 'low',
      product: 'marketing',
      pitch: 'Copy y botones de CTA optimizados mejoran la tasa de conversión de las visitas que ya tienes.',
    }))
  }
  return opps
}

function scoreAndOpportunities(opts: {
  webAlive: boolean
  webReachable: boolean
  hasWebsite: boolean
  info: WebInfo | null
  seo: SeoSignals | null
  socials: Record<string, string>
  gbpRating?: number | null
  gbpReviews?: number | null
  gbpPhotosCount?: number | null
}): { score: number; opps: Opportunity[] } {
  const { webAlive, webReachable, hasWebsite, info, seo, socials, gbpRating, gbpReviews, gbpPhotosCount } = opts
  let score = 0
  const opps: Opportunity[] = []

  if (!webAlive && !webReachable && !hasWebsite) {
    opps.push(opp({ title: 'No tiene web propia', severity: 'high', product: 'web', pitch: 'Punto de partida ideal: web one-page o tienda según volumen.' }))
  } else if (!webAlive && !webReachable && hasWebsite) {
    opps.push(opp({ title: 'Web caída o no accesible (posible SSL roto / timeout)', severity: 'high', product: 'web', pitch: 'Tiene dominio pero no responde correctamente. Confírmalo manualmente y véndelo como rescate o web nueva.' }))
  } else if (!webAlive && webReachable) {
    score += 20
    if (info?.isHttps) score += 5
    opps.push(opp({ title: 'Web no auditable automáticamente (protección anti-bot)', severity: 'low', product: 'seo', pitch: 'Tiene web activa pero bloquea el análisis. Revisar manualmente antes de contactar.' }))
  } else {
    score += 25
    if (info?.isHttps) {
      score += 5
    } else {
      opps.push(opp({ title: 'Web sin HTTPS', severity: 'high', product: 'web', pitch: 'Pérdida de confianza + penalización SEO. Migración a HTTPS.' }))
    }
    const load = info?.loadMs ?? 0
    if (load > 0 && load < 2500) {
      score += 10
    } else if (load >= 4500) {
      opps.push(opp({ title: `Web lenta (${load} ms)`, severity: 'medium', product: 'web', pitch: 'Optimización Core Web Vitals + CDN + lazy loading.' }))
    }
  }

  if (seo) {
    if (seo.title && seo.titleLen >= 15 && seo.titleLen <= 70) {
      score += 5
    } else if (webAlive) {
      opps.push(opp({ title: 'Title SEO ausente o mal dimensionado', severity: 'medium', product: 'seo', pitch: 'Reescritura SEO de title + meta + cabeceras.' }))
    }
    if (seo.metaDescription && seo.metaDescriptionLen >= 50 && seo.metaDescriptionLen <= 170) {
      score += 5
    } else if (webAlive) {
      opps.push(opp({ title: 'Meta description ausente o débil', severity: 'low', product: 'seo', pitch: 'Mejora CTR en Google con meta descriptions optimizadas.' }))
    }
    if (seo.hasViewport) {
      score += 3
    } else if (webAlive) {
      opps.push(opp({ title: 'Sin meta viewport (no responsive)', severity: 'high', product: 'web', pitch: '+60% del tráfico es móvil — rediseño responsive crítico.' }))
    }
    if (seo.hasCanonical) score += 2
    if (seo.hasSchemaJsonld) {
      score += 3
    } else if (webAlive) {
      opps.push(opp({ title: 'Sin datos estructurados (Schema.org)', severity: 'low', product: 'seo', pitch: 'Rich snippets en Google → +CTR y trust.' }))
    }
    if (seo.hasOgImage) score += 2

    if (seo.hasAnalytics) {
      score += 5
    } else if (webAlive) {
      opps.push(opp({ title: 'Sin Analytics / GTM', severity: 'medium', product: 'marketing', pitch: 'Sin medición no hay decisiones. Instalación de GA4 + GTM.' }))
    }
    if (seo.hasMetaPixel) score += 5
  }

  score += Math.min(Object.keys(socials).length, 10)
  if (webAlive) {
    if (Object.keys(socials).length < 2) {
      opps.push(opp({ title: `Solo ${Object.keys(socials).length} red social detectada en web`, severity: 'medium', product: 'marketing', pitch: 'Gestión RRSS (IG/FB) + integración con web para captación.' }))
    }
    if (!('instagram' in socials)) {
      opps.push(opp({ title: 'Sin presencia Instagram visible', severity: 'low', product: 'marketing', pitch: 'IG es el canal #1 para descubrimiento local en su sector.' }))
    }
  }

  if (gbpRating != null) {
    score += Math.round((gbpRating / 5) * 10)
    const reviews = gbpReviews ?? 0
    if (reviews >= 50) {
      score += 10
    } else if (reviews >= 10) {
      score += 5
    } else {
      opps.push(opp({ title: `Pocas reseñas Google (${reviews})`, severity: 'medium', product: 'marketing', pitch: 'Campaña de captación de reseñas + automatización post-servicio.' }))
    }
    if (gbpRating < 4.0) {
      opps.push(opp({ title: `Rating Google bajo (${gbpRating.toFixed(1)})`, severity: 'high', product: 'marketing', pitch: 'Plan de gestión de reputación + respuesta automatizada.' }))
    }
    // Ficha existe pero está poco cuidada: pocas reseñas o pocas fotos.
    // Distinto del caso "no detectado" (gbpRating == null), que ya se cubre abajo.
    if (gbpPhotosCount != null && gbpPhotosCount < 3) {
      opps.push(opp({ title: `Ficha Google Business con pocas fotos (${gbpPhotosCount})`, severity: 'medium', product: 'marketing', pitch: 'Ficha con pocas fotos convierte peor — sesión de fotos + carga y optimización de ficha GBP.' }))
    }
  } else {
    opps.push(opp({ title: 'No detectado en Google Business', severity: 'high', product: 'marketing', pitch: 'Alta y optimización de ficha GBP — ROI inmediato en local.' }))
  }

  return { score: Math.max(0, Math.min(100, score)), opps }
}

function tierFromScore(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 60) return 'HOT'
  if (score >= 30) return 'WARM'
  return 'COLD'
}

function buildSummary(opts: {
  name: string
  publicScore: number
  opsScore: number | null
  webAlive: boolean
  webReachable: boolean
  hasWebsite: boolean
  socialsN: number
  gbpRating?: number | null
  gbpReviews?: number | null
  opportunities: Opportunity[]
}): string {
  const { name, publicScore, opsScore, webAlive, webReachable, hasWebsite, socialsN, gbpRating, gbpReviews, opportunities } = opts
  const parts: string[] = []
  parts.push(
    opsScore != null
      ? `${name} — presencia pública ${publicScore}/100, madurez operativa ${opsScore}/100.`
      : `${name} — presencia pública ${publicScore}/100.`
  )
  if (!webAlive && !webReachable && !hasWebsite) {
    parts.push('Sin web operativa (oportunidad alta).')
  } else if (!webAlive && !webReachable && hasWebsite) {
    parts.push('Tiene dominio pero no responde (posible caída o SSL roto): oportunidad de rescate/web nueva.')
  } else if (!webAlive && webReachable) {
    parts.push('Web activa pero no auditable automáticamente (revisar manualmente).')
  } else {
    parts.push(`Web operativa, ${socialsN} redes detectadas.`)
  }
  parts.push(gbpRating != null ? `Google: ${gbpRating.toFixed(1)}★ (${gbpReviews ?? 0} reseñas).` : 'Sin datos GBP.')
  if (opsScore != null && publicScore >= 60 && opsScore < 50) {
    parts.push('Buen escaparate pero operativa manual: oportunidad IA/software.')
  }
  const highOpps = opportunities.filter((o) => o.severity === 'high')
  if (highOpps.length) parts.push(`Pain points críticos: ${highOpps.length}.`)
  return parts.join(' ')
}

function buildCommercialPitch(name: string, tier: 'HOT' | 'WARM' | 'COLD', opportunities: Opportunity[]): string {
  if (!opportunities.length) {
    return `${name} tiene una presencia digital sólida y pocas carencias detectables automáticamente — oportunidad de venta baja por esta vía.`
  }
  const sorted = [...opportunities].sort((a, b) => {
    const impactDiff = IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]
    if (impactDiff !== 0) return impactDiff
    return SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
  })
  const top = sorted.slice(0, 2)
  const intro = tier === 'HOT'
    ? `${name} es una oportunidad caliente: hay mucho margen de venta.`
    : tier === 'WARM'
      ? `${name} tiene una oportunidad de venta moderada.`
      : `${name} tiene presencia digital razonable, con margen de venta puntual.`
  return `${intro} ${top.map((o) => o.pitch).join(' ')}`.trim()
}

/**
 * Compara al negocio con hasta 20 negocios del mismo sector+ciudad (misma
 * fuente que Prospect Finder, sin fetch de HTML adicional — solo datos GBP
 * ya devueltos por la búsqueda). No excluye al propio negocio de la muestra
 * si aparece en ella: con 20 resultados el sesgo es despreciable.
 */
async function benchmarkAgainstSector(opts: {
  sector?: string | null
  city?: string | null
}): Promise<SectorBenchmark | null> {
  const { sector, city } = opts
  if (!sector || !city) return null

  let peers: Awaited<ReturnType<typeof searchProspects>>
  try {
    peers = await searchProspects({ sector, city, limit: 20 })
  } catch (err) {
    if (err instanceof ProspectingUnavailable) return null
    throw err
  }
  if (!peers.length) return null

  const ratings = peers.map((p) => p.rating).filter((r): r is number => r != null)
  const reviews = peers.map((p) => p.userRatingCount).filter((r): r is number => r != null)
  const withWebsite = peers.filter((p) => !!p.website).length

  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const avgReviews = reviews.length ? reviews.reduce((a, b) => a + b, 0) / reviews.length : null
  const pctWithWebsite = Math.round((withWebsite / peers.length) * 100)

  return {
    sector, city, sampleSize: peers.length, avgRating, avgReviews, pctWithWebsite,
    ratingDiffPct: null, reviewsDiffPct: null, // se rellenan en auditBusiness, que conoce los valores propios
  }
}

function fillBenchmarkDiffs(
  benchmark: SectorBenchmark | null,
  gbpRating?: number | null,
  gbpReviews?: number | null
): SectorBenchmark | null {
  if (!benchmark) return null
  const ratingDiffPct = gbpRating != null && benchmark.avgRating
    ? Math.round(((gbpRating - benchmark.avgRating) / benchmark.avgRating) * 100)
    : null
  const reviewsDiffPct = gbpReviews != null && benchmark.avgReviews
    ? Math.round(((gbpReviews - benchmark.avgReviews) / benchmark.avgReviews) * 100)
    : null
  return { ...benchmark, ratingDiffPct, reviewsDiffPct }
}

/**
 * Enriquecimiento barato al importar un prospecto: un solo fetch de su web
 * para sacar email, redes y tecnología detectada. No calcula scores ni
 * benchmark — eso lo hace auditBusiness() bajo demanda desde la ficha del lead.
 */
export async function enrichFromWebsite(website: string): Promise<{
  email: string | null
  socials: Record<string, string>
  tech: TechSignals | null
} | null> {
  const url = normalizeUrl(website)
  if (!url) return null
  const { status, html } = await fetchHtml(url)
  if (status !== 200 || html.length < 200) return null
  return {
    email: extractEmail(html),
    socials: detectSocials(html),
    tech: techSignals(html),
  }
}

export async function auditBusiness(opts: {
  name: string
  website?: string | null
  sector?: string | null
  city?: string | null
  gbpRating?: number | null
  gbpReviews?: number | null
  gbpPhotosCount?: number | null
}): Promise<DigitalAuditResult> {
  const { name, website, sector, city, gbpRating, gbpReviews, gbpPhotosCount } = opts

  let webAlive = false
  let webReachable = false
  let info: WebInfo | null = null
  let seo: SeoSignals | null = null
  let socials: Record<string, string> = {}
  let tech: TechSignals | null = null
  let conversion: ConversionSignals | null = null

  if (website) {
    const url = normalizeUrl(website)
    const { status, html, info: fetchedInfo } = await fetchHtml(url)
    info = fetchedInfo
    webAlive = status === 200 && html.length > 200
    webReachable = status > 0
    if (webAlive) {
      seo = seoSignals(html)
      socials = detectSocials(html)
      tech = techSignals(html)
      conversion = conversionSignals(html, socials)
    }
  }

  const { score: publicScore, opps: publicOpps } = scoreAndOpportunities({
    webAlive, webReachable, hasWebsite: !!website, info, seo, socials, gbpRating, gbpReviews, gbpPhotosCount,
  })
  const { score: opsScore, opps: opsOpps } = opsMaturity(tech ?? { booking: false, ecommerce: false, payment: false, chat: false, diyBuilder: false }, webAlive, sector ?? undefined)
  const convOpps = conversionOpportunities(conversion, webAlive)

  const opportunities = [...publicOpps, ...opsOpps, ...convOpps]
  const publicGap = 100 - publicScore
  const opsGap = opsScore != null ? 100 - opsScore : 0
  const opportunity = Math.max(publicGap, opsGap)

  // Gap de reputación: sin ficha GBP se asume alta oportunidad (80, no 100,
  // para no eclipsar del todo al eje de presencia/operativa). Con ficha, el
  // gap baja cuanto mejor el rating y más volumen de reseñas.
  const reputationGap = gbpRating == null
    ? 80
    : Math.max(0, Math.min(100, Math.round(((5 - gbpRating) / 5) * 100) - ((gbpReviews ?? 0) >= 50 ? 20 : (gbpReviews ?? 0) >= 10 ? 10 : 0)))
  const leadOpportunityScore = Math.max(0, Math.min(100, Math.round(opportunity * 0.6 + reputationGap * 0.4)))
  const tier = tierFromScore(leadOpportunityScore)

  const rawBenchmark = await benchmarkAgainstSector({ sector, city })
  const benchmark = fillBenchmarkDiffs(rawBenchmark, gbpRating, gbpReviews)

  return {
    name,
    website: website ?? null,
    webAlive,
    webReachable,
    webInfo: info,
    seo,
    socials,
    tech,
    conversion,
    publicScore,
    opsScore,
    opportunity,
    leadOpportunityScore,
    tier,
    opportunities,
    benchmark,
    commercialPitch: buildCommercialPitch(name, tier, opportunities),
    summary: buildSummary({
      name, publicScore, opsScore, webAlive, webReachable, hasWebsite: !!website,
      socialsN: Object.keys(socials).length, gbpRating, gbpReviews, opportunities,
    }),
    auditedAt: new Date().toISOString(),
  }
}
