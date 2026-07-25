import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type ProviderRuntimeStatus = 'not_configured' | 'configured' | 'healthy' | 'degraded'

/**
 * Optional organization-scoped overrides. The current schema stores provider
 * bindings/workspace ids, but not provider secrets. Until a vault-backed
 * credential table exists, these overrides may be supplied as a secret-managed
 * JSON map keyed by organization id. Values are never returned by health APIs.
 */
export type IntegrationProvider = 'metricool' | 'postiz' | 'mautic' | 'twilio'
export type OrganizationIntegrationOverride = Record<string, unknown>

const ORGANIZATION_CONFIG_ENV: Record<IntegrationProvider, string> = {
  metricool: 'METRICOOL_ORG_CONFIG_JSON',
  postiz: 'POSTIZ_ORG_CONFIG_JSON',
  mautic: 'MAUTIC_ORG_CONFIG_JSON',
  twilio: 'TWILIO_ORG_CONFIG_JSON',
}

export type RuntimeConfigIssue = {
  provider: string
  missing: string[]
  invalid: string[]
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 120_000
const SENSITIVE_ENV_NAMES = [
  'META_APP_SECRET',
  'META_TOKEN_ENCRYPTION_KEY',
  'META_WEBHOOK_VERIFY_TOKEN',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'ORGANIC_TOKEN_ENCRYPTION_KEY',
  'METRICOOL_USER_TOKEN',
  'POSTIZ_API_KEY',
  'MAUTIC_CLIENT_SECRET',
  'MAUTIC_WEBHOOK_SECRET',
  'TWILIO_AUTH_TOKEN',
  'METRICOOL_ORG_CONFIG_JSON',
  'POSTIZ_ORG_CONFIG_JSON',
  'MAUTIC_ORG_CONFIG_JSON',
  'TWILIO_ORG_CONFIG_JSON',
  'DATABASE_URL',
  'REDIS_URL',
]

const INSECURE_SECRET_VALUES = new Set([
  'changeme',
  'change_me',
  'change_me_secret',
  'change_me_refresh',
  'change_me_voice_secret',
  'generate_a_random_secret_of_at_least_32_characters_before_starting',
  'generate_a_different_random_secret_of_at_least_32_characters',
  'secret',
  'password',
])

function privateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

function privateIpv6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0]
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('::ffff:192.0.2.')
}

function privateAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? privateIpv4(address) : family === 6 ? privateIpv6(address) : false
}

function privateHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/\.$/, '')
  return value === 'localhost'
    || value.endsWith('.localhost')
    || value.endsWith('.local')
    || value.endsWith('.internal')
    || value === 'host.docker.internal'
}

function privateNetworkOptIn(): boolean {
  return env('ALLOW_PRIVATE_INTEGRATION_NETWORKS') === 'true'
}

function validateUrlShape(name: string, value: string | undefined, options: { httpsInProduction?: boolean } = {}): URL | string {
  if (!value) return `${name} ausente`
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) return `${name} inválida`
    if (options.httpsInProduction && isProductionRuntime() && parsed.protocol !== 'https:') return `${name} debe usar HTTPS`
    if (!privateNetworkOptIn() && (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || privateAddress(parsed.hostname))) return `${name} apunta a una red privada`
    return parsed
  } catch {
    return `${name} inválida`
  }
}

export function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function organizationConfigMap(provider: IntegrationProvider): Record<string, OrganizationIntegrationOverride> {
  const raw = env(ORGANIZATION_CONFIG_ENV[provider])
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([orgId, config]) => {
      return Boolean(orgId.trim()) && isRecord(config)
    })) as Record<string, OrganizationIntegrationOverride>
  } catch {
    // Configuration diagnostics report the variable name, never the JSON or
    // its secret values. Callers must fall back to the global configuration.
    return {}
  }
}

export function organizationIntegrationConfigEnv(provider: IntegrationProvider): string {
  return ORGANIZATION_CONFIG_ENV[provider]
}

export function getOrganizationIntegrationOverride(
  provider: IntegrationProvider,
  orgId: string | undefined,
): OrganizationIntegrationOverride | null {
  if (!orgId?.trim()) return null
  return organizationConfigMap(provider)[orgId.trim()] ?? null
}

export function organizationIntegrationConfigIds(provider: IntegrationProvider): string[] {
  return Object.keys(organizationConfigMap(provider))
}

export function hasOrganizationIntegrationOverrides(provider: IntegrationProvider): boolean {
  return organizationIntegrationConfigIds(provider).length > 0
}

export function integrationCredentialScope(provider: IntegrationProvider, orgId?: string): 'none' | 'global' | 'organization' {
  if (orgId && getOrganizationIntegrationOverride(provider, orgId)) return 'organization'
  return hasOrganizationIntegrationOverrides(provider) ? 'organization' : 'global'
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function configIssue(provider: string, required: readonly string[], options: { invalid?: string[] } = {}): RuntimeConfigIssue | null {
  const present = required.filter(name => Boolean(env(name)))
  const missing = required.filter(name => !env(name))
  if (present.length === 0 && (!options.invalid || options.invalid.length === 0)) return null
  if (missing.length === 0 && (!options.invalid || options.invalid.length === 0)) return null
  return { provider, missing, invalid: options.invalid ?? [] }
}

export function requireCompleteProviderConfig(provider: string, required: readonly string[]): RuntimeConfigIssue | null {
  return configIssue(provider, required)
}

export function validateBaseUrl(name: string, value: string | undefined, options: { httpsInProduction?: boolean } = {}): string | null {
  const result = validateUrlShape(name, value, options)
  return typeof result === 'string' ? result : null
}

/**
 * Validates a callback/base URL that must be reachable from a provider. DNS
 * resolution is deliberately left to the outbound request; this check only
 * rejects obvious local/private names and insecure production URLs.
 */
export function validatePublicBaseUrl(name: string, value: string | undefined): string | null {
  const result = validateUrlShape(name, value, { httpsInProduction: true })
  if (typeof result === 'string') return result
  if (!privateNetworkOptIn() && (privateHostname(result.hostname) || privateAddress(result.hostname))) {
    return `${name} debe apuntar a un host pÃºblico`
  }
  return null
}

export function validateSecretValue(name: string, value: string | undefined, minimumLength = 32): string | null {
  const normalized = value?.trim()
  if (!normalized) return `${name} ausente`
  if (normalized.length < minimumLength) return `${name} demasiado corto`
  if (INSECURE_SECRET_VALUES.has(normalized.toLowerCase())) return `${name} usa un valor de ejemplo`
  return null
}

export function redactProviderError(value: unknown): string {
  let message = value instanceof Error ? value.message : String(value ?? 'Unknown provider error')
  message = message
    .replace(/([?&](?:access_token|client_secret|refresh_token|api_key|apikey|auth_token|token|secret|password|signature)=)[^&\s]*/gi, '$1[redacted]')
    .replace(/(["']?(?:access_token|client_secret|refresh_token|api_key|apikey|auth_token|token|secret|password|authorization|signature)["']?\s*[:=]\s*["']?)([^"',}\s]+)(["']?)/gi, '$1[redacted]$3')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]')
  for (const name of SENSITIVE_ENV_NAMES) {
    const secret = env(name)
    if (secret && secret.length >= 8) message = message.split(secret).join('[redacted]')
  }
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500)
}

export async function assertSafeOutboundUrl(input: string | URL): Promise<URL> {
  const result = validateUrlShape('outbound URL', String(input), { httpsInProduction: false })
  if (typeof result === 'string') throw new Error('OUTBOUND_URL_BLOCKED')
  if (!privateNetworkOptIn() && !isIP(result.hostname)) {
    const addresses = await lookup(result.hostname, { all: true, verbatim: true })
    if (!addresses.length || addresses.some(address => privateAddress(address.address))) throw new Error('OUTBOUND_URL_BLOCKED')
  }
  return result
}

export function stableIdempotencyKey(namespace: string, ...parts: string[]): string {
  const input = [namespace, ...parts].map(part => String(part).trim()).join('|')
  return `${namespace}:${createHash('sha256').update(input).digest('hex').slice(0, 48)}`
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const url = await assertSafeOutboundUrl(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(MAX_TIMEOUT_MS, Math.max(1_000, timeoutMs)))
  timer.unref?.()
  const forwardAbort = () => controller.abort()
  init.signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' })
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function responseErrorCode(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).slice(0, 4_000)
  const safe = redactProviderError(text)
  return `${response.status}${safe ? `: ${safe}` : ''}`
}
