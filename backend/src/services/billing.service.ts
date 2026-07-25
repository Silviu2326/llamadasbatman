import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'

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

async function stripeRequest(path: string, params?: Record<string, string>) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
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

export async function handleWebhookEvent(event: { type?: string; data?: { object?: any } }) {
  const type = event?.type
  const object = event?.data?.object
  if (type === 'checkout.session.completed') {
    const orgId = object?.metadata?.orgId
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
