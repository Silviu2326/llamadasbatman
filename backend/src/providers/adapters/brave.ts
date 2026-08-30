// Adapter de Brave Search para el registro de proveedores: envuelve
// webSearch.service.ts existente (que defendía "sin capa de abstracción
// mientras haya un solo proveedor" — el catálogo de capabilities es
// exactamente el momento en que ese criterio caduca, 03-PROVEEDORES §0).
// Se auto-registra al importarse.
//
// Consumo: el servicio legado conserva su degradación a [] para no romper
// investigaciones antiguas. El adapter usa su variante observable y registra
// exactamente un UsageRecord idempotente por llamada enrutada.
import { createHash } from 'node:crypto'
import { recordUsage } from '../../lib/usage'
import { searchWithStatus } from '../../services/webSearch.service'
import { webSearchInput } from '../capabilities'
import { registerProvider } from '../registry'
import type { CapabilityExecuteResult, CostEstimate, ProviderCtx } from '../types'

async function estimateCost(): Promise<CostEstimate> {
  // Tarifa plana por petición (~1 $/1000 búsquedas del plan Base): 0,1 ¢.
  return { cents: 0.1, confidence: 'estimate' }
}

async function execute(ctx: ProviderCtx, rawInput: unknown): Promise<CapabilityExecuteResult> {
  const input = webSearchInput.parse(rawInput)
  // `freshnessDays` del contrato aún no llega al servicio (search() no expone
  // el parámetro de frescura de Brave): se ignora documentadamente — devuelve
  // resultados más amplios, no incorrectos.
  const attempt = await searchWithStatus(input.query, { count: input.count })
  if (attempt.attempted) {
    const fallback = createHash('sha256')
      .update(`${ctx.executionKey ?? ctx.jobId ?? 'adhoc'}|${input.query}|${input.count}`)
      .digest('hex')
    await recordUsage({
      orgId: ctx.orgId,
      provider: 'brave',
      capability: 'web.search',
      quantity: 1,
      unit: 'requests',
      costCents: 0.1,
      billingMode: ctx.billingMode,
      jobId: ctx.jobId,
      rateVersion: process.env.BRAVE_SEARCH_RATE_VERSION?.trim() || 'brave:2026-08',
      idempotencyKey: `brave:${attempt.requestId ?? fallback}`,
      meta: { ok: attempt.ok, status: attempt.status ?? null, resultCount: attempt.results.length },
    })
  }
  if (!attempt.attempted) throw new Error('Brave Search no está configurado')
  if (!attempt.ok) throw new Error(`Brave Search no completó la petición${attempt.status ? ` (${attempt.status})` : ''}`)
  return {
    output: {
      results: attempt.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      })),
    },
  }
}

registerProvider({
  id: 'brave',
  displayName: 'Brave Search',
  capabilities: [
    {
      capability: 'web.search',
      qualityTier: 'standard',
      limits: {},
      estimateCost,
      execute,
    },
  ],
  auth: {
    modes: ['managed'],
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://api-dashboard.search.brave.com/app/documentation/web-search/get-started',
})
