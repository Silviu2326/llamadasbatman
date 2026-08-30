import type { CallContext } from '../intelligence/conversation/callContext'
import { VendravaVoiceSession, vendravaVoiceConfigured, vendravaVoiceLanguageSupported } from '../pipelines/vendravaVoice'
import { missingRuntimeCredentials, resolveAgentRuntime, runtimePipelineLabel, unsupportedRuntimeProviders } from '../runtimeConfig'
import type { VoiceSession } from './voiceSession'

/**
 * Un único pipeline bilingüe: Deepgram Flux Multilingual → Cerebras GPT-OSS
 * 120B → Fish Audio S2.1 Pro.
 */
export async function createVoiceSession(ctx: CallContext, systemPrompt: string): Promise<VoiceSession> {
  const runtime = resolveAgentRuntime(ctx.agentConfig)
  const unsupported = unsupportedRuntimeProviders(runtime)
  const missing = missingRuntimeCredentials(runtime)
  if (unsupported.length) {
    throw new Error(`Proveedores de voz no soportados: ${unsupported.join(', ')}`)
  }
  if (!vendravaVoiceConfigured(ctx.agentConfig)) {
    throw new Error(`Faltan credenciales para el runtime seleccionado: ${missing.join(', ')}`)
  }
  if (!vendravaVoiceLanguageSupported(ctx.agentConfig)) {
    // Mejor no llamar que llamar en el idioma equivocado con el guion de otro.
    throw new Error(`El motor de voz solo admite inglés y español; el agente ${ctx.agentId} está en "${ctx.agentConfig?.identity?.agentAccent}"`)
  }
  console.info('[VOICE_ENGINE] %s call=%s', runtimePipelineLabel(runtime), ctx.callSid)
  const voice = ctx.agentConfig?.voice
  return new VendravaVoiceSession(ctx, systemPrompt, {
    speculative: voice?.speculative ?? true,
    voiceId: voice?.ttsVoiceId ?? '',
    ttsModel: 's2.1-pro',
    speed: voice?.speed ?? 1,
  })
}
