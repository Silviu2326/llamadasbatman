import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { redactProviderError, validatePublicBaseUrl, validateSecretValue } from '../lib/integrationRuntime'
import { buildIntegrationCatalog } from '../lib/integrationCatalog'
import { getProvider, listProviders } from '../providers/registry'
import { providerDependencyImpacts } from '../services/integrationDependencies.service'
import { resendInboundWebhookEndpoint } from '../services/resendInboundEmail.service'
import {
  decryptDefaultOrganizationCredential,
  getOrganizationCredential,
  getMonthlyUsageByProvider,
  listOrganizationCredentials,
  markOrganizationCredentialError,
  markOrganizationCredentialUsed,
  ORGANIZATION_CREDENTIAL_PROVIDERS,
  revokeOrganizationCredential,
  supportedOrganizationCredentialProviders,
  upsertOrganizationCredential,
} from '../services/organizationCredentials.service'

type JWTUser = { orgId: string }

// La lista admitida es la unión perezosa legacy + registro BYOK, así que la
// validación es una función y no un z.enum congelado en la importación.
function resolveProviderParam(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) return null
  return supportedOrganizationCredentialProviders().includes(normalized) ? normalized : null
}
const bodySchema = z.object({
  slot: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/).optional(),
  secrets: z.record(z.unknown()).refine(value => Object.keys(value).length > 0, 'secrets es obligatorio'),
  metadata: z.record(z.unknown()).optional(),
  scopes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
}).strict()

const ALLOWED_SECRET_KEYS: Record<string, readonly string[]> = {
  metricool: ['baseUrl', 'userToken', 'userId', 'blogId', 'timezone'],
  twilio: ['accountSid', 'authToken', 'fromNumber', 'whatsappFrom', 'webhookBaseUrl', 'mxNumbers', 'voiceStreamSecret', 'humanTransferNumber', 'whatsappWelcomeContentSid'],
  telegram: ['botToken'],
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
    : provider === 'twilio'
      ? ['authToken', 'voiceStreamSecret']
      : provider === 'telegram'
        ? ['botToken']
        : ['clientSecret']
  for (const field of secretFields) {
    if (result[field] && validateSecretValue(field, String(result[field]), field === 'authToken' ? 16 : 32)) throw new Error('INTEGRATION_SECRET_INVALID')
  }
  if (provider === 'twilio' && result.accountSid && !/^AC[a-zA-Z0-9]{20,40}$/.test(String(result.accountSid))) throw new Error('TWILIO_ACCOUNT_SID_INVALID')
  return result
}

// Los proveedores del registro validan contra sus SecretFieldSpec declarados:
// las claves permitidas, la obligatoriedad y el tipo salen del descriptor en
// lugar de la tabla legacy ALLOWED_SECRET_KEYS.
function validateRegistryProviderSecrets(providerId: string, input: Record<string, unknown>): Record<string, unknown> {
  const fields = getProvider(providerId)?.auth.byokFields ?? []
  if (!fields.length) throw new Error('INTEGRATION_SECRET_FIELD_NOT_ALLOWED')
  const allowed = fields.map(field => field.key)
  const unknown = Object.keys(input).filter(key => !allowed.includes(key))
  if (unknown.length) throw new Error('INTEGRATION_SECRET_FIELD_NOT_ALLOWED')
  const result = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, stringValue(value, key)]).filter(([, value]) => value !== undefined))
  for (const field of fields) {
    const value = result[field.key]
    if (field.required && value === undefined) throw new Error('INTEGRATION_CREDENTIALS_REQUIRED')
    if (value === undefined) continue
    if (field.kind === 'url' && validatePublicBaseUrl(`${providerId}.${field.key}`, String(value))) throw new Error('INTEGRATION_BASE_URL_INVALID')
    if (field.kind === 'secret' && validateSecretValue(field.key, String(value), 16)) throw new Error('INTEGRATION_SECRET_INVALID')
  }
  return result
}

function allowedSecretKeys(providerId: string): readonly string[] {
  return ALLOWED_SECRET_KEYS[providerId] ?? (getProvider(providerId)?.auth.byokFields ?? []).map(field => field.key)
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
  const provider = resolveProviderParam(request.params.provider)
  if (!provider) return reply.status(400).send({ error: 'Proveedor no soportado' })
  const body = parseRequest(reply, bodySchema, request.body)
  if (!body) return
  try {
    const secrets = ALLOWED_SECRET_KEYS[provider]
      ? validateProviderSecrets(provider, body.secrets)
      : validateRegistryProviderSecrets(provider, body.secrets)
    const metadata = body.metadata ? Object.fromEntries(Object.entries(body.metadata).filter(([key]) => !allowedSecretKeys(provider).includes(key))) : undefined
    const stored = await upsertOrganizationCredential(orgId, {
      provider,
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
  const provider = resolveProviderParam(request.params.provider)
  if (!provider) return reply.status(400).send({ error: 'Proveedor no soportado' })
  const revoked = await revokeOrganizationCredential(orgId, provider, request.params.slot)
  return reply.send({ ok: true, revoked })
}

/**
 * Catálogo del Centro de conexiones (03-PROVEEDORES §4 y §6): registro +
 * legacy, con estado de conexión de la org y consumo del mes en curso.
 */
export async function catalog(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const descriptors = listProviders()
  const providerIds = [...new Set([...descriptors.map(provider => provider.id), ...ORGANIZATION_CREDENTIAL_PROVIDERS])]
  const [credentials, usageByProvider, impacts] = await Promise.all([
    listOrganizationCredentials(orgId),
    getMonthlyUsageByProvider(orgId),
    providerDependencyImpacts(orgId, providerIds),
  ])
  const providers = buildIntegrationCatalog({
    descriptors,
    legacyProviders: ORGANIZATION_CREDENTIAL_PROVIDERS,
    credentials,
    usageByProvider,
    dependencyImpactByProvider: impacts,
  })
  return reply.send({ providers })
}

/**
 * Botón "probar" del Centro de conexiones. Nunca devuelve el secreto ni
 * fragmentos: cualquier mensaje del proveedor pasa por redactProviderError.
 */
export async function testProvider(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const providerId = request.params.provider?.trim().toLowerCase() ?? ''
  const descriptor = providerId ? getProvider(providerId) : undefined
  const testConnection = descriptor?.auth.testConnection
  if (!descriptor || !testConnection) {
    return reply.status(501).send({ ok: false, message: 'Este proveedor no admite prueba de conexión automática todavía' })
  }
  let secret: Record<string, string> | null = null
  try {
    secret = await decryptDefaultOrganizationCredential(orgId, providerId)
  } catch {
    // INTEGRATION_PROVIDER_NOT_SUPPORTED: descrito en el registro pero sin BYOK.
    return reply.status(400).send({ ok: false, message: 'Este proveedor no admite credenciales propias de la organización' })
  }
  if (!secret) {
    return reply.status(400).send({ ok: false, message: 'No hay credencial conectada para este proveedor' })
  }
  try {
    const result = await testConnection(secret)
    if (result.ok) {
      await markOrganizationCredentialUsed(orgId, providerId)
      return reply.send({ ok: true, message: result.message ? redactProviderError(result.message) : 'Conexión verificada' })
    }
    await markOrganizationCredentialError(orgId, providerId, result.message ?? 'test_connection_failed')
    return reply.send({ ok: false, message: result.message ? redactProviderError(result.message) : 'La prueba de conexión falló' })
  } catch (error) {
    await markOrganizationCredentialError(orgId, providerId, error)
    return reply.send({ ok: false, message: redactProviderError(error) })
  }
}

export async function resendInboundWebhook(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const credential = await getOrganizationCredential(orgId, 'resend').catch(() => null)
  const endpoint = resendInboundWebhookEndpoint(orgId)
  const signingSecretConfigured = typeof credential?.secrets.webhookSigningSecret === 'string' && Boolean(credential.secrets.webhookSigningSecret)
  const resendApiKeyConfigured = typeof credential?.secrets.apiKey === 'string' && Boolean(credential.secrets.apiKey)
  return reply.send({ endpoint, signingSecretConfigured, resendApiKeyConfigured, ready: Boolean(endpoint && signingSecretConfigured && resendApiKeyConfigured) })
}
