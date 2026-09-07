import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { readResponseBufferLimited } from '../lib/integrationRuntime'
import {
  decryptOrganizationCredentialSlot,
  markOrganizationCredentialError,
  revokeOrganizationCredential,
  upsertOrganizationCredential,
} from './organizationCredentials.service'
import {
  capabilitiesFor,
  connectorOf as anyConnectorOf,
  getWebsiteConnection,
  scriptInstall,
  type WebsiteConnectionMode,
  type WordPressConnectorState,
} from './websiteConnections.service'

/**
 * Conector de WordPress. Habla con la API REST nativa (`wp/v2`) autenticada
 * con una contraseña de aplicación del usuario (WordPress ≥ 5.6, sin plugin)
 * y, cuando está instalado, con el plugin Vendrava Connect (`vendrava/v1`)
 * que añade lo que el núcleo no expone: metadatos SEO por página y la
 * instalación del script universal sin tocar el tema.
 *
 * La credencial se guarda cifrada en OrganizationIntegrationCredential con
 * provider `wordpress` y un slot por conexión web.
 */

export const WORDPRESS_PROVIDER = 'wordpress'
export const VENDRAVA_PLUGIN_NAMESPACE = 'vendrava/v1'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 4_000_000
const MAX_PAGES = 100

export class WordPressConnectorError extends Error {
  status: number
  code: string
  constructor(code: string, status = 400, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

export type WordPressAuth = { restBase: string; username: string; applicationPassword: string }
export type WordPressContentType = 'pages' | 'posts'

export type WordPressPage = {
  id: number
  type: WordPressContentType
  title: string
  slug: string
  link: string
  status: string
  modified: string | null
  excerpt?: string
  content?: string
  seo: { title: string | null; description: string | null; source: string | null } | null
}

type WpUser = { id: number; name?: string; slug?: string; capabilities?: Record<string, boolean> }
type PluginStatus = {
  version?: string
  wp_version?: string
  seo_plugin?: string | null
  site_key_set?: boolean
  script_enabled?: boolean
}

function connectorOf(connection: { detection?: unknown } | null | undefined): WordPressConnectorState | null {
  const connector = anyConnectorOf(connection)
  return connector?.kind === 'wordpress' ? connector : null
}

/* ── Red ──────────────────────────────────────────────────────────────── */

function privateAddress(address: string): boolean {
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

/** Misma barrera SSRF que la auditoría web, con la excepción explícita de
 * desarrollo (ALLOW_PRIVATE_INTEGRATION_NETWORKS) para un WordPress local. */
async function assertSafeWordPressUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new WordPressConnectorError('WORDPRESS_URL_INVALID', 400)
  if (process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS === 'true') return
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new WordPressConnectorError('WORDPRESS_URL_BLOCKED', 400)
  }
  if (isIP(host)) {
    if (privateAddress(host)) throw new WordPressConnectorError('WORDPRESS_URL_BLOCKED', 400)
    return
  }
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length || addresses.some(entry => privateAddress(entry.address))) throw new WordPressConnectorError('WORDPRESS_URL_BLOCKED', 400)
}

function basicAuth(auth: WordPressAuth): string {
  // WordPress muestra la contraseña con espacios cada 4 caracteres; los ignora al validar.
  const password = auth.applicationPassword.replace(/\s+/g, '')
  return `Basic ${Buffer.from(`${auth.username}:${password}`, 'utf8').toString('base64')}`
}

function joinRest(restBase: string, path: string): URL {
  const base = restBase.endsWith('/') ? restBase : `${restBase}/`
  const clean = path.replace(/^\/+/, '')
  // Sitios sin enlaces permanentes: la ruta va en ?rest_route=/...
  if (base.includes('rest_route=')) {
    const url = new URL(base)
    const [routePath, routeQuery] = clean.split('?')
    url.searchParams.set('rest_route', `/${routePath}`)
    if (routeQuery) for (const [key, value] of new URLSearchParams(routeQuery)) url.searchParams.set(key, value)
    return url
  }
  return new URL(clean, base)
}

export async function wordPressRequest<T = unknown>(
  auth: WordPressAuth | null,
  restBase: string,
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<{ status: number; data: T | null; raw: string }> {
  const url = joinRest(restBase, path)
  await assertSafeWordPressUrl(url)
  const controller = new AbortController()
  const timeoutMs = init.timeoutMs ?? REQUEST_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Vendrava-Connector/1.0 (+https://vendrava.com)',
    }
    if (auth) headers.Authorization = basicAuth(auth)
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Nunca seguimos redirecciones con credenciales: un salto a otro host
      // filtraría la contraseña de aplicación.
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 300 && response.status < 400) throw new WordPressConnectorError('WORDPRESS_REDIRECT_BLOCKED', 502)
    const raw = (await readResponseBufferLimited(response, MAX_BODY_BYTES, timeoutMs)).toString('utf8')
    let data: T | null = null
    if (raw.trim()) {
      try {
        data = JSON.parse(raw) as T
      } catch {
        data = null
      }
    }
    return { status: response.status, data, raw }
  } catch (error) {
    if (error instanceof WordPressConnectorError) throw error
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new WordPressConnectorError(aborted ? 'WORDPRESS_TIMEOUT' : 'WORDPRESS_UNREACHABLE', 502)
  } finally {
    clearTimeout(timer)
  }
}

function wpErrorCode(data: unknown): string | null {
  return data && typeof data === 'object' && typeof (data as { code?: unknown }).code === 'string' ? (data as { code: string }).code : null
}

/* ── Descubrimiento ───────────────────────────────────────────────────── */

/** Localiza la raíz REST: primero /wp-json/, si no, ?rest_route=/ (sin permalinks). */
export async function resolveRestBase(websiteUrl: string): Promise<string> {
  const origin = new URL(websiteUrl)
  const candidates = [
    new URL('/wp-json/', origin).toString(),
    `${origin.origin}/?rest_route=/`,
  ]
  for (const candidate of candidates) {
    try {
      const result = await wordPressRequest<{ namespaces?: string[] }>(null, candidate, '', { timeoutMs: 10_000 })
      if (result.status === 200 && Array.isArray(result.data?.namespaces)) return candidate
    } catch (error) {
      if (error instanceof WordPressConnectorError && error.code.startsWith('WORDPRESS_URL')) throw error
    }
  }
  throw new WordPressConnectorError('WORDPRESS_REST_UNAVAILABLE', 422)
}

async function fetchCurrentUser(auth: WordPressAuth): Promise<WpUser> {
  const result = await wordPressRequest<WpUser & { code?: string }>(auth, auth.restBase, 'wp/v2/users/me?context=edit')
  if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
  if (result.status !== 200 || !result.data || typeof result.data.id !== 'number') {
    throw new WordPressConnectorError(wpErrorCode(result.data) === 'rest_no_route' ? 'WORDPRESS_REST_UNAVAILABLE' : 'WORDPRESS_UNEXPECTED_RESPONSE', 502)
  }
  return result.data
}

async function fetchPluginStatus(auth: WordPressAuth): Promise<PluginStatus | null> {
  const result = await wordPressRequest<PluginStatus>(auth, auth.restBase, `${VENDRAVA_PLUGIN_NAMESPACE}/status`)
  if (result.status !== 200 || !result.data || typeof result.data !== 'object') return null
  return result.data
}

function connectorState(input: { user: WpUser; plugin: PluginStatus | null; restBase: string; previous?: WordPressConnectorState | null }): WordPressConnectorState {
  const caps = input.user.capabilities ?? {}
  return {
    kind: 'wordpress',
    canEdit: caps.edit_pages === true || caps.edit_posts === true || caps.edit_others_pages === true,
    plugin: Boolean(input.plugin),
    pluginVersion: input.plugin?.version ?? null,
    seoPlugin: input.plugin?.seo_plugin ?? null,
    username: input.user.slug ?? input.user.name ?? null,
    wpVersion: input.plugin?.wp_version ?? null,
    restBase: input.restBase,
    scriptInstalled: input.plugin ? Boolean(input.plugin.site_key_set && input.plugin.script_enabled) : Boolean(input.previous?.scriptInstalled),
    verifiedAt: new Date().toISOString(),
  }
}

async function persistConnector(connectionId: string, connector: WordPressConnectorState | null, extra: { status?: string; connectionMode?: WebsiteConnectionMode } = {}) {
  const current = await prisma.websiteConnection.findUnique({ where: { id: connectionId } })
  if (!current) throw new WordPressConnectorError('WEB_CONNECTION_NOT_FOUND', 404)
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

async function loadConnection(orgId: string, connectionId: string) {
  const connection = await prisma.websiteConnection.findFirst({ where: { id: connectionId, orgId } })
  if (!connection) throw new WordPressConnectorError('WEB_CONNECTION_NOT_FOUND', 404)
  return connection
}

async function loadAuth(orgId: string, connectionId: string): Promise<WordPressAuth> {
  const fields = await decryptOrganizationCredentialSlot(orgId, WORDPRESS_PROVIDER, connectionId)
  if (!fields?.username || !fields.applicationPassword || !fields.restBase) throw new WordPressConnectorError('WORDPRESS_NOT_CONNECTED', 409)
  return { username: fields.username, applicationPassword: fields.applicationPassword, restBase: fields.restBase }
}

/* ── Conexión ─────────────────────────────────────────────────────────── */

export async function connectWordPress(params: {
  orgId: string
  connectionId: string
  username: string
  applicationPassword: string
  actorUserId?: string | null
  correlationId?: string
}) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const restBase = await resolveRestBase(connection.websiteUrl)
  const auth: WordPressAuth = { restBase, username: params.username.trim(), applicationPassword: params.applicationPassword.trim() }
  const user = await fetchCurrentUser(auth)
  const plugin = await fetchPluginStatus(auth)
  const connector = connectorState({ user, plugin, restBase, previous: connectorOf(connection) })
  if (!connector.canEdit) throw new WordPressConnectorError('WORDPRESS_INSUFFICIENT_ROLE', 403)

  await upsertOrganizationCredential(params.orgId, {
    provider: WORDPRESS_PROVIDER,
    slot: connection.id,
    secrets: { username: auth.username, applicationPassword: auth.applicationPassword, restBase },
    metadata: { domain: connection.domain, wpUserId: user.id },
    scopes: ['edit_pages', ...(plugin ? ['vendrava_plugin'] : [])],
  })
  await persistConnector(connection.id, connector, { status: 'connected', connectionMode: plugin ? 'plugin' : 'api' })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.wordpress.connect',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    after: { username: connector.username, plugin: connector.plugin, seoPlugin: connector.seoPlugin },
    correlationId: params.correlationId,
  })
  return getWebsiteConnection(params.orgId, connection.id)
}

/** Vuelve a comprobar credencial y plugin. Si la credencial ya no vale, la
 * conexión pasa a `degraded` en vez de fingir que sigue conectada. */
export async function verifyWordPress(params: { orgId: string; connectionId: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const auth = await loadAuth(params.orgId, connection.id)
  try {
    const user = await fetchCurrentUser(auth)
    const plugin = await fetchPluginStatus(auth)
    const connector = connectorState({ user, plugin, restBase: auth.restBase, previous: connectorOf(connection) })
    await persistConnector(connection.id, connector, { status: 'connected', connectionMode: plugin ? 'plugin' : 'api' })
  } catch (error) {
    if (error instanceof WordPressConnectorError && error.code === 'WORDPRESS_AUTH_FAILED') {
      await markOrganizationCredentialError(params.orgId, WORDPRESS_PROVIDER, error, connection.id)
      const previous = connectorOf(connection)
      await persistConnector(connection.id, previous ? { ...previous, canEdit: false, verifiedAt: new Date().toISOString() } : null, { status: 'degraded' })
    }
    throw error
  }
  return getWebsiteConnection(params.orgId, connection.id)
}

export async function disconnectWordPress(params: { orgId: string; connectionId: string; actorUserId?: string | null; correlationId?: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  await revokeOrganizationCredential(params.orgId, WORDPRESS_PROVIDER, connection.id).catch(() => undefined)
  await persistConnector(connection.id, null, {
    status: connection.lastEventAt ? 'connected' : 'setup_required',
    connectionMode: 'script',
  })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.wordpress.disconnect',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    correlationId: params.correlationId,
  })
  return getWebsiteConnection(params.orgId, connection.id)
}

/* ── Contenido ────────────────────────────────────────────────────────── */

type WpRendered = { rendered?: string; raw?: string }
type WpPageRow = { id: number; type?: string; title?: WpRendered; slug?: string; link?: string; status?: string; modified?: string; excerpt?: WpRendered; content?: WpRendered }
type PluginSeoRow = { id: number; title: string | null; description: string | null; source: string | null }

function textOf(value: WpRendered | undefined): string {
  if (!value) return ''
  if (typeof value.raw === 'string') return value.raw
  return (value.rendered ?? '').replace(/<[^>]+>/g, '').trim()
}

function normalizeType(value: unknown): WordPressContentType {
  return value === 'posts' || value === 'post' ? 'posts' : 'pages'
}

function toPage(row: WpPageRow, type: WordPressContentType, seo: PluginSeoRow | null, withBody: boolean): WordPressPage {
  return {
    id: row.id,
    type,
    title: textOf(row.title),
    slug: row.slug ?? '',
    link: row.link ?? '',
    status: row.status ?? 'publish',
    modified: row.modified ?? null,
    ...(withBody ? { excerpt: textOf(row.excerpt), content: row.content?.raw ?? row.content?.rendered ?? '' } : {}),
    seo: seo ? { title: seo.title ?? null, description: seo.description ?? null, source: seo.source ?? null } : null,
  }
}

async function fetchPluginSeo(auth: WordPressAuth, ids: number[]): Promise<Map<number, PluginSeoRow>> {
  const map = new Map<number, PluginSeoRow>()
  if (!ids.length) return map
  const result = await wordPressRequest<{ items?: PluginSeoRow[] } | PluginSeoRow[]>(auth, auth.restBase, `${VENDRAVA_PLUGIN_NAMESPACE}/seo?ids=${ids.join(',')}`)
  if (result.status !== 200 || !result.data) return map
  const rows = Array.isArray(result.data) ? result.data : Array.isArray(result.data.items) ? result.data.items : []
  for (const row of rows) if (row && typeof row.id === 'number') map.set(row.id, row)
  return map
}

export async function listWordPressPages(params: { orgId: string; connectionId: string; type?: string; search?: string }): Promise<{ items: WordPressPage[]; plugin: boolean }> {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const auth = await loadAuth(params.orgId, connection.id)
  const connector = connectorOf(connection)
  const type = normalizeType(params.type)
  const query = new URLSearchParams({
    per_page: String(MAX_PAGES),
    context: 'edit',
    status: 'publish,draft,pending,private',
    orderby: 'modified',
    order: 'desc',
    _fields: 'id,type,title,slug,link,status,modified',
  })
  if (params.search?.trim()) query.set('search', params.search.trim().slice(0, 120))
  const result = await wordPressRequest<WpPageRow[]>(auth, auth.restBase, `wp/v2/${type}?${query.toString()}`)
  if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
  if (result.status !== 200 || !Array.isArray(result.data)) throw new WordPressConnectorError('WORDPRESS_UNEXPECTED_RESPONSE', 502)
  const rows = result.data.filter(row => row && typeof row.id === 'number')
  const seo = connector?.plugin ? await fetchPluginSeo(auth, rows.map(row => row.id)).catch(() => new Map<number, PluginSeoRow>()) : new Map<number, PluginSeoRow>()
  return { items: rows.map(row => toPage(row, type, seo.get(row.id) ?? null, false)), plugin: Boolean(connector?.plugin) }
}

async function fetchPage(auth: WordPressAuth, type: WordPressContentType, id: number, plugin: boolean): Promise<WordPressPage> {
  const result = await wordPressRequest<WpPageRow>(auth, auth.restBase, `wp/v2/${type}/${id}?context=edit&_fields=id,type,title,slug,link,status,modified,excerpt,content`)
  if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
  if (result.status === 404) throw new WordPressConnectorError('WORDPRESS_PAGE_NOT_FOUND', 404)
  if (result.status !== 200 || !result.data || typeof result.data.id !== 'number') throw new WordPressConnectorError('WORDPRESS_UNEXPECTED_RESPONSE', 502)
  const seo = plugin ? (await fetchPluginSeo(auth, [id]).catch(() => new Map<number, PluginSeoRow>())).get(id) ?? null : null
  return toPage(result.data, type, seo, true)
}

export async function getWordPressPage(params: { orgId: string; connectionId: string; pageId: number; type?: string }): Promise<WordPressPage> {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const auth = await loadAuth(params.orgId, connection.id)
  return fetchPage(auth, normalizeType(params.type), params.pageId, Boolean(connectorOf(connection)?.plugin))
}

export type WordPressPageUpdate = {
  type?: string
  title?: string
  content?: string
  excerpt?: string
  seoTitle?: string | null
  metaDescription?: string | null
}

/**
 * Escribe en la web del cliente. Título, contenido y extracto van por la API
 * nativa; título SEO y meta description exigen el plugin porque el núcleo de
 * WordPress no expone los metadatos de Yoast/Rank Math/AIOSEO por REST.
 * Antes/después quedan en AuditLog para poder deshacer a mano.
 */
export async function updateWordPressPage(params: {
  orgId: string
  connectionId: string
  pageId: number
  changes: WordPressPageUpdate
  actorUserId?: string | null
  correlationId?: string
}): Promise<WordPressPage> {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const connector = connectorOf(connection)
  if (!connector?.canEdit) throw new WordPressConnectorError('WORDPRESS_NOT_CONNECTED', 409)
  const auth = await loadAuth(params.orgId, connection.id)
  const type = normalizeType(params.changes.type)
  const wantsSeo = params.changes.seoTitle !== undefined || params.changes.metaDescription !== undefined
  if (wantsSeo && !connector.plugin) throw new WordPressConnectorError('WORDPRESS_SEO_REQUIRES_PLUGIN', 409)

  const before = await fetchPage(auth, type, params.pageId, connector.plugin)

  const coreBody: Record<string, string> = {}
  if (typeof params.changes.title === 'string') coreBody.title = params.changes.title
  if (typeof params.changes.content === 'string') coreBody.content = params.changes.content
  if (typeof params.changes.excerpt === 'string') coreBody.excerpt = params.changes.excerpt
  if (Object.keys(coreBody).length) {
    const result = await wordPressRequest<WpPageRow>(auth, auth.restBase, `wp/v2/${type}/${params.pageId}`, { method: 'POST', body: coreBody })
    if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
    if (result.status !== 200) throw new WordPressConnectorError('WORDPRESS_UPDATE_FAILED', 502, wpErrorCode(result.data) ?? undefined)
  }
  if (wantsSeo) {
    const body: Record<string, string | null> = {}
    if (params.changes.seoTitle !== undefined) body.title = params.changes.seoTitle
    if (params.changes.metaDescription !== undefined) body.description = params.changes.metaDescription
    const result = await wordPressRequest<PluginSeoRow>(auth, auth.restBase, `${VENDRAVA_PLUGIN_NAMESPACE}/seo/${params.pageId}`, { method: 'POST', body })
    if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
    if (result.status !== 200) throw new WordPressConnectorError('WORDPRESS_SEO_UPDATE_FAILED', 502, wpErrorCode(result.data) ?? undefined)
  }

  const after = await fetchPage(auth, type, params.pageId, connector.plugin)
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.wordpress.page.update',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    before: { pageId: before.id, type, title: before.title, excerpt: before.excerpt, seo: before.seo, contentLength: before.content?.length ?? 0 },
    after: { pageId: after.id, type, title: after.title, excerpt: after.excerpt, seo: after.seo, contentLength: after.content?.length ?? 0, changed: Object.keys(params.changes).filter(key => key !== 'type') },
    correlationId: params.correlationId,
  })
  return after
}

/** Con el plugin activo, deja el script universal instalado en el <head>
 * del sitio sin que el cliente pegue nada a mano. */
export async function installWordPressTracking(params: { orgId: string; connectionId: string; actorUserId?: string | null; correlationId?: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const connector = connectorOf(connection)
  if (!connector?.canEdit) throw new WordPressConnectorError('WORDPRESS_NOT_CONNECTED', 409)
  if (!connector.plugin) throw new WordPressConnectorError('WORDPRESS_SCRIPT_REQUIRES_PLUGIN', 409)
  const auth = await loadAuth(params.orgId, connection.id)
  const install = scriptInstall(connection.siteKey)
  const result = await wordPressRequest<PluginStatus>(auth, auth.restBase, `${VENDRAVA_PLUGIN_NAMESPACE}/settings`, {
    method: 'POST',
    body: { site_key: connection.siteKey, endpoint: install.eventUrl, script_url: install.scriptUrl, enabled: true },
  })
  if (result.status === 401 || result.status === 403) throw new WordPressConnectorError('WORDPRESS_AUTH_FAILED', 401)
  if (result.status !== 200) throw new WordPressConnectorError('WORDPRESS_SETTINGS_FAILED', 502, wpErrorCode(result.data) ?? undefined)
  await persistConnector(connection.id, { ...connector, scriptInstalled: true, verifiedAt: new Date().toISOString() }, {
    status: connection.status === 'setup_required' ? 'verification_pending' : connection.status,
  })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.wordpress.script.install',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    after: { scriptUrl: install.scriptUrl, endpoint: install.eventUrl },
    correlationId: params.correlationId,
  })
  return getWebsiteConnection(params.orgId, connection.id)
}

export const WORDPRESS_ERROR_MESSAGES: Record<string, string> = {
  WEB_CONNECTION_NOT_FOUND: 'Conexión web no encontrada.',
  WORDPRESS_URL_INVALID: 'La URL de la web no es válida.',
  WORDPRESS_URL_BLOCKED: 'La web apunta a una red privada y no se puede conectar.',
  WORDPRESS_REST_UNAVAILABLE: 'No encontramos la API REST de WordPress en esa web. Comprueba que no esté desactivada por un plugin de seguridad.',
  WORDPRESS_AUTH_FAILED: 'WordPress rechazó el usuario o la contraseña de aplicación.',
  WORDPRESS_INSUFFICIENT_ROLE: 'El usuario no puede editar páginas. Usa un usuario Editor o Administrador.',
  WORDPRESS_NOT_CONNECTED: 'Esta web no tiene WordPress conectado todavía.',
  WORDPRESS_SEO_REQUIRES_PLUGIN: 'Para editar título SEO y meta description hace falta el plugin Vendrava Connect en WordPress.',
  WORDPRESS_SCRIPT_REQUIRES_PLUGIN: 'Para instalar el script automáticamente hace falta el plugin Vendrava Connect. Sin él, pega el snippet en el tema.',
  WORDPRESS_PAGE_NOT_FOUND: 'La página ya no existe en WordPress.',
  WORDPRESS_UPDATE_FAILED: 'WordPress no aceptó el cambio.',
  WORDPRESS_SEO_UPDATE_FAILED: 'El plugin no pudo guardar los metadatos SEO.',
  WORDPRESS_SETTINGS_FAILED: 'El plugin no pudo guardar la configuración del script.',
  WORDPRESS_REDIRECT_BLOCKED: 'La web redirige a otra dirección. Conecta la URL final.',
  WORDPRESS_TIMEOUT: 'WordPress tardó demasiado en responder.',
  WORDPRESS_UNREACHABLE: 'No se pudo contactar con WordPress.',
  WORDPRESS_UNEXPECTED_RESPONSE: 'WordPress devolvió una respuesta inesperada.',
}
