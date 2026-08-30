// Lógica pura del catálogo del Centro de conexiones (docs/plataforma-abierta/
// 03-PROVEEDORES §4 y §6).
//
// Sin Prisma, sin entorno y sin adapters a propósito: aquí vive lo que se
// puede probar offline (la unión de proveedores admitidos, la normalización
// del secreto descifrado y el shape del catálogo). Los controllers aportan
// los datos de BD y este módulo sólo los combina.
import { effectiveCommercialTerms, type ProviderDescriptor, type SecretFieldSpec, type ProviderTermsStatus } from '../providers/types'

export type CatalogUsage = { quantity: number; costCents: number }
export type CatalogDependencyImpact = {
  wouldBlock: boolean
  counts: { blockingFlows: number; reroutableFlows: number; automations: number }
  blockingFlows: unknown[]
  reroutableFlows: unknown[]
  automations: unknown[]
}

/** Proyección mínima de credentialMetadata() que necesita el catálogo. */
export type CatalogCredentialRecord = {
  provider: string
  slot: string
  status: string
  lastUsedAt: Date | null
  lastError: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
}

export type CatalogSlotState = {
  slot: string
  status: string
  lastUsedAt: Date | null
  lastError: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
}

export type IntegrationCatalogEntry = {
  id: string
  displayName: string
  legacy: boolean
  modes: string[]
  capabilities: Array<{ capability: string; qualityTier: string }>
  byokFields: Array<Pick<SecretFieldSpec, 'key' | 'label' | 'kind' | 'required' | 'help'>>
  docsUrl: string | null
  commercialUseAllowed: boolean | null
  commercialTerms: {
    status: ProviderTermsStatus
    allowedUseCases: string[]
    blockedUseCases: string[]
    requiredPlan: string | null
    regions: string[]
    restrictions: string[]
    reviewedAt: string
    sourceUrl: string
  } | null
  connection: { status: string; slots: CatalogSlotState[] }
  usage: CatalogUsage
  dependencyImpact: CatalogDependencyImpact | null
}

/**
 * Unión de la lista legacy (proveedores sin descriptor todavía) y los ids
 * BYOK del registro. Se calcula en cada llamada porque los adapters se
 * registran al arrancar: congelarla en un const de módulo dejaría fuera a
 * cualquier proveedor registrado después de la primera importación.
 */
export function mergeCredentialProviders(legacy: readonly string[], registryIds: readonly string[]): string[] {
  return [...new Set<string>([...legacy, ...registryIds])]
}

/**
 * Convierte el secreto descifrado en el objeto plano de campos que espera
 * ProviderCtx. Un string simple (o un JSON que codifica un string) se expone
 * como { apiKey }; un objeto de campos se aplana a valores string. Devuelve
 * null cuando no queda ningún campo utilizable.
 */
export function normalizeCredentialFields(value: unknown): Record<string, string> | null {
  let candidate = value
  if (typeof candidate === 'string') {
    let parsed: unknown = candidate
    try {
      parsed = JSON.parse(candidate)
    } catch {
      // String plano sin envoltorio JSON: se usa tal cual.
    }
    if (typeof parsed === 'string') return parsed.trim() ? { apiKey: parsed } : null
    candidate = parsed
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const fields: Record<string, string> = {}
  for (const [key, entry] of Object.entries(candidate)) {
    if (typeof entry === 'string') fields[key] = entry
    else if (typeof entry === 'number' || typeof entry === 'boolean') fields[key] = String(entry)
    // Objetos anidados y null se descartan: los adapters esperan string plano.
  }
  return Object.keys(fields).length ? fields : null
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function connectionState(records: CatalogCredentialRecord[] | undefined): { status: string; slots: CatalogSlotState[] } {
  const slots: CatalogSlotState[] = (records ?? []).map(record => ({
    slot: record.slot,
    status: record.status,
    lastUsedAt: record.lastUsedAt,
    lastError: record.lastError,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    refreshTokenExpiresAt: record.refreshTokenExpiresAt,
  }))
  // El estado agregado es el del slot "default"; si no existe, el del primero.
  const preferred = slots.find(slot => slot.slot === 'default') ?? slots[0]
  return { status: preferred?.status ?? 'not_connected', slots }
}

/**
 * Catálogo combinado: proveedores del registro (con capabilities, modos y
 * campos BYOK — nunca valores) más los proveedores legacy sin descriptor,
 * cada uno con el estado de conexión de la org y su consumo del mes.
 */
export function buildIntegrationCatalog(input: {
  descriptors: ProviderDescriptor[]
  legacyProviders: readonly string[]
  credentials: CatalogCredentialRecord[]
  usageByProvider: Record<string, CatalogUsage>
  dependencyImpactByProvider?: Record<string, CatalogDependencyImpact>
}): IntegrationCatalogEntry[] {
  const byProvider = new Map<string, CatalogCredentialRecord[]>()
  for (const record of input.credentials) {
    const list = byProvider.get(record.provider) ?? []
    list.push(record)
    byProvider.set(record.provider, list)
  }
  const usageOf = (id: string): CatalogUsage => input.usageByProvider[id] ?? { quantity: 0, costCents: 0 }
  const entries: IntegrationCatalogEntry[] = []
  const described = new Set<string>()
  for (const descriptor of [...input.descriptors].sort((a, b) => a.id.localeCompare(b.id))) {
    const terms = effectiveCommercialTerms(descriptor)
    described.add(descriptor.id)
    entries.push({
      id: descriptor.id,
      displayName: descriptor.displayName,
      legacy: false,
      modes: [...descriptor.auth.modes],
      capabilities: descriptor.capabilities.map(binding => ({ capability: binding.capability, qualityTier: binding.qualityTier })),
      // SecretFieldSpec describe el formulario; jamás transporta valores.
      byokFields: (descriptor.auth.byokFields ?? []).map(field => ({
        key: field.key,
        label: field.label,
        kind: field.kind,
        required: field.required,
        ...(field.help ? { help: field.help } : {}),
      })),
      docsUrl: descriptor.docsUrl ?? null,
      commercialUseAllowed: descriptor.commercialUseAllowed,
      commercialTerms: {
        status: terms.status,
        allowedUseCases: [...(terms.allowedUseCases ?? [])],
        blockedUseCases: [...(terms.blockedUseCases ?? [])],
        requiredPlan: terms.requiredPlan ?? null,
        regions: [...(terms.regions ?? descriptor.regions ?? [])],
        restrictions: [...(terms.restrictions ?? [])],
        reviewedAt: terms.reviewedAt,
        sourceUrl: terms.sourceUrl,
      },
      connection: connectionState(byProvider.get(descriptor.id)),
      usage: usageOf(descriptor.id),
      dependencyImpact: input.dependencyImpactByProvider?.[descriptor.id] ?? null,
    })
  }
  for (const legacyId of [...input.legacyProviders].sort((a, b) => a.localeCompare(b))) {
    // Si un proveedor legacy gana descriptor, la entrada del registro manda.
    if (described.has(legacyId)) continue
    entries.push({
      id: legacyId,
      displayName: capitalize(legacyId),
      legacy: true,
      modes: ['byok'],
      capabilities: [],
      byokFields: [],
      docsUrl: null,
      commercialUseAllowed: null,
      commercialTerms: null,
      connection: connectionState(byProvider.get(legacyId)),
      usage: usageOf(legacyId),
      dependencyImpact: input.dependencyImpactByProvider?.[legacyId] ?? null,
    })
  }
  return entries
}
