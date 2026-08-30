// Ejecutor genérico de capabilities sobre el contrato universal de trabajo
// (02-FUNDAMENTOS §1): un solo ejecutor por kind = capability, que relee la
// decisión del router persistida en Job.input._routing y ejecuta el binding
// del proveedor elegido. El dispatcher (src/jobs/jobDispatcher.ts) es quien
// reclama y cierra el job; aquí solo se ejecuta y se contabiliza.
import type { Job } from '@prisma/client'
import {
  registerJobExecutor,
  hasJobExecutor,
  type JobExecutorResult,
} from '../services/jobs.service'
import { releaseJob, settleJob, WalletError } from '../services/wallet.service'
import { resolveProviderCredential } from './credentials'
import { getProvider } from './registry'
import { registerCoreCapabilityContracts } from './capabilities'
import { reportProviderFailure, reportProviderSuccess } from './router'
import { walletEnforcementOn } from './runCapability'
import type { CapabilityExecuteResult, ProviderCtx, RouteDecision } from './types'

// Capabilities con contrato registrado (providers/capabilities.ts): una por
// kind. Añadir una capability nueva es añadir su contrato y listarla aquí.
const CAPABILITY_KINDS = [
  'llm.generate',
  'image.generate',
  'image.upscale',
  'audio.tts',
  'video.generate',
  'video.upscale',
  'web.search',
] as const

interface CapabilityJobInput {
  payload?: unknown
  _routing?: RouteDecision
}

async function executeCapabilityJob(capability: string, job: Job): Promise<JobExecutorResult> {
  const input = (job.input ?? {}) as CapabilityJobInput
  const decision = input._routing
  if (!decision?.providerId) {
    throw new Error(`El job ${job.id} no trae decisión de enrutado (_routing): debe crearse vía runCapability()`)
  }

  const provider = getProvider(decision.providerId)
  const binding = provider?.capabilities.find((candidate) => candidate.capability === capability)
  if (!provider || !binding) {
    // Deploy viejo: el job fue enrutado por un proceso que conocía al
    // proveedor y este worker no lo tiene registrado. Error claro en vez de
    // un undefined críptico; la fila se reintenta cuando despliegue el worker
    // con el adapter.
    throw new Error(
      `El proveedor "${decision.providerId}" no está registrado para ${capability} en este despliegue`,
    )
  }

  // La credencial se re-resuelve en ejecución (pudo cambiar desde el enrutado:
  // BYOK desconectada, env retirada). Sin credencial no se ejecuta — y no
  // cuenta como fallo del proveedor para el breaker, porque no lo es.
  const credential = await resolveProviderCredential(job.orgId, decision.providerId)
  if (!credential) {
    throw new Error(
      `Sin credencial para ${decision.providerId}: conecta la cuenta de la organización o configura la clave de plataforma`,
    )
  }

  // La reserva se hizo (o no) al crear el job con la misma condición; si el
  // flag cambió entre medias, settleJob tolera el hold ausente más abajo.
  const reserved = decision.billingMode === 'managed' && walletEnforcementOn()

  const ctx: ProviderCtx = {
    orgId: job.orgId,
    jobId: job.id,
    executionKey: job.id,
    billingMode: credential.billingMode,
    secret: credential.secret,
  }

  try {
    const result = await binding.execute(ctx, input.payload)

    if ('pending' in result && result.pending) {
      // Asíncrono en el proveedor: se propaga tal cual y el webhook cierra el
      // job (completeProviderJob). La reserva del wallet, si existe, queda
      // activa hasta ese cierre.
      return { pending: true, providerJobId: result.providerJobId, provider: decision.providerId }
    }

    // Tras el early-return del caso pending solo queda la variante síncrona;
    // el aserto se lo decimos al compilador porque el narrowing del `in` no
    // sobrevive al bloque.
    const done = result as Exclude<CapabilityExecuteResult, { pending: true; providerJobId: string }>

    reportProviderSuccess(decision.providerId, capability)

    if (reserved) {
      try {
        await settleJob({
          orgId: job.orgId,
          jobId: job.id,
          actualCents: Math.ceil(done.costActualCents ?? decision.estimateCents),
        })
      } catch (error) {
        if (error instanceof WalletError && error.code === 'WALLET_HOLD_NOT_FOUND') {
          // El flag se activó después de crear el job: no hay hold que
          // capturar. El consumo sigue registrado en UsageRecord.
          console.warn(`[Providers] job ${job.id} sin reserva que liquidar (flag activado en caliente)`)
        } else {
          // El trabajo del proveedor YA ocurrió: fallar el job aquí lo
          // reejecutaría y duplicaría el efecto. Se loguea fuerte y el hold
          // queda activo, visible y recuperable a mano.
          console.error(`[Providers] no se pudo liquidar el wallet del job ${job.id}:`, (error as Error).message)
        }
      }
    }

    return { output: done.output, costActualCents: done.costActualCents }
  } catch (error) {
    reportProviderFailure(decision.providerId, capability)
    if (reserved) {
      // Liberar sin cobrar: el fallo llegó antes de producir nada facturable.
      // releaseJob es idempotente y solo toca holds activos.
      await releaseJob({ orgId: job.orgId, jobId: job.id }).catch((releaseError) => {
        console.error(`[Providers] no se pudo liberar la reserva del job ${job.id}:`, (releaseError as Error).message)
      })
    }
    throw error
  }
}

let registered = false

/**
 * Registra el ejecutor genérico de cada capability con contrato. Idempotente:
 * el arranque de la API y del worker pueden llamarlo sin pelearse con el
 * chequeo anti-duplicados de registerJobExecutor.
 */
export function registerCapabilityExecutors(): void {
  if (registered) return
  registered = true
  // Los contratos son prerequisito del router y también idempotentes.
  registerCoreCapabilityContracts()
  for (const kind of CAPABILITY_KINDS) {
    if (hasJobExecutor(kind)) continue
    registerJobExecutor(kind, (job) => executeCapabilityJob(kind, job))
  }
}
