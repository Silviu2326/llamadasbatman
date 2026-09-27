import assert from 'node:assert/strict'
import test from 'node:test'
import Stripe from 'stripe'
import { availablePlans, parseStripeEvent, planForPriceId, priceIdForPlan } from '../services/billing.service'

test('Checkout solo acepta planes conocidos y precios configurados', () => {
  const before = {
    pro: process.env.STRIPE_PRICE_PRO,
    completo: process.env.STRIPE_PRICE_COMPLETO,
    agency: process.env.STRIPE_PRICE_AGENCY,
  }
  try {
    process.env.STRIPE_PRICE_PRO = 'price_pro_test'
    process.env.STRIPE_PRICE_COMPLETO = 'price_complete_test'
    delete process.env.STRIPE_PRICE_AGENCY
    assert.equal(priceIdForPlan('free'), null)
    assert.equal(priceIdForPlan('inventado'), null)
    assert.equal(priceIdForPlan('pro'), 'price_pro_test')
    assert.equal(planForPriceId('price_complete_test'), 'completo')
    assert.equal(planForPriceId('price_ajeno'), null)
    assert.deepEqual(availablePlans(), ['pro', 'completo'])
  } finally {
    for (const [plan, value] of Object.entries(before)) {
      const key = `STRIPE_PRICE_${plan.toUpperCase()}`
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
test('Webhook de Stripe exige la firma exacta del cuerpo recibido', () => {
  const previousKey = process.env.STRIPE_SECRET_KEY
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_signature_check'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_signature_check'
    const body = JSON.stringify({ id: 'evt_signature_check', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_test' } } })
    const signature = new Stripe(process.env.STRIPE_SECRET_KEY).webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    })
    assert.equal(parseStripeEvent(body, signature).id, 'evt_signature_check')
    assert.throws(() => parseStripeEvent(body.replace('sub_test', 'sub_other'), signature))
    assert.throws(() => parseStripeEvent(body, undefined))
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = previousKey
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret
  }
})
