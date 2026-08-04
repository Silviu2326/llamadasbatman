import { prisma } from '../lib/prisma'
import {
  configIssue,
  env,
  fetchWithTimeout,
  isProductionRuntime,
  validatePublicBaseUrl,
  validateSecretValue,
  validateBaseUrl,
  type ProviderRuntimeStatus,
  type RuntimeConfigIssue,
} from '../lib/integrationRuntime'
import Redis from 'ioredis'

type IntegrationHealth = {
  provider: string
  status: ProviderRuntimeStatus
  configured: boolean
  checkedAt: string
  missing: string[]
  invalid: string[]
  probe?: 'not_requested' | 'passed' | 'failed'
  errorCode?: string
}

const ALL_PROVIDERS = ['meta_ads', 'google_search_console', 'metricool', 'mautic_email', 'twilio'] as const

function requiredProviders(): string[] {
  const configured = env('REQUIRED_INTEGRATIONS')
  if (configured) return configured.split(',').map(value => value.trim()).filter(Boolean)
  return isProductionRuntime() ? [...ALL_PROVIDERS] : []
}

function secretInvalid(...checks: Array<[name: string, value: string | undefined, minimumLength?: number]>): string[] {
  return checks.flatMap(([name, value, minimumLength]) => validateSecretValue(name, value, minimumLength) ? [name] : [])
}

function activationConfigured(name: string): boolean {
  const raw = env(name)
  if (!raw) return false
  // Development defaults are intentionally not treated as an enabled provider.
  // The production gate rejects private endpoints; this keeps the bundled
  // local defaults from creating a misleading "partial integration" locally.
  if (['METRICOOL_BASE_URL', 'MAUTIC_BASE_URL'].includes(name)) {
    try {
      const url = new URL(raw)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') return false
    } catch {
      return true
    }
  }
  return true
}

function providerHealth(
  provider: string,
  required: readonly string[],
  invalid: string[] = [],
  activationKeys: readonly string[] = required,
): IntegrationHealth {
  const anyConfigured = activationKeys.some(activationConfigured)
  if (!anyConfigured && invalid.length === 0) {
    return { provider, status: 'not_configured', configured: false, checkedAt: new Date().toISOString(), missing: [], invalid: [], probe: 'not_requested' }
  }
  const issue = configIssue(provider, required, { invalid })
  const checkedAt = new Date().toISOString()
  if (!issue) return { provider, status: 'configured', configured: true, checkedAt, missing: [], invalid: [], probe: 'not_requested' }
  return {
    provider,
    status: anyConfigured || invalid.length > 0 ? 'degraded' : 'not_configured',
    configured: false,
    checkedAt,
    missing: issue.missing,
    invalid: issue.invalid,
    probe: 'not_requested',
    ...(anyConfigured || invalid.length > 0 ? { errorCode: 'configuration_incomplete' } : {}),
  }
}

function metaHealth(): IntegrationHealth {
  const health = providerHealth('meta_ads', [
    'META_APP_ID',
    'META_APP_SECRET',
    'META_TOKEN_ENCRYPTION_KEY',
    'META_WEBHOOK_VERIFY_TOKEN',
  ])
  const callback = env('META_OAUTH_REDIRECT_URI') || (env('PUBLIC_HOST') ? `${env('PUBLIC_HOST')}/api/meta/accounts/oauth/callback` : undefined)
  const invalid = [...health.invalid, ...secretInvalid(
    ['META_APP_SECRET', env('META_APP_SECRET'), 16],
    ['META_TOKEN_ENCRYPTION_KEY', env('META_TOKEN_ENCRYPTION_KEY')],
    ['META_WEBHOOK_VERIFY_TOKEN', env('META_WEBHOOK_VERIFY_TOKEN')],
  )]
  const callbackBase = callback?.replace(/\/api\/meta\/accounts\/oauth\/callback$/, '')
  const callbackError = validatePublicBaseUrl('META_OAUTH_REDIRECT_URI', callbackBase)
  const graphVersion = env('META_GRAPH_API_VERSION')
  if (graphVersion && !/^v\d+\.\d+$/.test(graphVersion)) invalid.push('META_GRAPH_API_VERSION')
  if (health.status !== 'not_configured' && callbackError) invalid.push('META_OAUTH_REDIRECT_URI')
  return health.status !== 'not_configured' && (Boolean(callbackError) || invalid.includes('META_GRAPH_API_VERSION') || invalid.length > health.invalid.length)
    ? { ...health, status: 'degraded', configured: false, invalid: [...new Set(invalid)], errorCode: callbackError ? 'invalid_oauth_callback' : 'invalid_graph_version' }
    : health
}

function googleHealth(): IntegrationHealth {
  const health = providerHealth('google_search_console', [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_BASE_URL',
    'ORGANIC_TOKEN_ENCRYPTION_KEY',
  ])
  const invalid = [...health.invalid, ...secretInvalid(
    ['ORGANIC_TOKEN_ENCRYPTION_KEY', env('ORGANIC_TOKEN_ENCRYPTION_KEY')],
    ['GOOGLE_OAUTH_CLIENT_SECRET', env('GOOGLE_OAUTH_CLIENT_SECRET'), 16],
  )]
  const callbackError = validatePublicBaseUrl('GOOGLE_OAUTH_REDIRECT_BASE_URL', env('GOOGLE_OAUTH_REDIRECT_BASE_URL') || env('PUBLIC_HOST'))
  if (health.status !== 'not_configured' && (callbackError || invalid.length > health.invalid.length)) return { ...health, status: 'degraded', configured: false, invalid: [...new Set([...invalid, ...(callbackError ? ['GOOGLE_OAUTH_REDIRECT_BASE_URL'] : [])])], errorCode: 'invalid_oauth_callback' }
  return health
}

function mauticHealth(): IntegrationHealth {
  const health = providerHealth('mautic_email', ['MAUTIC_BASE_URL', 'MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET'], [], ['MAUTIC_BASE_URL', 'MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET'])
  const invalid = validatePublicBaseUrl('MAUTIC_BASE_URL', env('MAUTIC_BASE_URL'))
  const secretNames = secretInvalid(['MAUTIC_CLIENT_SECRET', env('MAUTIC_CLIENT_SECRET'), 16], ['MAUTIC_WEBHOOK_SECRET', env('MAUTIC_WEBHOOK_SECRET')])
  if (health.status !== 'not_configured' && (invalid || secretNames.length)) return { ...health, status: 'degraded', configured: false, invalid: [...new Set([...health.invalid, ...(invalid ? ['MAUTIC_BASE_URL'] : []), ...secretNames])], errorCode: invalid ? 'invalid_base_url' : 'invalid_secret' }
  return health
}

function metricoolHealth(): IntegrationHealth {
  const health = providerHealth('metricool', ['METRICOOL_BASE_URL', 'METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID'], [], ['METRICOOL_BASE_URL', 'METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID'])
  const invalid = validatePublicBaseUrl('METRICOOL_BASE_URL', env('METRICOOL_BASE_URL'))
  const secretNames = secretInvalid(['METRICOOL_USER_TOKEN', env('METRICOOL_USER_TOKEN'), 16])
  if (health.status !== 'not_configured' && (invalid || secretNames.length)) return { ...health, status: 'degraded', configured: false, invalid: [...new Set([...health.invalid, ...(invalid ? ['METRICOOL_BASE_URL'] : []), ...secretNames])], errorCode: invalid ? 'invalid_base_url' : 'invalid_secret' }
  return health
}

function twilioHealth(): IntegrationHealth {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
  const health = providerHealth('twilio', required)
  const invalid: string[] = []
  const publicBase = env('TWILIO_WEBHOOK_BASE_URL') || env('PUBLIC_HOST')
  const baseError = validatePublicBaseUrl('TWILIO_WEBHOOK_BASE_URL/PUBLIC_HOST', publicBase)
  if (health.status !== 'not_configured' && baseError) invalid.push('TWILIO_WEBHOOK_BASE_URL/PUBLIC_HOST')
  if (health.status !== 'not_configured' && !env('TWILIO_FROM_NUMBER') && !env('TWILIO_WHATSAPP_FROM')) invalid.push('TWILIO_FROM_NUMBER o TWILIO_WHATSAPP_FROM')
  if (health.status !== 'not_configured' && env('TWILIO_AUTH_TOKEN') && validateSecretValue('TWILIO_AUTH_TOKEN', env('TWILIO_AUTH_TOKEN'), 16)) invalid.push('TWILIO_AUTH_TOKEN')
  return invalid.length ? { ...health, status: 'degraded', configured: false, invalid, errorCode: 'configuration_incomplete' } : health
}

function issuesToHealth(): IntegrationHealth[] {
  return [metaHealth(), googleHealth(), metricoolHealth(), mauticHealth(), twilioHealth()]
}

async function probe(health: IntegrationHealth): Promise<IntegrationHealth> {
  if (health.status !== 'configured') return health
  try {
    if (health.provider === 'metricool') {
      const url = new URL(`${env('METRICOOL_BASE_URL')!.replace(/\/$/, '')}/admin/simpleProfiles`)
      url.searchParams.set('userId', env('METRICOOL_USER_ID')!)
      url.searchParams.set('blogId', env('METRICOOL_BLOG_ID')!)
      const response = await fetchWithTimeout(url, { headers: { 'X-Mc-Auth': env('METRICOOL_USER_TOKEN')! } })
      if (!response.ok) throw new Error(`METRICOOL_${response.status}`)
    } else if (health.provider === 'mautic_email') {
      const response = await fetchWithTimeout(`${env('MAUTIC_BASE_URL')!.replace(/\/$/, '')}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env('MAUTIC_CLIENT_ID')!, client_secret: env('MAUTIC_CLIENT_SECRET')! }),
      })
      if (!response.ok) throw new Error(`MAUTIC_${response.status}`)
    } else if (health.provider === 'meta_ads') {
      const graphVersion = env('META_GRAPH_API_VERSION') || 'v23.0'
      if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('META_GRAPH_VERSION_INVALID')
      const response = await fetchWithTimeout(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(env('META_APP_ID')!)}`, { headers: { accept: 'application/json' } })
      if (response.status >= 500) throw new Error(`META_${response.status}`)
      // An app metadata endpoint may reject unauthenticated access even when
      // the app credentials are valid; configuration remains the stronger
      // signal and this probe only detects provider outages.
    } else if (health.provider === 'twilio') {
      const response = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env('TWILIO_ACCOUNT_SID')!)}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}` },
      })
      if (!response.ok) throw new Error(`TWILIO_${response.status}`)
    } else if (health.provider === 'google_search_console') {
      // Google OAuth client credentials cannot be probed without a tenant
      // refresh token. Do not call Google and pretend the integration is live.
      return { ...health, probe: 'not_requested' }
    }
    return { ...health, status: 'healthy', probe: 'passed' }
  } catch (error) {
    // Never return provider response bodies, URLs or credential-shaped values
    // through the readiness endpoint. Operators can correlate the timestamp
    // with server-side logs without turning health into a secret oracle.
    return { ...health, status: 'degraded', probe: 'failed', errorCode: 'external_probe_failed' }
  }
}

export async function getIntegrationReadiness(options: { probeExternal?: boolean } = {}) {
  const initial = issuesToHealth()
  const integrations = options.probeExternal ? await Promise.all(initial.map(probe)) : initial
  const required = new Set(requiredProviders())
  const missingRequired = integrations.filter(item => required.has(item.provider) && item.status === 'not_configured').map(item => item.provider)
  const degraded = integrations.some(item => item.status === 'degraded') || missingRequired.length > 0
  return {
    status: degraded ? 'degraded' : 'ok',
    production: isProductionRuntime(),
    checkedAt: new Date().toISOString(),
    requiredProviders: [...required],
    missingRequired,
    integrations,
    note: 'configured no significa conectado: las conexiones por organización se validan con OAuth y sus tokens almacenados de forma cifrada.',
  }
}

export async function getOperationalReadiness() {
  let database: 'ok' | 'failed' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    database = 'failed'
  }
  const integration = await getIntegrationReadiness()
  const ready = database === 'ok' && integration.status === 'ok'
  const { status: integrationStatus, ...integrationDetails } = integration
  return { status: ready ? 'ready' : 'not_ready', database, integrationStatus, ...integrationDetails }
}

export function collectRuntimeConfigIssues(): RuntimeConfigIssue[] {
  const checks = [
    configIssue('meta_ads', ['META_APP_ID', 'META_APP_SECRET', 'META_TOKEN_ENCRYPTION_KEY', 'META_WEBHOOK_VERIFY_TOKEN']),
    configIssue('google_search_console', ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_BASE_URL', 'ORGANIC_TOKEN_ENCRYPTION_KEY']),
    configIssue('metricool', ['METRICOOL_BASE_URL', 'METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID', 'METRICOOL_BLOG_ID']),
    configIssue('mautic_email', ['MAUTIC_BASE_URL', 'MAUTIC_CLIENT_ID', 'MAUTIC_CLIENT_SECRET', 'MAUTIC_WEBHOOK_SECRET']),
  ]
  return checks.filter((item): item is RuntimeConfigIssue => Boolean(item))
}
