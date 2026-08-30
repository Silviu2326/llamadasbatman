// Router inteligente (docs/plataforma-abierta/04-ROUTER.md).
//
// Función determinista, no servicio con estado: filtra candidatos con motivos
// visibles, respeta la preferencia explícita del usuario avanzado y puntúa el
// resto por tier/coste. La decisión completa (elegido, alternativas y
// exclusiones con motivo) viaja en Job.input._routing y la UI la muestra tal
// cual — la transparencia es requisito, no cortesía.
import { prisma } from '../lib/prisma'
import { bindingsFor, getCapabilityContract } from './registry'
import { resolveProviderCredential } from './credentials'
import { effectiveCommercialTerms, type CapabilityBinding, type RouteDecision, type RouteRequest } from './types'

export class RoutingError extends Error {
  statusCode: number
  code: string
  details?: unknown
  constructor(message: string, code: string, statusCode = 422, details?: unknown) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

// Breaker en memoria por provider+capability: N fallos seguidos en ventana →
// excluido T ms. Por proceso a propósito (sin Redis sigue funcionando); el
// estado compartido llegará con datos reales de Job si hace falta.
const BREAKER_THRESHOLD = 4
const BREAKER_WINDOW_MS = 5 * 60_000
const BREAKER_OPEN_MS = 10 * 60_000
const breaker = new Map<string, { failures: number[]; openUntil: number }>()

export function reportProviderFailure(providerId: string, capability: string): void {
  const key = `${providerId}:${capability}`
  const now = Date.now()
  const entry = breaker.get(key) ?? { failures: [], openUntil: 0 }
  entry.failures = entry.failures.filter((t) => now - t < BREAKER_WINDOW_MS)
  entry.failures.push(now)
  if (entry.failures.length >= BREAKER_THRESHOLD) {
    entry.openUntil = now + BREAKER_OPEN_MS
    entry.failures = []
  }
  breaker.set(key, entry)
}

export function reportProviderSuccess(providerId: string, capability: string): void {
  breaker.delete(`${providerId}:${capability}`)
}

function breakerOpen(providerId: string, capability: string): boolean {
  const entry = breaker.get(`${providerId}:${capability}`)
  return !!entry && entry.openUntil > Date.now()
}

// Solo para tests: el breaker es estado de módulo.
export function resetBreakerForTests(): void {
  breaker.clear()
}

interface ProviderPolicyConfig {
  allowedProviders?: string[]
  blockedProviders?: string[]
  orgPlan?: string
}

// Política por organización (08-SEGURIDAD §3): GovernancePolicy key
// 'providers'. Sin fila o deshabilitada → todos los proveedores del catálogo.
async function loadProviderPolicy(orgId: string): Promise<ProviderPolicyConfig> {
  const [row, org] = await Promise.all([
    prisma.governancePolicy.findUnique({ where: { orgId_key: { orgId, key: 'providers' } } }).catch(() => null),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }).catch(() => null),
  ])
  if (!row || !row.enabled || !row.config) return { orgPlan: org?.plan }
  return { ...(row.config as ProviderPolicyConfig), orgPlan: org?.plan }
}

const TIER_RANK = { draft: 0, standard: 1, premium: 2 } as const

export interface RoutedCandidate {
  decision: RouteDecision
  binding: CapabilityBinding
}

export async function route(req: RouteRequest): Promise<RoutedCandidate> {
  const contract = getCapabilityContract(req.capability)
  if (!contract) {
    throw new RoutingError(`Capability desconocida: ${req.capability}`, 'CAPABILITY_UNKNOWN', 400)
  }
  const parsed = contract.input.safeParse(req.input)
  if (!parsed.success) {
    throw new RoutingError(
      `Entrada inválida para ${req.capability}`,
      'CAPABILITY_INPUT_INVALID',
      400,
      parsed.error.flatten(),
    )
  }
  const input = parsed.data

  // Guard temprano de identidad (08-SEGURIDAD §2): una voz elegida por id se
  // trata como identidad sensible. El router no crea Job ni consulta saldo si
  // falta un consentimiento activo y compatible.
  const consentInput = input as Record<string, unknown>
  const explicitVoice = req.capability === 'audio.tts' && typeof consentInput.voiceId === 'string'
  const consentGrantId = typeof consentInput.consentGrantId === 'string' ? consentInput.consentGrantId : null
  if (explicitVoice && !consentGrantId) {
    throw new RoutingError('La voz seleccionada exige un consentimiento activo', 'CONSENT_REQUIRED', 403)
  }
  if (consentGrantId) {
    const { isConsentValid } = await import('../services/consent.service')
    const check = await isConsentValid({
      orgId: req.orgId,
      consentGrantId,
      purpose: typeof consentInput.purpose === 'string' ? consentInput.purpose : undefined,
      channel: typeof consentInput.channel === 'string' ? consentInput.channel : undefined,
    })
    if (!check.valid) {
      throw new RoutingError(
        `Consentimiento no válido${check.subjectName ? ` para ${check.subjectName}` : ''}: ${check.reason ?? 'fuera de alcance'}`,
        'CONSENT_INVALID',
        403,
      )
    }
  }

  const candidates = bindingsFor(req.capability)
  if (!candidates.length) {
    throw new RoutingError(`Sin proveedores para ${req.capability}`, 'NO_PROVIDERS', 422)
  }

  const policy = await loadProviderPolicy(req.orgId)
  const exclusions: RouteDecision['exclusions'] = []
  const viable: Array<{
    providerId: string
    binding: CapabilityBinding
    billingMode: 'managed' | 'byok'
    estimateCents: number
  }> = []

  for (const { provider, binding } of candidates) {
    if (binding.routable === false) {
      exclusions.push({ providerId: provider.id, reason: 'Integración catalogada; se ejecuta mediante su servicio de dominio' })
      continue
    }
    if (policy.blockedProviders?.includes(provider.id)) {
      exclusions.push({ providerId: provider.id, reason: 'Bloqueado por la política de la organización' })
      continue
    }
    if (policy.allowedProviders && !policy.allowedProviders.includes(provider.id)) {
      exclusions.push({ providerId: provider.id, reason: 'Fuera de la lista permitida de la organización' })
      continue
    }
    const terms = effectiveCommercialTerms(provider)
    if (terms.status === 'blocked' || terms.status === 'pending') {
      exclusions.push({ providerId: provider.id, reason: `Condiciones comerciales: ${terms.status}` })
      continue
    }
    const routingInput = input as Record<string, unknown>
    const useCase = typeof routingInput.useCase === 'string' ? routingInput.useCase : req.capability
    const region = typeof routingInput.region === 'string' ? routingInput.region : undefined
    if (terms.blockedUseCases?.includes(useCase)) {
      exclusions.push({ providerId: provider.id, reason: `Caso de uso bloqueado por condiciones: ${useCase}` })
      continue
    }
    if (terms.status === 'restricted' && terms.allowedUseCases?.length && !terms.allowedUseCases.includes(useCase)) {
      exclusions.push({ providerId: provider.id, reason: `Caso de uso no aprobado por condiciones: ${useCase}` })
      continue
    }
    if (region && terms.regions?.length && !terms.regions.includes(region)) {
      exclusions.push({ providerId: provider.id, reason: `Región no cubierta por condiciones: ${region}` })
      continue
    }
    if (terms.requiredPlan && policy.orgPlan !== terms.requiredPlan) {
      exclusions.push({ providerId: provider.id, reason: `Las condiciones exigen el plan del proveedor: ${terms.requiredPlan}` })
      continue
    }
    if (breakerOpen(provider.id, req.capability)) {
      exclusions.push({ providerId: provider.id, reason: 'Proveedor degradado (fallos recientes)' })
      continue
    }
    const credential = await resolveProviderCredential(req.orgId, provider.id)
    if (!credential) {
      exclusions.push({ providerId: provider.id, reason: 'Sin credencial: conecta tu cuenta o no hay clave de plataforma' })
      continue
    }
    let estimateCents: number
    try {
      estimateCents = (await binding.estimateCost(input)).cents
    } catch {
      exclusions.push({ providerId: provider.id, reason: 'No pudo estimar el coste' })
      continue
    }
    if (req.preferences?.maxCostCents !== undefined && estimateCents > req.preferences.maxCostCents) {
      exclusions.push({ providerId: provider.id, reason: `Supera el tope de coste (${estimateCents} > ${req.preferences.maxCostCents} cts)` })
      continue
    }
    viable.push({ providerId: provider.id, binding, billingMode: credential.billingMode, estimateCents })
  }

  if (!viable.length) {
    throw new RoutingError(
      `Ningún proveedor disponible para ${req.capability}`,
      'NO_VIABLE_PROVIDER',
      422,
      { exclusions },
    )
  }

  // Preferencia explícita del modo profesional: si sobrevivió a los filtros,
  // gana siempre.
  let chosen = req.preferences?.providerId
    ? viable.find((v) => v.providerId === req.preferences?.providerId)
    : undefined
  if (req.preferences?.providerId && !chosen) {
    const excluded = exclusions.find((e) => e.providerId === req.preferences?.providerId)
    throw new RoutingError(
      `El proveedor fijado (${req.preferences.providerId}) no está disponible`,
      'PREFERRED_PROVIDER_UNAVAILABLE',
      422,
      { reason: excluded?.reason ?? 'No ofrece esta capability' },
    )
  }

  if (!chosen) {
    // Puntuación simple y explicable: tier deseado manda; a igualdad, coste.
    // draft prioriza barato; premium prioriza calidad. Nada de pesos opacos.
    const wantedTier = req.preferences?.tier ?? 'draft'
    const sorted = [...viable].sort((a, b) => {
      const tierDiff = Math.abs(TIER_RANK[a.binding.qualityTier] - TIER_RANK[wantedTier])
        - Math.abs(TIER_RANK[b.binding.qualityTier] - TIER_RANK[wantedTier])
      if (tierDiff !== 0) return tierDiff
      return a.estimateCents - b.estimateCents
    })
    chosen = sorted[0]
  }

  const alternatives = viable
    .filter((v) => v.providerId !== chosen!.providerId)
    .map((v) => ({
      providerId: v.providerId,
      estimateCents: v.estimateCents,
      reason: `Alternativa viable (tier ${v.binding.qualityTier})`,
    }))

  const decision: RouteDecision = {
    providerId: chosen.providerId,
    capability: req.capability,
    billingMode: chosen.billingMode,
    estimateCents: chosen.estimateCents,
    alternatives,
    exclusions,
    fallbackProviderId: alternatives[0]?.providerId,
  }

  return { decision, binding: chosen.binding }
}
