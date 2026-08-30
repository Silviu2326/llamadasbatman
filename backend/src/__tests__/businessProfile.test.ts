import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBusinessProfile } from '../services/businessProfile.service'
import { renderBusinessProfilePrompt } from '../voice/intelligence/promptContext'

test('normaliza la ficha empresarial sin mezclar otras claves de settings', () => {
  const profile = parseBusinessProfile({
    voiceProfile: { tone: 'calm' },
    businessProfile: {
      description: 'Clínica dental familiar',
      idealCustomer: 'Familias de Madrid',
      valueProposition: 'Atención sin esperas',
      differentiators: ['Urgencias el mismo día'],
      offers: [{
        id: 'revision', name: 'Revisión', description: 'Diagnóstico inicial', priceCents: 4900,
        currency: 'EUR', billingPeriod: 'one_time', includes: ['Exploración', 'Plan de tratamiento'],
        conditions: 'Radiografías aparte', active: true,
      }],
      commercialGuardrails: { discountPolicy: 'No ofrecer descuentos', forbiddenClaims: 'No prometer resultados médicos' },
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
  })

  assert.equal(profile.offers[0].priceCents, 4900)
  assert.deepEqual(profile.offers[0].includes, ['Exploración', 'Plan de tratamiento'])
  assert.equal(profile.commercialGuardrails.paymentTerms, '')
  assert.equal(profile.updatedAt, '2026-08-12T10:00:00.000Z')
})

test('el contexto de voz trata precios y límites como fuente autoritativa para todos los agentes', () => {
  const profile = parseBusinessProfile({ businessProfile: {
    description: 'Software de llamadas con IA', idealCustomer: 'Equipos B2B', valueProposition: 'Más conversaciones útiles',
    differentiators: ['Integración CRM'],
    offers: [{ id: 'pro', name: 'Plan Pro', description: 'Llamadas y seguimiento', priceCents: 59900, currency: 'EUR', billingPeriod: 'monthly', includes: ['3.000 minutos'], conditions: 'Sin permanencia', active: true }],
    commercialGuardrails: { discountPolicy: 'Solo 10% con aprobación', paymentTerms: 'Pago anticipado', guarantees: 'Sin garantía de ventas', forbiddenClaims: 'Nunca prometer ingresos' },
  } })
  const prompt = renderBusinessProfilePrompt({
    company: { name: 'Vendrava', email: null, website: 'https://vendrava.com', phone: null, industry: 'SaaS', timezone: 'Europe/Madrid', address: null, currency: 'EUR' },
    profile,
  })

  assert.match(prompt, /shared by every agent/)
  assert.match(prompt, /Plan Pro: €599\.00 monthly/)
  assert.match(prompt, /Includes: 3\.000 minutos/)
  assert.match(prompt, /Never invent, infer or round a price/)
  assert.match(prompt, /Forbidden claims: Nunca prometer ingresos/)
})
