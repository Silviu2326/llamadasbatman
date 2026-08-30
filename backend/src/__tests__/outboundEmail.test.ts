import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectFindings, unsubscribeToken, verifyUnsubscribeToken } from '../services/outboundEmail.service'
import { auditFields } from '../services/mauticSync.service'
import type { DigitalAuditResult } from '../services/digitalAudit.service'

/**
 * La regla que sostiene el outbound frío: **los hallazgos los pone el código,
 * no el modelo**. Estas pruebas protegen esa frontera. Si un día el email
 * afirma algo que no está en `digitalAudit`, es aquí donde tenía que haber
 * saltado.
 */

const audit = (overrides: Partial<DigitalAuditResult> = {}) => ({
  name: 'Clínica Ejemplo',
  website: 'https://ejemplo.es',
  webAlive: true,
  webReachable: true,
  webInfo: null,
  seo: null,
  socials: {},
  tech: null,
  conversion: null,
  publicScore: 42,
  opsScore: 30,
  opportunity: 60,
  leadOpportunityScore: 71,
  tier: 'HOT',
  opportunities: [],
  benchmark: null,
  commercialPitch: '',
  summary: 'Web lenta y sin formulario de contacto.',
  auditedAt: '2026-08-09T10:00:00.000Z',
  ...overrides,
} as DigitalAuditResult)

const opportunity = (title: string, severity: 'low' | 'medium' | 'high') => ({
  title,
  severity,
  product: 'web' as const,
  pitch: `Arreglar ${title}`,
  impact: 'ALTO' as const,
})

test('los hallazgos van de más grave a menos', () => {
  const findings = selectFindings(audit({
    opportunities: [opportunity('leve', 'low'), opportunity('grave', 'high'), opportunity('media', 'medium')],
  }))
  assert.deepEqual(findings.map(finding => finding.title), ['grave', 'media', 'leve'])
})

test('nunca se mandan más de tres hallazgos', () => {
  // Un correo frío con siete problemas se lee como un informe automático.
  const findings = selectFindings(audit({
    opportunities: Array.from({ length: 7 }, (_, index) => opportunity(`hallazgo-${index}`, 'high')),
  }))
  assert.equal(findings.length, 3)
})

test('sin oportunidades no hay hallazgos que contar', () => {
  assert.deepEqual(selectFindings(audit({ opportunities: [] })), [])
})

test('el hallazgo conserva el argumento tal cual sale de la auditoría', () => {
  const [finding] = selectFindings(audit({ opportunities: [opportunity('sin HTTPS', 'high')] }))
  assert.equal(finding.pitch, 'Arreglar sin HTTPS')
  assert.equal(finding.impact, 'ALTO')
})

test('sin auditoría no se manda ningún campo personalizado a Mautic', () => {
  assert.deepEqual(auditFields(null), {})
  assert.deepEqual(auditFields({}), {})
  assert.deepEqual(auditFields({ digitalAudit: 'texto' }), {})
  assert.deepEqual(auditFields({ digitalAudit: [] }), {})
})

test('los campos de Mautic salen de la auditoría y van recortados', () => {
  const fields = auditFields({
    digitalAudit: audit({
      opportunities: [opportunity('sin formulario', 'medium'), opportunity('sin HTTPS', 'high')],
      summary: 'x'.repeat(900),
    }),
  })
  assert.equal(fields.auditscore, 42)
  assert.equal(fields.audittier, 'HOT')
  assert.equal(String(fields.auditsummary).length, 500)
  assert.equal(fields.auditedat, '2026-08-09')
  assert.equal(fields.auditfindings, 'sin formulario · sin HTTPS')
  // El destacado es el grave, aunque no sea el primero de la lista.
  assert.equal(fields.audittopfinding, 'sin HTTPS')
})

test('una web caída se declara, no se omite', () => {
  const fields = auditFields({ digitalAudit: audit({ webAlive: false }) })
  assert.equal(fields.auditweb, 'sin web operativa')
})

test('el token de baja es estable para el mismo lead y distinto entre leads', () => {
  assert.equal(unsubscribeToken('lead-1'), unsubscribeToken('lead-1'))
  assert.notEqual(unsubscribeToken('lead-1'), unsubscribeToken('lead-2'))
})

test('el token de baja no se puede falsificar desde el id del lead', () => {
  assert.ok(verifyUnsubscribeToken('lead-1', unsubscribeToken('lead-1')))
  // El token de otro lead no sirve, aunque sea válido en su propia URL.
  assert.equal(verifyUnsubscribeToken('lead-1', unsubscribeToken('lead-2')), false)
  assert.equal(verifyUnsubscribeToken('lead-1', 'lead-1'), false)
  assert.equal(verifyUnsubscribeToken('lead-1', ''), false)
})
