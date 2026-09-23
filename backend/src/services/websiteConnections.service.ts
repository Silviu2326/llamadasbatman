import { enqueueWebsiteAudit } from './websiteSeo.service'
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { fetchHtml, normalizeUrl } from './digitalAudit.service'

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
  wordpress: ['plugin', 'script', 'git', 'sftp', 'edge'],
  shopify: ['api', 'script', 'edge'],
  webflow: ['api', 'script', 'edge'],
  wix: ['api', 'script', 'edge'],
  squarespace: ['api', 'script', 'edge'],
  framer: ['script', 'edge'],
  // Las webs de código propio se conectan desde su repositorio. No ofrecemos
  // un script que pueda quedarse fuera del control del despliegue.
  nextjs: ['git'],
  static: ['git'],
  unknown: ['script', 'git', 'sftp', 'edge'],
}

const RECOMMENDED_MODES: Record<string, WebsiteConnectionMode> = {
  wordpress: 'plugin',
  shopify: 'script',
  webflow: 'script',
  wix: 'script',
  squarespace: 'script',
  framer: 'script',
  nextjs: 'git',
  static: 'script',
  unknown: 'script',
}

function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
}

export function detectWebsiteTechnology(html: string, headers = new Headers()) {
  // Solo señales técnicas: mencionar WordPress en un artículo no implica usarlo.
  const rules: Array<[string, RegExp, string]> = [
    ['wordpress', /(?:src|href)\s*=\s*["'][^"']*\/wp-(?:content|includes)\//i, 'Recursos de WordPress (wp-content / wp-includes)'],
    ['shopify', /(?:src|href)\s*=\s*["'][^"']*cdn\.shopify\.com\//i, 'Recursos servidos por Shopify'],
    ['webflow', /\bdata-wf-(?:page|site)\s*=/i, 'Identificadores de página de Webflow'],
    ['wix', /(?:src|href)\s*=\s*["'][^"']*wixstatic\.com\//i, 'Recursos de Wix'],
    ['squarespace', /(?:src|href)\s*=\s*["'][^"']*squarespace\.com\//i, 'Recursos de Squarespace'],
    ['framer', /\bdata-framer-[\w-]+\s*=|(?:src|href)\s*=\s*["'][^"']*framerusercontent\.com\//i, 'Recursos o componentes de Framer'],
    ['nextjs', /(?:src|href)\s*=\s*["'][^"']*\/_next\/static\/|\bid\s*=\s*["']__NEXT_DATA__["']/i, 'Recursos de Next.js (_next/static)'],
  ]
  for (const [technology, pattern, evidence] of rules) {
    if (pattern.test(html)) return { technology, evidence: [evidence] }
  }
  const generatorTags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of generatorTags) {
    if (!/\bname\s*=\s*["']generator["']/i.test(tag)) continue
    const generator = tag.match(/\bcontent\s*=\s*["']([^"']+)/i)?.[1] ?? ''
    for (const technology of ['wordpress', 'shopify', 'webflow', 'wix', 'squarespace', 'framer']) {
      if (new RegExp(`^${technology}(?:\\s|$)`, 'i').test(generator)) return { technology, evidence: [`Etiqueta generator de ${TECHNOLOGY_LABELS[technology]}`] }
    }
  }
  if (/next\.js/i.test(headers.get('x-powered-by') ?? '')) return { technology: 'nextjs', evidence: ['Cabecera X-Powered-By de Next.js'] }
  // Recibir HTML no permite concluir que sea una web estática.
  return { technology: 'unknown', evidence: [] as string[] }
}

export class WebsiteDetectionError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

export async function detectWebsiteConnection(website: string) {
  const normalized = normalizeUrl(website)
  if (!normalized) throw new WebsiteDetectionError('WEB_CONNECTION_URL_REQUIRED', 'Introduce el dominio de tu web.')
  const result = await fetchHtml(normalized, 15_000)
  if (!result.html || result.status < 200 || result.status >= 400) {
    const code = result.errorCode ?? ''
    let message = 'No pudimos leer la web. Comprueba el dominio y vuelve a intentar la detección.'
    if (/EACCES|EPERM/.test(code)) message = 'El servidor de Vendrava no tiene permiso para acceder a Internet. Revisa su conexión de salida y vuelve a intentarlo.'
    else if (/AUDIT_URL_BLOCKED|AUDIT_REDIRECT_BLOCKED/.test(code)) message = 'Usa una dirección web pública. No se permiten direcciones internas ni redirecciones a redes privadas.'
    else if (/ENOTFOUND|EAI_AGAIN/.test(code)) message = 'No pudimos resolver este dominio. Revisa que esté bien escrito o inténtalo de nuevo.'
    else if (/TIMEOUT|ETIMEDOUT/.test(code)) message = 'La web ha tardado demasiado en responder. Vuelve a intentar la detección.'
    else if (/CERT|TLS|SSL/.test(code)) message = 'No pudimos verificar el certificado HTTPS de la web. Revisa su certificado antes de conectarla.'
    else if (result.info.httpStatus === 403 || result.info.httpStatus === 429) message = 'La web ha bloqueado la detección automática. Revisa su protección contra bots o inténtalo más tarde.'
    else if (result.info.httpStatus >= 400) message = `La web devuelve un error HTTP ${result.info.httpStatus}. Comprueba que la dirección abre correctamente.`
    else if (code === 'AUDIT_CONTENT_TYPE_BLOCKED') message = 'Esta dirección no devuelve una página HTML. Introduce la página principal de tu web.'
    else if (code === 'RESPONSE_BODY_TOO_LARGE') message = 'La página supera el tamaño máximo de análisis. Prueba otra página pública de la misma web.'
    throw new WebsiteDetectionError('WEB_CONNECTION_DETECTION_FAILED', message)
  }
  const { technology, evidence } = detectWebsiteTechnology(result.html, result.headers)
  const finalUrl = result.info.finalUrl || normalized
  return {
    websiteUrl: finalUrl,
    domain: domainOf(finalUrl),
    technology,
    technologyLabel: TECHNOLOGY_LABELS[technology],
    recommendedMode: RECOMMENDED_MODES[technology] ?? 'script',
    availableModes: (AVAILABLE_MODES[technology] ?? AVAILABLE_MODES.unknown).filter(mode => ['plugin', 'git', 'script'].includes(mode)),
    detection: { httpStatus: result.status, isHttps: result.info.isHttps, loadMs: result.info.loadMs, finalUrl, evidence },
  }
}

/** Estado real del conector de escritura (hoy solo WordPress). Se guarda en
 * `detection.connector` y es lo único que hace verdaderas las capacidades
 * profundas: elegir un modo en la UI no otorga nada por sí solo. */
export type WordPressConnectorState = {
  kind: 'wordpress'
  /** Credencial válida con permiso de edición (páginas y entradas). */
  canEdit: boolean
  /** Plugin Vendrava Connect activo: metadatos SEO y script sin tocar el tema. */
  plugin: boolean
  pluginVersion?: string | null
  seoPlugin?: string | null
  username?: string | null
  wpVersion?: string | null
  restBase?: string | null
  scriptInstalled?: boolean
  verifiedAt?: string | null
}

/** Repositorio conectado (hoy GitHub). Los cambios llegan como pull request:
 * Vendrava nunca escribe en la rama principal. */
export type GitConnectorState = {
  kind: 'git'
  provider: 'github'
  owner: string
  repo: string
  defaultBranch: string
  /** El token puede crear ramas y pull requests. */
  canPush: boolean
  isPrivate?: boolean
  htmlUrl?: string | null
  username?: string | null
  verifiedAt?: string | null
}

export type ConnectorState = WordPressConnectorState | GitConnectorState

export function capabilitiesFor(technology: string, mode: WebsiteConnectionMode, connector?: ConnectorState | null): Capability[] {
  if (connector?.kind === 'git') {
    const via = connector.canPush ? `pull request en ${connector.owner}/${connector.repo}` : 'el token ya no puede crear ramas: vuelve a conectar'
    return [
      { id: 'capture', label: 'Captación de leads', detail: 'Formularios, chat, agente y eventos de conversión.', available: true, via: 'script universal' },
      { id: 'analytics', label: 'Analítica y tracking', detail: 'Visitas, fuentes, conversiones y experimentos.', available: true, via: 'script universal' },
      { id: 'content', label: 'Cambiar contenido', detail: 'Un agente edita el código y abre un pull request revisable.', available: connector.canPush, via },
      { id: 'seo', label: 'SEO técnico', detail: 'Título, meta description y etiquetas por pull request.', available: connector.canPush, via },
      { id: 'publish', label: 'Publicar cambios', detail: 'Nada se publica hasta que alguien aprueba y fusiona el pull request.', available: connector.canPush, via: connector.canPush ? 'aprobación en GitHub + tu despliegue habitual' : via },
    ]
  }
  const canEdit = connector?.kind === 'wordpress' && connector.canEdit
  const plugin = connector?.kind === 'wordpress' && connector.plugin
  const editVia = connector?.kind === 'wordpress' ? 'API REST de WordPress' : 'conector de edición'
  const needsConnector = technology === 'wordpress'
    ? 'conecta WordPress con una contraseña de aplicación'
    : mode === 'git' ? 'conecta el repositorio de GitHub'
      : mode === 'script' ? 'requiere un canal de escritura' : `el canal «${mode}» aún no tiene conector`
  const scriptVia = plugin && connector?.kind === 'wordpress' && connector.scriptInstalled ? 'plugin Vendrava Connect' : 'script universal'
  const seoPlugin = connector?.kind === 'wordpress' ? connector.seoPlugin : null
  return [
    { id: 'capture', label: 'Captación de leads', detail: 'Formularios, chat, agente y eventos de conversión.', available: true, via: scriptVia },
    { id: 'analytics', label: 'Analítica y tracking', detail: 'Visitas, fuentes, conversiones y experimentos.', available: true, via: scriptVia },
    { id: 'content', label: 'Cambiar contenido', detail: 'Editar títulos y textos de páginas sin copiar la web.', available: canEdit, via: canEdit ? editVia : needsConnector },
    { id: 'seo', label: 'SEO técnico', detail: 'Título SEO y meta description por página.', available: plugin, via: plugin ? `plugin Vendrava Connect${seoPlugin ? ` · ${seoPlugin}` : ''}` : technology === 'wordpress' ? 'instala el plugin Vendrava Connect' : needsConnector },
    { id: 'publish', label: 'Publicar cambios', detail: 'Cada edición queda registrada y se puede revertir a mano.', available: canEdit, via: canEdit ? editVia : needsConnector },
  ]
}

export function connectorOf(connection: { detection?: unknown } | null | undefined): ConnectorState | null {
  const detection = connection?.detection
  if (!detection || typeof detection !== 'object' || Array.isArray(detection)) return null
  const connector = (detection as Record<string, unknown>).connector
  if (!connector || typeof connector !== 'object' || Array.isArray(connector)) return null
  const value = connector as Record<string, unknown>
  const text = (key: string) => (typeof value[key] === 'string' ? value[key] as string : null)
  if (value.kind === 'git') {
    if (!text('owner') || !text('repo')) return null
    return {
      kind: 'git',
      provider: 'github',
      owner: text('owner') as string,
      repo: text('repo') as string,
      defaultBranch: text('defaultBranch') || 'main',
      canPush: value.canPush === true,
      isPrivate: value.isPrivate === true,
      htmlUrl: text('htmlUrl'),
      username: text('username'),
      verifiedAt: text('verifiedAt'),
    }
  }
  if (value.kind !== 'wordpress') return null
  return {
    kind: 'wordpress',
    canEdit: value.canEdit === true,
    plugin: value.plugin === true,
    pluginVersion: text('pluginVersion'),
    seoPlugin: text('seoPlugin'),
    username: text('username'),
    wpVersion: text('wpVersion'),
    restBase: text('restBase'),
    scriptInstalled: value.scriptInstalled === true,
    verifiedAt: text('verifiedAt'),
  }
}

/** Guarda (o borra, con `null`) el estado del conector dentro de `detection`
 * y recalcula las capacidades. Lo usan los conectores de WordPress y Git. */
export async function setWebsiteConnector(connectionId: string, connector: ConnectorState | null, extra: { status?: string; connectionMode?: WebsiteConnectionMode } = {}) {
  const current = await prisma.websiteConnection.findUnique({ where: { id: connectionId } })
  if (!current) return null
  const detection = current.detection && typeof current.detection === 'object' && !Array.isArray(current.detection)
    ? { ...(current.detection as Record<string, unknown>) }
    : {}
  if (connector) detection.connector = connector
  else delete detection.connector
  const mode = (extra.connectionMode ?? current.connectionMode) as WebsiteConnectionMode
  return prisma.websiteConnection.update({
    where: { id: connectionId },
    data: {
      detection: detection as Prisma.InputJsonValue,
      connectionMode: mode,
      status: extra.status ?? current.status,
      capabilities: capabilitiesFor(current.technology, mode, connector) as unknown as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
    },
  })
}

export function scriptInstall(siteKey: string) {
  const host = (process.env.PUBLIC_HOST?.trim() || 'https://api.vendrava.com').replace(/\/+$/, '')
  // El backend sirve el script en /web-client.js (routes/webClient.ts); el CDN es opcional.
  const scriptUrl = process.env.VENDRAVA_WEB_CLIENT_URL?.trim() || `${host}/web-client.js`
  const eventUrl = process.env.VENDRAVA_WEB_EVENTS_URL?.trim() || `${host}/api/web-events/collect`
  return {
    scriptUrl,
    eventUrl,
    snippet: `<script defer src="${scriptUrl}" data-vendrava-site="${siteKey}" data-vendrava-endpoint="${eventUrl}"></script>`,
  }
}

export type WebsiteSignals = {
  /** Eventos de los últimos 7 días, por nombre. */
  last7d: Record<string, number>
  total7d: number
  lastEventAt: Date | null
  /** El script (o el plugin) ha enviado al menos una señal alguna vez. */
  verified: boolean
}

const EMPTY_SIGNALS: WebsiteSignals = { last7d: {}, total7d: 0, lastEventAt: null, verified: false }

export function viewWebsiteConnection(connection: any, signals: WebsiteSignals = EMPTY_SIGNALS) {
  return view(connection, signals)
}

function view(connection: any, signals: WebsiteSignals = EMPTY_SIGNALS) {
  const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities : []
  const connector = connectorOf(connection)
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
    lastEventAt: connection.lastEventAt ?? signals.lastEventAt,
    signals: { ...signals, lastEventAt: connection.lastEventAt ?? signals.lastEventAt, verified: signals.verified || Boolean(connection.lastEventAt) },
    // Sin secretos: usuario y versiones, nunca la contraseña de aplicación.
    connector,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    install: scriptInstall(connection.siteKey),
  }
}

async function signalsFor(connectionIds: string[]): Promise<Map<string, WebsiteSignals>> {
  const result = new Map<string, WebsiteSignals>()
  if (!connectionIds.length) return result
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const grouped = await prisma.websiteEvent.groupBy({
    by: ['connectionId', 'eventName'],
    where: { connectionId: { in: connectionIds }, occurredAt: { gte: since } },
    _count: { _all: true },
  })
  for (const row of grouped) {
    const current = result.get(row.connectionId) ?? { last7d: {}, total7d: 0, lastEventAt: null, verified: true }
    current.last7d[row.eventName] = row._count._all
    current.total7d += row._count._all
    result.set(row.connectionId, current)
  }
  return result
}

export async function listWebsiteConnections(orgId: string) {
  const rows = await prisma.websiteConnection.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } })
  const signals = await signalsFor(rows.map(row => row.id))
  return rows.map(row => view(row, signals.get(row.id)))
}

export async function getWebsiteConnection(orgId: string, id: string) {
  const row = await prisma.websiteConnection.findFirst({ where: { id, orgId } })
  if (!row) return null
  const signals = await signalsFor([row.id])
  return view(row, signals.get(row.id))
}

export async function discoverWebsiteConnection(params: { orgId: string; website: string; mode?: WebsiteConnectionMode }) {
  const preview = await detectWebsiteConnection(params.website)
  const { websiteUrl: finalUrl, domain, technology, recommendedMode, detection } = preview
  if (params.mode && !preview.availableModes.includes(params.mode)) throw new WebsiteDetectionError('WEB_CONNECTION_MODE_INVALID', 'Este método no está disponible para la tecnología detectada. Analiza la web de nuevo.')
  const mode = params.mode ?? recommendedMode
  const existing = await prisma.websiteConnection.findUnique({ where: { orgId_domain: { orgId: params.orgId, domain } } })
  const existingConnector = connectorOf(existing)
  const updatedMode = (existingConnector ? existing?.connectionMode : params.mode ?? existing?.connectionMode) as WebsiteConnectionMode || recommendedMode
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
      connectionMode: mode,
      recommendedMode,
      siteKey: `wk_${randomBytes(18).toString('base64url')}`,
      capabilities: capabilitiesFor(technology, mode) as unknown as Prisma.InputJsonValue,
      detection,
      lastCheckedAt: new Date(),
    },
    update: {
      websiteUrl: finalUrl,
      technology,
      technologyLabel: TECHNOLOGY_LABELS[technology] ?? TECHNOLOGY_LABELS.unknown,
      connectionMode: updatedMode,
      recommendedMode,
      capabilities: capabilitiesFor(technology, updatedMode, existingConnector) as unknown as Prisma.InputJsonValue,
      // Re-analizar no desconecta: el conector sobrevive a la nueva detección.
      detection: { ...detection, ...(connectorOf(existing) ? { connector: connectorOf(existing) } : {}) },
      lastCheckedAt: new Date(),
    },
  })
  await enqueueWebsiteAudit(params.orgId, connection.id, 'initial')
  const signals = await signalsFor([connection.id])
  return view(connection, signals.get(connection.id))
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
      capabilities: capabilitiesFor(current.technology, mode, connectorOf(current)) as unknown as Prisma.InputJsonValue,
    },
  })
  const signals = await signalsFor([updated.id])
  return view(updated, signals.get(updated.id))
}

export function isWebsiteConnectionMode(value: unknown): value is WebsiteConnectionMode {
  return typeof value === 'string' && (WEBSITE_CONNECTION_MODES as readonly string[]).includes(value)
}

export async function recordWebsiteEvent(input: { siteKey: string; eventName: string; path?: string; referrer?: string; origin?: string }) {
  const connection = await prisma.websiteConnection.findUnique({ where: { siteKey: input.siteKey }, select: { id: true, domain: true, status: true, lastEventAt: true } })
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
  // La primera señal verifica la instalación. `lastEventAt` se refresca como
  // mucho una vez por minuto para no convertir cada vista en dos escrituras.
  const now = new Date()
  const stale = !connection.lastEventAt || now.getTime() - connection.lastEventAt.getTime() > 60_000
  const verifies = connection.status === 'setup_required' || connection.status === 'verification_pending'
  if (stale || verifies) {
    await prisma.websiteConnection.update({
      where: { id: connection.id },
      data: { lastEventAt: now, ...(verifies ? { status: 'connected' } : {}) },
    }).catch(() => undefined)
  }
  return true
}
