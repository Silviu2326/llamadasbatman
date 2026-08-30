import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getWalletSummary } from '../services/wallet.service'
import * as billing from '../services/billing.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

// UsageRecord guarda céntimos con precisión subcéntimo (Decimal); el panel de
// saldo habla en céntimos como el wallet, así que aquí se redondea a 2
// decimales de céntimo — suficiente para mostrar sin perder el detalle.
function toCents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100
}

// Recarga mínima 5 € y máxima 5000 €: por debajo la comisión fija de Stripe se
// come el margen y por encima conviene hablar con soporte (fraude/facturación).
const topupSchema = z
  .object({ amountCents: z.number().int().min(500).max(500_000) })
  .strict()

/**
 * GET /api/wallet — foto del saldo + últimas transacciones + consumo del mes.
 * Solo lectura informativa: la decisión real de si un job cabe la toma
 * reserveForJob bajo bloqueo (wallet.service).
 */
export async function getWallet(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [summary, transactions, byBillingMode, topProviders] = await Promise.all([
    getWalletSummary(orgId),
    prisma.walletTransaction.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { amountCents: true, reason: true, createdAt: true, stripeRef: true },
    }),
    prisma.usageRecord.groupBy({
      by: ['billingMode'],
      where: { orgId, createdAt: { gte: monthStart } },
      _sum: { priceCents: true, costCents: true },
      _count: { _all: true },
    }),
    prisma.usageRecord.groupBy({
      by: ['provider'],
      where: { orgId, createdAt: { gte: monthStart } },
      _sum: { priceCents: true, costCents: true },
      orderBy: { _sum: { priceCents: 'desc' } },
      take: 5,
    }),
  ])

  return reply.send({
    summary,
    transactions,
    monthUsage: {
      from: monthStart.toISOString(),
      byBillingMode: byBillingMode.map(row => ({
        billingMode: row.billingMode,
        priceCents: toCents(row._sum.priceCents),
        costCents: toCents(row._sum.costCents),
        records: row._count._all,
      })),
      topProviders: topProviders.map(row => ({
        provider: row.provider,
        priceCents: toCents(row._sum.priceCents),
        costCents: toCents(row._sum.costCents),
      })),
    },
  })
}

/**
 * POST /api/wallet/topup — crea la sesión de pago de Stripe y devuelve su URL.
 * NUNCA abona el saldo aquí: el abono lo hace el webhook de Stripe
 * (checkout.session.completed con purpose=wallet_topup) de forma idempotente,
 * porque el redirect de vuelta al frontend no prueba que el pago se cobró.
 */
export async function createTopup(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, email } = request.user as JWTUser
  const body = parseRequest(reply, topupSchema, request.body)
  if (!body) return

  if (!billing.billingEnabled()) {
    // 503: no es un error del cliente, falta configuración del servidor.
    return reply.status(503).send({
      error:
        'Stripe no está configurado en el servidor. Define STRIPE_SECRET_KEY (y STRIPE_WEBHOOK_SECRET) para habilitar las recargas de créditos.',
    })
  }

  try {
    const url = await billing.createWalletTopupCheckout({ orgId, email, amountCents: body.amountCents })
    return reply.send({ url })
  } catch (error) {
    return reply
      .status(400)
      .send({ error: error instanceof Error ? error.message : 'No se pudo iniciar la recarga' })
  }
}
