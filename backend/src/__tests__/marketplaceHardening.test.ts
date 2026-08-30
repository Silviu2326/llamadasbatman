process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.MARKETPLACE_MANIFEST_SIGNING_KEY = 'marketplace-test-signing-key-32-bytes'

import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marketplaceManifestChecksum, marketplaceManifestSchema, startMarketplaceExecution } from '../services/marketplace.service'
import { outcomeIdempotencyKey } from '../services/outcomes.service'
import { ProviderWebhookVerificationError, verifyAndClaimProviderWebhook } from '../services/providerWebhookInbox.service'
import { WalletError } from '../services/wallet.service'

const manifest = {
  schemaVersion: 1 as const,
  kind: 'microapp' as const,
  entrypoint: 'result',
  permissions: [],
  capabilities: ['llm.generate'],
  inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
  outputSchema: { type: 'object' },
  recipe: {
    nodes: [
      { id: 'generate', type: 'capability' as const, capability: 'llm.generate', input: { prompt: '$.input.prompt' }, config: { maxCostCents: 25 } },
      { id: 'result', type: 'output' as const, input: { generated: '$.nodes.generate' } },
    ],
    edges: [{ from: 'generate', to: 'result' }],
  },
}

test('manifiesto marketplace rechaza código, ciclos e IDs duplicados', () => {
  assert.equal(marketplaceManifestSchema.safeParse(manifest).success, true)
  assert.equal(marketplaceManifestSchema.safeParse({ ...manifest, recipe: { ...manifest.recipe, nodes: [{ ...manifest.recipe.nodes[0], code: 'process.exit()' }, manifest.recipe.nodes[1]] } }).success, false)
  assert.equal(marketplaceManifestSchema.safeParse({ ...manifest, recipe: { nodes: [manifest.recipe.nodes[0], { ...manifest.recipe.nodes[1], id: 'generate' }], edges: [] } }).success, false)
  assert.equal(marketplaceManifestSchema.safeParse({ ...manifest, recipe: { ...manifest.recipe, edges: [{ from: 'generate', to: 'result' }, { from: 'result', to: 'generate' }] } }).success, false)
})

test('checksum e idempotencia de outcomes son canónicos', () => {
  assert.equal(marketplaceManifestChecksum({ b: 2, a: 1 }), marketplaceManifestChecksum({ a: 1, b: 2 }))
  assert.equal(
    outcomeIdempotencyKey({ kind: 'deal_won', sourceRef: { opportunityId: 'o1', value: 2 } }),
    outcomeIdempotencyKey({ kind: 'deal_won', sourceRef: { value: 2, opportunityId: 'o1' } }),
  )
})

test('inbox de proveedor rechaza firma ausente y timestamp vencido antes de tocar BD', async () => {
  const profile = { provider: 'test', channel: 'render', secret: 'secret' }
  await assert.rejects(verifyAndClaimProviderWebhook({ profile, headers: {}, rawBody: '{}' }), (error: unknown) => error instanceof ProviderWebhookVerificationError && error.code === 'MISSING_SIGNATURE')
  await assert.rejects(verifyAndClaimProviderWebhook({ profile, headers: { 'webhook-signature': 'x', 'webhook-timestamp': '1', 'webhook-id': 'evt' }, rawBody: '{}' }), (error: unknown) => error instanceof ProviderWebhookVerificationError && error.code === 'STALE_TIMESTAMP')
})

test('saldo insuficiente bloquea marketplace antes de cualquier binding', async () => {
  const checksum = marketplaceManifestChecksum(manifest)
  const signature = `hmac-sha256:${createHmac('sha256', process.env.MARKETPLACE_MANIFEST_SIGNING_KEY!).update(checksum).digest('base64url')}`
  let queued = 0
  let failed = 0
  const install = {
    id: 'install-1', orgId: 'org-1', listingId: 'listing-1', versionId: 'version-1', status: 'installed',
    listing: { id: 'listing-1', slug: 'test-recipe', status: 'published' },
    version: { id: 'version-1', version: '1.0.0', priceCents: 100, manifest, checksum, signature },
  }

  await assert.rejects(
    startMarketplaceExecution(
      { orgId: 'org-1', userId: 'user-1', role: 'owner', listingId: 'listing-1', payload: { prompt: 'hola' } },
      {
        loadInstall: async () => install,
        loadEntitlement: async () => ({ status: 'active', expiresAt: null }),
        createQueuedJob: async (data) => { queued += 1; return { id: 'job-1', ...data } as never },
        reserve: async () => { throw new WalletError('sin saldo', 402, 'WALLET_INSUFFICIENT_FUNDS') },
        failJob: async () => { failed += 1 },
      },
    ),
    (error: unknown) => error instanceof WalletError && error.code === 'WALLET_INSUFFICIENT_FUNDS',
  )
  assert.equal(queued, 1)
  assert.equal(failed, 1)
})

test('entitlement revocado bloquea marketplace antes de crear el job', async () => {
  const checksum = marketplaceManifestChecksum(manifest)
  const signature = `hmac-sha256:${createHmac('sha256', process.env.MARKETPLACE_MANIFEST_SIGNING_KEY!).update(checksum).digest('base64url')}`
  let queued = 0
  await assert.rejects(startMarketplaceExecution(
    { orgId: 'org-1', userId: 'user-1', role: 'owner', listingId: 'listing-1', payload: { prompt: 'hola' } },
    {
      loadInstall: async () => ({ status: 'installed', listing: { status: 'published' }, version: { manifest, checksum, signature } }),
      loadEntitlement: async () => ({ status: 'revoked', expiresAt: null }),
      createQueuedJob: async () => { queued += 1; return { id: 'never' } as never },
    },
  ), (error: unknown) => error instanceof Error && (error as { code?: string }).code === 'MARKETPLACE_ENTITLEMENT_REQUIRED')
  assert.equal(queued, 0)
})
