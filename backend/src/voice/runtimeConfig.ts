import type { CallContext } from './intelligence/conversation/callContext'

export type RuntimeLlmProvider = 'cerebras' | 'groq' | 'deepseek'
export type RuntimeSttProvider = 'deepgram' | 'cartesia'
export type RuntimeTtsProvider = 'fish' | 'minimax'

export interface RuntimeNode {
  provider: string
  model: string
  enabled?: boolean
}

export interface AgentRuntimeConfig {
  primaryLlm: RuntimeNode
  guru: RuntimeNode & { structure: string; instructions: string; contextMode: 'full' | 'conversation' }
  transcriptionStt: RuntimeNode
  emotionStt: RuntimeNode
  tts: RuntimeNode
  temperature: number
  transcriptionLanguage: 'auto' | 'es' | 'en'
  emotionMode: 'turn' | 'important' | 'off'
  turnTaking: 'fast' | 'balanced' | 'natural'
}

const DEFAULT_RUNTIME: AgentRuntimeConfig = {
  primaryLlm: { provider: 'cerebras', model: 'gpt-oss-120b' },
  guru: { provider: 'cerebras', model: 'gpt-oss-120b', enabled: true, structure: 'sales-strategist', instructions: '', contextMode: 'full' },
  transcriptionStt: { provider: 'deepgram', model: 'flux-general-multi' },
  emotionStt: { provider: 'cartesia', model: 'ink-2', enabled: false },
  tts: { provider: 'fish', model: 's2.1-pro' },
  temperature: 0.58,
  transcriptionLanguage: 'auto',
  emotionMode: 'turn',
  turnTaking: 'balanced',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function node(value: unknown, fallback: RuntimeNode): RuntimeNode {
  const current = record(value)
  return {
    provider: stringValue(current.provider, fallback.provider),
    model: stringValue(current.model, fallback.model),
    ...(typeof current.enabled === 'boolean' ? { enabled: current.enabled } : {}),
  }
}

export function resolveAgentRuntime(agentConfig?: CallContext['agentConfig'] | null): AgentRuntimeConfig {
  const current = record(agentConfig?.runtime)
  const legacyGuru = current.guru ?? current.fallbackLlm
  const guruRecord = record(legacyGuru)
  const temperature = Number(current.temperature)
  const transcriptionLanguage = current.transcriptionLanguage
  const emotionMode = current.emotionMode
  const turnTaking = current.turnTaking
  return {
    primaryLlm: node(current.primaryLlm, DEFAULT_RUNTIME.primaryLlm),
    guru: {
      ...node(legacyGuru, DEFAULT_RUNTIME.guru),
      structure: stringValue(guruRecord.structure, DEFAULT_RUNTIME.guru.structure),
      instructions: typeof guruRecord.instructions === 'string' ? guruRecord.instructions.trim().slice(0, 4_000) : '',
      contextMode: guruRecord.contextMode === 'conversation' ? 'conversation' : 'full',
    },
    transcriptionStt: node(current.transcriptionStt, DEFAULT_RUNTIME.transcriptionStt),
    emotionStt: node(current.emotionStt, DEFAULT_RUNTIME.emotionStt),
    tts: node(current.tts, DEFAULT_RUNTIME.tts),
    temperature: Number.isFinite(temperature) ? Math.min(0.8, Math.max(0.2, temperature)) : DEFAULT_RUNTIME.temperature,
    transcriptionLanguage: transcriptionLanguage === 'es' || transcriptionLanguage === 'en' ? transcriptionLanguage : 'auto',
    emotionMode: emotionMode === 'important' || emotionMode === 'off' ? emotionMode : 'turn',
    turnTaking: turnTaking === 'fast' || turnTaking === 'natural' ? turnTaking : 'balanced',
  }
}

export function runtimeCredentialName(provider: string): string | undefined {
  return {
    cerebras: 'CEREBRAS_API_KEY',
    groq: 'GROQ_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    deepgram: 'DEEPGRAM_API_KEY',
    cartesia: 'CARTESIA_API_KEY',
    fish: 'FISH_API_KEY',
    minimax: 'MINIMAX_API_KEY',
  }[provider]
}

export function requiredRuntimeCredentials(runtime: AgentRuntimeConfig): string[] {
  const providers = [runtime.primaryLlm.provider, runtime.transcriptionStt.provider, runtime.tts.provider]
  if (runtime.emotionStt.enabled === true && runtime.emotionMode !== 'off') providers.push(runtime.emotionStt.provider)
  return [...new Set(providers.map(runtimeCredentialName).filter((value): value is string => Boolean(value)))]
}

export function missingRuntimeCredentials(runtime: AgentRuntimeConfig): string[] {
  return requiredRuntimeCredentials(runtime).filter(name => !process.env[name]?.trim())
}

export function unsupportedRuntimeProviders(runtime: AgentRuntimeConfig): string[] {
  const supported = new Set(['cerebras', 'groq', 'deepseek', 'deepgram', 'cartesia', 'fish', 'minimax'])
  const providers = [runtime.primaryLlm.provider, runtime.transcriptionStt.provider, runtime.tts.provider]
  if (runtime.emotionStt.enabled === true && runtime.emotionMode !== 'off') providers.push(runtime.emotionStt.provider)
  return [...new Set(providers.filter(provider => !supported.has(provider)))]
}

export function runtimeProviderLabel(provider: string): string {
  return ({ cerebras: 'Cerebras', groq: 'Groq', deepseek: 'DeepSeek', deepgram: 'Deepgram', cartesia: 'Cartesia', fish: 'Fish Audio', minimax: 'MiniMax' } as Record<string, string>)[provider] ?? provider
}

export function runtimePipelineLabel(runtime: AgentRuntimeConfig): string {
  return `${runtimeProviderLabel(runtime.transcriptionStt.provider)} ${runtime.transcriptionStt.model} → ${runtimeProviderLabel(runtime.primaryLlm.provider)} ${runtime.primaryLlm.model} → ${runtimeProviderLabel(runtime.tts.provider)} ${runtime.tts.model}`
}
