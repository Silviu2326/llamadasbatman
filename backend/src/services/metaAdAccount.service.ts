import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { encryptToken, decryptToken } from '../lib/tokenCrypto'
import { getMetaOAuthCallbackUrl, requireStrongSecret } from '../lib/securityConfig'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
const META_HTTP_TIMEOUT_MS = 15_000
export const META_OAUTH_SCOPES = [
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'business_management',
] as const

type MetaRequestFailureKind = 'provider' | 'timeout' | 'network' | 'invalid_response'

class MetaRequestError extends Error {
  readonly kind: MetaRequestFailureKind
  readonly status?: number

  constructor(message: string, kind: MetaRequestFailureKind, status?: number) {
    super(message)
    this.name = 'MetaRequestError'
    this.kind = kind
    this.status = status
  }
}

function isMetaRequestError(error: unknown): error is MetaRequestError {
  return error instanceof MetaRequestError
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function invalidMetaResponse(operation: string) {
  return new MetaRequestError(`Meta ${operation} devolvió una respuesta no válida`, 'invalid_response')
}

/**
 * Executes a Meta request with a hard deadline and deliberately safe errors.
 * Provider bodies are never copied into an exception: they may contain tokens,
 * request identifiers, user data, or URLs with credentials.
 */
async function requestMetaJson<T>(operation: string, input: string, init?: RequestInit): Promise<T> {
  const signal = AbortSignal.timeout(META_HTTP_TIMEOUT_MS)

  try {
    const response = await fetch(input, { ...init, signal })
    if (!response.ok) {
      // Release the undici connection without reading provider-controlled data.
      await response.body?.cancel().catch(() => undefined)
      throw new MetaRequestError(`Meta ${operation} falló (${response.status})`, 'provider', response.status)
    }

    try {
      return (await response.json()) as T
    } catch {
      throw invalidMetaResponse(operation)
    }
  } catch (error) {
    if (isMetaRequestError(error)) throw error
    if (signal.aborted || isAbortError(error)) {
      throw new MetaRequestError(`Meta ${operation} agotó el tiempo de espera`, 'timeout')
    }
    throw new MetaRequestError(`Meta ${operation} no está disponible`, 'network')
  }
}

function accessTokenFromResponse(operation: string, value: unknown): string {
  if (
    !value ||
    typeof value !== 'object' ||
    !('access_token' in value) ||
    typeof value.access_token !== 'string' ||
    !value.access_token
  ) {
    throw invalidMetaResponse(operation)
  }
  return value.access_token
}

function expiresAtFromResponse(value: unknown): Date | null {
  if (!value || typeof value !== 'object' || !('expires_in' in value)) return null
  const seconds = typeof value.expires_in === 'number' && Number.isFinite(value.expires_in) && value.expires_in > 0
    ? Math.min(value.expires_in, 90 * 24 * 60 * 60)
    : null
  return seconds ? new Date(Date.now() + seconds * 1000) : null
}

function firstIdFromResponse(operation: string, value: unknown): { id: string } | null {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) {
    throw invalidMetaResponse(operation)
  }
  const first = value.data[0]
  if (!first) return null
  if (typeof first !== 'object' || !('id' in first) || typeof first.id !== 'string' || !first.id) {
    throw invalidMetaResponse(operation)
  }
  return { id: first.id }
}

function stateHash(state: string) {
  return createHash('sha256').update(state).digest('hex')
}

function oauthCipherKey() {
  return createHash('sha256').update(requireStrongSecret('OAUTH_STATE_SECRET')).digest()
}

function encryptCodeVerifier(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', oauthCipherKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.')
}

function decryptCodeVerifier(value: string) {
  const [ivValue, tagValue, ciphertext] = value.split('.')
  if (!ivValue || !tagValue || !ciphertext) throw new Error('Estado OAuth corrupto')
  const decipher = createDecipheriv('aes-256-gcm', oauthCipherKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

function metaCredentials() {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) throw new Error('META_APP_ID y META_APP_SECRET deben configurarse antes de conectar Meta')
  return { appId, appSecret }
}

/** Creates a short-lived, one-use opaque state plus a PKCE verifier. */
export async function buildOAuthStartUrl(orgId: string): Promise<string> {
  const { appId } = metaCredentials()
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  await prisma.metaOAuthState.create({
    data: {
      orgId,
      stateHash: stateHash(state),
      codeVerifierEnc: encryptCodeVerifier(verifier),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })

  const scope = META_OAUTH_SCOPES.join(',')
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getMetaOAuthCallbackUrl(),
    state,
    scope,
    response_type: 'code',
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
  })
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`
}

/** Atomically consumes the state so a captured callback cannot be replayed. */
export async function consumeOAuthState(state: string): Promise<{ orgId: string; codeVerifier: string } | null> {
  if (!state || state.length > 512) return null
  const record = await prisma.metaOAuthState.findUnique({ where: { stateHash: stateHash(state) } })
  if (!record || record.consumedAt || record.expiresAt <= new Date()) return null

  const consumed = await prisma.metaOAuthState.updateMany({
    where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  })
  if (consumed.count !== 1) return null

  try {
    return { orgId: record.orgId, codeVerifier: decryptCodeVerifier(record.codeVerifierEnc) }
  } catch {
    return null
  }
}

async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const { appId, appSecret } = metaCredentials()
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: getMetaOAuthCallbackUrl(),
    code,
    code_verifier: codeVerifier,
  })
  const data = await requestMetaJson<unknown>('token exchange', `${GRAPH_URL}/oauth/access_token?${params.toString()}`)
  return accessTokenFromResponse('token exchange', data)
}

// Usamos el token de usuario long-lived (permisos ads_management sobre su
// cuenta). Migrar a System User cuando se necesite operar sin ese usuario.
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ token: string; expiresAt: Date | null }> {
  const { appId, appSecret } = metaCredentials()
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })
  const data = await requestMetaJson<unknown>(
    'long-lived token exchange',
    `${GRAPH_URL}/oauth/access_token?${params.toString()}`
  )
  return { token: accessTokenFromResponse('long-lived token exchange', data), expiresAt: expiresAtFromResponse(data) }
}

async function fetchMetaUser(accessToken: string): Promise<{ id: string; scopes: string[] }> {
  const user = await requestMetaJson<unknown>(
    'user fetch',
    `${GRAPH_URL}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
  )
  if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !user.id) {
    throw invalidMetaResponse('user fetch')
  }
  const permissions = await requestMetaJson<unknown>(
    'permissions fetch',
    `${GRAPH_URL}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
  )
  const data = permissions && typeof permissions === 'object' && 'data' in permissions && Array.isArray(permissions.data)
    ? permissions.data
    : []
  const scopes = data.flatMap(item => {
    if (!item || typeof item !== 'object' || !('permission' in item) || !('status' in item)) return []
    return item.status === 'granted' && typeof item.permission === 'string' ? [item.permission] : []
  })
  const missing = META_OAUTH_SCOPES.filter(scope => !scopes.includes(scope))
  if (missing.length) throw new MetaRequestError('Meta no concedió todos los permisos requeridos', 'provider', 403)
  return { id: user.id, scopes }
}

async function fetchFirstAdAccount(accessToken: string): Promise<{ id: string } | null> {
  const data = await requestMetaJson<unknown>(
    'adaccounts fetch',
    `${GRAPH_URL}/me/adaccounts?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  )
  return firstIdFromResponse('adaccounts fetch', data)
}

async function fetchFirstPage(accessToken: string): Promise<{ id: string } | null> {
  const data = await requestMetaJson<unknown>(
    'pages fetch',
    `${GRAPH_URL}/me/accounts?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  )
  return firstIdFromResponse('pages fetch', data)
}

export interface MetaNamedOption { id: string; name: string | null }

/** Lista id+nombre de un listado de Graph; una fila sin id válido invalida la respuesta. */
function namedListFromResponse(operation: string, value: unknown): MetaNamedOption[] {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) {
    throw invalidMetaResponse(operation)
  }
  return value.data.map(item => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id) {
      throw invalidMetaResponse(operation)
    }
    const name = 'name' in item && typeof item.name === 'string' ? item.name.slice(0, 200) : null
    return { id: item.id, name }
  })
}

async function fetchAccountOptions(accessToken: string) {
  const [adAccounts, pages] = await Promise.all([
    requestMetaJson<unknown>(
      'adaccounts fetch',
      `${GRAPH_URL}/me/adaccounts?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`
    ).then(data => namedListFromResponse('adaccounts fetch', data)),
    requestMetaJson<unknown>(
      'pages fetch',
      `${GRAPH_URL}/me/accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`
    ).then(data => namedListFromResponse('pages fetch', data)),
  ])
  return { adAccounts, pages }
}

export class MetaAccountSelectionError extends Error {
  readonly statusCode: number
  constructor(message: string, readonly code: string, statusCode = 409) {
    super(message)
    this.name = 'MetaAccountSelectionError'
    this.statusCode = statusCode
  }
}

/**
 * Cuentas publicitarias y páginas que el token conectado puede administrar,
 * pedidas a Graph en el momento (no se guardan: la lista cambia en Meta).
 * Devuelve null sin cuenta conectada.
 */
export async function listAccountOptions(orgId: string) {
  const account = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!account?.systemUserTokenEnc) return null
  const options = await fetchAccountOptions(decryptToken(account.systemUserTokenEnc))
  return {
    ...options,
    current: { adAccountId: account.metaAdAccountId, pageId: account.metaPageId ?? null },
  }
}

/**
 * Cambia la cuenta publicitaria y la página con las que opera la organización.
 * Solo se aceptan ids que Graph devuelva para el token conectado: un id ajeno
 * nunca llega a la base.
 */
export async function selectAccountTargets(orgId: string, selection: { adAccountId: string; pageId: string | null }) {
  const account = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!account?.systemUserTokenEnc) return null
  const options = await fetchAccountOptions(decryptToken(account.systemUserTokenEnc))
  if (!options.adAccounts.some(item => item.id === selection.adAccountId)) {
    throw new MetaAccountSelectionError('La cuenta publicitaria elegida no está entre las que administra el usuario conectado.', 'META_AD_ACCOUNT_NOT_ALLOWED')
  }
  if (selection.pageId && !options.pages.some(item => item.id === selection.pageId)) {
    throw new MetaAccountSelectionError('La página elegida no está entre las que administra el usuario conectado.', 'META_PAGE_NOT_ALLOWED')
  }

  // (orgId, metaAdAccountId) es único: una fila antigua revocada con la misma
  // cuenta bloquearía el cambio, así que se retira antes de mover la conexión.
  if (selection.adAccountId !== account.metaAdAccountId) {
    await prisma.metaAdAccount.deleteMany({
      where: { orgId, metaAdAccountId: selection.adAccountId, id: { not: account.id }, status: { not: 'connected' } },
    })
  }
  const updated = await prisma.metaAdAccount.update({
    where: { id: account.id },
    data: { metaAdAccountId: selection.adAccountId, metaPageId: selection.pageId, lastValidatedAt: new Date(), lastError: null },
  })
  const { systemUserTokenEnc: _omit, ...safe } = updated
  return safe
}

export async function completeOAuth(orgId: string, code: string, codeVerifier: string) {
  const shortLivedToken = await exchangeCodeForToken(code, codeVerifier)
  const longLived = await exchangeForLongLivedToken(shortLivedToken)
  const longLivedToken = longLived.token
  const metaUser = await fetchMetaUser(longLivedToken)
  const [adAccount, page] = await Promise.all([
    fetchFirstAdAccount(longLivedToken),
    fetchFirstPage(longLivedToken),
  ])
  if (!adAccount) throw new Error('El usuario no administra ninguna cuenta publicitaria de Meta')

  return prisma.metaAdAccount.upsert({
    where: { orgId_metaAdAccountId: { orgId, metaAdAccountId: adAccount.id } },
    update: {
      metaUserId: metaUser.id,
      metaPageId: page?.id,
      systemUserTokenEnc: encryptToken(longLivedToken),
      scopes: metaUser.scopes,
      accessTokenExpiresAt: longLived.expiresAt,
      lastValidatedAt: new Date(),
      lastError: null,
      status: 'connected',
    },
    create: {
      orgId,
      metaAdAccountId: adAccount.id,
      metaUserId: metaUser.id,
      metaPageId: page?.id,
      systemUserTokenEnc: encryptToken(longLivedToken),
      scopes: metaUser.scopes,
      accessTokenExpiresAt: longLived.expiresAt,
      lastValidatedAt: new Date(),
      status: 'connected',
    },
  })
}

export async function getAccount(orgId: string) {
  const account = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!account) return null
  const { systemUserTokenEnc: _omit, ...safe } = account
  return safe
}

export async function getDecryptedToken(orgId: string): Promise<string | null> {
  const account = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!account?.systemUserTokenEnc) return null
  return decryptToken(account.systemUserTokenEnc)
}

/** null quita el tope: la campaña deja de pausarse por gasto diario. */
export async function setBudgetCap(orgId: string, id: string, dailyBudgetCapCents: number | null) {
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { dailyBudgetCapCents },
  })
}

/** null retira el píxel: CAPI deja de tener destino. */
export async function setPixelId(orgId: string, id: string, metaPixelId: string | null) {
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { metaPixelId },
  })
}

export async function disconnect(orgId: string, id: string) {
  const account = await prisma.metaAdAccount.findFirst({ where: { id, orgId } })
  if (!account) return { count: 0 }
  if (account.systemUserTokenEnc && account.metaUserId) {
    try {
      await requestMetaJson<unknown>(
        'permissions revoke',
        `${GRAPH_URL}/${encodeURIComponent(account.metaUserId)}/permissions?access_token=${encodeURIComponent(decryptToken(account.systemUserTokenEnc))}`,
        { method: 'DELETE' },
      )
    } catch {
      // A failed provider request must not keep the local token active.
    }
  }
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { status: 'revoked', systemUserTokenEnc: null, scopes: [], accessTokenExpiresAt: null, lastError: null },
  })
}
