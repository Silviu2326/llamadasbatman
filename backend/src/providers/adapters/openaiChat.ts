import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { recordUsage } from '../../lib/usage'
import { llmGenerateInput } from '../capabilities'
import { registerProvider } from '../registry'
import type { CapabilityExecuteResult, CostEstimate, ProviderCtx } from '../types'

function configuredModel(secret?: Record<string, string> | null): string | null {
  return secret?.model?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || null
}

function pricePerMillion(kind: 'input' | 'output'): number {
  const key = kind === 'input'
    ? 'OPENAI_CHAT_INPUT_COST_CENTS_PER_1M_TOKENS'
    : 'OPENAI_CHAT_OUTPUT_COST_CENTS_PER_1M_TOKENS'
  const value = Number(process.env[key])
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function estimatedTokens(text: string | undefined): number {
  return Math.ceil((text?.length ?? 0) / 4)
}

async function estimateCost(rawInput: unknown): Promise<CostEstimate> {
  const input = llmGenerateInput.parse(rawInput)
  const inputTokens = estimatedTokens(input.system) + estimatedTokens(input.prompt)
  const outputTokens = input.maxTokens ?? 900
  return {
    cents: (inputTokens / 1_000_000) * pricePerMillion('input')
      + (outputTokens / 1_000_000) * pricePerMillion('output'),
    confidence: 'estimate',
  }
}

async function execute(ctx: ProviderCtx, rawInput: unknown): Promise<CapabilityExecuteResult> {
  const input = llmGenerateInput.parse(rawInput)
  const apiKey = ctx.secret?.apiKey?.trim()
  if (!apiKey) throw Object.assign(new Error('Falta apiKey de OpenAI en la conexión de la organización'), { code: 'PROVIDER_CREDENTIAL_MISSING' })
  const model = configuredModel(ctx.secret)
  if (!model) {
    throw Object.assign(
      new Error('Configura el modelo de OpenAI en la conexión (campo model) o en OPENAI_CHAT_MODEL'),
      { code: 'PROVIDER_MODEL_REQUIRED' },
    )
  }
  if (input.model && input.model !== model) {
    throw Object.assign(new Error('El modelo solicitado no coincide con el modelo OpenAI autorizado en la conexión'), { code: 'PROVIDER_MODEL_UNSUPPORTED' })
  }

  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model,
    input: input.prompt,
    instructions: input.system,
    max_output_tokens: input.maxTokens,
    temperature: input.temperature,
    store: false,
    // Identificador opaco y estable: ayuda al proveedor a detectar abuso sin
    // enviar email, nombre ni otro dato identificativo del usuario final.
    safety_identifier: createHash('sha256').update(ctx.orgId).digest('hex').slice(0, 64),
    ...(input.json ? { text: { format: { type: 'json_object' as const } } } : {}),
  })

  const text = response.output_text?.trim()
  if (!text) throw new Error('OpenAI no devolvió texto utilizable')
  const inputTokens = response.usage?.input_tokens ?? estimatedTokens(input.system) + estimatedTokens(input.prompt)
  const outputTokens = response.usage?.output_tokens ?? estimatedTokens(text)
  const providerEstimate = (inputTokens / 1_000_000) * pricePerMillion('input')
    + (outputTokens / 1_000_000) * pricePerMillion('output')

  await recordUsage({
    orgId: ctx.orgId,
    provider: 'openai-chat',
    capability: 'llm.generate',
    quantity: inputTokens + outputTokens,
    unit: 'tokens',
    costCents: 0,
    priceCents: 0,
    billingMode: 'byok',
    jobId: ctx.jobId,
    rateVersion: process.env.OPENAI_CHAT_RATE_VERSION?.trim() || `openai:${model}`,
    idempotencyKey: `openai:${response.id}:llm.generate`,
    meta: {
      providerRequestId: response.id,
      model,
      inputTokens,
      outputTokens,
      estimatedProviderCostCents: providerEstimate,
      store: false,
    },
  })

  return { output: { text, tokensIn: inputTokens, tokensOut: outputTokens }, costActualCents: 0 }
}

registerProvider({
  id: 'openai-chat',
  displayName: 'OpenAI (Responses API)',
  capabilities: [{
    capability: 'llm.generate',
    models: [],
    qualityTier: 'premium',
    limits: {},
    estimateCost,
    execute,
  }],
  auth: {
    modes: ['byok'],
    byokFields: [
      { key: 'apiKey', label: 'API key', kind: 'secret', required: true },
      { key: 'model', label: 'Modelo', kind: 'text', required: true, help: 'ID exacto del modelo habilitado en tu proyecto de OpenAI.' },
    ],
    async testConnection(secret) {
      const apiKey = secret.apiKey?.trim()
      if (!apiKey) return { ok: false, message: 'Falta apiKey' }
      const client = new OpenAI({ apiKey })
      await client.models.list()
      return { ok: true, message: 'Clave aceptada por OpenAI' }
    },
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://platform.openai.com/docs/api-reference/responses',
})
