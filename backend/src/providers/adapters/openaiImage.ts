// Adapter de gpt-image-1 para el registro de proveedores
// (docs/plataforma-abierta/03-PROVEEDORES.md §2): envuelve
// assetGenerator.service.ts existente. Se auto-registra al importarse.
//
// ANTI-DOBLE-REGISTRO: generateImage() ya crea la fila Asset y escribe el
// UsageRecord cuando recibe orgId. Este adapter NO llama a recordUsage ni a
// createAssetFromBuffer por su cuenta; solo delega pasando ctx.orgId.
import { generateImage } from '../../services/assetGenerator.service'
import { imageGenerateInput } from '../capabilities'
import { registerProvider } from '../registry'
import type { CapabilityExecuteResult, CostEstimate, ProviderCtx } from '../types'

/** Mismo default (4 ¢/imagen) y misma env que usa assetGenerator.service.ts. */
function imageCostCents(): number {
  const parsed = Number.parseFloat(process.env.OPENAI_IMAGE_COST_CENTS ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 4
}

function unsupported(message: string): Error {
  // Código estable para que el llamador distinga "este proveedor no sabe
  // hacer eso" de un fallo del proveedor: ignorar el parámetro en silencio
  // entregaría una imagen distinta de la pedida sin avisar.
  return Object.assign(new Error(message), { code: 'UNSUPPORTED_INPUT' })
}

export function openAiImageSize(aspectRatio: '1:1' | '9:16' | '16:9' | '4:5') {
  return aspectRatio === '1:1'
    ? '1024x1024' as const
    : aspectRatio === '16:9'
      ? '1536x1024' as const
      : '1024x1536' as const
}

async function estimateCost(rawInput: unknown): Promise<CostEstimate> {
  const input = imageGenerateInput.parse(rawInput)
  return { cents: imageCostCents() * input.count, confidence: 'estimate' }
}

async function execute(ctx: ProviderCtx, rawInput: unknown): Promise<CapabilityExecuteResult> {
  const input = imageGenerateInput.parse(rawInput)
  // gpt-image-1 ofrece cuadrado, retrato y paisaje. 9:16/4:5 comparten el
  // lienzo vertical más cercano; el crop exacto se hace en el preset final.
  const size = openAiImageSize(input.aspectRatio)
  // generateImage() tampoco acepta imágenes de referencia todavía.
  if (input.refAssetIds?.length) {
    throw unsupported('openai-image no admite imágenes de referencia por ahora')
  }

  // Una llamada por imagen: cada una crea su Asset y su UsageRecord dentro
  // del servicio, así el estimado (coste × count) y lo registrado cuadran.
  const assetIds: string[] = []
  for (let i = 0; i < input.count; i += 1) {
    const image = await generateImage(input.prompt, { orgId: ctx.orgId, jobId: ctx.jobId, size })
    if (!image) {
      throw new Error('gpt-image-1 no devolvió imagen (¿falta OPENAI_API_KEY o falló la generación?)')
    }
    if (!image.assetId) {
      // La imagen existe pero no entró en la biblioteca: para el contrato
      // imageGenerateOutput eso es un fallo, no un éxito a medias.
      throw new Error('La imagen se generó pero no quedó registrada como Asset; revisa el almacenamiento de la biblioteca')
    }
    assetIds.push(image.assetId)
  }

  return {
    output: { assetIds },
    assetIds,
    // Tarifa plana por imagen: el coste real es el estimado consumado.
    costActualCents: imageCostCents() * assetIds.length,
  }
}

registerProvider({
  id: 'openai-image',
  displayName: 'OpenAI Imágenes (gpt-image-1)',
  capabilities: [
    {
      capability: 'image.generate',
      models: ['gpt-image-1'],
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
  docsUrl: 'https://platform.openai.com/docs/api-reference/images',
})
