// Contrato de microapp (docs/plataforma-abierta/07-MICROAPPS.md §1).
//
// Una microapp es una receta especializada sobre la plataforma común, no un
// producto aparte: declara promesa, entradas, permisos, coste y caducidad, y
// devuelve SIEMPRE salida estructurada con evidencias — nunca texto suelto.
import type { ZodTypeAny } from 'zod'
import type { RoutePreferences } from '../providers/types'
import type { AgenticCouncilResult } from './agentic'

export type MicroappCategory = 'research' | 'sales' | 'content' | 'studio' | 'data' | 'success'

// Evidencia que justifica el resultado (§5.6 de la visión): enlace, cita o
// referencia interna, con confianza declarada. La ausencia de evidencia no se
// presenta como falsedad — se presenta como ausencia.
export interface EvidenceItem {
  claim: string
  sourceUrl?: string
  sourceRef?: { kind: string; id: string }
  confidence: 'high' | 'medium' | 'low'
  fetchedAt?: string
}

export type MicroappSurface =
  | 'lead' | 'account' | 'call' | 'opportunity' | 'conversation' | 'meeting'
  | 'campaign' | 'landing' | 'asset' | 'production' | 'flow' | 'client'

export type MicroappPlacementRole = 'primary' | 'secondary'
export type MicroappPlacementTrigger = 'manual' | 'after_call' | 'after_create' | 'recommended'

export type FollowUpKind =
  | 'navigate' | 'run_microapp' | 'create_task' | 'create_note' | 'create_meeting'
  | 'send_email_draft' | 'update_lead_field' | 'update_stage' | 'create_opportunity'
  | 'create_document' | 'create_lead' | 'create_asset' | 'create_campaign_draft' | 'request_approval' | 'queue_call'

export interface FollowUpAction {
  /** Kept as string at the authoring boundary for legacy catalog compatibility. Registry normalizes it. */
  kind: string
  label: string
  params?: Record<string, unknown>
}

export interface MicroappResult {
  data: unknown
  evidence: EvidenceItem[]
  assets?: string[]
  suggestedActions?: FollowUpAction[]
  limitations?: string[]
  // Opt-in: consejo multiagente adjunto sin sustituir ni reescribir la salida
  // canónica validada por la microapp.
  agentic?: AgenticCouncilResult
}

// Contexto de ejecución. Disciplina deliberada: una microapp no importa
// servicios arbitrarios — todo lo que necesita entra por aquí. Es lo que
// permitirá marketplace sin inventar un sandbox nuevo.
export interface MicroappCtx {
  orgId: string
  jobId: string
  createdById?: string
  context?: MicroappContext
  // Ejecuta una capability EN PROCESO (route + execute síncrono) registrando
  // el consumo bajo el job de la microapp. Las capabilities asíncronas en el
  // proveedor (vídeo, upscale) no son invocables desde aquí en v1: lanzan
  // error claro; se orquestan como pasos de Flow.
  capability(name: string, input: unknown, preferences?: RoutePreferences): Promise<unknown>
  // Descubre alternativas viables antes de un consejo multi-modelo. No
  // ejecuta ni factura; devuelve solo proveedor, coste estimado y los modelos
  // declarados por su binding.
  planCapability?(name: string, input: unknown, preferences?: RoutePreferences): Promise<{
    chosen: { providerId: string; estimateCents: number; models: string[] }
    alternatives: Array<{ providerId: string; estimateCents: number; models: string[] }>
  }>
  // Para capacidades remotas/asíncronas (upscale/vídeo): crea un Job hijo
  // en vez de fingir una ejecución síncrona dentro del job de la microapp.
  enqueueCapability?(name: string, input: unknown, preferences?: RoutePreferences): Promise<{ jobId: string }>
  log(message: string, meta?: Record<string, unknown>): void
}

export interface MicroappContext {
  lead?: Record<string, unknown>
  account?: Record<string, unknown>
  call?: Record<string, unknown>
  opportunity?: Record<string, unknown>
  conversation?: Record<string, unknown>
  meeting?: Record<string, unknown>
  limitations: string[]
}

// Pista de UI por campo del inputSchema (anotación de revisión del doc 07:
// zod no basta para montar un formulario digno). El runner genérico del
// frontend renderiza con esto: orden, widget, ayuda y si el campo es sensible.
export interface UiFieldSpec {
  key: string
  label: string
  widget: 'text' | 'textarea' | 'select' | 'number' | 'toggle' | 'asset' | 'lead' | 'account' | 'call' | 'opportunity' | 'conversation' | 'meeting' | 'url'
  help?: string
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  sensitive?: boolean
  scope?: 'organization' | 'team' | 'user' | 'run'
}

export interface MicroappManifest {
  id: string
  version: string
  name: string
  promise: string
  category: MicroappCategory
  /** Recetas de sistema invocadas por una superficie propia pero no
   * publicadas como una microapp adicional en el catálogo de 147. */
  visibility?: 'catalog' | 'internal'

  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  uiSchema: UiFieldSpec[]

  // Capabilities de proveedor que puede invocar y permisos RBAC del repo que
  // consume. El endpoint de ejecución los verifica antes de crear el job.
  capabilities: string[]
  dataAccess: string[]
  effects: 'local' | 'external'
  approvalAction?: string

  estimateCost(input: unknown): Promise<{ cents: number }>
  freshnessDays?: number

  followUps: FollowUpAction[]

  placements?: Array<{
    surface: MicroappSurface
    role: MicroappPlacementRole
    trigger: MicroappPlacementTrigger
    actionLabel: string
  }>
  resultProjection?: {
    kind: 'brief' | 'score' | 'sequence' | 'proposal' | 'evidence' | 'asset' | 'action'
    target: MicroappSurface
    pin?: boolean
  }
  configurationScope?: Array<'organization' | 'team' | 'user' | 'run'>

  run(ctx: MicroappCtx, input: unknown): Promise<MicroappResult>
}
