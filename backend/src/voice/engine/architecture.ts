import type { CallContext } from '../intelligence/conversation/callContext'

export type VoiceArchitecture = 'modular' | 'duplex'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeArchitecture(value: unknown): VoiceArchitecture | null {
  if (value === 'modular' || value === 'voice-modular' || value === 'cascade') return 'modular'
  if (value === 'duplex' || value === 'vendrava-duplex' || value === 'moshi') return 'duplex'
  return null
}

function experimentArchitecture(ctx: Pick<CallContext, 'metadata'>): VoiceArchitecture | null {
  const experiment = asRecord(ctx.metadata.voiceExperiment)
  const payload = asRecord(experiment?.payload)
  return normalizeArchitecture(payload?.architecture ?? payload?.voiceArchitecture ?? payload?.engine)
}

/**
 * Resolves the architecture once per call. An experiment payload wins over
 * process-wide configuration so both products can run against the same
 * telephony, CRM, Policy Engine and metrics path.
 */
export function configuredVoiceArchitecture(ctx?: Pick<CallContext, 'metadata'>): VoiceArchitecture {
  return (ctx && experimentArchitecture(ctx))
    ?? normalizeArchitecture(process.env.VOICE_ENGINE_ARCHITECTURE?.trim().toLowerCase())
    ?? 'modular'
}

export function voiceEngineUrl(architecture: VoiceArchitecture): string {
  if (architecture === 'duplex') return process.env.VOICE_DUPLEX_ENGINE_URL?.trim() ?? ''
  return process.env.VOICE_ENGINE_URL?.trim() ?? ''
}

export function voiceEngineToken(architecture: VoiceArchitecture): string {
  if (architecture === 'duplex') {
    return process.env.VOICE_DUPLEX_ENGINE_TOKEN?.trim()
      || process.env.VOICE_ENGINE_TOKEN?.trim()
      || ''
  }
  return process.env.VOICE_ENGINE_TOKEN?.trim() ?? ''
}
