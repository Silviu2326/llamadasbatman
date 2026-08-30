import type { PostCampaignAttribution } from './socialTypes'
import {
  fetchWithTimeout,
  getOrganizationIntegrationOverride,
  integrationCredentialScope,
  redactProviderError,
  responseErrorCode,
} from '../lib/integrationRuntime'
import { resolveOrganizationCredentialConfig } from './organizationCredentials.service'
import { checkAssetsConsentForPublication } from './consent.service'
import { emitOutcome } from './outcomes.service'

const DEFAULT_BASE_URL = 'https://app.metricool.com/api'
const DEFAULT_TIMEZONE = 'Europe/Madrid'

type MetricoolConfig = {
  baseUrl: string
  token: string
  userId: string
  blogId: string
  timezone: string
}

type MetricoolDate = { dateTime: string; timezone: string }

function overrideString(override: Record<string, unknown> | null, key: string): string | undefined {
  const value = override?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function getConfig(orgId?: string): Promise<MetricoolConfig | null> {
  const resolved = orgId ? await resolveOrganizationCredentialConfig(orgId, 'metricool') : null
  const override = resolved?.config ?? (orgId ? null : getOrganizationIntegrationOverride('metricool', undefined))
  const token = overrideString(override, 'userToken') || (!orgId ? process.env.METRICOOL_USER_TOKEN : undefined)
  const userId = overrideString(override, 'userId') || (!orgId ? process.env.METRICOOL_USER_ID : undefined)
  const blogId = overrideString(override, 'blogId') || (!orgId ? process.env.METRICOOL_BLOG_ID : undefined)
  if (!token || !userId || !blogId) return null
  return {
    baseUrl: (overrideString(override, 'baseUrl') || (!orgId ? process.env.METRICOOL_BASE_URL : undefined) || DEFAULT_BASE_URL).replace(/\/$/, ''),
    token,
    userId,
    blogId,
    timezone: overrideString(override, 'timezone') || (!orgId ? process.env.METRICOOL_TIMEZONE : undefined) || DEFAULT_TIMEZONE,
  }
}

/** Legacy synchronous check retained for workers that have no org context. */
export function isConfigured(orgId?: string): boolean {
  const override = getOrganizationIntegrationOverride('metricool', orgId)
  return Boolean(
    (overrideString(override, 'userToken') || (!orgId ? process.env.METRICOOL_USER_TOKEN : undefined))
    && (overrideString(override, 'userId') || (!orgId ? process.env.METRICOOL_USER_ID : undefined))
    && (overrideString(override, 'blogId') || (!orgId ? process.env.METRICOOL_BLOG_ID : undefined)),
  )
}

export async function isConfiguredForOrg(orgId: string): Promise<boolean> {
  return Boolean(await getConfig(orgId))
}

export async function connectionMetadata(orgId?: string) {
  return {
    provider: 'metricool',
    configured: await isConfiguredForOrg(orgId ?? ''),
    credentialScope: integrationCredentialScope('metricool', orgId),
    auth: {
      mode: 'user_token',
      oauthCallback: null,
      refreshSupported: false,
      revokeSupported: 'provider_dashboard',
      scopes: ['profiles:read', 'analytics:read', 'posts:write'],
    },
    note: 'Metricool no expone aquí OAuth ni refresh automático; la revocación se realiza rotando el user token en Metricool.',
  } as const
}

export function appUrl(): string {
  return process.env.METRICOOL_APP_URL || 'https://app.metricool.com'
}

export function hasPublicFrontendUrl(): boolean {
  const raw = process.env.FRONTEND_URL || process.env.APP_URL
  if (!raw) return false
  try {
    const url = new URL(raw)
    return !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function normalizedPlatform(platform: string): string {
  const value = platform.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (value === 'x' || value === 'twitter_x') return 'twitter'
  return value || 'facebook'
}

export function buildAttributedLandingUrl(attribution: PostCampaignAttribution, platform: string): string {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL
  if (!baseUrl || !hasPublicFrontendUrl()) throw new Error('APP_URL o FRONTEND_URL pública no configurada')
  const source = normalizedPlatform(platform)
  const url = new URL(`/l/${encodeURIComponent(attribution.landingSlug)}`, baseUrl)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', 'organic_social')
  url.searchParams.set('utm_campaign', attribution.campaignId)
  url.searchParams.set('utm_content', attribution.utmContent ?? `${source}_metricool`)
  return url.toString()
}

function withConfig(path: string, config: MetricoolConfig): URL {
  const url = new URL(`${config.baseUrl}${path}`)
  url.searchParams.set('userId', config.userId)
  url.searchParams.set('blogId', config.blogId)
  return url
}

async function metricoolFetch(path: string, init: RequestInit = {}, orgId?: string): Promise<Response | null> {
  const config = await getConfig(orgId)
  if (!config) return null
  try {
    const response = await fetchWithTimeout(withConfig(path, config), {
      ...init,
      headers: {
        ...init.headers,
        'X-Mc-Auth': config.token,
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) console.warn(`[MetricoolSync] provider request failed (${response.status}):`, await responseErrorCode(response))
    return response
  } catch (error) {
    console.warn('[MetricoolSync] request failed:', redactProviderError(error))
    return null
  }
}

function responseData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const record = payload as { data?: unknown }
  return record.data ?? payload
}

export async function listProfiles(orgId?: string): Promise<unknown[]> {
  const res = await metricoolFetch('/admin/simpleProfiles', {}, orgId)
  if (!res?.ok) return []
  const data = responseData(await res.json().catch(() => null))
  return Array.isArray(data) ? data : []
}

export async function getAnalytics(orgId?: string): Promise<Record<string, unknown> | null> {
  if (!(await isConfiguredForOrg(orgId ?? ''))) return null
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const from = start.toISOString()
  const networks = ['facebook', 'instagram', 'linkedin', 'tiktok', 'twitter', 'youtube']
  const entries = await Promise.all(networks.map(async network => {
    const res = await metricoolFetch(`/v2/analytics/posts/${network}?from=${encodeURIComponent(from)}`, {}, orgId)
    if (!res?.ok) return [network, null] as const
    return [network, responseData(await res.json().catch(() => null))] as const
  }))
  return Object.fromEntries(entries.filter(([, value]) => value !== null))
}

function publicationDate(value?: string, timezone = process.env.METRICOOL_TIMEZONE || DEFAULT_TIMEZONE): MetricoolDate {
  const date = value?.trim()
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { dateTime: `${date}T09:00:00`, timezone }
  }
  if (date && !Number.isNaN(new Date(date).getTime())) {
    return { dateTime: new Date(date).toISOString().slice(0, 19), timezone }
  }
  const fallback = new Date(Date.now() + 60 * 60 * 1000)
  return { dateTime: fallback.toISOString().slice(0, 19), timezone }
}

async function normalizeMedia(url: string, orgId?: string): Promise<string> {
  const res = await metricoolFetch(`/actions/normalize/image/url?url=${encodeURIComponent(url)}`, {}, orgId)
  if (!res?.ok) throw new Error('Metricool no pudo procesar el recurso multimedia')
  const payload = responseData(await res.json().catch(() => null))
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const item = payload as { url?: unknown; mediaId?: unknown; id?: unknown }
    if (typeof item.mediaId === 'string') return item.mediaId
    if (typeof item.url === 'string') return item.url
    if (typeof item.id === 'string') return item.id
  }
  return url
}

function appendLandingCta(text: string, cta: string | undefined, landingUrl: string): string {
  return `${text.trim()}\n\n${cta?.trim() || 'Descubre más'}\n${landingUrl}`
}

export async function createDraftPost(
  content: {
    text: string
    imageUrl?: string
    platforms: string[]
    attribution: PostCampaignAttribution
    scheduledAt?: string
    /**
     * Tipo de publicación en Instagram. Las stories de la fase 2 (idea 8) no
     * son posts: van al mismo endpoint pero con `type: 'STORY'`.
     *
     * ponytail: el valor 'STORY' sigue la nomenclatura del resto del payload de
     * Metricool pero **no se ha verificado contra la API real** — si la cuenta
     * conectada lo rechaza, el borrador falla con el motivo de Metricool y la
     * pieza se queda aprobada sin publicar, que es el camino degradado que ya
     * cubre `approveAndDraft`.
     */
    instagramType?: 'POST' | 'STORY' | 'REEL'
    /**
     * Assets de la pieza (imagen/audio), si el llamante los conoce. Solo se
     * usan para el guard de consentimiento de identidad (08-SEGURIDAD §2.3):
     * si su cadena (el asset o un antecesor) apunta a un ConsentGrant
     * revocado/caducado o fuera de alcance para los canales de destino, la
     * publicación se bloquea. Sin assets o sin consentGrantId en la cadena
     * (lo normal hoy) el comportamiento no cambia en nada.
     */
    imageAssetId?: string
    audioAssetId?: string
  },
  orgId?: string,
) {
  const config = await getConfig(orgId)
  if (!config) return null
  // Guard de publicación (08 §2.3): un consentimiento revocado no sale a redes.
  const guardedAssetIds = [content.imageAssetId, content.audioAssetId].filter((id): id is string => Boolean(id))
  if (orgId && guardedAssetIds.length) {
    const consent = await checkAssetsConsentForPublication({ orgId, assetIds: guardedAssetIds, channels: content.platforms.map(normalizedPlatform) })
    if (!consent.valid) {
      throw new Error(`Publicación bloqueada por consentimiento de identidad${consent.subjectName ? ` de «${consent.subjectName}»` : ''}: ${consent.reason ?? 'consentimiento no válido'}`)
    }
  }
  // Publicación desatendida. Por defecto la pieza aterriza como borrador y una
  // persona le da a publicar en Metricool; con METRICOOL_AUTO_PUBLISH=true sale
  // sola en la fecha programada, sin lectura humana.
  // ponytail: un interruptor global — si algún día hace falta por cliente, el
  // sitio es `getConfig`, que ya resuelve por organización.
  const live = process.env.METRICOOL_AUTO_PUBLISH === 'true'
  const date = publicationDate(content.scheduledAt, config.timezone)
  const media = content.imageUrl ? [await normalizeMedia(content.imageUrl, orgId)] : []
  const posts = await Promise.all(content.platforms.map(async platform => {
    const network = normalizedPlatform(platform)
    const landingUrl = buildAttributedLandingUrl(content.attribution, platform)
    const payload = {
      autoPublish: live,
      draft: !live,
      media,
      mediaAltText: [],
      providers: [{ network }],
      publicationDate: date,
      shortener: false,
      smartLinkData: { ids: [] },
      text: appendLandingCta(content.text, content.attribution.cta, landingUrl),
      ...(network === 'facebook' ? { facebookData: {} } : {}),
      ...(network === 'instagram' ? { instagramData: { type: content.instagramType ?? 'POST', showReelOnFeed: true } } : {}),
      ...(network === 'linkedin' ? { linkedinData: { type: 'post', previewIncluded: true } } : {}),
      ...(network === 'twitter' ? { twitterData: { tags: [] } } : {}),
      ...(network === 'tiktok' ? { tiktokData: { autoAddMusic: false } } : {}),
      ...(network === 'youtube' ? { youtubeData: { type: 'video', privacy: 'public', madeForKids: false } } : {}),
    }
    const res = await metricoolFetch('/v2/scheduler/posts?integrationSource=crm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, orgId)
    if (!res?.ok) return null
    return responseData(await res.json().catch(() => null))
  }))
  if (posts.some(post => !post)) return null
  // North star (09 §5): una pieza que llega a redes es un resultado. Nunca
  // lanza, y solo se emite con org conocida (el modo legacy por env no la tiene).
  if (orgId) {
    await emitOutcome({
      orgId,
      kind: 'asset_published',
      sourceRef: { campaignId: content.attribution.campaignId, platforms: content.platforms, utmContent: content.attribution.utmContent ?? null },
    })
  }
  return posts.length === 1 ? posts[0] : { campaignId: content.attribution.campaignId, posts }
}
