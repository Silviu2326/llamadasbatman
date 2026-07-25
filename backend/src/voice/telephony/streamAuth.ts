import { createHmac, timingSafeEqual } from 'crypto'
import { getTwilioIntegrationConfig } from '../../services/twilioIntegration.service'

/**
 * A short-lived capability for a Twilio Media Stream. Twilio does not include
 * its webhook signature in the WebSocket upgrade, so trusting the `start`
 * payload alone would allow a caller to forge another organisation's call.
 *
 * The capability is only minted while creating TwiML for a Twilio request and
 * is checked before accepting the upgrade. It is intentionally not a JWT: it
 * has a tiny, fixed schema and cannot be used against HTTP APIs.
 */
export interface MediaStreamClaims {
  purpose: 'twilio-media'
  callSid: string
  orgId: string
  agentId: string
  campaignId: string
  leadId: string
  phone: string
  businessType: string
  businessName: string
  issuedAt: number
  expiresAt: number
}

type MediaStreamClaimInput = Omit<MediaStreamClaims, 'purpose' | 'issuedAt' | 'expiresAt'>

const MAX_TOKEN_LENGTH = 4096
const MAX_FIELD_LENGTH = 256
const DEFAULT_TTL_SECONDS = 5 * 60
const MIN_TTL_SECONDS = 60
const MAX_TTL_SECONDS = 60 * 60

function signingSecret(override?: string): string | null {
  if (override?.trim()) return override.trim()
  // TWILIO_AUTH_TOKEN is already required to validate the webhook that emits
  // the TwiML, so it is a safe backwards-compatible fallback. Deployments can
  // set VOICE_STREAM_SECRET to rotate this capability independently.
  return process.env.VOICE_STREAM_SECRET?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || null
}

function configuredTtlSeconds(): number {
  const requested = Number.parseInt(process.env.VOICE_STREAM_TOKEN_TTL_SECONDS ?? '', 10)
  if (!Number.isFinite(requested)) return DEFAULT_TTL_SECONDS
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, requested))
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function validText(value: unknown, required = false): value is string {
  return typeof value === 'string' && value.length <= MAX_FIELD_LENGTH && (required ? value.trim().length > 0 : true)
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createMediaStreamToken(input: MediaStreamClaimInput, secretOverride?: string): string {
  const secret = signingSecret(secretOverride)
  if (!secret) {
    throw new Error('VOICE_STREAM_SECRET or TWILIO_AUTH_TOKEN must be configured before opening media streams')
  }

  if (!validText(input.callSid, true) || !validText(input.orgId, true)) {
    throw new Error('A media stream requires a callSid and orgId')
  }

  const optional = [input.agentId, input.campaignId, input.leadId, input.phone, input.businessType, input.businessName]
  if (!optional.every(value => validText(value))) {
    throw new Error('Invalid media stream claim')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const claims: MediaStreamClaims = {
    purpose: 'twilio-media',
    ...input,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + configuredTtlSeconds(),
  }
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${encodedPayload}.${sign(encodedPayload, secret)}`
}

export function verifyMediaStreamToken(token: string | null | undefined, secretOverride?: string): MediaStreamClaims | null {
  const secret = signingSecret(secretOverride)
  if (!secret || !token || token.length > MAX_TOKEN_LENGTH) return null

  const [encodedPayload, suppliedSignature, ...extraParts] = token.split('.')
  if (!encodedPayload || !suppliedSignature || extraParts.length || !safeEqual(sign(encodedPayload, secret), suppliedSignature)) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<MediaStreamClaims>
    const nowSeconds = Math.floor(Date.now() / 1000)
    const issuedAt = claims.issuedAt
    const expiresAt = claims.expiresAt
    if (
      claims.purpose !== 'twilio-media' ||
      !validText(claims.callSid, true) ||
      !validText(claims.orgId, true) ||
      !validText(claims.agentId) ||
      !validText(claims.campaignId) ||
      !validText(claims.leadId) ||
      !validText(claims.phone) ||
      !validText(claims.businessType) ||
      !validText(claims.businessName) ||
      !Number.isInteger(issuedAt) ||
      !Number.isInteger(expiresAt) ||
      expiresAt == null ||
      issuedAt == null ||
      expiresAt <= nowSeconds ||
      expiresAt - issuedAt > MAX_TTL_SECONDS ||
      issuedAt > nowSeconds + 60
    ) {
      return null
    }

    return claims as MediaStreamClaims
  } catch {
    return null
  }
}

/**
 * Reads only the untrusted tenant hint from a capability. It is never used as
 * authorization; callers must still verify the complete HMAC afterwards.
 */
export function peekMediaStreamOrgId(token: string | null | undefined): string | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const encodedPayload = token.split('.')[0]
  if (!encodedPayload) return null
  try {
    const value = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { orgId?: unknown }
    return typeof value.orgId === 'string' && value.orgId.trim().length <= MAX_FIELD_LENGTH ? value.orgId.trim() : null
  } catch {
    return null
  }
}

/** Resolves the tenant credential before validating the media capability. */
export async function verifyMediaStreamTokenForOrg(token: string | null | undefined): Promise<MediaStreamClaims | null> {
  const orgId = peekMediaStreamOrgId(token)
  if (!orgId) return null
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) return null
  return verifyMediaStreamToken(token, config.voiceStreamSecret ?? config.authToken)
}
