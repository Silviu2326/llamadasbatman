import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { topUp } from './wallet.service'

// ponytail: API REST de Stripe vía fetch — sin SDK. Un plan = una variable
// STRIPE_PRICE_<PLAN> (p. ej. STRIPE_PRICE_PRO=price_xxx).
const STRIPE_API = 'https://api.stripe.com/v1'

export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function priceIdForPlan(plan: string) {
  if (!/^[a-z0-9_]{1,40}$/.test(plan)) return null
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] || null
}

export function availablePlans() {
  return Object.keys(process.env)
    .filter(key => key.startsWith('STRIPE_PRICE_') && process.env[key])
    .map(key => key.slice('STRIPE_PRICE_'.length).toLowerCase())
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
}

async function stripeRequest(path: string, params?: Record<string, string>, idempotencyKey?: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const body: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `stripe_${response.status}`)
  return body
}

async function ensureCustomer(orgId: string, email: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw new Error('Organización no encontrada')
  if (org.stripeCustomerId) return org.stripeCustomerId
  const customer = await stripeRequest('/customers', {
    email,
    name: org.name,
    'metadata[orgId]': orgId,
  })
  await prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: customer.id } })
  return customer.id as string
}

export async function createCheckoutSession(orgId: string, email: string, plan: string) {
  const price = priceIdForPlan(plan)
  if (!price) throw new Error('Plan desconocido o sin precio configurado')
  const customer = await ensureCustomer(orgId, email)
  const base = `${frontendUrl()}/configuracion`
  const session = await stripeRequest('/checkout/sessions', {
    customer,
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${base}?billing=success`,
    cancel_url: `${base}?billing=cancelled`,
    'metadata[orgId]': orgId,
    'metadata[plan]': plan,
    'subscription_data[metadata][orgId]': orgId,
    'subscription_data[metadata][plan]': plan,
  })
  return session.url as string
}

export async function createPortalSession(orgId: string, email: string) {
  const customer = await ensureCustomer(orgId, email)
  const session = await stripeRequest('/billing_portal/sessions', {
    customer,
    return_url: `${frontendUrl()}/configuracion`,
  })
  return session.url as string
}

/** Checkout de pago único para créditos. El saldo solo se abona en webhook. */
export async function createWalletTopupCheckout(input: { orgId: string; email: string; amountCents: number }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 500 || input.amountCents > 500_000) {
    throw new Error('Importe de recarga inválido')
  }
  const customer = await ensureCustomer(input.orgId, input.email)
  const base = `${frontendUrl()}/configuracion`
  const session = await stripeRequest('/checkout/sessions', {
    customer,
    mode: 'payment',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': 'Créditos Vendrava',
    'line_items[0][quantity]': '1',
    success_url: `${base}?wallet=success`,
    cancel_url: `${base}?wallet=cancelled`,
    client_reference_id: input.orgId,
    'metadata[purpose]': 'wallet_topup',
    'metadata[orgId]': input.orgId,
    'metadata[amountCents]': String(input.amountCents),
    'payment_intent_data[metadata][purpose]': 'wallet_topup',
    'payment_intent_data[metadata][orgId]': input.orgId,
  }, `wallet-checkout:${input.orgId}:${input.amountCents}:${Date.now()}`)
  if (typeof session.url !== 'string') throw new Error('Stripe no devolvió URL de Checkout')
  return session.url
}

export function verifyStripeSignature(rawBody: string, header: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !header) return false
  const parts: Record<string, string> = {}
  for (const kv of header.split(',')) {
    const idx = kv.indexOf('=')
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim()
  }
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

/**
 * Añade a la factura del ciclo del partner el coste mayorista de los clientes
 * que tiene activos. Stripe cobra la línea junto con su suscripción, así que
 * `wholesaleCostCents` deja de ser un número guardado y pasa a facturarse.
 *
 * ponytail: una sola línea agregada por factura, no una por cliente. La clave
 * de idempotencia es el id de la factura, así que un reintento del webhook no
 * duplica el cargo. Si algún día hace falta el desglose por cliente en el PDF,
 * el cambio es iterar los clientes y usar `wholesale:<invoiceId>:<clientId>`.
 */
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
  await stripeRequest('/invoiceitems', {
    customer: customerId,
    invoice: invoiceId,
    amount: String(amount),
    currency: (org.currency || 'EUR').toLowerCase(),
    description: `Clientes white-label (${clients.length})`,
    'metadata[orgId]': org.id,
    'metadata[clients]': String(clients.length),
  }, `wholesale:${invoiceId}`)
  return amount
}

export async function handleWebhookEvent(event: { id?: string; type?: string; data?: { object?: any } }) {
  const type = event?.type
  const object = event?.data?.object
  if (type === 'invoice.created') {
    // Stripe tarda ~1h en finalizar la factura: da margen para añadir la línea
    // del mayorista antes de cobrarla. Sólo en la renovación del ciclo, no en
    // el alta ni en cambios de plan a mitad de periodo.
    const customerId = typeof object?.customer === 'string' ? object.customer : null
    if (customerId && object?.id && object?.billing_reason === 'subscription_cycle') {
      await chargeAgencyWholesale(object.id, customerId).catch(error =>
        console.warn('[BILLING] no se pudo facturar el mayorista white-label:', (error as Error).message))
    }
  } else if (type === 'checkout.session.completed') {
    const orgId = object?.metadata?.orgId
    if (object?.metadata?.purpose === 'wallet_topup') {
      const expectedAmount = Number(object?.metadata?.amountCents)
      const paidAmount = Number(object?.amount_total)
      if (
        typeof orgId === 'string'
        && Number.isSafeInteger(expectedAmount)
        && expectedAmount > 0
        && paidAmount === expectedAmount
        && object?.payment_status === 'paid'
        && String(object?.currency ?? '').toLowerCase() === 'eur'
      ) {
        await topUp({
          orgId,
          amountCents: expectedAmount,
          stripeRef: typeof object?.payment_intent === 'string' ? object.payment_intent : object?.id,
          idempotencyKey: `stripe:${event.id ?? object?.id}`,
        })
      }
      return
    }
    const plan = object?.metadata?.plan
    if (orgId && plan && priceIdForPlan(plan)) {
      await prisma.organization.updateMany({ where: { id: orgId }, data: { plan } })
    }
  } else if (type === 'customer.subscription.deleted') {
    const customerId = typeof object?.customer === 'string' ? object.customer : null
    if (customerId) {
      await prisma.organization.updateMany({ where: { stripeCustomerId: customerId }, data: { plan: 'free' } })
    }
  }
}
