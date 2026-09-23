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
  auth: {
    modes: ['managed', 'byok'],
    byokFields: [
      { key: 'apiKey', label: 'Clave de envío', kind: 'secret', required: true, help: 'Se guarda cifrada y nunca vuelve a mostrarse.' },
      { key: 'fromEmail', label: 'Dirección remitente', kind: 'text', required: true, help: 'Debe pertenecer a un dominio verificado en tu cuenta de Resend.' },
      { key: 'fromName', label: 'Nombre remitente', kind: 'text', required: false, help: 'Por ejemplo, Preclases.' },
      { key: 'replyTo', label: 'Dirección para respuestas', kind: 'text', required: false },
      { key: 'webhookSigningSecret', label: 'Secreto de firma del webhook de recepción', kind: 'secret', required: false, help: 'Se guarda cifrado. Cópialo desde el webhook email.received creado en Resend.' },
    ],
    async testConnection(secret) {
      const apiKey = secret.apiKey?.trim()
      const fromEmail = secret.fromEmail?.trim().toLowerCase()
      if (!apiKey || !fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
        return { ok: false, message: 'Indica una clave y una dirección remitente válida.' }
      }
      try {
        const response = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) return { ok: false, message: response.status === 401 ? 'La clave de envío no es válida.' : 'No se pudo consultar la cuenta de envío.' }
        const payload = await response.json() as { data?: Array<{ name?: string; status?: string; capabilities?: { sending?: string } }> }
        const domain = fromEmail.split('@')[1]
        const verified = (payload.data ?? []).some(item => item.name?.toLowerCase() === domain && item.status === 'verified' && item.capabilities?.sending === 'enabled')
        return verified
          ? { ok: true, message: 'Cuenta conectada y dominio remitente verificado.' }
          : { ok: false, message: `Verifica ${domain} y habilita el envío antes de usar esta dirección.` }
      } catch {
        return { ok: false, message: 'No se pudo conectar con el servicio de envío.' }
      }
    },
  },
  commercialUseAllowed: true, tosReviewedAt: '2026-08-18',
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
