import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attributeOpportunities } from '../services/emailMetrics.service'
import { readVariants } from '../services/marketingCampaigns.service'
import type { MarketingCampaign } from '@prisma/client'

/**
 * EM-113. Dos reglas que, si se rompen, mienten al cliente sobre su dinero:
 * ganado y abierto nunca se suman, y una oportunidad fuera de la ventana no
 * es mérito del email. Más el parseo del reparto A/B, que llega como JSON
 * libre desde base y no se puede dar por bueno.
 */

const campaign = (variantDefinition: unknown) => ({ variantDefinition } as unknown as MarketingCampaign)

test('el reparto A/B se lee solo si está completo', () => {
  assert.deepEqual(
    readVariants(campaign([
      { key: 'A', templateExternalId: '11' },
      { key: 'B', templateExternalId: '12' },
    ])),
    [
      { key: 'A', templateExternalId: '11', externalCampaignId: null },
      { key: 'B', templateExternalId: '12', externalCampaignId: null },
    ],
  )
})

test('una sola variante no es una prueba', () => {
  assert.equal(readVariants(campaign([{ key: 'A', templateExternalId: '11' }])), null)
})

test('un reparto malformado no se interpreta a medias', () => {
  assert.equal(readVariants(campaign(null)), null)
  assert.equal(readVariants(campaign('A/B')), null)
  assert.equal(readVariants(campaign([{ key: 'A' }, { key: 'B', templateExternalId: '12' }])), null)
  assert.equal(readVariants(campaign([{ key: '', templateExternalId: '11' }, { key: 'B', templateExternalId: '12' }])), null)
})

const DAY = 86_400_000
const touchedAt = new Date('2026-08-01T10:00:00Z')
const at = (days: number) => new Date(touchedAt.getTime() + days * DAY)

test('ganado y abierto se cuentan por separado y nunca se suman', () => {
  const result = attributeOpportunities(
    new Map([['lead-1', touchedAt], ['lead-2', touchedAt]]),
    [
      { leadId: 'lead-1', stage: 'closed_won', value: 3_000, currency: 'EUR', createdAt: at(1) },
      { leadId: 'lead-2', stage: 'proposal', value: 5_000, currency: 'EUR', createdAt: at(2) },
    ],
    7 * DAY,
  )
  assert.equal(result.byCurrency.EUR.wonValue, 3_000)
  assert.equal(result.byCurrency.EUR.openValue, 5_000)
  assert.equal(result.byCurrency.EUR.wonCount, 1)
  assert.equal(result.byCurrency.EUR.openCount, 1)
  assert.equal(result.attributedLeads, 2)
})

test('lo perdido no cuenta en ninguna de las dos columnas', () => {
  const result = attributeOpportunities(
    new Map([['lead-1', touchedAt]]),
    [{ leadId: 'lead-1', stage: 'closed_lost', value: 9_000, currency: 'EUR', createdAt: at(1) }],
    7 * DAY,
  )
  assert.deepEqual(result.byCurrency, {})
  assert.equal(result.attributedLeads, 0)
})

test('fuera de la ventana no se atribuye', () => {
  const outside = attributeOpportunities(
    new Map([['lead-1', touchedAt]]),
    [
      // Ya existía antes del envío: no la trajo este email.
      { leadId: 'lead-1', stage: 'closed_won', value: 1_000, currency: 'EUR', createdAt: at(-1) },
      // Un día después del cierre de la ventana de 7 días.
      { leadId: 'lead-1', stage: 'closed_won', value: 2_000, currency: 'EUR', createdAt: at(8) },
    ],
    7 * DAY,
  )
  assert.deepEqual(outside.byCurrency, {})

  const inside = attributeOpportunities(
    new Map([['lead-1', touchedAt]]),
    [{ leadId: 'lead-1', stage: 'closed_won', value: 2_000, currency: 'EUR', createdAt: at(7) }],
    7 * DAY,
  )
  assert.equal(inside.byCurrency.EUR.wonValue, 2_000)
})

test('las divisas no se mezclan', () => {
  const result = attributeOpportunities(
    new Map([['lead-1', touchedAt], ['lead-2', touchedAt]]),
    [
      { leadId: 'lead-1', stage: 'closed_won', value: 1_000, currency: 'EUR', createdAt: at(1) },
      { leadId: 'lead-2', stage: 'closed_won', value: 1_000, currency: 'USD', createdAt: at(1) },
    ],
    7 * DAY,
  )
  assert.equal(result.byCurrency.EUR.wonValue, 1_000)
  assert.equal(result.byCurrency.USD.wonValue, 1_000)
})

test('una oportunidad sin importe cuenta como caso, no como cero euros inventados', () => {
  const result = attributeOpportunities(
    new Map([['lead-1', touchedAt]]),
    [{ leadId: 'lead-1', stage: 'qualified', value: null, currency: 'EUR', createdAt: at(1) }],
    7 * DAY,
  )
  assert.equal(result.byCurrency.EUR.openCount, 1)
  assert.equal(result.byCurrency.EUR.openValue, 0)
})

test('un lead que no recibió el envío no se atribuye', () => {
  const result = attributeOpportunities(
    new Map([['lead-1', touchedAt]]),
    [{ leadId: 'lead-desconocido', stage: 'closed_won', value: 4_000, currency: 'EUR', createdAt: at(1) }],
    7 * DAY,
  )
  assert.deepEqual(result.byCurrency, {})
})
