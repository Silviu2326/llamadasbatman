import twilio from 'twilio'
import {
  getOrganizationIntegrationOverride,
  redactProviderError,
  validatePublicBaseUrl,
} from '../lib/integrationRuntime'
import { resolveOrganizationCredentialConfig } from './organizationCredentials.service'

export type TwilioIntegrationConfig = {
  accountSid: string
  authToken: string
  fromNumber?: string
  whatsappFrom?: string
  webhookBaseUrl: string
  mxNumbers: Record<string, string>
  voiceStreamSecret?: string
  humanTransferNumber?: string
  whatsappWelcomeContentSid?: string
  credentialScope: 'organization' | 'environment_override' | 'global_compatibility'
}

export type TwilioCredentialDocument = Record<string, unknown>

const GLOBAL_FALLBACK_FLAG = 'TWILIO_ALLOW_GLOBAL_FALLBACK'

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseMxNumbers(value: unknown): Record<string, string> {
  const candidate = typeof value === 'string'
    ? (() => {
        try { return JSON.parse(value) as unknown } catch { return null }
      })()
    : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
  return Object.fromEntries(Object.entries(candidate).flatMap(([key, number]) => {
    const normalized = stringValue(number)
    return normalized ? [[key.trim(), normalized] as const] : []
  }))
}

function publicBaseUrl(value: string | undefined, allowSharedFallback: boolean): string | undefined {
  const configured = value
    || (allowSharedFallback ? (process.env.TWILIO_WEBHOOK_BASE_URL?.trim() || process.env.PUBLIC_HOST?.trim()) : process.env.PUBLIC_HOST?.trim())
  if (!configured) return undefined
  const withProtocol = /^https?:\/\//i.test(configured)
    ? configured
    : `${configured.startsWith('localhost') ? 'http' : 'https'}://${configured}`
  const invalid = validatePublicBaseUrl('TWILIO_WEBHOOK_BASE_URL', withProtocol)
  if (invalid) {
    // Local development may deliberately use a private callback when the
    // runtime has opted into private integration networks. The URL is still
    // parsed and constrained below; no arbitrary protocol/query is accepted.
    try {
      const parsed = new URL(withProtocol)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) return undefined
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return undefined
      return parsed.toString().replace(/\/$/, '')
    } catch {
      return undefined
    }
  }
  return withProtocol.replace(/\/$/, '')
}

function validAccountSid(value: string | undefined): value is string {
  return Boolean(value && /^AC[a-zA-Z0-9]{20,40}$/.test(value))
}

function validAuthToken(value: string | undefined): value is string {
  return Boolean(value && value.length >= 16 && !['secret', 'password', 'changeme'].includes(value.toLowerCase()))
}

function validAddress(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/^whatsapp:/i, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized)
}

/** Pure parser used by runtime code and unit tests; it never reads Prisma. */
export function parseTwilioCredentialDocument(
  input: TwilioCredentialDocument,
  options: {
    credentialScope: TwilioIntegrationConfig['credentialScope']
    sharedBaseUrl?: string
  },
): TwilioIntegrationConfig | null {
  const accountSid = stringValue(input.accountSid)
  const authToken = stringValue(input.authToken)
  const webhookBaseUrl = publicBaseUrl(stringValue(input.webhookBaseUrl), Boolean(options.sharedBaseUrl))
    || publicBaseUrl(options.sharedBaseUrl, true)
  if (!validAccountSid(accountSid) || !validAuthToken(authToken) || !webhookBaseUrl) return null

  const fromNumber = stringValue(input.fromNumber)
  const whatsappFrom = stringValue(input.whatsappFrom)
  if (fromNumber && !validAddress(fromNumber)) return null
  if (whatsappFrom && !validAddress(whatsappFrom)) return null

  return {
    accountSid,
    authToken,
    ...(fromNumber ? { fromNumber } : {}),
    ...(whatsappFrom ? { whatsappFrom } : {}),
    webhookBaseUrl,
    mxNumbers: parseMxNumbers(input.mxNumbers),
    ...(stringValue(input.voiceStreamSecret) ? { voiceStreamSecret: stringValue(input.voiceStreamSecret) } : {}),
    ...(stringValue(input.humanTransferNumber) ? { humanTransferNumber: stringValue(input.humanTransferNumber) } : {}),
    ...(stringValue(input.whatsappWelcomeContentSid) ? { whatsappWelcomeContentSid: stringValue(input.whatsappWelcomeContentSid) } : {}),
    credentialScope: options.credentialScope,
  }
}

function environmentDocument(): TwilioCredentialDocument {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL,
    mxNumbers: process.env.TWILIO_MX_NUMBERS,
    voiceStreamSecret: process.env.VOICE_STREAM_SECRET,
    humanTransferNumber: process.env.HUMAN_TRANSFER_NUMBER,
    whatsappWelcomeContentSid: process.env.TWILIO_WHATSAPP_WELCOME_CONTENT_SID,
  }
}

/**
 * Resolves Twilio credentials without crossing tenants. For an org, the
 * encrypted organization credential (or its per-org migration override) is
 * authoritative. Global environment credentials are only considered when the
 * explicit compatibility flag is true.
 */
export async function getTwilioIntegrationConfig(orgId?: string): Promise<TwilioIntegrationConfig | null> {
  if (orgId) {
    const resolved = await resolveOrganizationCredentialConfig(orgId, 'twilio')
    if (resolved) {
      return parseTwilioCredentialDocument(resolved.config, {
        credentialScope: resolved.source === 'database' ? 'organization' : 'environment_override',
        sharedBaseUrl: process.env.PUBLIC_HOST,
      })
    }
    if (process.env.TWILIO_ALLOW_GLOBAL_FALLBACK !== 'true') return null
  }

  return parseTwilioCredentialDocument(environmentDocument(), {
    credentialScope: 'global_compatibility',
    sharedBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || process.env.PUBLIC_HOST,
  })
}

export function globalTwilioFallbackEnabled(): boolean {
  return process.env[GLOBAL_FALLBACK_FLAG] === 'true'
}

export function createTwilioClient(config: Pick<TwilioIntegrationConfig, 'accountSid' | 'authToken'>): twilio.Twilio {
  return twilio(config.accountSid, config.authToken)
}

/** Pure SDK-compatible signature verifier. */
export function verifyTwilioSignatureWithAuthToken(
  authToken: string | undefined,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!authToken || !url || !signature) return false
  try {
    return twilio.validateRequest(authToken, signature, url, params)
  } catch {
    return false
  }
}

export function twilioWebhookUrl(baseUrl: string, path: string, query = ''): string {
  const base = baseUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}${query ? `?${query.replace(/^\?/, '')}` : ''}`
}

export function safeTwilioIntegrationError(error: unknown): string {
  return redactProviderError(error)
}
