import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Créditos gestionados de una organización (02-FUNDAMENTOS §3 y anotación de
 * revisión de 09-MODELO-COMERCIAL §2): el saldo visible se lleva en céntimos
 * enteros y el disponible real es `balanceCents − SUM(holds activos)`.
 *
 * Restricción central: nunca se comprueba el saldo de forma optimista. La
 * reserva de un job se decide dentro de una transacción con la fila del
 * wallet bloqueada (`SELECT ... FOR UPDATE`), porque dos jobs concurrentes
 * comprobando saldo fuera de la transacción podrían sobregirar la cuenta.
 *
 * Idempotencia: `WalletHold.jobId` y `WalletTransaction.idempotencyKey` son
 * únicos en base de datos. Los reintentos del dispatcher o de un webhook de
 * pago colisionan con esa restricción (P2002) y devolvemos el registro que
 * ya existía en lugar de duplicar reservas o abonos.
 */

export type WalletErrorCode =
  | 'WALLET_INSUFFICIENT_FUNDS'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_HOLD_NOT_FOUND'
  | 'WALLET_HOLD_NOT_ACTIVE'
  | 'WALLET_AMOUNT_INVALID'

// Mismo patrón que EntitlementError (src/access-control/entitlements.ts):
// código estable + statusCode para que las rutas traduzcan sin adivinar.
// 402 = saldo insuficiente, la respuesta debe ofrecer recargar o pasar a BYOK.
export class WalletError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 402 | 404 | 409,
    public readonly code: WalletErrorCode,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'WalletError'
  }
}

export type WalletSummary = {
  balanceCents: number
  heldCents: number
  availableCents: number
  softLimitCents: number | null
  hardLimitCents: number | null
  currency: string
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

const HOLD_TTL_MS = Math.max(60 * 60_000, Number(process.env.WALLET_HOLD_TTL_HOURS ?? 24 * 7) * 60 * 60_000)

// Todos los importes del wallet son céntimos enteros; los importes subcéntimo
// viven en UsageRecord (Decimal) y llegan aquí ya redondeados por el caller.
function assertCents(value: number, name: string, options: { allowZero: boolean }): void {
  const valid = Number.isSafeInteger(value) && (options.allowZero ? value >= 0 : value > 0)
  if (!valid) {
    throw new WalletError(
      `${name} debe ser un número entero de céntimos ${options.allowZero ? 'no negativo' : 'positivo'}`,
      400,
      'WALLET_AMOUNT_INVALID',
      { [name]: value },
    )
  }
}

/**
 * El wallet se crea perezosamente a saldo 0: toda org tiene wallet en cuanto
 * algo lo consulta. `orgId` es único, así que el upsert compila a
 * `INSERT ... ON CONFLICT` y es seguro ante carreras de creación.
 */
export async function getOrCreateWallet(orgId: string) {
  return prisma.wallet.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  })
}

/**
 * Foto informativa del saldo (banners, UI de recarga). No sirve para decidir
 * si un job cabe: esa decisión solo la toma reserveForJob bajo bloqueo.
 */
export async function getWalletSummary(orgId: string): Promise<WalletSummary> {
  await expireWalletHolds(orgId)
  const wallet = await getOrCreateWallet(orgId)
  const held = await prisma.walletHold.aggregate({
    _sum: { amountCents: true },
    where: { walletId: wallet.id, status: 'active' },
  })
  const heldCents = held._sum.amountCents ?? 0
  return {
    balanceCents: wallet.balanceCents,
    heldCents,
    availableCents: wallet.balanceCents - heldCents,
    softLimitCents: wallet.softLimitCents,
    hardLimitCents: wallet.hardLimitCents,
    currency: wallet.currency,
  }
}

/** Transición durable de reservas vencidas; nunca se limita a ignorarlas. */
export async function expireWalletHolds(orgId?: string): Promise<number> {
  const stale = await prisma.walletHold.findMany({
    where: { ...(orgId ? { orgId } : {}), status: 'active', expiresAt: { lte: new Date() } },
    select: { id: true, walletId: true, jobId: true },
    take: 250,
  })
  let expired = 0
  for (const hold of stale) {
    expired += await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${hold.walletId} FOR UPDATE`
      const updated = await tx.walletHold.updateMany({ where: { id: hold.id, status: 'active', expiresAt: { lte: new Date() } }, data: { status: 'expired', resolvedAt: new Date() } })
      return updated.count
    })
  }
  return expired
}

/**
 * Abono idempotente. La clave la aporta el caller (id de evento de Stripe,
 * id de ajuste manual...): si el webhook se reintenta, la segunda inserción
 * choca con el unique de `idempotencyKey`, la transacción entera se revierte
 * (el saldo no se incrementa dos veces) y devolvemos el abono original.
 */
export async function topUp(params: {
  orgId: string
  amountCents: number
  reason?: 'topup' | 'adjustment'
  stripeRef?: string
  idempotencyKey: string
}) {
  const { orgId, amountCents, reason = 'topup', stripeRef, idempotencyKey } = params
  assertCents(amountCents, 'amountCents', { allowZero: false })
  const wallet = await getOrCreateWallet(orgId)
  try {
    return await prisma.$transaction(async tx => {
      const transaction = await tx.walletTransaction.create({
        data: {
          orgId,
          walletId: wallet.id,
          amountCents,
          reason,
          stripeRef: stripeRef ?? null,
          idempotencyKey,
        },
      })
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: amountCents } },
      })
      return transaction
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      })
      if (existing) return existing
    }
    throw error
  }
}

/**
 * Reserva atómica del coste estimado de un job antes de ejecutarlo.
 *
 * Dentro de la transacción se bloquea la fila del wallet con FOR UPDATE y solo
 * entonces se calcula el disponible: cualquier otra reserva concurrente espera
 * a que esta termine, así que dos jobs nunca pueden comerse el mismo saldo.
 * Un settle/topUp concurrente también toca la fila del wallet (UPDATE), por lo
 * que queda serializado por el mismo bloqueo.
 *
 * `jobId` es único en WalletHold: si el dispatcher reintenta la creación del
 * mismo job, la segunda reserva colisiona (P2002) y devolvemos el hold que ya
 * existía sin volver a descontar disponible.
 */
export async function reserveForJob(params: { orgId: string; jobId: string; amountCents: number }) {
  const { orgId, jobId, amountCents } = params
  assertCents(amountCents, 'amountCents', { allowZero: true })
  const wallet = await getOrCreateWallet(orgId)
  try {
    return await prisma.$transaction(async tx => {
      // Bloqueo pesimista de la fila del wallet. Prisma no expone FOR UPDATE,
      // así que bajamos a SQL; el resto de la transacción lee bajo ese cerrojo.
      const rows = await tx.$queryRaw<Array<{ id: string; balanceCents: number }>>`
        SELECT "id", "balanceCents" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE
      `
      const locked = rows[0]
      if (!locked) {
        throw new WalletError('El wallet de la organización no existe', 404, 'WALLET_NOT_FOUND', { orgId })
      }
      await tx.walletHold.updateMany({
        where: { walletId: wallet.id, status: 'active', expiresAt: { lte: new Date() } },
        data: { status: 'expired', resolvedAt: new Date() },
      })
      const held = await tx.walletHold.aggregate({
        _sum: { amountCents: true },
        where: { walletId: wallet.id, status: 'active', expiresAt: { gt: new Date() } },
      })
      const availableCents = locked.balanceCents - (held._sum.amountCents ?? 0)
      if (amountCents > availableCents) {
        // 402: el caller debe ofrecer las dos salidas — recargar o BYOK.
        throw new WalletError(
          'Saldo insuficiente para reservar el coste estimado del trabajo',
          402,
          'WALLET_INSUFFICIENT_FUNDS',
          { orgId, jobId, requestedCents: amountCents, availableCents },
        )
      }
      return tx.walletHold.create({
        data: {
          orgId,
          walletId: wallet.id,
          jobId,
          amountCents,
          expiresAt: new Date(Date.now() + HOLD_TTL_MS),
        },
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Reintento del dispatcher: el hold del job ya existe y sigue siendo
      // válido tal cual (mismo estimado, mismo job). Idempotencia.
      const existing = await prisma.walletHold.findUnique({ where: { jobId } })
      if (existing && existing.orgId === orgId) {
        if (existing.amountCents !== amountCents) {
          throw new WalletError(
            'El job ya tiene una reserva con un importe diferente',
            409,
            'WALLET_HOLD_NOT_ACTIVE',
            { orgId, jobId, existingCents: existing.amountCents, requestedCents: amountCents },
          )
        }
        if (existing.status === 'active') return existing
        if (existing.status === 'captured') {
          throw new WalletError('La reserva ya fue capturada y no puede reutilizarse', 409, 'WALLET_HOLD_NOT_ACTIVE', { orgId, jobId, status: existing.status })
        }
        // Reintento manual tras failed/canceled: released|expired se reactiva
        // bajo el mismo orden de locks Wallet -> Hold y vuelve a comprobar saldo.
        return prisma.$transaction(async tx => {
          const rows = await tx.$queryRaw<Array<{ balanceCents: number }>>`SELECT "balanceCents" FROM "Wallet" WHERE "id" = ${existing.walletId} AND "orgId" = ${orgId} FOR UPDATE`
          const held = await tx.walletHold.aggregate({ _sum: { amountCents: true }, where: { walletId: existing.walletId, status: 'active', expiresAt: { gt: new Date() } } })
          const availableCents = (rows[0]?.balanceCents ?? 0) - (held._sum.amountCents ?? 0)
          if (amountCents > availableCents) throw new WalletError('Saldo insuficiente para reactivar la reserva del trabajo', 402, 'WALLET_INSUFFICIENT_FUNDS', { orgId, jobId, requestedCents: amountCents, availableCents })
          const reactivated = await tx.walletHold.updateMany({ where: { id: existing.id, status: { in: ['released', 'expired'] } }, data: { status: 'active', amountCents, expiresAt: new Date(Date.now() + HOLD_TTL_MS), resolvedAt: null } })
          if (reactivated.count !== 1) throw new WalletError('La reserva cambió durante el reintento', 409, 'WALLET_HOLD_NOT_ACTIVE', { orgId, jobId })
          return tx.walletHold.findUniqueOrThrow({ where: { id: existing.id } })
        })
      }
    }
    throw error
  }
}

/**
 * Liquidación al terminar el job: captura el hold y cobra el coste REAL, no
 * el estimado. Si el real es menor, la diferencia queda liberada de forma
 * implícita al pasar el hold a 'captured' (deja de contar como activo); si es
 * mayor, se cobra igualmente — el saldo puede quedar temporalmente negativo,
 * que es preferible a dejar consumo sin contabilizar.
 *
 * Idempotencia por `usage:${jobId}`: una segunda liquidación del mismo job
 * revierte su transacción al chocar con el unique y devuelve la original,
 * así que el saldo nunca se decrementa dos veces.
 */
export async function settleJob(params: {
  orgId: string
  jobId: string
  actualCents: number
  usageRecordId?: string
}) {
  const { orgId, jobId, actualCents, usageRecordId } = params
  assertCents(actualCents, 'actualCents', { allowZero: true })
  const hold = await prisma.walletHold.findUnique({ where: { jobId } })
  if (!hold || hold.orgId !== orgId) {
    throw new WalletError('No existe reserva para el trabajo indicado', 404, 'WALLET_HOLD_NOT_FOUND', { orgId, jobId })
  }
  const idempotencyKey = `usage:${jobId}`
  const alreadySettled = await prisma.walletTransaction.findUnique({
    where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
  })
  if (alreadySettled) {
    const currentHold = await prisma.walletHold.findUnique({ where: { jobId } })
    return { hold: currentHold ?? hold, transaction: alreadySettled }
  }
  try {
    return await prisma.$transaction(async tx => {
      // Orden global de locks: Wallet -> WalletHold. reserveForJob ya bloquea
      // Wallet; usar el mismo orden evita deadlocks con settle concurrentes.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Wallet" WHERE "id" = ${hold.walletId} AND "orgId" = ${orgId} FOR UPDATE
      `
      const lockedHolds = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "WalletHold" WHERE "jobId" = ${jobId} AND "orgId" = ${orgId} FOR UPDATE
      `
      if (!lockedHolds[0] || lockedHolds[0].status !== 'active') {
        throw new WalletError(
          'La reserva ya no está activa y no puede liquidarse',
          409,
          'WALLET_HOLD_NOT_ACTIVE',
          { orgId, jobId, status: lockedHolds[0]?.status ?? null },
        )
      }
      const transaction = await tx.walletTransaction.create({
        data: {
          orgId,
          walletId: hold.walletId,
          amountCents: -actualCents,
          reason: 'usage',
          jobId,
          usageRecordId: usageRecordId ?? null,
          idempotencyKey,
        },
      })
      // El UPDATE toma el cerrojo de fila del wallet: cualquier reserveForJob
      // concurrente ve el decremento y la captura del hold como un todo.
      await tx.wallet.update({
        where: { id: hold.walletId },
        data: { balanceCents: { decrement: actualCents } },
      })
      const captured = await tx.walletHold.update({
        where: { jobId },
        data: { status: 'captured', resolvedAt: new Date() },
      })
      return { hold: captured, transaction }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      })
      if (existing) {
        const currentHold = await prisma.walletHold.findUnique({ where: { jobId } })
        return { hold: currentHold ?? hold, transaction: existing }
      }
    }
    throw error
  }
}

/**
 * Libera la reserva sin cobrar nada (job cancelado o fallido antes de generar
 * coste). Idempotente por diseño: el updateMany solo toca holds 'active', así
 * que repetir la llamada — o llamarla tras un settle — no cambia nada.
 */
export async function releaseJob(params: { orgId: string; jobId: string }) {
  const { orgId, jobId } = params
  await prisma.walletHold.updateMany({
    where: { orgId, jobId, status: 'active' },
    data: { status: 'released', resolvedAt: new Date() },
  })
  return prisma.walletHold.findUnique({ where: { jobId } })
}
