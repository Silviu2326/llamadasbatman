// Registro de capacidades de proveedores (docs/plataforma-abierta/03-PROVEEDORES.md).
//
// El registro es código compilado a propósito: los hechos estáticos de un
// proveedor (condiciones, regiones, campos BYOK) cambian por PR con diff
// revisable. Las métricas dinámicas (latencia, fallos, coste real) se leen de
// UsageRecord/Job, nunca se declaran aquí.
import type { ZodTypeAny } from 'zod'

export type BillingMode = 'managed' | 'byok'
export type QualityTier = 'draft' | 'standard' | 'premium'

// Campo que el cliente debe rellenar para conectar su propia cuenta (BYOK).
// Alimenta el formulario genérico del Centro de conexiones.
export interface SecretFieldSpec {
  key: string
  label: string
  kind: 'secret' | 'text' | 'url'
  required: boolean
  help?: string
}

export interface TestConnectionResult {
  ok: boolean
  message?: string
}

// Contexto que recibe todo adapter al ejecutar. El secreto llega ya resuelto
// (BYOK de la org o clave global); el adapter nunca lo re-expone ni lo
// persiste. fetchers/redactores de lib/integrationRuntime son obligatorios
// para cualquier URL que venga del usuario.
export interface ProviderCtx {
  orgId: string
  jobId?: string
  /** Clave estable de la llamada dentro del job (p. ej. jobId:nodo). */
  executionKey?: string
  billingMode: BillingMode
  secret: Record<string, string> | null
}

export interface CostEstimate {
  cents: number
  confidence: 'exact' | 'estimate'
}

// Resultado síncrono de una ejecución, o remisión a trabajo asíncrono en el
// proveedor (vídeo, upscale): el Job queda 'running' con providerJobId y lo
// cierra el webhook del proveedor.
export type CapabilityExecuteResult =
  | { output: unknown; costActualCents?: number; assetIds?: string[] }
  | { pending: true; providerJobId: string }

export interface CapabilityBinding {
  capability: string
  /** false = integración catalogada que conserva su servicio de dominio y no puede seleccionarse por route(). */
  routable?: boolean
  models?: string[]
  qualityTier: QualityTier
  limits: { rpm?: number; concurrent?: number; maxDurationS?: number }
  estimateCost(input: unknown): Promise<CostEstimate>
  execute(ctx: ProviderCtx, input: unknown): Promise<CapabilityExecuteResult>
}

export interface ProviderDescriptor {
  id: string
  displayName: string
  capabilities: CapabilityBinding[]
  auth: {
    modes: BillingMode[]
    byokFields?: SecretFieldSpec[]
    testConnection?(secret: Record<string, string>): Promise<TestConnectionResult>
  }
  regions?: string[]
  // Revisado contra los términos del proveedor, con fecha. Ningún proveedor
  // entra al registro sin esta revisión (08-SEGURIDAD §5.1).
  commercialUseAllowed: boolean
  tosReviewedAt: string
  terms?: ProviderCommercialTerms
  docsUrl: string
}

export type ProviderTermsStatus = 'approved' | 'restricted' | 'pending' | 'blocked'

export interface ProviderCommercialTerms {
  status: ProviderTermsStatus
  allowedUseCases?: string[]
  blockedUseCases?: string[]
  requiredPlan?: string
  regions?: string[]
  restrictions?: string[]
  reviewedAt: string
  sourceUrl: string
  /** Solo operación interna; nunca se proyecta al catálogo público. */
  internalNotes?: string
}

export function effectiveCommercialTerms(provider: ProviderDescriptor): ProviderCommercialTerms {
  return provider.terms ?? {
    status: provider.commercialUseAllowed ? 'approved' : 'blocked',
    reviewedAt: provider.tosReviewedAt,
    sourceUrl: provider.docsUrl,
    restrictions: provider.commercialUseAllowed ? ['Revisión legacy: confirmar plan, región y caso de uso antes de reventa gestionada.'] : [],
  }
}

// ---------------------------------------------------------------------------
// Router (docs/plataforma-abierta/04-ROUTER.md)
// ---------------------------------------------------------------------------

export interface RoutePreferences {
  providerId?: string
  tier?: QualityTier
  maxCostCents?: number
  maxLatencyMs?: number
}

export interface RouteRequest {
  orgId: string
  capability: string
  input: unknown
  preferences?: RoutePreferences
  context?: { microappId?: string; flowRunId?: string }
}

// La decisión completa se persiste en Job.input._routing: qué se eligió, por
// qué, qué alternativa había y por qué se excluyó al resto. La UI la muestra
// tal cual — es el requisito de transparencia de la visión §2.5.
export interface RouteDecision {
  providerId: string
  capability: string
  billingMode: BillingMode
  estimateCents: number
  alternatives: Array<{ providerId: string; estimateCents: number; reason: string }>
  exclusions: Array<{ providerId: string; reason: string }>
  fallbackProviderId?: string
}

// Contrato de entrada/salida normalizado de cada capability. La validación es
// del contrato, no del proveedor: cambiar de proveedor no cambia el input.
export interface CapabilityContract {
  capability: string
  input: ZodTypeAny
  output: ZodTypeAny
}
