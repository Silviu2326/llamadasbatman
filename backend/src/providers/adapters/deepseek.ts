// Adapter de DeepSeek para el registro de proveedores
// (docs/plataforma-abierta/03-PROVEEDORES.md §2): envuelve lib/deepseek.ts
// existente, no lo sustituye. Se auto-registra al importarse, mismo patrón
// side-effect que los módulos de src/jobs/.
//
// ANTI-DOBLE-REGISTRO: askText/askJson ya escriben el UsageRecord cuando
// reciben `usage.orgId`. Este adapter NO llama a recordUsage por su cuenta;
// solo delega pasando ctx.orgId.
import { askJson, askText, fastModel } from '../../lib/deepseek'
import { llmGenerateInput } from '../capabilities'
import { registerProvider } from '../registry'
import type { CapabilityExecuteResult, CostEstimate, ProviderCtx } from '../types'

/**
 * Misma tarifa (y mismas envs) que usa lib/deepseek.ts para el ledger: la
 * estimación del router y el coste registrado salen de la misma fuente.
 */
function chatCostCentsPer1MTokens(): number {
  const raw = Number(process.env.DEEPSEEK_CHAT_COST_CENTS_PER_1M_TOKENS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 25
}

/** Misma heurística de respaldo que lib/deepseek.ts: ~4 caracteres por token. */
function estimateTokens(...texts: Array<string | undefined>): number {
  return Math.ceil(texts.reduce((total, text) => total + (text?.length ?? 0), 0) / 4)
}

async function estimateCost(rawInput: unknown): Promise<CostEstimate> {
  const input = llmGenerateInput.parse(rawInput)
  // Entrada estimada por longitud + salida al tope pedido (o el default de
  // lib/deepseek.ts, 900): mejor sobrestimar un poco que reservar de menos.
  const tokens = estimateTokens(input.system, input.prompt) + (input.maxTokens ?? 900)
  return { cents: (tokens / 1_000_000) * chatCostCentsPer1MTokens(), confidence: 'estimate' }
}

async function execute(ctx: ProviderCtx, rawInput: unknown): Promise<CapabilityExecuteResult> {
  const input = llmGenerateInput.parse(rawInput)
  const allowedModels = new Set(['deepseek-chat', 'deepseek-reasoner'])
  if (input.model && !allowedModels.has(input.model)) {
    throw Object.assign(new Error(`Modelo DeepSeek no permitido: ${input.model}`), { code: 'PROVIDER_MODEL_UNSUPPORTED' })
  }
  // El consejo puede alternar el modelo generalista y el razonador. Fuera de
  // ese caso se conserva el modelo de volumen configurado históricamente.
  const model = input.model || fastModel()
  const common = {
    model,
    system: input.system,
    prompt: input.prompt,
    maxTokens: input.maxTokens,
    label: 'providers:llm.generate',
    // Delegación del registro de consumo: lib/deepseek.ts escribe el
    // UsageRecord al recibir orgId. Aquí no se registra nada más.
    usage: { orgId: ctx.orgId, capability: 'llm.generate', jobId: ctx.jobId },
  }
  if (input.json) {
    const parsed = await askJson(common)
    if (parsed === null) {
      throw new Error('DeepSeek no devolvió JSON válido (o falta DEEPSEEK_API_KEY)')
    }
    return { output: { text: JSON.stringify(parsed) } }
  }
  const text = await askText(common)
  if (text === null) {
    throw new Error('DeepSeek no devolvió respuesta (o falta DEEPSEEK_API_KEY)')
  }
  return { output: { text } }
}

registerProvider({
  id: 'deepseek',
  displayName: 'DeepSeek',
  capabilities: [
    {
      capability: 'llm.generate',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      qualityTier: 'standard',
      limits: {},
      estimateCost,
      execute,
    },
  ],
  auth: {
    // Solo gestionado por ahora: el BYOK de LLM llega con el adapter de
    // Anthropic/OpenAI chat (03-PROVEEDORES §5), no forzándolo aquí.
    modes: ['managed'],
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://api-docs.deepseek.com',
})
