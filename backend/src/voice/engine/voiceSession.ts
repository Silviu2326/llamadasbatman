import type { CallContext } from '../intelligence/conversation/callContext'
import type { VoiceArchitecture } from './architecture'

export type VoiceSessionMeta = Record<string, unknown>

export type VoiceSessionEvent = {
  type: string
  role?: 'system' | 'user' | 'assistant' | 'tool'
  payload?: Record<string, unknown>
  component?: string
  componentVer?: string
  model?: string
  provider?: string
}

export type VoiceSessionCallbacks = {
  onAudio: (audio: Buffer) => Promise<void>
  onInterrupt?: () => Promise<void>
  onTranscript?: (role: string, text: string, meta?: VoiceSessionMeta) => Promise<void>
  onEvent?: (event: VoiceSessionEvent) => Promise<void> | void
}

/**
 * Provider-neutral contract used by the Twilio media stream.
 *
 * The legacy Deepgram/ElevenLabs pipeline and the self-hosted remote engine
 * deliberately implement the same contract. The factory keeps the legacy
 * path opt-in so telephony and CRM code stay provider-neutral without making
 * proprietary fallback the default.
 */
export interface VoiceSession {
  readonly architecture?: VoiceArchitecture
  attach(callbacks: VoiceSessionCallbacks): Promise<void>
  sendAudio(pcm16k: Buffer): Promise<void>
  updateEotTimeout(ms: number): Promise<void>
  run(): Promise<void>
  close(): Promise<void>
}

export type VoiceSessionContext = Pick<CallContext,
  'callSid' | 'orgId' | 'leadId' | 'agentId' | 'campaignId' | 'phone' | 'businessType' | 'businessName' | 'agentConfig' | 'recordingConsentPending'
>
