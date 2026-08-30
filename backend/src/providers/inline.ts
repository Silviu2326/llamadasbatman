// Ejecución en proceso de una capability: route() decide proveedor, el adapter
// ejecuta y el resultado vuelve al llamador sin crear un Job propio.
//
// Es el mismo patrón que ya usan la runtime de microapps y el marketplace,
// extraído aquí para los servicios que YA corren dentro de su propio Job y
// solo necesitan una llamada al modelo: el consumo se registra contra ese
// jobId, así que el trabajo del usuario sigue teniendo un único coste visible.
//
// `preferProviderId` es una preferencia, no una imposición: si la organización
// no tiene esa conexión (o el proveedor está excluido por el breaker), se
// vuelve a enrutar sin preferencia en vez de fallar. Un onboarding no puede
// romperse porque falte una API key concreta.
import { resolveProviderCredential } from './credentials'
import { getCapabilityContract, getProvider } from './registry'
import { RoutingError, reportProviderFailure, reportProviderSuccess, route } from './router'
import type { RoutePreferences } from './types'

export interface InlineCapabilityParams {
  orgId: string
  capability: string
  input: unknown
  jobId?: string
  preferences?: RoutePreferences
  preferProviderId?: string
}

export interface InlineCapabilityResult<T> {
  output: T
  providerId: string
  /** true cuando el proveedor preferido no estaba disponible y se enrutó a otro. */
  fellBack: boolean
}

export async function executeCapabilityInline<T = unknown>(
  params: InlineCapabilityParams,
): Promise<InlineCapabilityResult<T>> {
  const base = { orgId: params.orgId, capability: params.capability, input: params.input }
  let fellBack = false
  let routed = null as Awaited<ReturnType<typeof route>> | null

  if (params.preferProviderId) {
    try {
      routed = await route({ ...base, preferences: { ...params.preferences, providerId: params.preferProviderId } })
    } catch (error) {
      // Solo se degrada por indisponibilidad del proveedor preferido: una
      // entrada inválida o una capability inexistente son errores del
      // llamador y deben salir tal cual.
      if (!(error instanceof RoutingError) || error.code === 'CAPABILITY_UNKNOWN' || error.code === 'CAPABILITY_INPUT_INVALID') throw error
      fellBack = true
    }
  }
  if (!routed) routed = await route({ ...base, preferences: params.preferences })

  const { decision, binding } = routed
  const provider = getProvider(decision.providerId)
  if (!provider) throw new Error(`Proveedor desaparecido del registro: ${decision.providerId}`)
  const contract = getCapabilityContract(params.capability)
  if (!contract) throw new Error(`Capability sin contrato: ${params.capability}`)
  const credential = await resolveProviderCredential(params.orgId, decision.providerId)

  try {
    const result = await binding.execute(
      {
        orgId: params.orgId,
        jobId: params.jobId,
        billingMode: decision.billingMode,
        secret: credential?.secret ?? null,
      },
      contract.input.parse(params.input),
    )
    if ('pending' in result && result.pending) {
      throw Object.assign(
        new Error(`La capability ${params.capability} es asíncrona en este proveedor y no puede ejecutarse en línea`),
        { code: 'CAPABILITY_ASYNC_INLINE' },
      )
    }
    reportProviderSuccess(decision.providerId, params.capability)
    return {
      output: contract.output.parse((result as { output: unknown }).output) as T,
      providerId: decision.providerId,
      fellBack,
    }
  } catch (error) {
    reportProviderFailure(decision.providerId, params.capability)
    throw error
  }
}
