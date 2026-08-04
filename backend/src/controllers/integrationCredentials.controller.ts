import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { validatePublicBaseUrl, validateSecretValue } from '../lib/integrationRuntime'
import {
  listOrganizationCredentials,
  ORGANIZATION_CREDENTIAL_PROVIDERS,
  revokeOrganizationCredential,
  upsertOrganizationCredential,
} from '../services/organizationCredentials.service'

type JWTUser = { orgId: string }

const providerSchema = z.enum(ORGANIZATION_CREDENTIAL_PROVIDERS)
const bodySchema = z.object({
  slot: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/).optional(),
  secrets: z.record(z.unknown()).refine(value => Object.keys(value).length > 0, 'secrets es obligatorio'),
  metadata: z.record(z.unknown()).optional(),
  scopes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
}).strict()

const ALLOWED_SECRET_KEYS: Record<string, readonly string[]> = {
  metricool: ['baseUrl', 'userToken', 'userId', 'blogId', 'timezone'],
  mautic: ['baseUrl', 'clientId', 'clientSecret', 'webhookSecret'],
  twilio: ['accountSid', 'authToken', 'fromNumber', 'whatsappFrom', 'webhookBaseUrl', 'mxNumbers', 'voiceStreamSecret', 'humanTransferNumber', 'whatsappWelcomeContentSid'],
  google: ['clientId', 'clientSecret'],
}

function stringValue(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim() || value.length > 4_000) throw new Error(`INTEGRATION_${key.toUpperCase()}_INVALID`)
  return value.trim()
}

function validateProviderSecrets(provider: string, input: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_SECRET_KEYS[provider] ?? []
  const unknown = Object.keys(input).filter(key => !allowed.includes(key))
  if (unknown.length) throw new Error('INTEGRATION_SECRET_FIELD_NOT_ALLOWED')
  const result = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, stringValue(value, key)]).filter(([, value]) => value !== undefined))
  const baseUrl = typeof result.baseUrl === 'string' ? result.baseUrl : undefined
  if (baseUrl && validatePublicBaseUrl(`${provider}.baseUrl`, baseUrl)) throw new Error('INTEGRATION_BASE_URL_INVALID')
  const secretFields = provider === 'metricool'
    ? ['userToken']
    : provider === 'mautic'
      ? ['clientSecret', 'webhookSecret']
      : provider === 'twilio'
        ? ['authToken', 'voiceStreamSecret']
        : ['clientSecret']
  for (const field of secretFields) {
    if (result[field] && validateSecretValue(field, String(result[field]), field === 'authToken' ? 16 : 32)) throw new Error('INTEGRATION_SECRET_INVALID')
  }
  if (provider === 'twilio' && result.accountSid && !/^AC[a-zA-Z0-9]{20,40}$/.test(String(result.accountSid))) throw new Error('TWILIO_ACCOUNT_SID_INVALID')
  return result
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ credentials: await listOrganizationCredentials(orgId) })
}

export async function put(
  request: FastifyRequest<{ Params: { provider: string }; Body: z.infer<typeof bodySchema> }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const provider = providerSchema.safeParse(request.params.provider)
  if (!provider.success) return reply.status(400).send({ error: 'Proveedor no soportado' })
  const body = parseRequest(reply, bodySchema, request.body)
  if (!body) return
  try {
    const secrets = validateProviderSecrets(provider.data, body.secrets)
    const metadata = body.metadata ? Object.fromEntries(Object.entries(body.metadata).filter(([key]) => !ALLOWED_SECRET_KEYS[provider.data].includes(key))) : undefined
    const stored = await upsertOrganizationCredential(orgId, {
      provider: provider.data,
      slot: body.slot,
      secrets,
      metadata,
      scopes: body.scopes,
    })
    return reply.status(200).send(stored)
  } catch (error) {
    request.log.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'organization integration credential rejected')
    return reply.status(400).send({ error: 'Credencial de integración no válida' })
  }
}

export async function remove(
  request: FastifyRequest<{ Params: { provider: string; slot?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const provider = providerSchema.safeParse(request.params.provider)
  if (!provider.success) return reply.status(400).send({ error: 'Proveedor no soportado' })
  const revoked = await revokeOrganizationCredential(orgId, provider.data, request.params.slot)
  return reply.send({ ok: true, revoked })
}
