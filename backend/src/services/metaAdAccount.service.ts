import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../lib/prisma'
import { encryptToken, decryptToken } from '../lib/tokenCrypto'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

function callbackUrl(): string {
  const host = process.env.PUBLIC_HOST ?? 'localhost:3000'
  return `https://${host}/api/meta/accounts/oauth/callback`
}

// El "state" del OAuth dialog viaja por el navegador del cliente (Meta se lo
// devuelve tal cual en el callback), así que se firma con HMAC para que no se
// pueda falsificar el orgId — el callback no tiene el JWT del usuario.
export function signState(orgId: string): string {
  const sig = createHmac('sha256', process.env.JWT_SECRET ?? 'changeme_secret').update(orgId).digest('hex')
  return `${orgId}.${sig}`
}

export function verifyState(state: string): string | null {
  const [orgId, sig] = state.split('.')
  if (!orgId || !sig) return null
  const expected = createHmac('sha256', process.env.JWT_SECRET ?? 'changeme_secret').update(orgId).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return orgId
}

export function buildOAuthStartUrl(orgId: string): string {
  const appId = process.env.META_APP_ID ?? ''
  const scope = ['ads_management', 'pages_show_list', 'leads_retrieval', 'business_management'].join(',')
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl(),
    state: signState(orgId),
    scope,
    response_type: 'code',
  })
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    redirect_uri: callbackUrl(),
    code,
  })
  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

// ponytail: usamos el token de usuario long-lived (permisos ads_management
// sobre su cuenta), no un System User real de Business Manager — eso requiere
// un paso adicional (crear system user + asignar assets vía Business Manager
// API) que solo se puede probar con una Business Manager real. Subir a System
// User cuando haga falta operar sin depender de que el usuario no revoque el
// token.
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    fb_exchange_token: shortLivedToken,
  })
  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Meta long-lived exchange failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

async function fetchFirstAdAccount(accessToken: string): Promise<{ id: string } | null> {
  const res = await fetch(`${GRAPH_URL}/me/adaccounts?fields=id,name&access_token=${accessToken}`)
  if (!res.ok) throw new Error(`Meta adaccounts fetch failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { data: Array<{ id: string }> }
  return data.data[0] ?? null
}

async function fetchFirstPage(accessToken: string): Promise<{ id: string } | null> {
  const res = await fetch(`${GRAPH_URL}/me/accounts?fields=id,name&access_token=${accessToken}`)
  if (!res.ok) throw new Error(`Meta pages fetch failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { data: Array<{ id: string }> }
  return data.data[0] ?? null
}

export async function completeOAuth(orgId: string, code: string) {
  const shortLivedToken = await exchangeCodeForToken(code)
  const longLivedToken = await exchangeForLongLivedToken(shortLivedToken)
  const [adAccount, page] = await Promise.all([
    fetchFirstAdAccount(longLivedToken),
    fetchFirstPage(longLivedToken),
  ])
  if (!adAccount) throw new Error('El usuario no administra ninguna cuenta publicitaria de Meta')

  return prisma.metaAdAccount.upsert({
    where: { orgId_metaAdAccountId: { orgId, metaAdAccountId: adAccount.id } },
    update: {
      metaPageId: page?.id,
      systemUserTokenEnc: encryptToken(longLivedToken),
      status: 'connected',
    },
    create: {
      orgId,
      metaAdAccountId: adAccount.id,
      metaPageId: page?.id,
      systemUserTokenEnc: encryptToken(longLivedToken),
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
  if (!account) return null
  return decryptToken(account.systemUserTokenEnc)
}

export async function setBudgetCap(orgId: string, id: string, dailyBudgetCapCents: number) {
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { dailyBudgetCapCents },
  })
}

export async function setPixelId(orgId: string, id: string, metaPixelId: string) {
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { metaPixelId },
  })
}

export async function disconnect(orgId: string, id: string) {
  return prisma.metaAdAccount.updateMany({
    where: { id, orgId },
    data: { status: 'revoked' },
  })
}
