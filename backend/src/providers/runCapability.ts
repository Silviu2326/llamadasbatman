// Puerta de entrada única de capabilities al contrato universal de trabajo:
// route() decide proveedor con motivos visibles, createJob persiste la
// decisión completa en input._routing (04-ROUTER §3) y, solo si el cobro está
// activado, se reserva el estimado contra el Wallet antes de ejecutar.
//
// WALLET_ENFORCEMENT (documentada en .env.example): por defecto (ausente u
// "off") NO se reserva ni se liquida saldo — el ledger de UsageRecord registra
// igual, porque la regla de 02-FUNDAMENTOS §3 es "registrar siempre, cobrar
// después". Con "on", los trabajos gestionados reservan el estimado al crearse
// y liquidan el coste real al terminar (src/providers/executors.ts).
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { redactProviderError } from '../lib/integrationRuntime'
import { createJob, emitJobUpdate } from '../services/jobs.service'
import { reserveForJob, WalletError } from '../services/wallet.service'
import { getCapabilityContract } from './registry'
import { route } from './router'
import type { RoutePreferences } from './types'

export interface RunCapabilityParams {
  orgId: string
  capability: string
  input: unknown
  preferences?: RoutePreferences
  createdById?: string
  microappId?: string
  flowRunId?: string
  parentJobId?: string
  idempotencyKey?: string
}

/** El flag exige el literal "on": cualquier otra cosa es "todavía no se cobra". */
export function walletEnforcementOn(): boolean {
  return process.env.WALLET_ENFORCEMENT === 'on'
}

/**
 * Encola la ejecución de una capability como Job y devuelve su id. El trabajo
 * lo reclama el dispatcher con el ejecutor genérico de executors.ts, así que
 * registerCapabilityExecutors() debe haberse llamado en el arranque del
 * proceso (createJob rechaza kinds sin ejecutor, a propósito).
 */
export async function runCapability(params: RunCapabilityParams): Promise<{ jobId: string }> {
  const { decision } = await route({
    orgId: params.orgId,
    capability: params.capability,
    input: params.input,
    preferences: params.preferences,
    context: { microappId: params.microappId, flowRunId: params.flowRunId },
  })

  // route() validó la entrada pero no devuelve el resultado parseado: se
  // reparsea aquí para persistir el payload normalizado (defaults aplicados),
  // que es lo que el ejecutor le pasará al binding tal cual.
  const contract = getCapabilityContract(params.capability)
  if (!contract) {
    // Imposible tras un route() exitoso; el chequeo evita un `!` silencioso.
    throw new Error(`Capability sin contrato tras enrutar: ${params.capability}`)
  }
  const payload = contract.input.parse(params.input)

  // Job conserva el estimado subcéntimo exacto para margen, auditoría y
  // comparación de proveedores. Solo el Wallet trabaja en céntimos enteros:
  // su hold se redondea hacia arriba para no quedarse corto.
  const estimateCents = decision.estimateCents
  const walletHoldCents = Math.ceil(estimateCents)

  const job = await createJob({
    orgId: params.orgId,
    kind: params.capability,
    input: { payload, _routing: decision } as unknown as Prisma.InputJsonValue,
    costEstimateCents: estimateCents,
    createdById: params.createdById,
    microappId: params.microappId,
    flowRunId: params.flowRunId,
    parentJobId: params.parentJobId,
    idempotencyKey: params.idempotencyKey,
  })

  if (decision.billingMode === 'managed' && walletEnforcementOn()) {
    try {
      await reserveForJob({ orgId: params.orgId, jobId: job.id, amountCents: walletHoldCents })
    } catch (error) {
      if (error instanceof WalletError) {
        // Sin saldo no hay ejecución: el job muere aquí con el motivo visible
        // (mensaje redactado, nunca detalles internos completos) y el error se
        // relanza para que la ruta ofrezca las dos salidas: recargar o BYOK.
        const failed = await prisma.job
          .update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: { code: error.code, message: redactProviderError(error) },
              finishedAt: new Date(),
            },
          })
          .catch(() => null)
        if (failed) emitJobUpdate(failed)
      }
      throw error
    }
  }

  return { jobId: job.id }
}
