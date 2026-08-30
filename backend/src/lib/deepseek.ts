import OpenAI from 'openai'
import { recordUsage } from './usage'

/**
 * Cliente de DeepSeek. Su API es compatible con la de OpenAI, así que se
 * reutiliza el SDK que ya está instalado en lugar de escribir un cliente HTTP:
 * cambia la URL base y poco más.
 *
 * Dos modelos, dos trabajos distintos:
 * - `deepseek-chat` para volumen — leer una página y extraer frases. Barato.
 * - `deepseek-reasoner` para criterio — elegir ángulo, juzgar copys. Piensa
 *   antes de responder, que es exactamente lo que hace falta cuando la
 *   decisión es "cuál de estos tres emails contestaría un desconocido".
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim())
}

/** Modelo de volumen: extraer, resumir, clasificar. */
export function fastModel(): string {
  return process.env.DEEPSEEK_FAST_MODEL?.trim() || 'deepseek-chat'
}

/** Modelo de criterio: elegir, juzgar, escribir. */
export function smartModel(): string {
  return process.env.DEEPSEEK_SMART_MODEL?.trim() || 'deepseek-reasoner'
}

/**
 * Contexto de uso para el ledger de consumo (docs/plataforma-abierta/02-FUNDAMENTOS.md §3).
 * Opcional: los llamadores que no lo pasan siguen funcionando igual y no
 * registran nada. `feature` viaja en `meta` para distinguir qué producto
 * consumió sin multiplicar capabilities.
 */
export interface DeepseekUsageContext {
  orgId: string
  capability?: string
  feature?: string
  jobId?: string
}

/** Versión de tarifa con la que se calculan los costes de este archivo. */
const RATE_VERSION = '2026-08'

/**
 * Coste para Vendrava en céntimos por millón de tokens. Constantes por env
 * para poder seguir a DeepSeek cuando cambie tarifas sin tocar código.
 */
function costCentsPer1MTokens(model: string): number {
  const isReasoner = /reasoner/i.test(model)
  const raw = Number(isReasoner
    ? process.env.DEEPSEEK_REASONER_COST_CENTS_PER_1M_TOKENS
    : process.env.DEEPSEEK_CHAT_COST_CENTS_PER_1M_TOKENS)
  if (Number.isFinite(raw) && raw >= 0) return raw
  return isReasoner ? 120 : 25
}

/** Estimación de respaldo cuando la API no devuelve `usage`: ~4 chars/token. */
function estimateTokens(...texts: Array<string | null | undefined>): number {
  const chars = texts.reduce((total, text) => total + (text?.length ?? 0), 0)
  return Math.ceil(chars / 4)
}

/**
 * Registra el consumo de una respuesta ya recibida. `recordUsage` nunca lanza,
 * pero se espera para que un ejecutor compuesto no liquide el job antes de
 * que su coste exista en el ledger. Este cliente no usa streaming; si algún día lo
 * usa, esto se llama al terminar el stream con lo que haya disponible.
 */
async function trackUsage(
  usage: DeepseekUsageContext | undefined,
  model: string,
  response: OpenAI.Chat.Completions.ChatCompletion,
  system: string | undefined,
  prompt: string,
): Promise<void> {
  if (!usage?.orgId) return
  const reported = response.usage?.total_tokens
  const quantity = typeof reported === 'number' && reported > 0
    ? reported
    : estimateTokens(system, prompt, response.choices?.[0]?.message?.content)
  await recordUsage({
    orgId: usage.orgId,
    provider: 'deepseek',
    capability: usage.capability ?? 'llm.generate',
    quantity,
    unit: 'tokens',
    costCents: (quantity / 1_000_000) * costCentsPer1MTokens(model),
    billingMode: 'managed',
    jobId: usage.jobId,
    rateVersion: RATE_VERSION,
    idempotencyKey: `deepseek:${response.id}:${usage.capability ?? 'llm.generate'}`,
    meta: { model, ...(usage.feature ? { feature: usage.feature } : {}) },
  })
}

function client(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  return new OpenAI({ apiKey, baseURL: BASE_URL, timeout: Number(process.env.DEEPSEEK_TIMEOUT_SECONDS ?? 90) * 1000 })
}

/**
 * Pide JSON y lo devuelve parseado, o `null`. Nunca lanza: en esta cadena un
 * paso que falla degrada el email, no rompe la importación de un cliente.
 *
 * El modo JSON nativo solo se pide al modelo rápido. El razonador emite su
 * cadena de pensamiento antes de la respuesta, así que se le deja escribir
 * libre y se recorta el JSON del final.
 */
export async function askJson<T = unknown>(opts: {
  model: string
  system?: string
  prompt: string
  maxTokens?: number
  /** Etiqueta para los avisos del log. */
  label: string
  /** Si llega, la respuesta se apunta en el ledger de consumo. */
  usage?: DeepseekUsageContext
}): Promise<T | null> {
  const sdk = client()
  if (!sdk) return null
  const useNativeJson = opts.model !== smartModel()
  try {
    const response = await sdk.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 900,
      ...(useNativeJson ? { response_format: { type: 'json_object' as const } } : {}),
      messages: [
        ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
        { role: 'user' as const, content: opts.prompt },
      ],
    })
    // Se registra antes de parsear: los tokens ya se consumieron aunque el
    // JSON venga roto.
    await trackUsage(opts.usage, opts.model, response, opts.system, opts.prompt)
    const text = response.choices[0]?.message?.content?.trim() ?? ''
    if (!text) return null
    // El último bloque {…} o […] del texto: el razonador puede haber escrito
    // ejemplos antes de la respuesta final.
    const match = text.match(/[[{][\s\S]*[\]}]/)
    return JSON.parse(match?.[0] ?? text) as T
  } catch (error) {
    console.warn(`[DeepSeek:${opts.label}] ${opts.model} no devolvió JSON válido:`, (error as Error).message)
    return null
  }
}

/** Texto libre, para cuando la respuesta no es una estructura. */
export async function askText(opts: { model: string; system?: string; prompt: string; maxTokens?: number; label: string; usage?: DeepseekUsageContext }): Promise<string | null> {
  const sdk = client()
  if (!sdk) return null
  try {
    const response = await sdk.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 900,
      messages: [
        ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
        { role: 'user' as const, content: opts.prompt },
      ],
    })
    await trackUsage(opts.usage, opts.model, response, opts.system, opts.prompt)
    return response.choices[0]?.message?.content?.trim() || null
  } catch (error) {
    console.warn(`[DeepSeek:${opts.label}] ${opts.model} falló:`, (error as Error).message)
    return null
  }
}
