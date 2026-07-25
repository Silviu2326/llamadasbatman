import { prisma } from '../lib/prisma'
import type { PostCampaignAttribution } from './socialTypes'
export type { PostCampaignAttribution } from './socialTypes'
import {
  fetchWithTimeout,
  getOrganizationIntegrationOverride,
  integrationCredentialScope,
  redactProviderError,
  responseErrorCode,
  validatePublicBaseUrl,
} from '../lib/integrationRuntime'
import { resolveOrganizationCredentialConfig } from './organizationCredentials.service'
import {
  buildPostizDraftPayload,
  normalizePostizIdentifier,
  type PostizIntegrationDescriptor,
  type PostizMedia,
} from './postizPayload'

/**
 * Postiz Public API integration.
 *
 * Postiz does not expose a Vendrava-owned workspace resource here. The API
 * operates on the integrations/channels belonging to the API key or OAuth
 * token. Consequently this adapter never creates or fabricates a workspace
 * id; the legacy workspace argument is retained only for source compatibility
 * with older callers and is ignored by Public API calls.
 */

type PostizConfig = { baseUrl: string; apiKey: string }

function overrideString(override: Record<string, unknown> | null, key: string): string | undefined {
  const value = override?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function postizApiBase(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return null
  const withApiPath = /\/public\/v1$/i.test(trimmed)
    ? trimmed
    : /\/public$/i.test(trimmed) ? `${trimmed}/v1` : `${trimmed}/public/v1`
  return validatePublicBaseUrl('POSTIZ_BASE_URL', withApiPath) ? null : withApiPath
}

export function normalizePostizApiBase(raw: string): string | null {
  return postizApiBase(raw)
}

async function config(orgId?: string): Promise<PostizConfig | null> {
  const resolved = orgId ? await resolveOrganizationCredentialConfig(orgId, 'postiz') : null
  const override = resolved?.config ?? (orgId ? null : getOrganizationIntegrationOverride('postiz', undefined))
  const baseRaw = overrideString(override, 'baseUrl') || (!orgId ? process.env.POSTIZ_BASE_URL : undefined)
  const apiKey = overrideString(override, 'apiKey') || (!orgId ? process.env.POSTIZ_API_KEY : undefined)
  const baseUrl = baseRaw ? postizApiBase(baseRaw) : null
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey }
}

/** Legacy synchronous check retained for worker paths without org context. */
export function isConfigured(orgId?: string): boolean {
  const override = getOrganizationIntegrationOverride('postiz', orgId)
  const baseRaw = overrideString(override, 'baseUrl') || (!orgId ? process.env.POSTIZ_BASE_URL : undefined)
  const apiKey = overrideString(override, 'apiKey') || (!orgId ? process.env.POSTIZ_API_KEY : undefined)
  return Boolean(baseRaw && apiKey && postizApiBase(baseRaw))
}

export async function isConfiguredForOrg(orgId: string): Promise<boolean> {
  return Boolean(await config(orgId))
}

export async function connectionMetadata(orgId?: string) {
  return {
    provider: 'postiz',
    configured: await isConfiguredForOrg(orgId ?? ''),
    credentialScope: integrationCredentialScope('postiz', orgId),
    auth: {
      mode: 'api_key_or_oauth2',
      oauthCallback: null,
      refreshSupported: false,
      revokeSupported: 'provider_admin_or_postiz_user',
      scopes: [],
    },
    api: {
      basePath: '/public/v1',
      integrations: 'GET /public/v1/integrations',
      posts: 'POST /public/v1/posts',
      postTypes: ['draft', 'schedule', 'now'],
    },
    note: 'Postiz gestiona las conexiones OAuth de cada red y el token/API key delimita las integraciones visibles. No se crea ni se asume un workspace semántico de Vendrava.',
  } as const
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

export function buildAttributedLandingUrl(attribution: PostCampaignAttribution, platform: string): string {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL
  if (!baseUrl || !hasPublicFrontendUrl()) throw new Error('APP_URL o FRONTEND_URL pública no configurada')
  const source = normalizePostizIdentifier(platform) || 'social'
  const url = new URL(`/l/${encodeURIComponent(attribution.landingSlug)}`, baseUrl)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', 'organic_social')
  url.searchParams.set('utm_campaign', attribution.campaignId)
  url.searchParams.set('utm_content', `${source}_postiz`)
  return url.toString()
}

function appendLandingCta(text: string, cta: string | undefined, landingUrl: string): string {
  return `${text.trim()}\n\n${cta?.trim() || 'Descubre más'}\n${landingUrl}`
}

async function postizFetch(path: string, init: RequestInit = {}, orgId?: string): Promise<Response | null> {
  const provider = await config(orgId)
  if (!provider) return null
  try {
    const response = await fetchWithTimeout(`${provider.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        // Postiz Public API accepts the API key or pos_* OAuth token directly
        // in Authorization; do not invent a Bearer scheme for self-hosted.
        Authorization: provider.apiKey,
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) console.warn(`[PostizSync] provider request failed (${response.status}):`, await responseErrorCode(response))
    return response
  } catch (err) {
    console.warn('[PostizSync] request failed:', redactProviderError(err))
    return null
  }
}

/**
 * Compatibility read only: an old stored workspace id may still be returned,
 * but no workspace is created because that endpoint is not part of the Public
 * API contract.
 */
export async function ensureWorkspace(orgId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { postizWorkspaceId: true } })
  return org?.postizWorkspaceId ?? null
}

/** Public API has no workspace embed endpoint. Return null rather than a fake URL. */
export async function buildEmbedUrl(_workspaceId: string | undefined, orgId?: string): Promise<string | null> {
  if (!(await config(orgId))) throw new Error('Postiz no está configurado')
  return null
}

function asIntegrationList(value: unknown): PostizIntegrationDescriptor[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { integrations?: unknown }).integrations)
      ? (value as { integrations: unknown[] }).integrations
      : []
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) return []
    return [{
      id: candidate.id,
      ...(typeof candidate.identifier === 'string' ? { identifier: candidate.identifier } : {}),
      ...(typeof candidate.providerIdentifier === 'string' ? { providerIdentifier: candidate.providerIdentifier } : {}),
      ...(candidate.disabled === true ? { disabled: true } : {}),
    }]
  })
}

export async function listIntegrations(_workspaceId?: string, orgId?: string): Promise<PostizIntegrationDescriptor[]> {
  const res = await postizFetch('/integrations', {}, orgId)
  if (!res?.ok) return []
  return asIntegrationList(await res.json().catch(() => []))
}

export async function listPosts(_workspaceId?: string, orgId?: string, range: { startDate?: string; endDate?: string } = {}) {
  const endDate = range.endDate ?? new Date().toISOString()
  const startDate = range.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const query = new URLSearchParams({ startDate, endDate }).toString()
  const res = await postizFetch(`/posts?${query}`, {}, orgId)
  if (!res?.ok) return []
  return res.json().catch(() => [])
}

/** The Public API analytics path uses a real integration id, never a workspace id. */
export async function getAnalytics(integrationId: string | undefined, orgId?: string) {
  if (!integrationId) return null
  const res = await postizFetch(`/analytics/${encodeURIComponent(integrationId)}`, {}, orgId)
  if (!res?.ok) return null
  return res.json().catch(() => null)
}

async function uploadImageFromUrl(imageUrl: string, orgId?: string): Promise<PostizMedia[] | null> {
  const res = await postizFetch('/upload-from-url', {
    method: 'POST',
    body: JSON.stringify({ url: imageUrl }),
  }, orgId)
  if (!res?.ok) return null
  const data = await res.json().catch(() => null) as { id?: unknown; path?: unknown } | null
  if (!data || typeof data.id !== 'string' || typeof data.path !== 'string') return null
  return [{ id: data.id, path: data.path }]
}

/**
 * Creates one official Public API draft containing one `posts[]` item per
 * connected integration. `platforms` can be an integration id or identifier;
 * names are resolved against GET /integrations and never sent as fake ids.
 */
export async function createDraftPost(
  _workspaceId: string | undefined,
  content: { text: string; imageUrl?: string; platforms: string[]; attribution: PostCampaignAttribution },
  orgId?: string,
) {
  const integrations = await listIntegrations(undefined, orgId)
  if (!integrations.length) return null
  const image = content.imageUrl ? await uploadImageFromUrl(content.imageUrl, orgId) : []
  if (content.imageUrl && !image) return null
  const requestedPosts = content.platforms.map(platform => ({
    platform,
    content: appendLandingCta(content.text, content.attribution.cta, buildAttributedLandingUrl(content.attribution, platform)),
    image: image ?? [],
  }))
  const payload = buildPostizDraftPayload(integrations, requestedPosts, new Date())
  if (!payload) return null
  const res = await postizFetch('/posts', { method: 'POST', body: JSON.stringify(payload) }, orgId)
  if (!res?.ok) return null
  const result = await res.json().catch(() => null)
  return Array.isArray(result) && result.length > 1
    ? { campaignId: content.attribution.campaignId, posts: result }
    : result
}

