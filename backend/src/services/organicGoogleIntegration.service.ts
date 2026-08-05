import { createHash, randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { decryptOrganicToken, encryptOrganicToken } from '../lib/organicTokenCrypto'
import { ORGANIC_INTEGRATION_PROVIDERS, OrganicIntegrationProvider } from './organic.service'
import { resolveOrganizationCredentialConfig } from './organizationCredentials.service'
import { fetchWithTimeout } from '../lib/integrationRuntime'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SEARCH_CONSOLE_API = 'https://www.googleapis.com/webmasters/v3'
const GA4_ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const GBP_ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const GBP_INFORMATION_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const refreshInFlight = new Map<string, Promise<string>>()
const GOOGLE_GLOBAL_FALLBACK_FLAG = 'GOOGLE_ALLOW_GLOBAL_FALLBACK'

type ProviderConfig = { scopes: readonly string[]; label: string }
const PROVIDER_CONFIG: Record<OrganicIntegrationProvider, ProviderConfig> = {
  search_console: {
    label: 'Google Search Console',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  },
  ga4: {
    label: 'Google Analytics 4',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  },
  google_business_profile: {
    label: 'Google Business Profile',
    scopes: ['https://www.googleapis.com/auth/business.manage'],
  },
}

export type OrganicGoogleProvider = OrganicIntegrationProvider

export type SearchConsoleSyncInput = {
  startDate: string
  endDate: string
  rowLimit?: number
}

export class OrganicGoogleIntegrationError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode = 400) {
    super(message)
    this.name = 'OrganicGoogleIntegrationError'
    this.code = code
    this.statusCode = statusCode
  }
}

export function isOrganicGoogleProvider(value: unknown): value is OrganicGoogleProvider {
  return typeof value === 'string' && (ORGANIC_INTEGRATION_PROVIDERS as readonly string[]).includes(value)
}

export function requireOrganicGoogleProvider(value: unknown): OrganicGoogleProvider {
  if (!isOrganicGoogleProvider(value)) {
    throw new OrganicGoogleIntegrationError('invalid_provider', 'Proveedor Organic no válido')
  }
  return value
}

function providerConfig(provider: OrganicGoogleProvider) {
  return PROVIDER_CONFIG[provider]
}

/** Public contract used by readiness checks and pure tests; callers receive a copy. */
export function requiredGoogleScopes(rawProvider: string): string[] {
  const provider = requireOrganicGoogleProvider(rawProvider)
  return [...providerConfig(provider).scopes]
}

function hashState(state: string) {
  return createHash('sha256').update(state).digest('hex')
}

async function googleCredentials(orgId?: string) {
  let clientId: string | undefined
  let clientSecret: string | undefined

  if (orgId) {
    const resolved = await resolveOrganizationCredentialConfig(orgId, 'google')
    if (resolved) {
      clientId = typeof resolved.config.clientId === 'string' ? resolved.config.clientId.trim() : undefined
      clientSecret = typeof resolved.config.clientSecret === 'string' ? resolved.config.clientSecret.trim() : undefined
      // A malformed tenant record must not silently fall through to an app
      // global client, which could connect the wrong OAuth application.
    } else if (process.env[GOOGLE_GLOBAL_FALLBACK_FLAG] !== 'true') {
      throw new OrganicGoogleIntegrationError(
        'google_oauth_not_configured',
        'Configura las credenciales Google de la organización o habilita explícitamente GOOGLE_ALLOW_GLOBAL_FALLBACK',
        503,
      )
    }
  }

  if (!clientId && !clientSecret) {
    clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  }
  if (!clientId || !clientSecret) {
    throw new OrganicGoogleIntegrationError(
      'google_oauth_not_configured',
      'GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET deben configurarse',
      503,
    )
  }
  return { clientId, clientSecret }
}

/**
 * Env vars:
 * - GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET: credenciales Web de Google.
 * - GOOGLE_OAUTH_REDIRECT_BASE_URL: origen HTTPS público del backend; en local
 *   se permite http://localhost:3000. Se añade la ruta por proveedor.
 * - ORGANIC_TOKEN_ENCRYPTION_KEY: secreto aleatorio >=32 caracteres para tokens
 *   y verifiers PKCE. No reutilizar JWT_SECRET, OAUTH_STATE_SECRET ni claves Meta.
 */
export function googleCallbackUrl(provider: OrganicGoogleProvider): string {
  const raw = process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL?.trim()
    || process.env.PUBLIC_HOST?.trim()
    || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000')
  if (!raw) throw new OrganicGoogleIntegrationError('google_oauth_not_configured', 'GOOGLE_OAUTH_REDIRECT_BASE_URL debe configurarse', 503)

  const base = new URL(raw.includes('://') ? raw : `https://${raw}`)
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash) {
    throw new OrganicGoogleIntegrationError('invalid_google_redirect_base', 'La URL base OAuth de Google no es válida')
  }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new OrganicGoogleIntegrationError('insecure_google_redirect', 'OAuth de Google requiere HTTPS en producción', 503)
  }
  return new URL(`/api/organic/integrations/${provider}/oauth/callback`, base).toString()
}

function ensureProjectIntegration(orgId: string, projectId: string, provider: OrganicGoogleProvider) {
  return prisma.organicIntegration.upsert({
    where: { orgId_projectId_provider: { orgId, projectId, provider } },
    update: {},
    create: { orgId, projectId, provider },
  })
}

async function projectForOrg(orgId: string) {
  const project = await prisma.organicProject.findUnique({ where: { orgId } })
  if (!project) throw new OrganicGoogleIntegrationError('project_required', 'Configura primero el proyecto Organic Leads', 409)
  return project
}

async function integrationForOrg(orgId: string, provider: OrganicGoogleProvider) {
  const project = await projectForOrg(orgId)
  return { project, integration: await ensureProjectIntegration(orgId, project.id, provider) }
}

function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Creates a one-use opaque state and persists only its hash plus encrypted verifier. */
export async function buildOAuthStartUrl(
  orgId: string,
  userId: string,
  rawProvider: string,
): Promise<string> {
  const provider = requireOrganicGoogleProvider(rawProvider)
  const { clientId } = await googleCredentials(orgId)
  const project = await projectForOrg(orgId)
  const config = providerConfig(provider)
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(64).toString('base64url')

  await prisma.organicOAuthState.create({
    data: {
      orgId,
      projectId: project.id,
      createdByUserId: userId,
      provider,
      stateHash: hashState(state),
      codeVerifierEnc: encryptOrganicToken(verifier),
      scopes: [...config.scopes],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCallbackUrl(provider),
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/** Atomically consumes state; a replayed or expired callback returns null. */
export async function consumeOAuthState(
  rawProvider: string,
  state: string,
): Promise<{ orgId: string; projectId: string; userId: string | null; codeVerifier: string } | null> {
  const provider = requireOrganicGoogleProvider(rawProvider)
  if (!state || state.length > 512) return null
  const record = await prisma.organicOAuthState.findUnique({ where: { stateHash: hashState(state) } })
  if (!record || record.provider !== provider || record.consumedAt || record.expiresAt <= new Date()) return null

  const consumed = await prisma.organicOAuthState.updateMany({
    where: { id: record.id, provider, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  })
  if (consumed.count !== 1) return null

  try {
    return {
      orgId: record.orgId,
      projectId: record.projectId,
      userId: record.createdByUserId,
      codeVerifier: decryptOrganicToken(record.codeVerifierEnc),
    }
  } catch {
    return null
  }
}

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json()
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function exchangeCode(orgId: string, provider: OrganicGoogleProvider, code: string, verifier: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = await googleCredentials(orgId)
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: googleCallbackUrl(provider),
  })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  const data = await parseJson(response)
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new OrganicGoogleIntegrationError('token_exchange_failed', 'Google no aceptó el intercambio OAuth', 502)
  }
  return data as GoogleTokenResponse
}

async function refreshAccessToken(orgId: string, provider: OrganicGoogleProvider, refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = await googleCredentials(orgId)
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  const data = await parseJson(response)
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new OrganicGoogleIntegrationError('token_refresh_failed', `No se pudo renovar la sesión de ${provider}`, 502)
  }
  return data as GoogleTokenResponse
}

function expiresAt(expiresIn: unknown) {
  const seconds = typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600
  return new Date(Date.now() + Math.min(seconds, 86_400) * 1000)
}

export async function completeOAuth(
  state: { orgId: string; projectId: string; userId: string | null },
  rawProvider: string,
  code: string,
  codeVerifier: string,
) {
  const provider = requireOrganicGoogleProvider(rawProvider)
  if (!code || code.length > 8_192) throw new OrganicGoogleIntegrationError('invalid_oauth_code', 'Código OAuth no válido')
  const tokens = await exchangeCode(state.orgId, provider, code, codeVerifier)
  const grantedScopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? []
  const requiredScopes = providerConfig(provider).scopes
  if (grantedScopes.length > 0 && requiredScopes.some(scope => !grantedScopes.includes(scope))) {
    throw new OrganicGoogleIntegrationError('scope_mismatch', 'Google no concedió los scopes requeridos para esta integración', 403)
  }
  const current = await ensureProjectIntegration(state.orgId, state.projectId, provider)
  const refreshToken = tokens.refresh_token
    || (current.refreshTokenEnc ? decryptOrganicToken(current.refreshTokenEnc) : null)
  if (!refreshToken) {
    throw new OrganicGoogleIntegrationError('refresh_token_missing', 'Google no devolvió refresh token; vuelve a autorizar la integración', 502)
  }
  const scopes = grantedScopes.length > 0 ? grantedScopes : [...providerConfig(provider).scopes]
  const updated = await prisma.organicIntegration.update({
    where: { id: current.id },
    data: {
      accessTokenEnc: encryptOrganicToken(tokens.access_token!),
      refreshTokenEnc: encryptOrganicToken(refreshToken),
      accessTokenExpiresAt: expiresAt(tokens.expires_in),
      scopes,
      status: 'connected',
      lastError: null,
    },
  })

  await writeAuditLog({
    orgId: state.orgId,
    actorUserId: state.userId,
    action: 'organic.integration.google.connect',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: safeIntegration(updated),
  })

  // Discovery inicial es best-effort: una caída temporal de Google no borra
  // una conexión OAuth válida y queda expresada como código seguro de error.
  try {
    await discoverResources(state.orgId, provider)
  } catch (error) {
    const codeValue = error instanceof OrganicGoogleIntegrationError ? error.code : 'discovery_failed'
    await prisma.organicIntegration.update({ where: { id: updated.id }, data: { lastError: codeValue } })
  }
  return safeIntegration(await prisma.organicIntegration.findUniqueOrThrow({ where: { id: updated.id } }))
}

async function getAccessToken(orgId: string, provider: OrganicGoogleProvider): Promise<string> {
  const { integration } = await integrationForOrg(orgId, provider)
  if (integration.status !== 'connected' || !integration.refreshTokenEnc) {
    throw new OrganicGoogleIntegrationError('integration_not_connected', `Conecta primero ${providerConfig(provider).label}`, 409)
  }
  const encryptedRefreshToken = integration.refreshTokenEnc

  if (integration.accessTokenEnc && integration.accessTokenExpiresAt && integration.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decryptOrganicToken(integration.accessTokenEnc)
  }

  const refreshKey = `${orgId}:${provider}`
  const pendingRefresh = refreshInFlight.get(refreshKey)
  if (pendingRefresh) return pendingRefresh
  const refreshPromise = (async () => {
  try {
      const refreshed = await refreshAccessToken(orgId, provider, decryptOrganicToken(encryptedRefreshToken))
      const refreshToken = refreshed.refresh_token ?? decryptOrganicToken(encryptedRefreshToken)
    await prisma.organicIntegration.update({
      where: { id: integration.id },
      data: {
        accessTokenEnc: encryptOrganicToken(refreshed.access_token!),
        refreshTokenEnc: encryptOrganicToken(refreshToken),
        accessTokenExpiresAt: expiresAt(refreshed.expires_in),
        status: 'connected',
        lastError: null,
      },
    })
    return refreshed.access_token!
  } catch (error) {
    await prisma.organicIntegration.update({
      where: { id: integration.id },
      data: { status: 'needs_reauth', lastError: error instanceof OrganicGoogleIntegrationError ? error.code : 'token_refresh_failed' },
    })
    if (error instanceof OrganicGoogleIntegrationError) throw error
    throw new OrganicGoogleIntegrationError('token_refresh_failed', `No se pudo renovar la sesión de ${provider}`, 502)
  }
  })()
  refreshInFlight.set(refreshKey, refreshPromise)
  try {
    return await refreshPromise
  } finally {
    if (refreshInFlight.get(refreshKey) === refreshPromise) refreshInFlight.delete(refreshKey)
  }
}

async function googleGet(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  const data = await parseJson(response)
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'provider_authorization_failed' : 'provider_request_failed'
    throw new OrganicGoogleIntegrationError(code, 'Google rechazó la consulta de recursos', response.status >= 500 ? 502 : response.status)
  }
  return data
}

async function googlePost(url: string, accessToken: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await parseJson(response)
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'provider_authorization_failed' : 'provider_request_failed'
    throw new OrganicGoogleIntegrationError(code, 'Google rechazó la consulta de datos', response.status >= 500 ? 502 : response.status)
  }
  return data
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function safeIntegration(integration: {
  id: string
  provider: string
  status: string
  scopes: string[]
  externalPropertyId: string | null
  lastDiscoveredAt: Date | null
  lastSyncedAt: Date | null
  lastError: string | null
  updatedAt: Date
  discovery?: Prisma.JsonValue | null
}) {
  return {
    id: integration.id,
    provider: integration.provider,
    status: integration.status,
    scopes: integration.scopes,
    externalPropertyId: integration.externalPropertyId,
    lastDiscoveredAt: integration.lastDiscoveredAt,
    lastSyncedAt: integration.lastSyncedAt,
    lastError: integration.lastError,
    updatedAt: integration.updatedAt,
    discovery: integration.discovery ?? null,
  }
}

export async function getIntegrationStatuses(orgId: string) {
  const project = await prisma.organicProject.findUnique({
    where: { orgId },
    include: { integrations: { orderBy: { provider: 'asc' } } },
  })
  if (!project) return { setupRequired: true, integrations: [] }
  const existing = new Map(project.integrations.map(item => [item.provider, item]))
  return {
    setupRequired: false,
    integrations: ORGANIC_INTEGRATION_PROVIDERS.map(provider => {
      const item = existing.get(provider)
      return item ? safeIntegration(item) : {
        id: null,
        provider,
        status: 'not_connected',
        scopes: [],
        externalPropertyId: null,
        lastDiscoveredAt: null,
        lastSyncedAt: null,
        lastError: null,
        updatedAt: null,
        discovery: null,
      }
    }),
  }
}

export async function getIntegrationStatus(orgId: string, rawProvider: string) {
  const provider = requireOrganicGoogleProvider(rawProvider)
  const { integration } = await integrationForOrg(orgId, provider)
  return safeIntegration(integration)
}

function discoveryFor(provider: OrganicGoogleProvider, data: Record<string, unknown>): Prisma.InputJsonValue {
  if (provider === 'search_console') {
    const sites = Array.isArray(data.siteEntry) ? data.siteEntry : []
    return {
      provider,
      resources: sites.slice(0, 500).flatMap(item => {
        if (!item || typeof item !== 'object') return []
        const value = item as Record<string, unknown>
        return typeof value.siteUrl === 'string' ? [{ id: value.siteUrl, label: value.siteUrl, permissionLevel: value.permissionLevel ?? null }] : []
      }),
    }
  }
  if (provider === 'ga4') {
    const accounts = Array.isArray(data.accountSummaries) ? data.accountSummaries : []
    return {
      provider,
      resources: accounts.slice(0, 200).flatMap(account => {
        if (!account || typeof account !== 'object') return []
        const value = account as Record<string, unknown>
        const properties = Array.isArray(value.propertySummaries) ? value.propertySummaries : []
        return properties.slice(0, 500).flatMap(property => {
          if (!property || typeof property !== 'object') return []
          const item = property as Record<string, unknown>
          return typeof item.property === 'string' ? [{ id: item.property, label: item.displayName ?? item.property, propertyType: item.propertyType ?? null }] : []
        })
      }),
    }
  }
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  return {
    provider,
    accounts: accounts.slice(0, 50).flatMap(account => {
      if (!account || typeof account !== 'object') return []
      const value = account as Record<string, unknown>
      return typeof value.name === 'string' ? [{ id: value.name, label: value.accountName ?? value.name }] : []
    }),
    locations: [],
  }
}

async function fetchDiscovery(provider: OrganicGoogleProvider, accessToken: string): Promise<Prisma.InputJsonValue> {
  if (provider === 'search_console') {
    return discoveryFor(provider, await googleGet(`${SEARCH_CONSOLE_API}/sites`, accessToken))
  }
  if (provider === 'ga4') {
    return discoveryFor(provider, await googleGet(`${GA4_ADMIN_API}/accountSummaries?pageSize=200`, accessToken))
  }
  const accounts = await googleGet(`${GBP_ACCOUNT_API}/accounts?pageSize=20`, accessToken)
  const accountItems = Array.isArray(accounts.accounts) ? accounts.accounts : []
  const locations: Array<{ id: string; label: unknown; accountId: string }> = []
  for (const account of accountItems.slice(0, 20)) {
    if (!account || typeof account !== 'object') continue
    const name = (account as Record<string, unknown>).name
    if (typeof name !== 'string') continue
    const locationData = await googleGet(
      `${GBP_INFORMATION_API}/${name}/locations?readMask=name,title,storeCode&pageSize=100`,
      accessToken,
    )
    const items = Array.isArray(locationData.locations) ? locationData.locations : []
    for (const location of items.slice(0, 100)) {
      if (!location || typeof location !== 'object') continue
      const value = location as Record<string, unknown>
      if (typeof value.name === 'string') locations.push({ id: value.name, label: value.title ?? value.name, accountId: name })
    }
  }
  const result = discoveryFor(provider, accounts) as Record<string, unknown>
  result.locations = locations
  return jsonValue(result)
}

export async function discoverResources(orgId: string, rawProvider: string) {
  const provider = requireOrganicGoogleProvider(rawProvider)
  const { integration } = await integrationForOrg(orgId, provider)
  const accessToken = await getAccessToken(orgId, provider)
  try {
    const discovery = await fetchDiscovery(provider, accessToken)
    const updated = await prisma.organicIntegration.update({
      where: { id: integration.id },
      data: { discovery, lastDiscoveredAt: new Date(), lastError: null, status: 'connected' },
    })
    return safeIntegration(updated)
  } catch (error) {
    const code = error instanceof OrganicGoogleIntegrationError ? error.code : 'discovery_failed'
    await prisma.organicIntegration.update({ where: { id: integration.id }, data: { lastError: code } })
    throw error
  }
}

function idsFromDiscovery(provider: OrganicGoogleProvider, discovery: Prisma.JsonValue | null) {
  if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) return []
  const value = discovery as Record<string, Prisma.JsonValue>
  const resources = Array.isArray(value.resources) ? value.resources : []
  const locations = Array.isArray(value.locations) ? value.locations : []
  return [...resources, ...locations].flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const id = (item as Record<string, Prisma.JsonValue>).id
    return typeof id === 'string' ? [id] : []
  })
}

export async function configureResource(orgId: string, userId: string, rawProvider: string, externalPropertyId: string) {
  const provider = requireOrganicGoogleProvider(rawProvider)
  if (!externalPropertyId || externalPropertyId.length > 2_048) {
    throw new OrganicGoogleIntegrationError('invalid_resource', 'Recurso Google no válido')
  }
  const { integration } = await integrationForOrg(orgId, provider)
  if (integration.status !== 'connected') throw new OrganicGoogleIntegrationError('integration_not_connected', 'Conecta primero la integración Google', 409)
  if (!idsFromDiscovery(provider, integration.discovery).includes(externalPropertyId)) {
    throw new OrganicGoogleIntegrationError('resource_not_discovered', 'El recurso debe proceder del discovery de Google', 409)
  }
  const updated = await prisma.organicIntegration.update({
    where: { id: integration.id },
    data: { externalPropertyId, lastError: null },
  })
  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'organic.integration.google.resource.configure',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: { provider, externalPropertyId },
  })
  return safeIntegration(updated)
}

export async function disconnect(orgId: string, userId: string, rawProvider: string) {
  const provider = requireOrganicGoogleProvider(rawProvider)
  const { integration } = await integrationForOrg(orgId, provider)
  if (integration.refreshTokenEnc) {
    try {
      await fetchWithTimeout(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decryptOrganicToken(integration.refreshTokenEnc) }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // Se revoca localmente aunque el endpoint de Google no responda.
    }
  }
  const updated = await prisma.organicIntegration.update({
    where: { id: integration.id },
    data: {
      status: 'revoked',
      accessTokenEnc: null,
      refreshTokenEnc: null,
      accessTokenExpiresAt: null,
      scopes: [],
      externalPropertyId: null,
      discovery: Prisma.DbNull,
      lastDiscoveredAt: null,
      lastSyncedAt: null,
      lastError: null,
    },
  })
  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'organic.integration.google.disconnect',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: { provider, status: updated.status },
  })
  return safeIntegration(updated)
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Consulta puntual a la API de Search Console sin persistir nada. La usa la
 * página SEO para análisis que necesitan otras dimensiones (query+page) y no
 * justifican duplicar el pipeline de sincronización de OrganicOpportunity.
 */
export async function querySearchAnalytics(orgId: string, input: {
  startDate: string
  endDate: string
  dimensions: string[]
  rowLimit?: number
}): Promise<Array<{ keys: string[]; clicks: number; impressions: number; position: number | null }>> {
  const provider: OrganicGoogleProvider = 'search_console'
  const { integration } = await integrationForOrg(orgId, provider)
  if (integration.status !== 'connected' || !integration.externalPropertyId) {
    throw new OrganicGoogleIntegrationError('resource_required', 'Configura una propiedad de Search Console antes de consultar', 409)
  }
  const accessToken = await getAccessToken(orgId, provider)
  const data = await googlePost(
    `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(integration.externalPropertyId)}/searchAnalytics/query`,
    accessToken,
    {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: input.dimensions,
      type: 'web',
      rowLimit: Math.min(Math.max(input.rowLimit ?? 5_000, 1), 25_000),
      dataState: 'all',
    },
  )
  const rows = Array.isArray(data.rows) ? data.rows : []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const value = row as Record<string, unknown>
    const keys = Array.isArray(value.keys) ? value.keys.filter((k): k is string => typeof k === 'string') : []
    if (!keys.length) return []
    return [{
      keys,
      clicks: safeNumber(value.clicks) ?? 0,
      impressions: safeNumber(value.impressions) ?? 0,
      position: safeNumber(value.position),
    }]
  })
}

export async function syncSearchConsoleQueries(orgId: string, userId: string, input: SearchConsoleSyncInput) {
  const provider: OrganicGoogleProvider = 'search_console'
  const { project, integration } = await integrationForOrg(orgId, provider)
  if (integration.status !== 'connected' || !integration.externalPropertyId) {
    throw new OrganicGoogleIntegrationError('resource_required', 'Configura una propiedad de Search Console antes de sincronizar', 409)
  }
  const accessToken = await getAccessToken(orgId, provider)
  const rowLimit = Math.min(Math.max(input.rowLimit ?? 1_000, 1), 25_000)
  const data = await googlePost(
    `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(integration.externalPropertyId)}/searchAnalytics/query`,
    accessToken,
    { startDate: input.startDate, endDate: input.endDate, dimensions: ['query'], type: 'web', rowLimit, dataState: 'final' },
  )
  const rows = Array.isArray(data.rows) ? data.rows : []
  let upserted = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const value = row as Record<string, unknown>
    const keys = Array.isArray(value.keys) ? value.keys : []
    const query = typeof keys[0] === 'string' ? keys[0].trim() : ''
    if (!query) continue
    const metadata = {
      provider,
      property: integration.externalPropertyId,
      startDate: input.startDate,
      endDate: input.endDate,
      clicks: safeNumber(value.clicks),
      impressions: safeNumber(value.impressions),
      ctr: safeNumber(value.ctr),
      position: safeNumber(value.position),
    }
    await prisma.organicOpportunity.upsert({
      where: {
        orgId_projectId_source_sourceKey: {
          orgId,
          projectId: project.id,
          source: provider,
          sourceKey: `${integration.externalPropertyId}:${query}`,
        },
      },
      update: { title: query, query, status: 'open', metadata: jsonValue(metadata) },
      create: {
        orgId,
        projectId: project.id,
        title: query,
        query,
        source: provider,
        sourceKey: `${integration.externalPropertyId}:${query}`,
        status: 'open',
        metadata: jsonValue(metadata),
      },
    })
    upserted += 1
  }
  const updated = await prisma.organicIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedAt: new Date(), lastError: null, status: 'connected' },
  })
  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'organic.integration.search_console.sync',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: { provider, property: integration.externalPropertyId, startDate: input.startDate, endDate: input.endDate, rows: upserted },
  })
  return {
    provider,
    property: integration.externalPropertyId,
    startDate: input.startDate,
    endDate: input.endDate,
    rows: rows.length,
    upserted,
    integration: safeIntegration(updated),
  }
}
