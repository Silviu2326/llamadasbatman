import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { topUp } from './wallet.service'

const PAID_PLANS = ['pro', 'completo', 'agency'] as const
type PaidPlan = (typeof PAID_PLANS)[number]
let cachedStripe: Stripe | null = null
let cachedKey = ''

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error('Stripe no está configurado')
  if (!cachedStripe || cachedKey !== key) {
    // El SDK fija la versión estable de API que corresponde a su versión.
    cachedStripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 })
    cachedKey = key
  }
  return cachedStripe
}

export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim() && availablePlans().length)
}

export function priceIdForPlan(plan: string): string | null {
  if (!PAID_PLANS.includes(plan as PaidPlan)) return null
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim() || null
}

export function availablePlans() {
  return PAID_PLANS.filter(plan => priceIdForPlan(plan))
}

export function planForPriceId(priceId: string): PaidPlan | null {
  return PAID_PLANS.find(plan => priceIdForPlan(plan) === priceId) ?? null
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
}

async function ensureCustomer(orgId: string, email: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw new Error('Organización no encontrada')
  if (org.stripeCustomerId) return org.stripeCustomerId
  const customer = await stripeClient().customers.create({
    email,
    name: org.name,
    metadata: { orgId },
  }, { idempotencyKey: `pleneva-customer:${orgId}` })
  await prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

export async function hasSubscription(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { stripeSubscriptionId: true } })
  return Boolean(org?.stripeSubscriptionId)
}

export async function createCheckoutSession(orgId: string, email: string, plan: string) {
  const price = priceIdForPlan(plan)
  if (!price) throw new Error('Plan desconocido o sin precio configurado')
  if (await hasSubscription(orgId)) throw new Error('Gestiona el cambio de plan desde tu portal de suscripción')
  const customer = await ensureCustomer(orgId, email)
  const base = `${frontendUrl()}/configuracion/plan`
  const session = await stripeClient().checkout.sessions.create({
    customer,
    mode: 'subscription',
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    tax_id_collection: { enabled: true },
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}?billing=success`,
    cancel_url: `${base}?billing=cancelled`,
    client_reference_id: orgId,
    metadata: { orgId, plan, termsVersion: '2026-09' },
    subscription_data: { metadata: { orgId, plan, termsVersion: '2026-09' } },
  })
  if (!session.url) throw new Error('Stripe no devolvió URL de Checkout')
  return session.url
}

export async function createPortalSession(orgId: string, email: string) {
  const customer = await ensureCustomer(orgId, email)
  const session = await stripeClient().billingPortal.sessions.create({
    customer,
    return_url: `${frontendUrl()}/configuracion/plan`,
  })
  return session.url
}

/** Checkout de pago único para créditos. El saldo solo se abona en webhook. */
export async function createWalletTopupCheckout(input: { orgId: string; email: string; amountCents: number }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 500 || input.amountCents > 500_000) {
    throw new Error('Importe de recarga inválido')
  }
  const customer = await ensureCustomer(input.orgId, input.email)
  const base = `${frontendUrl()}/configuracion/plan`
  const session = await stripeClient().checkout.sessions.create({
    customer,
    mode: 'payment',
    line_items: [{
      price_data: { currency: 'eur', unit_amount: input.amountCents, product_data: { name: 'Créditos Pleneva' } },
      quantity: 1,
    }],
    success_url: `${base}?wallet=success`,
    cancel_url: `${base}?wallet=cancelled`,
    client_reference_id: input.orgId,
    metadata: { purpose: 'wallet_topup', orgId: input.orgId, amountCents: String(input.amountCents) },
    payment_intent_data: { metadata: { purpose: 'wallet_topup', orgId: input.orgId } },
  })
  if (!session.url) throw new Error('Stripe no devolvió URL de Checkout')
  return session.url
}

export function parseStripeEvent(rawBody: string, header: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret || !header) throw new Error('Webhook de Stripe sin firma o sin secreto')
  return stripeClient().webhooks.constructEvent(rawBody, header, secret)
}

/** El precio real de la suscripción manda; nunca concedemos un plan por metadata. */
async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, stripeSubscriptionId: true },
  })
  if (!org || (org.stripeSubscriptionId && org.stripeSubscriptionId !== subscription.id)) return
  const priceId = subscription.items.data[0]?.price?.id
  const plan = priceId ? planForPriceId(priceId) : null
  if (['active', 'trialing'].includes(subscription.status) && plan) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { plan, stripeSubscriptionId: subscription.id, commercialTermsVersion: '2026-09' },
    })
  } else if (org.stripeSubscriptionId === subscription.id && ['unpaid', 'canceled', 'incomplete_expired', 'paused'].includes(subscription.status)) {
    // Libera la referencia al revocar acceso; si no, hasSubscription() impide contratar de nuevo.
    await prisma.organization.update({
      where: { id: org.id },
      data: { plan: 'free', stripeSubscriptionId: null },
    })
  }
  // past_due conserva acceso durante el periodo de reintentos configurado en Stripe.
}

async function refreshSubscription(subscriptionId: string) {
  try {
    const subscription = await stripeClient().subscriptions.retrieve(subscriptionId)
    await syncSubscription(subscription)
  } catch (error) {
    // Un evento antiguo puede llegar después de que Stripe haya eliminado la
    // suscripción. En ese caso, el evento deleted es quien retira el acceso.
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) return
    throw error
  }
}

/** Coste mayorista agregado en la factura del ciclo del partner. */
export async function chargeAgencyWholesale(invoiceId: string, customerId: string): Promise<number> {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, currency: true },
  })
  if (!org) return 0
  const clients = await prisma.agencyClient.findMany({
    where: { agencyOrgId: org.id, status: 'active' },
    select: { wholesaleCostCents: true },
  })
  const amount = clients.reduce((total, client) => total + client.wholesaleCostCents, 0)
  if (amount <= 0) return 0
  await stripeClient().invoiceItems.create({
    customer: customerId,
    invoice: invoiceId,
    amount,
    currency: (org.currency || 'EUR').toLowerCase(),
    description: `Clientes white-label (${clients.length})`,
    metadata: { orgId: org.id, clients: String(clients.length) },
  }, { idempotencyKey: `wholesale:${invoiceId}` })
  return amount
}

export async function handleWebhookEvent(event: Stripe.Event) {
  const object = event.data.object as any
  if (event.type === 'invoice.created') {
    const customerId = typeof object?.customer === 'string' ? object.customer : null
    if (customerId && object?.id && object?.billing_reason === 'subscription_cycle') {
      await chargeAgencyWholesale(object.id, customerId)
    }
  } else if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && object?.metadata?.purpose === 'wallet_topup') {
    const orgId = object.metadata.orgId
    const expectedAmount = Number(object.metadata.amountCents)
    if (
      typeof orgId === 'string'
      && Number.isSafeInteger(expectedAmount)
      && expectedAmount > 0
      && Number(object.amount_total) === expectedAmount
      && object.payment_status === 'paid'
      && String(object.currency ?? '').toLowerCase() === 'eur'
    ) {
      await topUp({
        orgId,
        amountCents: expectedAmount,
        stripeRef: typeof object.payment_intent === 'string' ? object.payment_intent : object.id,
        idempotencyKey: `stripe:checkout:${object.id}`,
      })
    }
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    if (typeof object?.id === 'string') await refreshSubscription(object.id)
  } else if (event.type === 'customer.subscription.deleted') {
    const customerId = typeof object?.customer === 'string' ? object.customer : null
    if (customerId && typeof object?.id === 'string') {
      await prisma.organization.updateMany({
        where: { stripeCustomerId: customerId, stripeSubscriptionId: object.id },
        data: { plan: 'free', stripeSubscriptionId: null },
      })
    }
  } else if (event.type === 'invoice.paid') {
    const subscriptionId = typeof object?.subscription === 'string'
      ? object.subscription
      : object?.parent?.subscription_details?.subscription
    if (typeof subscriptionId === 'string') await refreshSubscription(subscriptionId)
  }
}
