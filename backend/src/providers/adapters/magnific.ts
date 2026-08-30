// Adapter de Magnific — primera integración asíncrona nueva sobre el contrato
// Job (docs/plataforma-abierta/03-PROVEEDORES.md §5). El descriptor se
// registra al importar el módulo, igual que el resto de adapters; el cierre
// del job lo hace el webhook de src/routes/providerWebhooks.ts (o el polling
// de respaldo pollPendingMagnificJobs).
import { registerProvider } from '../registry'
import { imageUpscaleInput } from '../capabilities'
import type { CapabilityExecuteResult, CostEstimate, ProviderCtx } from '../types'
import { submitUpscale, validateApiKey } from './magnificClient'
import { getAsset } from '../../services/assets.service'

export const MAGNIFIC_PROVIDER_ID = 'magnific'

// Coste gestionado estimado por upscale x2 en céntimos; escala linealmente con
// el factor. Es una estimación operable (confidence 'estimate'): el coste real
// llega con el webhook o queda el estimado.
function baseCostCents(): number {
  const raw = Number(process.env.MAGNIFIC_UPSCALE_COST_CENTS)
  return Number.isFinite(raw) && raw > 0 ? raw : 10
}

/**
 * URL pública del webhook entrante. Reutiliza PUBLIC_HOST (la env ya existente
 * para el host público del backend) y exige MAGNIFIC_WEBHOOK_TOKEN: sin token
 * el endpoint receptor rechazaría el aviso y el job se quedaría colgado, así
 * que es mejor fallar aquí con un mensaje accionable.
 */
function webhookUrl(): string {
  const base = process.env.PUBLIC_HOST?.trim().replace(/\/$/, '')
  if (!base) {
    throw new Error('Configura PUBLIC_HOST (URL pública del backend) para recibir los webhooks de Magnific')
  }
  const token = process.env.MAGNIFIC_WEBHOOK_TOKEN?.trim()
  if (!token) {
    throw new Error('Configura MAGNIFIC_WEBHOOK_TOKEN para autenticar los webhooks de Magnific')
  }
  return `${base}/api/webhooks/providers/magnific?token=${encodeURIComponent(token)}`
}

async function estimateCost(input: unknown): Promise<CostEstimate> {
  const parsed = imageUpscaleInput.safeParse(input)
  const scale = parsed.success ? parsed.data.scale : 2
  return { cents: Math.round(baseCostCents() * (scale / 2)), confidence: 'estimate' }
}

async function execute(ctx: ProviderCtx, input: unknown): Promise<CapabilityExecuteResult> {
  const parsed = imageUpscaleInput.safeParse(input)
  if (!parsed.success) {
    throw new Error(`Entrada inválida para image.upscale: ${parsed.error.issues.map(issue => issue.message).join('; ')}`)
  }

  // BYOK primero, clave gestionada después — misma cadena que credentials.ts.
  const apiKey = ctx.secret?.apiKey?.trim() || process.env.MAGNIFIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Magnific no está configurado: conecta tu API key en el Centro de conexiones o define MAGNIFIC_API_KEY')
  }

  // El asset debe existir en la org del contexto (un id de otra org se
  // comporta como inexistente) y ser una imagen con URL descargable.
  const asset = await getAsset({ orgId: ctx.orgId, id: parsed.data.assetId })
  if (!asset) throw new Error(`El asset ${parsed.data.assetId} no existe en esta organización`)
  if (asset.kind !== 'image') throw new Error(`El asset ${parsed.data.assetId} no es una imagen (kind=${asset.kind})`)
  if (!asset.url) {
    throw new Error('El asset no tiene URL descargable: configura S3/R2 o, en desarrollo, PUBLIC_HOST')
  }

  const { providerJobId } = await submitUpscale({
    apiKey,
    imageUrl: asset.url,
    mode: parsed.data.mode,
    scale: parsed.data.scale,
    prompt: parsed.data.prompt,
    webhookUrl: webhookUrl(),
  })

  // Trabajo asíncrono en el proveedor: el Job queda 'running' con este
  // providerJobId y lo cierra completeProviderJob desde el webhook/polling.
  return { pending: true, providerJobId }
}

registerProvider({
  id: MAGNIFIC_PROVIDER_ID,
  displayName: 'Magnific',
  capabilities: [
    {
      capability: 'image.upscale',
      qualityTier: 'premium',
      limits: { rpm: 10, concurrent: 4 },
      estimateCost,
      execute,
    },
  ],
  auth: {
    modes: ['managed', 'byok'],
    byokFields: [
      { key: 'apiKey', label: 'API key', kind: 'secret', required: true },
    ],
    async testConnection(secret) {
      const apiKey = secret.apiKey?.trim()
      if (!apiKey) return { ok: false, message: 'Falta la API key' }
      return validateApiKey(apiKey)
    },
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://docs.magnific.com',
})
