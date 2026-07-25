import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getOrganizationIntegrationOverride, redactProviderError } from '../lib/integrationRuntime'
import { credentialMetadata, decryptOrganizationCredential, encryptOrganizationCredential } from '../lib/organizationCredentialsCrypto'

export const ORGANIZATION_CREDENTIAL_PROVIDERS = [
  'metricool',
  'postiz',
  'mautic',
  'twilio',
  // Google OAuth application credentials are optional per organization. The
  // usual SaaS deployment keeps the OAuth client global, while tenant tokens
  // remain in OrganicIntegration; this provider enables stricter per-tenant
  // isolation when customers bring their own Google OAuth app.
  'google',
] as const

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

function provider(value: string): OrganizationCredentialProvider {
  if (!(ORGANIZATION_CREDENTIAL_PROVIDERS as readonly string[]).includes(value)) throw new Error('INTEGRATION_PROVIDER_NOT_SUPPORTED')
  return value as OrganizationCredentialProvider
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
    return { record, secrets: decryptOrganizationCredential(record.secretEnc) }
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
