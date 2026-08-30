import { createHash, createHmac } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { bindingsFor, getCapabilityContract } from '../providers/registry'
import { getProvider } from '../providers/registry'
import { route } from '../providers/router'
import { resolveProviderCredential } from '../providers/credentials'
import { createJob, registerJobExecutor } from './jobs.service'
import { reserveForJob } from './wallet.service'
import { isPermission, permissionsForRole } from '../access-control/permissions'

const recipeNode = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  type: z.enum(['capability', 'prompt', 'template', 'transform', 'condition', 'output']),
  capability: z.string().regex(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/).optional(),
  promptTemplate: z.string().max(20_000).optional(),
  input: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
}).strict().superRefine((node, ctx) => {
  if (node.type === 'capability' && !node.capability) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'capability requerida' })
})

export const marketplaceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(['microapp', 'flow']),
  entrypoint: z.string().min(1).max(64),
  permissions: z.array(z.string()).max(50).default([]),
  capabilities: z.array(z.string().regex(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/)).max(50).default([]),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  recipe: z.object({
    nodes: z.array(recipeNode).min(1).max(100),
    edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()).max(300).default([]),
  }).strict(),
}).strict().superRefine((manifest, ctx) => {
  const ids = new Set(manifest.recipe.nodes.map((node) => node.id))
  if (ids.size !== manifest.recipe.nodes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe', 'nodes'], message: 'Los IDs de nodo deben ser únicos' })
  if (!ids.has(manifest.entrypoint)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entrypoint'], message: 'entrypoint no existe' })
  const entrypoint = manifest.recipe.nodes.find(node => node.id === manifest.entrypoint)
  if (entrypoint && entrypoint.type !== 'output') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entrypoint'], message: 'entrypoint debe ser un nodo output' })
  for (const permission of manifest.permissions) {
    if (!isPermission(permission)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissions'], message: `Permiso desconocido: ${permission}` })
  }
  for (const edge of manifest.recipe.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe', 'edges'], message: 'Arista a nodo inexistente' })
  }
  const nodeCapabilities = new Set(manifest.recipe.nodes.map(node => node.capability).filter((value): value is string => !!value))
  for (const capability of nodeCapabilities) if (!manifest.capabilities.includes(capability)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities'], message: `Capability usada pero no declarada: ${capability}` })
  for (const capability of manifest.capabilities) if (!nodeCapabilities.has(capability)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities'], message: `Capability declarada pero no usada: ${capability}` })
  for (const node of manifest.recipe.nodes) if (node.type === 'capability' && (!Number.isSafeInteger(node.config?.maxCostCents) || Number(node.config?.maxCostCents) <= 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe', 'nodes'], message: `El nodo ${node.id} requiere config.maxCostCents entero positivo` })
  const indegree = new Map([...ids].map(id => [id, 0]))
  const outgoing = new Map([...ids].map(id => [id, [] as string[]]))
  for (const edge of manifest.recipe.edges) if (ids.has(edge.from) && ids.has(edge.to)) { indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1); outgoing.get(edge.from)?.push(edge.to) }
  const queue = [...ids].filter(id => indegree.get(id) === 0)
  let visited = 0
  while (queue.length) { const id = queue.shift()!; visited += 1; for (const next of outgoing.get(id) ?? []) { indegree.set(next, (indegree.get(next) ?? 1) - 1); if (indegree.get(next) === 0) queue.push(next) } }
  if (visited !== ids.size) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe', 'edges'], message: 'La receta contiene un ciclo' })
})

export class MarketplaceError extends Error {
  constructor(public code: string, public statusCode: number, message: string, public details?: unknown) { super(message) }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value)
}

export function marketplaceManifestChecksum(manifest: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(manifest)).digest('hex')}`
}

function signChecksum(checksum: string): string | null {
  const key = process.env.MARKETPLACE_MANIFEST_SIGNING_KEY?.trim()
  return key ? `hmac-sha256:${createHmac('sha256', key).update(checksum).digest('base64url')}` : null
}

function verifyVersionIntegrity(version: { manifest: unknown; checksum: string; signature: string | null }, requireSignature: boolean): void {
  const actual = marketplaceManifestChecksum(version.manifest)
  if (actual !== version.checksum) throw new MarketplaceError('MANIFEST_CHECKSUM_MISMATCH', 409, 'La integridad del manifiesto no es válida')
  const expected = signChecksum(actual)
  if (requireSignature && !expected) throw new MarketplaceError('MARKETPLACE_SIGNING_NOT_CONFIGURED', 503, 'Configura MARKETPLACE_MANIFEST_SIGNING_KEY antes de publicar')
  if (expected && version.signature !== expected) throw new MarketplaceError('MANIFEST_SIGNATURE_MISMATCH', 409, 'La firma editorial del manifiesto no es válida')
}

function assertPublisher(listing: { publisherOrgId: string | null }, orgId: string) {
  if (listing.publisherOrgId !== orgId) throw new MarketplaceError('MARKETPLACE_NOT_OWNER', 404, 'Publicación no encontrada')
}

export async function listMarketplace(params: { category?: string; kind?: string }) {
  return prisma.marketplaceListing.findMany({
    where: { status: 'published', ...(params.category ? { category: params.category } : {}), ...(params.kind ? { kind: params.kind } : {}) },
    include: { versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, version: true, priceCents: true, capabilityDependencies: true, permissions: true, checksum: true } } },
    orderBy: [{ publishedAt: 'desc' }, { name: 'asc' }],
    take: 200,
  })
}

export async function getMarketplaceListing(idOrSlug: string) {
  return prisma.marketplaceListing.findFirst({
    where: { status: 'published', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { versions: { orderBy: { createdAt: 'desc' }, select: { id: true, version: true, priceCents: true, capabilityDependencies: true, permissions: true, checksum: true, createdAt: true } } },
  })
}

export async function createMarketplaceListing(input: {
  orgId: string; userId: string; slug: string; kind: 'microapp' | 'flow'; name: string; description: string; category: string; revenueShareBps?: number
}) {
  return prisma.marketplaceListing.create({ data: { publisherOrgId: input.orgId, createdById: input.userId, slug: input.slug, kind: input.kind, name: input.name, description: input.description, category: input.category, revenueShareBps: input.revenueShareBps ?? 7000 } })
}

export async function updateMarketplaceListing(input: { orgId: string; listingId: string; name?: string; description?: string; category?: string }) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: input.listingId } })
  if (!listing) throw new MarketplaceError('MARKETPLACE_NOT_FOUND', 404, 'Publicación no encontrada')
  assertPublisher(listing, input.orgId)
  if (!['draft', 'rejected'].includes(listing.status)) throw new MarketplaceError('MARKETPLACE_IMMUTABLE_REVIEW', 409, 'Solo se edita en borrador o tras rechazo')
  return prisma.marketplaceListing.update({ where: { id: listing.id }, data: { name: input.name, description: input.description, category: input.category, status: 'draft', reviewNotes: null } })
}

export async function addMarketplaceVersion(input: { orgId: string; userId: string; listingId: string; version: string; manifest: unknown; priceCents: number }) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: input.listingId } })
  if (!listing) throw new MarketplaceError('MARKETPLACE_NOT_FOUND', 404, 'Publicación no encontrada')
  assertPublisher(listing, input.orgId)
  if (!['draft', 'rejected'].includes(listing.status)) throw new MarketplaceError('MARKETPLACE_IMMUTABLE_REVIEW', 409, 'No se añaden versiones durante revisión/publicación')
  const parsed = marketplaceManifestSchema.safeParse(input.manifest)
  if (!parsed.success) throw new MarketplaceError('MANIFEST_INVALID', 400, 'Manifiesto declarativo inválido', parsed.error.flatten())
  if (parsed.data.kind !== listing.kind) throw new MarketplaceError('MANIFEST_KIND_MISMATCH', 400, 'El tipo del manifiesto no coincide')
  const capabilities = [...new Set([...parsed.data.capabilities, ...parsed.data.recipe.nodes.map((node) => node.capability).filter((v): v is string => !!v)])]
  const checksum = marketplaceManifestChecksum(parsed.data)
  return prisma.marketplaceVersion.create({ data: { listingId: listing.id, version: input.version, manifest: parsed.data as unknown as Prisma.InputJsonValue, checksum, signature: signChecksum(checksum), capabilityDependencies: capabilities, permissions: parsed.data.permissions, priceCents: input.priceCents, createdById: input.userId } })
}

export async function submitMarketplaceListing(orgId: string, listingId: string) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId }, include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } } })
  if (!listing) throw new MarketplaceError('MARKETPLACE_NOT_FOUND', 404, 'Publicación no encontrada')
  assertPublisher(listing, orgId)
  if (!listing.versions[0]) throw new MarketplaceError('MARKETPLACE_VERSION_REQUIRED', 409, 'Añade una versión antes de enviar')
  return prisma.marketplaceListing.update({ where: { id: listing.id }, data: { status: 'in_review', latestVersionId: listing.versions[0].id, reviewNotes: null } })
}

export function isMarketplaceEditor(email: string): boolean {
  const editors = (process.env.MARKETPLACE_EDITOR_EMAILS ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
  return editors.includes(email.trim().toLowerCase())
}

export async function reviewMarketplaceListing(input: { listingId: string; reviewerId: string; approve: boolean; publish?: boolean; notes?: string }) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: input.listingId }, include: { versions: true } })
  if (!listing || listing.status !== 'in_review' || !listing.latestVersionId) throw new MarketplaceError('MARKETPLACE_NOT_IN_REVIEW', 409, 'La publicación no está en revisión')
  const version = listing.versions.find(row => row.id === listing.latestVersionId)
  if (!version) throw new MarketplaceError('MARKETPLACE_VERSION_NOT_FOUND', 404, 'Versión editorial no encontrada')
  if (input.approve) verifyVersionIntegrity(version, true)
  const status = input.approve ? (input.publish ? 'published' : 'approved') : 'rejected'
  return prisma.marketplaceListing.update({ where: { id: listing.id }, data: { status, reviewedById: input.reviewerId, reviewNotes: input.notes, reviewedAt: new Date(), publishedAt: status === 'published' ? new Date() : null } })
}

export async function installMarketplaceListing(input: { orgId: string; userId: string; role: string; listingId: string; versionId?: string; config?: Record<string, unknown> }) {
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.listingId, status: 'published' }, include: { versions: true } })
  if (!listing) throw new MarketplaceError('MARKETPLACE_NOT_FOUND', 404, 'Publicación no encontrada')
  const version = input.versionId ? listing.versions.find((row) => row.id === input.versionId) : listing.versions.find((row) => row.id === listing.latestVersionId)
  if (!version) throw new MarketplaceError('MARKETPLACE_VERSION_NOT_FOUND', 404, 'Versión no encontrada')
  verifyVersionIntegrity(version, true)
  const missingCapabilities = version.capabilityDependencies.filter((capability) => !getCapabilityContract(capability) || !bindingsFor(capability).some(({ binding }) => binding.routable !== false))
  if (missingCapabilities.length) throw new MarketplaceError('CAPABILITY_DEPENDENCY_MISSING', 409, 'Faltan capabilities instalables', { missingCapabilities })
  const grants = new Set(permissionsForRole(input.role))
  const missingPermissions = version.permissions.filter((permission) => !grants.has(permission as any))
  if (missingPermissions.length) throw new MarketplaceError('PERMISSION_DEPENDENCY_MISSING', 403, 'Tu rol no concede los permisos requeridos', { missingPermissions })
  return prisma.$transaction(async tx => {
    const install = await tx.marketplaceInstall.upsert({
      where: { orgId_listingId: { orgId: input.orgId, listingId: listing.id } },
      create: { orgId: input.orgId, listingId: listing.id, versionId: version.id, installedById: input.userId, config: input.config as Prisma.InputJsonValue | undefined },
      update: { versionId: version.id, installedById: input.userId, status: 'installed', config: input.config as Prisma.InputJsonValue | undefined },
    })
    await tx.marketplaceEntitlement.upsert({
      where: { orgId_listingId: { orgId: input.orgId, listingId: listing.id } },
      create: { orgId: input.orgId, listingId: listing.id, versionId: version.id, source: version.priceCents > 0 ? 'purchase' : 'install', grantedById: input.userId },
      update: { versionId: version.id, status: 'active', source: version.priceCents > 0 ? 'purchase' : 'install', expiresAt: null },
    })
    return install
  })
}

export async function setMarketplaceInstallStatus(input: { orgId: string; listingId: string; status: 'disabled' | 'uninstalled' }) {
  const updated = await prisma.marketplaceInstall.updateMany({ where: { orgId: input.orgId, listingId: input.listingId, status: { not: 'uninstalled' } }, data: { status: input.status } })
  if (!updated.count) throw new MarketplaceError('MARKETPLACE_INSTALL_NOT_FOUND', 404, 'Instalación no encontrada')
  if (input.status === 'uninstalled') await prisma.marketplaceEntitlement.updateMany({ where: { orgId: input.orgId, listingId: input.listingId }, data: { status: 'revoked' } })
}

export async function listMarketplaceInstalls(orgId: string) {
  return prisma.marketplaceInstall.findMany({ where: { orgId, status: { not: 'uninstalled' } }, include: { listing: true, version: { select: { id: true, version: true, checksum: true, priceCents: true, capabilityDependencies: true, permissions: true } } }, orderBy: { updatedAt: 'desc' } })
}

export async function settleMarketplaceExecution(input: { orgId: string; listingId: string; microappRunId: string }) {
  return prisma.$transaction(async tx => {
    const install = await tx.marketplaceInstall.findUnique({ where: { orgId_listingId: { orgId: input.orgId, listingId: input.listingId } }, include: { listing: true, version: true } })
    if (!install || install.status !== 'installed') throw new MarketplaceError('MARKETPLACE_NOT_INSTALLED', 409, 'La receta no está instalada')
    const entitlement = await tx.marketplaceEntitlement.findUnique({ where: { orgId_listingId: { orgId: input.orgId, listingId: input.listingId } } })
    if (!entitlement || entitlement.status !== 'active' || (entitlement.expiresAt && entitlement.expiresAt <= new Date())) throw new MarketplaceError('MARKETPLACE_ENTITLEMENT_REQUIRED', 403, 'Entitlement inactivo')
    const run = await tx.microappRun.findFirst({ where: { id: input.microappRunId, orgId: input.orgId }, select: { id: true, jobId: true, microappId: true, version: true, result: true } })
    if (!run) throw new MarketplaceError('MARKETPLACE_RUN_NOT_FOUND', 404, 'Ejecución de microapp no encontrada en la organización')
    const result = run.result && typeof run.result === 'object' && !Array.isArray(run.result) ? run.result as Record<string, unknown> : {}
    const marketplace = result.marketplace && typeof result.marketplace === 'object' && !Array.isArray(result.marketplace) ? result.marketplace as Record<string, unknown> : {}
    if (result.state !== 'completed' || marketplace.listingId !== install.listingId || marketplace.versionId !== install.versionId) {
      throw new MarketplaceError('MARKETPLACE_RUN_MISMATCH', 409, 'La ejecución no corresponde a esta versión instalada')
    }
    const executionKey = `${input.listingId}:${run.id}`
    const prior = await tx.marketplaceLedgerEntry.findUnique({ where: { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: `${executionKey}:charge` } } })
    if (prior) return { duplicate: true, settlementKey: prior.settlementKey }
    const gross = install.version.priceCents
    const usage = await tx.usageRecord.findMany({
      where: { orgId: input.orgId, jobId: run.jobId },
      select: { priceCents: true, costCents: true, billingMode: true },
    })
    // Registros managed antiguos pueden tener priceCents=0. No regalar el
    // consumo: por fila se cobra el precio explícito o, como suelo, el coste.
    // BYOK permanece a cero aunque meta conserve un coste estimado.
    const providerCharge = Math.ceil(usage.reduce((total, row) => {
      if (row.billingMode !== 'managed') return total
      return total + Math.max(Number(row.priceCents), Number(row.costCents))
    }, 0))
    const calculatedCharge = gross + providerCharge
    const publisherShare = install.listing.publisherOrgId ? Math.floor(gross * install.listing.revenueShareBps / 10_000) : 0
    const platformFee = gross - publisherShare
    const settlementKey = `marketplace:${executionKey}`
    const hold = await tx.walletHold.findUnique({ where: { jobId: run.jobId } })
    if (!hold || hold.orgId !== input.orgId) throw new MarketplaceError('MARKETPLACE_HOLD_REQUIRED', 409, 'La ejecución no tiene una reserva financiera válida')
    const customerCharge = Math.min(calculatedCharge, hold.amountCents)
    const overageCents = Math.max(0, calculatedCharge - customerCharge)
    await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${hold.walletId} AND "orgId" = ${input.orgId} FOR UPDATE`
    const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "WalletHold" WHERE "jobId" = ${run.jobId} AND "orgId" = ${input.orgId} FOR UPDATE`
    if (locked[0]?.status !== 'active') throw new MarketplaceError('MARKETPLACE_HOLD_NOT_ACTIVE', 409, 'La reserva financiera ya no está activa')
    if (customerCharge > 0) {
      await tx.walletTransaction.create({ data: { orgId: input.orgId, walletId: hold.walletId, amountCents: -customerCharge, reason: 'usage', jobId: run.jobId, idempotencyKey: `${executionKey}:marketplace-charge` } })
      await tx.wallet.update({ where: { id: hold.walletId }, data: { balanceCents: { decrement: customerCharge } } })
      if (publisherShare > 0 && install.listing.publisherOrgId) {
        const publisherWallet = await tx.wallet.upsert({ where: { orgId: install.listing.publisherOrgId }, create: { orgId: install.listing.publisherOrgId, balanceCents: publisherShare }, update: { balanceCents: { increment: publisherShare } } })
        await tx.walletTransaction.create({ data: { orgId: install.listing.publisherOrgId, walletId: publisherWallet.id, amountCents: publisherShare, reason: 'transfer', jobId: run.jobId, idempotencyKey: `${executionKey}:marketplace-share` } })
      }
    }
    await tx.walletHold.update({ where: { jobId: run.jobId }, data: { status: 'captured', resolvedAt: new Date() } })
    const common = { listingId: install.listingId, versionId: install.versionId, microappRunId: input.microappRunId, settlementKey, currency: 'EUR', counterpartyOrgId: install.listing.publisherOrgId, metadata: { revenueShareBps: install.listing.revenueShareBps, providerChargeCents: providerCharge, calculatedChargeCents: calculatedCharge, reservedCents: hold.amountCents, overageCents, requiresReconciliation: overageCents > 0 } as Prisma.InputJsonValue }
    await tx.marketplaceLedgerEntry.createMany({ data: [
      { ...common, orgId: input.orgId, kind: 'customer_charge', amountCents: customerCharge, idempotencyKey: `${executionKey}:charge` },
      { ...common, orgId: install.listing.publisherOrgId ?? input.orgId, kind: 'publisher_share', amountCents: publisherShare, idempotencyKey: `${executionKey}:publisher` },
      { ...common, orgId: input.orgId, kind: 'platform_fee', amountCents: platformFee, idempotencyKey: `${executionKey}:platform` },
    ] })
    return { duplicate: false, settlementKey, grossCents: gross, providerChargeCents: providerCharge, calculatedChargeCents: calculatedCharge, customerChargeCents: customerCharge, overageCents, requiresReconciliation: overageCents > 0, publisherShareCents: publisherShare, platformFeeCents: platformFee }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

type MarketplaceJobInput = { listingId: string; versionId: string; payload: Record<string, unknown> }

function valueAt(root: Record<string, unknown>, path: string): unknown {
  const clean = path.replace(/^\$\./, '')
  return clean.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, root)
}

function resolveDeclarative(value: unknown, state: Record<string, unknown>): unknown {
  if (typeof value === 'string' && value.startsWith('$.')) return valueAt(state, value)
  if (Array.isArray(value)) return value.map(entry => resolveDeclarative(entry, state))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, resolveDeclarative(entry, state)]))
  return value
}

function renderTemplate(template: string, state: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = valueAt(state, path)
    return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
  })
}

function orderedNodes(manifest: z.infer<typeof marketplaceManifestSchema>) {
  const byId = new Map(manifest.recipe.nodes.map(node => [node.id, node]))
  const indegree = new Map(manifest.recipe.nodes.map(node => [node.id, 0]))
  const outgoing = new Map(manifest.recipe.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of manifest.recipe.edges) { indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1); outgoing.get(edge.from)?.push(edge.to) }
  const queue = manifest.recipe.nodes.map(node => node.id).filter(id => indegree.get(id) === 0)
  const result: typeof manifest.recipe.nodes = []
  while (queue.length) { const id = queue.shift()!; result.push(byId.get(id)!); for (const next of outgoing.get(id) ?? []) { indegree.set(next, (indegree.get(next) ?? 1) - 1); if (indegree.get(next) === 0) queue.push(next) } }
  return result
}

function validateJsonSchemaSubset(schema: Record<string, unknown>, value: unknown, label: string, depth = 0): void {
  if (depth > 12) throw new MarketplaceError('MARKETPLACE_SCHEMA_UNSAFE', 400, `${label}: esquema demasiado profundo`)
  const type = schema.type
  const valid = type === undefined
    || (type === 'object' && !!value && typeof value === 'object' && !Array.isArray(value))
    || (type === 'array' && Array.isArray(value))
    || (type === 'string' && typeof value === 'string')
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && typeof value === 'number' && Number.isInteger(value))
    || (type === 'boolean' && typeof value === 'boolean')
    || (type === 'null' && value === null)
  if (!valid) throw new MarketplaceError('MARKETPLACE_SCHEMA_INVALID', 400, `${label}: tipo inválido`)
  if (Array.isArray(schema.enum) && !schema.enum.some(entry => canonical(entry) === canonical(value))) throw new MarketplaceError('MARKETPLACE_SCHEMA_INVALID', 400, `${label}: valor fuera del enum`)
  if (type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const required = Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : []
    const missing = required.filter(key => record[key] === undefined)
    if (missing.length) throw new MarketplaceError('MARKETPLACE_SCHEMA_INVALID', 400, `${label}: faltan campos requeridos`, { missing })
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : {}
    for (const [key, child] of Object.entries(properties)) if (record[key] !== undefined && child && typeof child === 'object' && !Array.isArray(child)) validateJsonSchemaSubset(child as Record<string, unknown>, record[key], `${label}.${key}`, depth + 1)
  }
  if (type === 'array' && Array.isArray(value) && schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) for (let i = 0; i < value.length; i += 1) validateJsonSchemaSubset(schema.items as Record<string, unknown>, value[i], `${label}[${i}]`, depth + 1)
}

function validateSimpleJsonInput(schema: Record<string, unknown>, payload: Record<string, unknown>) {
  validateJsonSchemaSubset(schema, payload, 'input')
  const required = Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : []
  const missing = required.filter(key => payload[key] === undefined)
  if (missing.length) throw new MarketplaceError('MARKETPLACE_INPUT_INVALID', 400, 'Faltan campos requeridos', { missing })
}

export async function startMarketplaceExecution(
  input: { orgId: string; userId: string; role: string; listingId: string; payload: Record<string, unknown>; idempotencyKey?: string },
  deps?: {
    loadInstall?: () => Promise<any>
    loadEntitlement?: () => Promise<any>
    createQueuedJob?: typeof createJob
    reserve?: typeof reserveForJob
    failJob?: (jobId: string, error: unknown) => Promise<void>
  },
) {
  const install = deps?.loadInstall ? await deps.loadInstall() : await prisma.marketplaceInstall.findUnique({ where: { orgId_listingId: { orgId: input.orgId, listingId: input.listingId } }, include: { listing: true, version: true } })
  if (!install || install.status !== 'installed' || install.listing.status !== 'published') throw new MarketplaceError('MARKETPLACE_NOT_INSTALLED', 409, 'La receta no está instalada y activa')
  const entitlement = deps?.loadEntitlement
    ? await deps.loadEntitlement()
    : await prisma.marketplaceEntitlement.findUnique({ where: { orgId_listingId: { orgId: input.orgId, listingId: input.listingId } } })
  if (!entitlement || entitlement.status !== 'active' || (entitlement.expiresAt && entitlement.expiresAt <= new Date())) {
    throw new MarketplaceError('MARKETPLACE_ENTITLEMENT_REQUIRED', 403, 'Entitlement inactivo')
  }
  verifyVersionIntegrity(install.version, true)
  const manifest = marketplaceManifestSchema.parse(install.version.manifest)
  const grants = new Set(permissionsForRole(input.role))
  const missing = manifest.permissions.filter(permission => !grants.has(permission as any))
  if (missing.length) throw new MarketplaceError('PERMISSION_DEPENDENCY_MISSING', 403, 'Tu rol ya no concede los permisos requeridos', { missing })
  validateSimpleJsonInput(manifest.inputSchema, input.payload)
  const reserveCents = install.version.priceCents + manifest.recipe.nodes
    .filter(node => node.type === 'capability')
    .reduce((total, node) => total + Math.ceil(Number(node.config?.maxCostCents ?? 0)), 0)
  const job = await (deps?.createQueuedJob ?? createJob)({
    orgId: input.orgId,
    kind: 'marketplace.run',
    createdById: input.userId,
    microappId: `marketplace:${install.listing.slug}`,
    costEstimateCents: reserveCents,
    idempotencyKey: input.idempotencyKey ? `${install.listingId}:${install.versionId}:${input.idempotencyKey}` : undefined,
    input: { listingId: install.listingId, versionId: install.versionId, payload: input.payload } as Prisma.InputJsonValue,
    maxAttempts: 1,
  })
  try {
    await (deps?.reserve ?? reserveForJob)({ orgId: input.orgId, jobId: job.id, amountCents: reserveCents })
  } catch (error) {
    if (deps?.failJob) await deps.failJob(job.id, error)
    else await prisma.job.updateMany({ where: { id: job.id, orgId: input.orgId, status: 'pending' }, data: { status: 'failed', finishedAt: new Date(), error: { code: (error as { code?: string }).code ?? 'WALLET_RESERVATION_FAILED', message: error instanceof Error ? error.message : 'No se pudo reservar saldo' } } })
    throw error
  }
  return { jobId: job.id }
}

let marketplaceExecutorRegistered = false
export function registerMarketplaceExecutor() {
  if (marketplaceExecutorRegistered) return
  marketplaceExecutorRegistered = true
  registerJobExecutor('marketplace.run', async job => {
    const input = job.input as unknown as MarketplaceJobInput
    const install = await prisma.marketplaceInstall.findUnique({ where: { orgId_listingId: { orgId: job.orgId, listingId: input.listingId } }, include: { listing: true, version: true } })
    if (!install || install.status !== 'installed' || install.versionId !== input.versionId) throw new MarketplaceError('MARKETPLACE_NOT_INSTALLED', 409, 'La versión ejecutada ya no está instalada')
    const entitlement = await prisma.marketplaceEntitlement.findUnique({ where: { orgId_listingId: { orgId: job.orgId, listingId: input.listingId } } })
    if (!entitlement || entitlement.versionId !== input.versionId || entitlement.status !== 'active' || (entitlement.expiresAt && entitlement.expiresAt <= new Date())) {
      throw new MarketplaceError('MARKETPLACE_ENTITLEMENT_REQUIRED', 403, 'Entitlement inactivo')
    }
    verifyVersionIntegrity(install.version, true)
    const manifest = marketplaceManifestSchema.parse(install.version.manifest)
    let run = await prisma.microappRun.upsert({
      where: { jobId: job.id },
      create: { orgId: job.orgId, microappId: `marketplace:${install.listing.slug}`, version: install.version.version, jobId: job.id, input: input.payload as Prisma.InputJsonValue, result: { state: 'running' }, createdById: job.createdById },
      update: {},
    })
    const previous = run.result && typeof run.result === 'object' && !Array.isArray(run.result) ? run.result as Record<string, unknown> : {}
    if (previous.state !== 'completed') {
      const savedNodes = previous.nodeOutputs && typeof previous.nodeOutputs === 'object' && !Array.isArray(previous.nodeOutputs) ? previous.nodeOutputs as Record<string, unknown> : {}
      const state: Record<string, unknown> = { input: input.payload, nodes: { ...savedNodes } }
      const routingDecisions: unknown[] = Array.isArray(previous.routingDecisions) ? [...previous.routingDecisions] : []
      for (const node of orderedNodes(manifest)) {
        if (Object.prototype.hasOwnProperty.call(state.nodes, node.id)) continue
        let output: unknown
        const resolvedInput = resolveDeclarative(node.input ?? {}, state)
        if (node.type === 'capability') {
          const { decision, binding } = await route({ orgId: job.orgId, capability: node.capability!, input: resolvedInput, preferences: { maxCostCents: Number(node.config?.maxCostCents) } })
          routingDecisions.push(decision)
          const credential = await resolveProviderCredential(job.orgId, decision.providerId)
          const provider = getProvider(decision.providerId)
          const contract = getCapabilityContract(node.capability!)
          if (!provider || !contract) throw new MarketplaceError('CAPABILITY_DEPENDENCY_MISSING', 409, `Capability no disponible: ${node.capability}`)
          const result = await binding.execute({ orgId: job.orgId, jobId: job.id, executionKey: `${job.id}:${node.id}`, billingMode: decision.billingMode, secret: credential?.secret ?? null }, contract.input.parse(resolvedInput))
          if ('pending' in result && result.pending) throw new MarketplaceError('MARKETPLACE_ASYNC_REQUIRES_FLOW', 409, 'Una receta microapp no puede esperar una capability remota; publícala como flow')
          output = contract.output.parse((result as { output: unknown }).output)
        } else if (node.type === 'prompt') output = renderTemplate(node.promptTemplate ?? '', state)
        else if (node.type === 'template') output = resolveDeclarative(node.config ?? node.input ?? {}, state)
        else if (node.type === 'condition') {
          const config = node.config ?? {}; const actual = typeof config.path === 'string' ? valueAt(state, config.path) : undefined
          output = actual === config.equals ? resolveDeclarative(config.then, state) : resolveDeclarative(config.else, state)
        } else if (node.type === 'transform') {
          const config = node.config ?? {}
          if (config.operation === 'pick' && Array.isArray(config.paths)) output = Object.fromEntries(config.paths.filter((p): p is string => typeof p === 'string').map(path => [path.split('.').pop()!, valueAt(state, path)]))
          else if (config.operation === 'merge' && Array.isArray(resolvedInput)) output = Object.assign({}, ...resolvedInput.filter(v => v && typeof v === 'object'))
          else output = resolvedInput
        } else output = resolvedInput
        ;(state.nodes as Record<string, unknown>)[node.id] = output
        await prisma.microappRun.update({ where: { id: run.id }, data: { result: { state: 'running', nodeOutputs: state.nodes, routingDecisions } as Prisma.InputJsonValue } })
      }
      const data = (state.nodes as Record<string, unknown>)[manifest.entrypoint]
      if (data === undefined) throw new MarketplaceError('MARKETPLACE_ENTRYPOINT_MISSING', 500, 'La receta no produjo su entrypoint')
      validateJsonSchemaSubset(manifest.outputSchema, data, 'output')
      run = await prisma.microappRun.update({ where: { id: run.id }, data: { result: { state: 'completed', data, evidence: [], routingDecisions, marketplace: { listingId: install.listingId, versionId: install.versionId, checksum: install.version.checksum } } as Prisma.InputJsonValue } })
    }
    const settlement = await settleMarketplaceExecution({ orgId: job.orgId, listingId: install.listingId, microappRunId: run.id })
    return { output: { microappRunId: run.id, listingId: install.listingId, versionId: install.versionId, settlement } }
  })
}
