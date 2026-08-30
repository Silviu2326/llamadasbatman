import type { CallContext } from '../intelligence/conversation/callContext'

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
  onAudio: (audio: Buffer, meta?: VoiceSessionMeta) => Promise<void>
  onInterrupt?: () => Promise<void>
  onTranscript?: (role: string, text: string, meta?: VoiceSessionMeta) => Promise<void>
  onEvent?: (event: VoiceSessionEvent) => Promise<void> | void
}

/**
 * Contrato que usan la telefonía (Twilio Media Streams) y el simulador de
 * navegador. Lo implementa VendravaVoiceSession; el contrato se mantiene
 * separado para que telefonía y CRM no dependan de un proveedor concreto.
 */
export interface VoiceSession {
  attach(callbacks: VoiceSessionCallbacks): Promise<void>
  sendAudio(pcm16k: Buffer): Promise<void>
  cancelResponse(reason: string): Promise<void>
  /** Veto de compliance: corta el turno en curso y no vuelve a responder (opt-out, transferencia). */
  stopResponding(reason: string): Promise<void>
  updateEotTimeout(ms: number): Promise<void>
  run(): Promise<void>
  close(): Promise<void>
}

export type VoiceSessionContext = Pick<CallContext,
  'callSid' | 'orgId' | 'leadId' | 'agentId' | 'campaignId' | 'phone' | 'businessType' | 'businessName' | 'agentConfig' | 'recordingConsentPending'
>
