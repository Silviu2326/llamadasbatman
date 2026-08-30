// Adapters de TTS para el registro de proveedores: migran al catálogo el
// router real más antiguo del repo (contentVoiceover.service.ts,
// Chatterbox→ElevenLabs), criterio de salida de la Fase 1
// (docs/plataforma-abierta/03-PROVEEDORES.md §7).
//
// Decisión: DOS providers, no uno. Los motores del servicio son separables sin
// refactor grande — synthesizeVoiceoverWith(engine, ...) sintetiza con un
// único motor y hace él mismo la doble escritura (Asset + UsageRecord). La
// cascada Chatterbox→ElevenLabs deja de estar cableada en el servicio para
// quien pase por el router: ahora la decide route() con exclusiones visibles.
//
// ANTI-DOBLE-REGISTRO: el servicio ya crea el Asset y escribe el UsageRecord
// cuando recibe orgId. Estos adapters NO llaman a recordUsage por su cuenta;
// solo delegan pasando ctx.orgId.
import {
  synthesizeVoiceoverWith,
  ttsCostCentsPerThousandChars,
  type VoiceoverEngine,
} from '../../services/contentVoiceover.service'
import { audioTtsInput } from '../capabilities'
import { registerProvider } from '../registry'
import type { CapabilityBinding, CapabilityExecuteResult, ProviderCtx, QualityTier } from '../types'

function unsupported(message: string): Error {
  return Object.assign(new Error(message), { code: 'UNSUPPORTED_INPUT' })
}

function ttsBinding(engine: VoiceoverEngine, qualityTier: QualityTier): CapabilityBinding {
  return {
    capability: 'audio.tts',
    qualityTier,
    limits: {},
    async estimateCost(rawInput) {
      const input = audioTtsInput.parse(rawInput)
      // Misma tarifa exportada por el servicio: lo estimado aquí y lo que
      // acaba en el ledger salen de las mismas envs.
      return {
        cents: (input.text.length / 1000) * ttsCostCentsPerThousandChars(engine),
        confidence: 'estimate',
      }
    },
    async execute(ctx: ProviderCtx, rawInput): Promise<CapabilityExecuteResult> {
      const input = audioTtsInput.parse(rawInput)
      // La voz la fijan las envs de cada motor (CHATTERBOX_VOICE /
      // ELEVENLABS_VOICE_ID); aceptar un voiceId que luego se ignora sería
      // mentir, así que se rechaza con código estable.
      if (input.voiceId) {
        throw unsupported(`${engine} no admite voiceId por petición: la voz se configura por entorno`)
      }
      // Nota: `format` del contrato es orientativo — Chatterbox entrega wav y
      // ElevenLabs mp3; el formato real queda en el Asset (params.format).
      const result = await synthesizeVoiceoverWith(engine, input.text, { orgId: ctx.orgId, jobId: ctx.jobId })
      if (!result.audioUrl) {
        const reason = 'reason' in result && result.reason ? result.reason : 'sin detalle del motor'
        throw new Error(`TTS ${engine} falló: ${reason}`)
      }
      if (!result.assetId) {
        // Con orgId siempre debería haber Asset; sin él no se puede cumplir
        // el contrato audioTtsOutput y se dice como fallo, no como éxito.
        throw new Error('El audio se generó pero no quedó registrado como Asset; revisa el almacenamiento de la biblioteca')
      }
      return {
        output: { assetId: result.assetId, durationMs: result.estimatedSeconds * 1000 },
        assetIds: [result.assetId],
      }
    },
  }
}

// Stack propio: barato, sin coste por carácter — el tier de borrador
// (04-ROUTER §5: draft → chatterbox).
registerProvider({
  id: 'chatterbox',
  displayName: 'Chatterbox (stack propio)',
  capabilities: [ttsBinding('chatterbox', 'draft')],
  auth: {
    // Servidor propio de Vendrava (CHATTERBOX_URL): no hay cuenta que traer.
    modes: ['managed'],
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://github.com/resemble-ai/chatterbox',
})

// Toma final: factura por carácter, calidad alta (04-ROUTER §5: final →
// elevenlabs).
registerProvider({
  id: 'elevenlabs',
  displayName: 'ElevenLabs',
  capabilities: [ttsBinding('elevenlabs', 'premium')],
  auth: {
    modes: ['managed'],
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
})
