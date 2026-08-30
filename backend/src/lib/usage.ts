// Ledger de consumo (docs/plataforma-abierta/02-FUNDAMENTOS.md §3).
//
// Registrar siempre, cobrar después: toda llamada a un proveedor externo
// escribe aquí su mejor estimación de cantidad y coste. El registro nunca
// puede tumbar la operación de negocio que lo origina — un fallo del ledger
// se loguea y se pierde esa fila, no la generación del cliente.
//
// Los costes van en céntimos con precisión subcéntimo (Decimal en BD): los
// proveedores facturan fracciones y el redondeo solo ocurre al capturar
// contra el Wallet.
import { Prisma, type UsageRecord } from '@prisma/client'
import { prisma } from './prisma'

export type BillingMode = 'managed' | 'byok'

export interface UsageInput {
  orgId: string
  provider: string
  capability: string
  quantity: number
  unit: 'tokens' | 'seconds' | 'images' | 'chars' | 'requests'
  /** Coste para Vendrava en céntimos (0 si BYOK). Admite fracciones. */
  costCents?: number
  /** Precio al cliente en céntimos (0 si BYOK). Admite fracciones. */
  priceCents?: number
  billingMode?: BillingMode
  jobId?: string
  /** Versión de tarifa aplicada, para reconstruir precios históricos. */
  rateVersion: string
  /** Identidad estable del efecto facturable (request/evento del proveedor). */
  idempotencyKey: string
  currency?: string
  meta?: Record<string, unknown>
}

function finiteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} debe ser finito y no negativo`)
}

/**
 * Inserción idempotente y tolerante a fallos. Un webhook/retry con la misma
 * clave devuelve la fila existente; nunca duplica coste y nunca rompe el
 * efecto de negocio que ya ocurrió.
 */
export async function recordUsage(input: UsageInput): Promise<UsageRecord | null> {
  try {
    finiteNonNegative(input.quantity, 'quantity')
    finiteNonNegative(input.costCents ?? 0, 'costCents')
    // Mientras no exista una tarifa comercial específica, managed cobra como
    // mínimo el coste observado. Dejar el default en cero hacía que el
    // settlement de Marketplace liberase consumo real del proveedor.
    const priceCents = input.priceCents
      ?? (input.billingMode === 'managed' ? input.costCents ?? 0 : 0)
    finiteNonNegative(priceCents, 'priceCents')
    const idempotencyKey = input.idempotencyKey.trim()
    const rateVersion = input.rateVersion.trim()
    if (!idempotencyKey || idempotencyKey.length > 240) throw new Error('idempotencyKey inválida')
    if (!rateVersion || rateVersion.length > 120) throw new Error('rateVersion inválida')

    return await prisma.usageRecord.create({
      data: {
        orgId: input.orgId,
        provider: input.provider,
        capability: input.capability,
        quantity: input.quantity,
        unit: input.unit,
        costCents: input.costCents ?? 0,
        priceCents,
        billingMode: input.billingMode ?? 'byok',
        jobId: input.jobId ?? null,
        rateVersion,
        idempotencyKey,
        currency: input.currency ?? 'EUR',
        meta: (input.meta ?? undefined) as never,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.usageRecord.findUnique({
        where: { orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey.trim() } },
      }).catch(() => null)
    }
    console.error('[usage] no se pudo registrar el consumo', {
      provider: input.provider,
      capability: input.capability,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
