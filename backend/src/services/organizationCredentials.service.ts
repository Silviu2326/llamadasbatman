import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getOrganizationIntegrationOverride, redactProviderError } from '../lib/integrationRuntime'
import { mergeCredentialProviders, normalizeCredentialFields } from '../lib/integrationCatalog'
import { credentialCiphertextNeedsReencryption, credentialMetadata, decryptOrganizationCredential, decryptSecretWithKeyring, encryptOrganizationCredential } from '../lib/organizationCredentialsCrypto'
import { byokProviderIds } from '../providers/registry'

// Proveedores legacy sin descriptor en el registro de src/providers. La lista
// de admitidos real es la unión de estos con byokProviderIds(): ver
// supportedOrganizationCredentialProviders().
export const ORGANIZATION_CREDENTIAL_PROVIDERS = [
  'metricool',
  'mautic',
  'twilio',
  'telegram',
  // Google OAuth application credentials are optional per organization. The
  // usual SaaS deployment keeps the OAuth client global, while tenant tokens
  // remain in OrganicIntegration; this provider enables stricter per-tenant
  // isolation when customers bring their own Google OAuth app.
  'google',
] as const

/**
 * Unión perezosa (legacy + registro BYOK) calculada en cada validación: los
 * adapters se registran al arrancar y congelar la lista en un const de módulo
 * dejaría fuera a los registrados después de la primera importación.
 */
/**
 * Conectores de webs de clientes (routes/webConnections). Usan la misma tabla
 * cifrada con un slot por conexión, pero no aparecen en el catálogo de
 * proveedores: no son BYOK de la organización sino credenciales de un sitio.
 */
export const WEBSITE_CONNECTOR_PROVIDERS = ['wordpress', 'github'] as const

export function supportedOrganizationCredentialProviders(): string[] {
  return mergeCredentialProviders([...ORGANIZATION_CREDENTIAL_PROVIDERS, ...WEBSITE_CONNECTOR_PROVIDERS], byokProviderIds())
}

export type OrganizationCredentialProvider = typeof ORGANIZATION_CREDENTIAL_PROVIDERS[number]
export type OrganizationCredentialInput = {
  provider: string
  slot?: string
  secrets: Record<string, unknown>
  metadata?: Record<string, unknown>
  scopes?: string[]
  accessTokenExpiresAt?: Date | null
  refreshTokenExpiresAt?: Date | null
}

export type ResolvedOrganizationCredential = {
  config: Record<string, unknown>
  source: 'database' | 'environment_override'
  recordId?: string
}

function provider(value: string): string {
  if (!supportedOrganizationCredentialProviders().includes(value)) throw new Error('INTEGRATION_PROVIDER_NOT_SUPPORTED')
  return value
}

function slot(value: string | undefined): string {
  const result = value?.trim() || 'default'
  if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(result)) throw new Error('INTEGRATION_CREDENTIAL_SLOT_INVALID')
  return result
}

function assertSecretDocument(value: Record<string, unknown>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INTEGRATION_CREDENTIALS_REQUIRED')
  if (JSON.stringify(value).length > 32_000) throw new Error('INTEGRATION_CREDENTIALS_TOO_LARGE')
}

async function lazilyReencryptCredential(
  orgId: string,
  recordId: string,
  previousCiphertext: string,
  secrets: Record<string, unknown>,
): Promise<string> {
  if (!credentialCiphertextNeedsReencryption(previousCiphertext)) return previousCiphertext
  const nextCiphertext = encryptOrganizationCredential(secrets)
  // Compare-and-swap: una edición concurrente de la credencial siempre gana;
  // el recifrado de una lectura antigua nunca puede restaurar el secreto viejo.
  await prisma.organizationIntegrationCredential.updateMany({
    where: { id: recordId, orgId, secretEnc: previousCiphertext },
    data: { secretEnc: nextCiphertext },
  }).catch(() => undefined)
  return nextCiphertext
}

export async function getOrganizationCredential(
  orgId: string,
  rawProvider: string,
  rawSlot = 'default',
) {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  const record = await prisma.organizationIntegrationCredential.findUnique({
    where: { orgId_provider_slot: { orgId, provider: providerName, slot: credentialSlot } },
  })
  if (!record || record.status === 'revoked' || !record.secretEnc) return null
  try {
    const secrets = decryptOrganizationCredential(record.secretEnc)
    const secretEnc = await lazilyReencryptCredential(orgId, record.id, record.secretEnc, secrets)
    return { record: { ...record, secretEnc }, secrets }
  } catch (error) {
    await prisma.organizationIntegrationCredential.updateMany({
      where: { id: record.id, orgId },
      data: { status: 'error', lastError: 'credential_decrypt_failed' },
    }).catch(() => undefined)
    throw new Error('INTEGRATION_CREDENTIAL_DECRYPT_FAILED', { cause: error as Error })
  }
}

/**
 * Database is the source of truth. The JSON environment override is retained
 * only as a controlled migration bridge for already deployed workspaces; it
 * is never mixed with another organization's value.
 */
export async function resolveOrganizationCredentialConfig(
  orgId: string | undefined,
  rawProvider: string,
  rawSlot = 'default',
): Promise<ResolvedOrganizationCredential | null> {
  if (!orgId) return null
  const stored = await getOrganizationCredential(orgId, rawProvider, rawSlot)
  if (stored) return { config: stored.secrets, source: 'database', recordId: stored.record.id }
  const override = getOrganizationIntegrationOverride(rawProvider as any, orgId)
  if (override) return { config: override, source: 'environment_override' }
  return null
}

export async function listOrganizationCredentials(orgId: string) {
  const records = await prisma.organizationIntegrationCredential.findMany({
    where: { orgId },
    orderBy: [{ provider: 'asc' }, { slot: 'asc' }],
  })
  return records.map(record => credentialMetadata(record))
}

export async function upsertOrganizationCredential(orgId: string, input: OrganizationCredentialInput) {
  const providerName = provider(input.provider)
  const credentialSlot = slot(input.slot)
  assertSecretDocument(input.secrets)
  const scopes = [...new Set((input.scopes ?? []).filter(value => typeof value === 'string' && value.length <= 300))]
  const metadata = input.metadata ? JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue : undefined
  const secretEnc = encryptOrganizationCredential(input.secrets)
  const record = await prisma.organizationIntegrationCredential.upsert({
    where: { orgId_provider_slot: { orgId, provider: providerName, slot: credentialSlot } },
    create: {
      orgId,
      provider: providerName,
      slot: credentialSlot,
      secretEnc,
      metadata,
      scopes,
      status: 'connected',
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
      lastError: null,
      revokedAt: null,
    },
    update: {
      secretEnc,
      ...(metadata === undefined ? {} : { metadata }),
      scopes,
      status: 'connected',
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
      revokedAt: null,
      lastError: null,
    },
  })
  return credentialMetadata(record)
}

export async function markOrganizationCredentialUsed(orgId: string, rawProvider: string, rawSlot = 'default') {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  await prisma.organizationIntegrationCredential.updateMany({
    where: { orgId, provider: providerName, slot: credentialSlot, status: 'connected' },
    data: { lastUsedAt: new Date() },
  })
}

export async function markOrganizationCredentialRefresh(
  orgId: string,
  rawProvider: string,
  rawSlot: string,
  accessTokenExpiresAt: Date | null,
  refreshTokenExpiresAt?: Date | null,
) {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  await prisma.organizationIntegrationCredential.updateMany({
    where: { orgId, provider: providerName, slot: credentialSlot, status: 'connected' },
    data: { lastRefreshedAt: new Date(), accessTokenExpiresAt, ...(refreshTokenExpiresAt === undefined ? {} : { refreshTokenExpiresAt }), lastError: null },
  })
}

export async function markOrganizationCredentialError(orgId: string, rawProvider: string, error: unknown, rawSlot = 'default') {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  await prisma.organizationIntegrationCredential.updateMany({
    where: { orgId, provider: providerName, slot: credentialSlot },
    data: { status: 'error', lastError: redactProviderError(error).replace(/\[redacted\]/g, 'secret') },
  })
}

export async function revokeOrganizationCredential(orgId: string, rawProvider: string, rawSlot = 'default') {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  const record = await prisma.organizationIntegrationCredential.updateMany({
    where: { orgId, provider: providerName, slot: credentialSlot },
    data: { status: 'revoked', secretEnc: null, revokedAt: new Date(), lastError: null },
  })
  return record.count === 1
}

// Descifra tolerando ambos formatos guardados: el JSON de campos habitual y
// el string plano cifrado con el keyring canónico (encryptSecretWithKeyring).
function decryptCredentialFieldsOrNull(secretEnc: string): Record<string, string> | null {
  try {
    return normalizeCredentialFields(decryptOrganizationCredential(secretEnc))
  } catch {
    try {
      return normalizeCredentialFields(decryptSecretWithKeyring(secretEnc))
    } catch {
      return null
    }
  }
}

/**
 * Descifra el slot "default" sin marcar uso: lo necesita el botón "probar"
 * del Centro de conexiones, que decide markUsed/markError según el resultado
 * real de la prueba y no según el descifrado.
 */
export async function decryptDefaultOrganizationCredential(
  orgId: string,
  rawProvider: string,
): Promise<Record<string, string> | null> {
  return decryptOrganizationCredentialSlot(orgId, rawProvider, 'default')
}

/** Misma lectura que el slot por defecto, para credenciales con un slot por
 * recurso (una por web conectada). */
export async function decryptOrganizationCredentialSlot(
  orgId: string,
  rawProvider: string,
  rawSlot: string,
): Promise<Record<string, string> | null> {
  const providerName = provider(rawProvider)
  const credentialSlot = slot(rawSlot)
  const record = await prisma.organizationIntegrationCredential.findUnique({
    where: { orgId_provider_slot: { orgId, provider: providerName, slot: credentialSlot } },
  })
  if (!record || record.status === 'revoked' || !record.secretEnc) return null
  const fields = decryptCredentialFieldsOrNull(record.secretEnc)
  if (!fields) {
    // Mismo marcado de error que getOrganizationCredential: la credencial
    // queda visible como rota en el catálogo en lugar de fallar en silencio.
    await prisma.organizationIntegrationCredential.updateMany({
      where: { id: record.id, orgId },
      data: { status: 'error', lastError: 'credential_decrypt_failed' },
    }).catch(() => undefined)
    return null
  }
  await lazilyReencryptCredential(orgId, record.id, record.secretEnc, fields)
  return fields
}

/**
 * Resolución BYOK para el router de proveedores (src/providers/credentials.ts
 * la importa dinámicamente con este nombre exacto). Devuelve el objeto de
 * campos del slot por defecto conectado, marcando el uso, o null cuando no
 * hay credencial utilizable o el descifrado falla.
 */
export async function getDecryptedOrganizationCredential(
  orgId: string,
  providerId: string,
): Promise<Record<string, string> | null> {
  const fields = await decryptDefaultOrganizationCredential(orgId, providerId)
  if (!fields) return null
  await markOrganizationCredentialUsed(orgId, providerId)
  return fields
}

/**
 * Consumo del mes natural en curso agrupado por proveedor (03-PROVEEDORES §6)
 * en una sola query groupBy sobre UsageRecord.
 */
export async function getMonthlyUsageByProvider(
  orgId: string,
): Promise<Record<string, { quantity: number; costCents: number }>> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const rows = await prisma.usageRecord.groupBy({
    by: ['provider'],
    where: { orgId, createdAt: { gte: monthStart } },
    _sum: { quantity: true, costCents: true },
  })
  return Object.fromEntries(rows.map(row => [row.provider, {
    quantity: Number(row._sum.quantity ?? 0),
    costCents: Number(row._sum.costCents ?? 0),
  }]))
}
