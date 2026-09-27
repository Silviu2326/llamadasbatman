import Stripe from 'stripe'

const catalog = [
  { key: 'pro', name: 'Pleneva Arranque', cents: 9900, lookupKey: 'pleneva_pro_2026_09_eur_monthly' },
  { key: 'completo', name: 'Pleneva Crecimiento', cents: 29900, lookupKey: 'pleneva_completo_2026_09_eur_monthly' },
]

const apply = process.argv.includes('--apply')
const mode = process.argv.find(value => value.startsWith('--mode='))?.slice('--mode='.length)
const key = process.env.STRIPE_SECRET_KEY?.trim()

if (!apply) {
  console.log(JSON.stringify({ dryRun: true, plans: catalog, note: 'No se creó nada en Stripe. Usa --apply --mode=test|live con STRIPE_SECRET_KEY.' }, null, 2))
  process.exit(0)
}
if (!key || !['test', 'live'].includes(mode) || !key.startsWith(mode === 'live' ? 'sk_live_' : 'sk_test_')) {
  throw new Error('Se requiere STRIPE_SECRET_KEY y --mode=test|live que coincida con la clave')
}

const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 })
for (const plan of catalog) {
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 })
  let price = existing.data[0]
  if (price) {
    if (price.unit_amount !== plan.cents || price.currency !== 'eur' || price.recurring?.interval !== 'month') {
      throw new Error(`El lookup_key ${plan.lookupKey} existe con precio o periodo distinto`)
    }
  } else {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { plan: plan.key, termsVersion: '2026-09' },
    }, { idempotencyKey: `pleneva-product-${plan.lookupKey}` })
    price = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: plan.cents,
      recurring: { interval: 'month' },
      tax_behavior: 'exclusive',
      lookup_key: plan.lookupKey,
      metadata: { plan: plan.key, termsVersion: '2026-09' },
    }, { idempotencyKey: `pleneva-price-${plan.lookupKey}` })
  }
  console.log(`STRIPE_PRICE_${plan.key.toUpperCase()}=${price.id}`)
}
console.log('Configura además STRIPE_WEBHOOK_SECRET y escucha customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.created y checkout.session.completed y checkout.session.async_payment_succeeded.')
