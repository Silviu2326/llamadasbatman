// Conectores maduros que siguen ejecutándose por sus servicios de dominio.
// Se describen en el catálogo abierto para que conexiones, dependencias y
// gobierno tengan una única fuente de verdad, pero no se enrutan todavía: el
// pipeline de llamadas y la publicación conservan su camino probado.
import { registerProvider } from '../registry'
import type { CapabilityBinding } from '../types'

function directOnly(capability: string): CapabilityBinding {
  return {
    capability,
    routable: false,
    qualityTier: 'standard',
    limits: {},
    async estimateCost() { return { cents: 0, confidence: 'estimate' } },
    async execute() {
      throw Object.assign(
        new Error(`${capability} se ejecuta mediante su servicio de dominio, no mediante el router genérico`),
        { code: 'LEGACY_DIRECT_ONLY' },
      )
    },
  }
}

registerProvider({
  id: 'twilio', displayName: 'Twilio', capabilities: [directOnly('call.outbound'), directOnly('messaging.sms')],
  auth: { modes: ['managed', 'byok'] }, commercialUseAllowed: true, tosReviewedAt: '2026-08-18',
  docsUrl: 'https://www.twilio.com/docs',
})
registerProvider({
  id: 'resend', displayName: 'Resend', capabilities: [directOnly('email.transactional')],
  auth: { modes: ['managed'] }, commercialUseAllowed: true, tosReviewedAt: '2026-08-18',
  docsUrl: 'https://resend.com/docs',
})
registerProvider({
  id: 'metricool', displayName: 'Metricool', capabilities: [directOnly('social.publish'), directOnly('social.metrics')],
  auth: { modes: ['managed', 'byok'] }, commercialUseAllowed: true, tosReviewedAt: '2026-08-18',
  docsUrl: 'https://help.metricool.com',
})
registerProvider({
  id: 'meta', displayName: 'Meta', capabilities: [directOnly('ads.publish'), directOnly('ads.insights')],
  auth: { modes: ['managed'] }, commercialUseAllowed: true, tosReviewedAt: '2026-08-18',
  docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
})
