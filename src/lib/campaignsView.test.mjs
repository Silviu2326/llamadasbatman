// Lógica pura de Planificar · Campañas. Sin framework:
// node --test src/lib/campaignsView.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  breakdownLines, buildChannelMixView, buildFunnelView, readApiError, startConfirmation,
  summarizeCampaigns, validateCampaignForm,
} from './campaignsView.js'
import { createTranslator } from '../i18n/index.js'

// Traductor real en inglés: comprueba que las funciones no llevan texto fijo.
const en = createTranslator('en')

const rows = [
  { status: 'active', type: 'outbound', totalLeads: 80, contacted: 40, meetingsScheduled: 8, budgetCents: 10000 },
  { status: 'draft', type: 'ads', totalLeads: 20, contacted: 10, meetingsScheduled: 2, budgetCents: null },
  { status: 'paused', type: 'outbound', totalLeads: 0, contacted: 0, meetingsScheduled: 0 },
]

test('summarizeCampaigns suma leads, presupuesto y canales', () => {
  const stats = summarizeCampaigns(rows)
  assert.equal(stats.totalLeads, 100)
  assert.equal(stats.contacted, 50)
  assert.equal(stats.meetingsScheduled, 10)
  assert.equal(stats.budgetTotalCents, 10000)
  assert.equal(stats.activeCount, 1)
  assert.equal(stats.conversionRate, 10)
  assert.deepEqual(stats.channelCounts, { outbound: 2, ads: 1 })
  assert.equal(summarizeCampaigns([]).conversionRate, 0)
})

test('embudo medido muestra valores y anchos; sin medición muestra «—», no ceros', () => {
  const stats = summarizeCampaigns(rows)
  const live = buildFunnelView(stats, 'live')
  assert.equal(live.measured, true)
  assert.deepEqual(live.steps.map(s => s.label), ['Leads', 'Contactados', 'Reuniones agendadas'])
  assert.deepEqual(buildFunnelView(stats, 'live', String, en).steps.map(s => s.label), ['Leads', 'Contacted', 'Meetings booked'])
  assert.deepEqual(live.steps.map(s => s.display), ['100', '50', '10'])
  assert.deepEqual(live.steps.map(s => s.width), ['100%', '50%', '10%'])
  assert.equal(live.conversionDisplay, '10%')

  for (const status of ['error', 'plan', 'loading']) {
    const view = buildFunnelView(summarizeCampaigns([]), status)
    assert.equal(view.measured, false)
    assert.ok(view.steps.every(s => s.display === '—' && s.value === null && s.width === '0%'))
    assert.equal(view.conversionDisplay, '—')
    assert.equal(view.noteKind, status === 'loading' ? 'loading' : 'unmeasured')
    assert.equal(view.note, status === 'loading' ? 'Calculando…' : 'Sin medición')
    assert.equal(buildFunnelView(summarizeCampaigns([]), status, String, en).note, status === 'loading' ? 'Calculating…' : 'Not measured')
  }
})

test('mezcla de canales distingue sin medición, vacío y datos reales', () => {
  assert.equal(buildChannelMixView(summarizeCampaigns(rows), 'error').state, 'unmeasured')
  assert.equal(buildChannelMixView(summarizeCampaigns(rows), 'plan').note, 'Sin medición')
  assert.equal(buildChannelMixView(summarizeCampaigns(rows), 'loading', en).noteKind, 'loading')
  assert.equal(buildChannelMixView(summarizeCampaigns([]), 'live').state, 'empty')
  const view = buildChannelMixView(summarizeCampaigns(rows), 'live')
  assert.equal(view.state, 'ready')
  assert.deepEqual(view.channels.map(c => [c.id, c.pct]), [['ads', 33], ['outbound', 67]])
  assert.deepEqual(view.channels.map(c => c.label), ['Publicidad', 'Llamadas outbound'])
  assert.deepEqual(buildChannelMixView(summarizeCampaigns(rows), 'live', en).channels.map(c => c.label), ['Advertising', 'Outbound calls'])
  assert.match(view.gradient, /^conic-gradient\(var\(--warn\) 0% 33\.3/)
  assert.equal(Math.round(view.channels.at(-1).end), 100)
})

test('validación del formulario: nombre obligatorio y presupuesto >= 0', () => {
  assert.equal(validateCampaignForm({ name: '   ' }).ok, false)
  assert.equal(validateCampaignForm({ name: 'X', budget: '-1' }).error, 'El presupuesto no puede ser negativo.')
  assert.equal(validateCampaignForm({ name: 'X', budget: '-1' }).field, 'budget')
  assert.equal(validateCampaignForm({ name: 'X', budget: '-1' }, { t: en }).error, 'The budget cannot be negative.')
  assert.equal(validateCampaignForm({ name: '' }, { t: en }).field, 'name')
  assert.equal(validateCampaignForm({ name: 'X', budget: 'abc' }).ok, false)
  assert.equal(validateCampaignForm({ name: 'X', budget: '2000000' }).ok, false)
  assert.equal(validateCampaignForm({ name: 'x'.repeat(141) }).ok, false)

  assert.deepEqual(validateCampaignForm({ name: ' Q2 ', objective: '', budget: '' }).payload, { name: 'Q2' })
  assert.deepEqual(validateCampaignForm({ name: 'Q2', objective: ' Citas ', budget: '12,5' }).payload, { name: 'Q2', objective: 'Citas', budgetCents: 1250 })
  assert.deepEqual(validateCampaignForm({ name: 'Q2', budget: '0' }).payload, { name: 'Q2', budgetCents: 0 })
  // En edición, vaciar campos opcionales los borra en el PUT.
  assert.deepEqual(validateCampaignForm({ name: 'Q2', objective: '', budget: '' }, { editing: true }).payload, { name: 'Q2', objective: null, budgetCents: null })
})

test('texto de confirmación indica cuántas llamadas reales se encolarán', () => {
  const many = startConfirmation({ name: 'Reactivación', eligibleLeads: 12, newLeadsWithoutPhone: 3, agent: { name: 'Carlos', lifecycleStatus: 'active' } })
  assert.equal(many.count, 12)
  assert.equal(many.title, 'Activar y encolar 12 llamadas')
  assert.equal(many.confirmText, 'Activar y llamar (12)')
  assert.match(many.message, /se encolarán 12 llamadas telefónicas reales/)
  assert.match(many.message, /3 leads nuevos sin teléfono no se llamarán/)
  assert.doesNotMatch(many.message, /no está publicado/)

  const one = startConfirmation({ name: 'A', eligibleLeads: 1, agent: { name: 'Carlos', lifecycleStatus: 'draft' } })
  assert.match(one.message, /se encolará 1 llamada telefónica real /)
  assert.match(one.message, /Carlos no está publicado/)

  const none = startConfirmation({ name: 'B', eligibleLeads: 0, agent: null })
  assert.equal(none.count, 0)
  assert.equal(none.confirmText, 'Activar')
  assert.match(none.message, /no se encolará ninguna llamada/)
  assert.match(none.message, /no tiene agente asignado/)

  // Con el traductor inglés no queda ningún texto fijo en español.
  const english = startConfirmation({ name: 'A', eligibleLeads: 2, newLeadsWithoutPhone: 1, agent: { name: 'Carlos', lifecycleStatus: 'draft' } }, en)
  assert.equal(english.title, 'Activate and queue 2 calls')
  assert.equal(english.confirmText, 'Activate and call (2)')
  assert.match(english.message, /will queue 2 real phone calls/)
  assert.match(english.message, /1 new lead without a phone number will not be called/)
  assert.match(english.message, /Agent Carlos is not published/)
  assert.equal(startConfirmation({ eligibleLeads: 0, agent: null }, en).message.startsWith('Activating "this campaign"'), true)
})

test('startConfirmation muestra el desglose de motivos del backend', () => {
  const view = startConfirmation({
    name: 'C', eligibleLeads: 2, newLeadsWithoutPhone: 0, agent: { name: 'Carlos', lifecycleStatus: 'active' },
    breakdown: { eligible: 2, withoutPhone: 0, invalidPhone: 1, optOut: 3, missingConsent: 4, maxAttempts: 0 },
  })
  assert.match(view.message, /No se llamará a: 3 en la lista de exclusión \(opt-out\), 4 sin consentimiento de voz registrado, 1 con teléfono no válido\./)
  assert.doesNotMatch(view.message, /intentos agotados/)
  assert.deepEqual(breakdownLines(null), [])
  assert.deepEqual(breakdownLines({ optOut: 0, missingConsent: 0 }), [])
  assert.deepEqual(breakdownLines({ optOut: 2, invalidPhone: 1 }, en), ['Will not be called: 2 on the opt-out list, 1 with an invalid phone number.'])
})

test('readApiError devuelve error/message del backend o el texto por defecto', async () => {
  const res = body => ({ clone: () => ({ json: async () => { if (body === undefined) throw new Error('no json'); return body } }) })
  assert.equal(await readApiError(res({ error: 'Campaign not found' }), 'x'), 'Campaign not found')
  assert.equal(await readApiError(res({ message: 'Sin permiso' }), 'x'), 'Sin permiso')
  assert.equal(await readApiError(res({ error: { code: 1 } }), 'x'), 'x')
  assert.equal(await readApiError(res(undefined), 'fallback'), 'fallback')
})
