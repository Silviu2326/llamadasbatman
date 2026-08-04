import type { CallContext } from '../intelligence/conversation/callContext'
import { DeepgramElevenLabsSession } from '../pipelines/deepgramElevenLabs'
import { RemoteVoiceEngineSession } from './remoteVoiceEngine'
import { configuredVoiceArchitecture, voiceEngineToken, voiceEngineUrl } from './architecture'
import type { VoiceSession } from './voiceSession'
export { configuredVoiceArchitecture } from './architecture'

export type VoiceEngineMode = 'legacy' | 'remote'

export interface VoicePipelineOverride {
  stt?: 'whisper' | 'kyutai'
  tts?: 'qwen' | 'chatterbox' | 'piper'
}

export function configuredVoiceEngineMode(): VoiceEngineMode {
  const requested = process.env.VOICE_ENGINE_MODE?.trim().toLowerCase()
  if (requested === 'legacy' && process.env.VOICE_ENGINE_ALLOW_PROPRIETARY === 'true') return 'legacy'
  return 'remote'
}

/**
 * Connects the self-hosted engine before the media loop starts. The legacy
 * Deepgram/ElevenLabs path is deliberately opt-in so an unavailable local
 * engine cannot silently route customer audio to a proprietary provider.
 */
export async function createVoiceSession(ctx: CallContext, systemPrompt: string, pipeline?: VoicePipelineOverride): Promise<VoiceSession> {
  if (configuredVoiceEngineMode() === 'legacy') {
    console.warn('[VOICE_ENGINE] proprietary legacy pipeline explicitly enabled call=%s', ctx.callSid)
    return new DeepgramElevenLabsSession(ctx, systemPrompt)
  }

  const architecture = configuredVoiceArchitecture(ctx)
  const remote = new RemoteVoiceEngineSession(ctx, systemPrompt, {
    architecture,
    url: voiceEngineUrl(architecture),
    token: voiceEngineToken(architecture),
    pipeline,
  })
  try {
    await remote.connect()
    console.info('[VOICE_ENGINE] using self-hosted remote engine call=%s', ctx.callSid)
    return remote
  } catch (error) {
    await remote.close().catch(() => {})
    if (process.env.VOICE_ENGINE_ALLOW_PROPRIETARY === 'true' && process.env.VOICE_ENGINE_FALLBACK === 'true') {
      console.warn('[VOICE_ENGINE] remote unavailable; falling back to legacy pipeline', error)
      return new DeepgramElevenLabsSession(ctx, systemPrompt)
    }
    console.error('[VOICE_ENGINE] self-hosted engine unavailable; proprietary fallback is disabled')
    throw error
  }
}
