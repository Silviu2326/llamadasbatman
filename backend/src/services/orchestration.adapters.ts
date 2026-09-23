import { Prisma, type OpportunityStage } from '@prisma/client'
import { prisma } from '../lib/prisma'
import * as agentsService from './agents.service'
import * as marketingCampaignsService from './marketingCampaigns.service'
import * as metaCampaignBuilder from './metaCampaignBuilder.service'
import { getDecryptedToken } from './metaAdAccount.service'
import * as metricoolSync from './metricoolSync.service'
import * as pipelineService from './pipeline.service'
import * as tasksService from './tasks.service'
import { enrichFromWebsite } from './digitalAudit.service'

export const ORCHESTRATION_ACTION_KINDS = [
  'landing.create_draft',
  'ads.publish_paused',
  'ads.activate',
  'social.create_draft',
  'email.publish',
  'agent.activate',
  'lead.create_follow_up',
  'pipeline.move_stage',
  'prospecting.enrich',
  'sequence.create_draft',
] as const

export type OrchestrationActionKind = typeof ORCHESTRATION_ACTION_KINDS[number]
export type OrchestrationActionStatus = 'succeeded' | 'blocked' | 'failed' | 'skipped'

/**
 * Referencias de recursos que el cliente puede enviar sin depender de nombres
 * internos de cada adaptador. Se mezclan con `input` al persistir el plan y
 * por tanto también quedan dentro del ledger y de la huella idempotente.
 */
export interface OrchestrationActionReferences {
  campaignId?: string
  landingSlug?: string
  leadId?: string
  leadIds?: string[]
  agentId?: string
  marketingCampaignId?: string
  emailDraftId?: string
  budgetCents?: number
  dailyBudgetCents?: number
  durationDays?: number
  opportunityId?: string
  sequenceId?: string
}

export interface OrchestrationActionContract {
  kind: OrchestrationActionKind
  title: string
  required: string[]
  anyOf?: string[]
  references: string[]
  effects: 'local' | 'external'
  compensation: 'automatic' | 'manual_review'
  retryPolicy: 'safe' | 'blocked_on_uncertain_external_outcome'
  /** Campos que la UI debe pedir para que la acción pase la validación. */
  fields: readonly OrchestrationActionField[]
  /** Acciones previas que permiten resolver referencias implícitas. */
  resolvesWith?: readonly OrchestrationActionKind[]
}

export type OrchestrationActionFieldType = 'text' | 'longText' | 'reference' | 'referenceList' | 'cents' | 'integer' | 'platforms' | 'stage'

export interface OrchestrationActionField {
  key: string
  label: string
  type: OrchestrationActionFieldType
  /** true: obligatorio siempre; 'unless_resolved': obligatorio salvo que una acción previa lo resuelva. */
  required: boolean | 'unless_resolved'
  hint?: string
  options?: readonly string[]
}

export const ORCHESTRATION_SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
export const ORCHESTRATION_PIPELINE_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const

const campaignField = (required: OrchestrationActionField['required'], hint: string): OrchestrationActionField => ({ key: 'campaignId', label: 'ID de campaña', type: 'reference', required, hint })

export const ORCHESTRATION_ACTION_CATALOG: readonly OrchestrationActionContract[] = [
  { kind: 'landing.create_draft', title: 'Crear landing en borrador', required: [], anyOf: ['campaignId', 'landingSlug'], references: ['campaignId', 'landingSlug', 'budgetCents'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'name', label: 'Nombre de la landing', type: 'text', required: false, hint: 'Si lo dejas vacío se usa el identificador del plan.' },
    { key: 'offer', label: 'Oferta principal', type: 'longText', required: false },
    campaignField(false, 'Opcional: reutiliza una campaña existente en lugar de crear una nueva.'),
  ] },
  { kind: 'ads.publish_paused', title: 'Crear campaña Ads pausada', required: ['budgetCents'], anyOf: ['campaignId'], references: ['campaignId', 'landingSlug', 'budgetCents'], effects: 'external', compensation: 'automatic', retryPolicy: 'blocked_on_uncertain_external_outcome', resolvesWith: ['landing.create_draft'], fields: [
    { key: 'budgetCents', label: 'Presupuesto total', type: 'cents', required: true, hint: 'Límite aprobado para la campaña; se crea pausada.' },
    campaignField('unless_resolved', 'Se resuelve solo si antes hay «Crear landing en borrador».'),
  ] },
  { kind: 'ads.activate', title: 'Activar campaña Ads', required: ['dailyBudgetCents', 'durationDays'], anyOf: ['campaignId'], references: ['campaignId', 'dailyBudgetCents', 'durationDays'], effects: 'external', compensation: 'automatic', retryPolicy: 'blocked_on_uncertain_external_outcome', resolvesWith: ['landing.create_draft', 'ads.publish_paused'], fields: [
    { key: 'dailyBudgetCents', label: 'Presupuesto diario', type: 'cents', required: true },
    { key: 'durationDays', label: 'Duración (días)', type: 'integer', required: true },
    campaignField('unless_resolved', 'Se resuelve solo si antes hay landing y campaña Ads pausada.'),
  ] },
  { kind: 'social.create_draft', title: 'Crear borrador social', required: ['text', 'platforms'], anyOf: ['campaignId', 'landingSlug'], references: ['campaignId', 'landingSlug'], effects: 'external', compensation: 'manual_review', retryPolicy: 'blocked_on_uncertain_external_outcome', resolvesWith: ['landing.create_draft'], fields: [
    { key: 'text', label: 'Texto de la publicación', type: 'longText', required: true },
    { key: 'platforms', label: 'Plataformas', type: 'platforms', required: true, options: ORCHESTRATION_SOCIAL_PLATFORMS },
    campaignField('unless_resolved', 'Se resuelve solo si antes hay «Crear landing en borrador».'),
  ] },
  { kind: 'email.publish', title: 'Publicar campaña de email', required: ['marketingCampaignId'], references: ['marketingCampaignId'], effects: 'external', compensation: 'automatic', retryPolicy: 'blocked_on_uncertain_external_outcome', fields: [
    { key: 'marketingCampaignId', label: 'ID de campaña de email', type: 'reference', required: true, hint: 'Campaña de Email marketing ya validada.' },
  ] },
  { kind: 'agent.activate', title: 'Activar agente comercial', required: ['agentId'], references: ['agentId'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'agentId', label: 'ID del agente', type: 'reference', required: true, hint: 'El agente debe cumplir todos los checks de publicación.' },
  ] },
  { kind: 'lead.create_follow_up', title: 'Crear seguimiento de lead', required: ['leadId', 'title'], references: ['leadId'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'leadId', label: 'ID del lead', type: 'reference', required: true },
    { key: 'title', label: 'Título de la tarea', type: 'text', required: true },
    { key: 'dueInDays', label: 'Vence en (días)', type: 'integer', required: false },
  ] },
  { kind: 'pipeline.move_stage', title: 'Mover oportunidad en pipeline', required: ['opportunityId', 'toStage'], references: ['opportunityId'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'opportunityId', label: 'ID de la oportunidad', type: 'reference', required: true },
    { key: 'toStage', label: 'Etapa destino', type: 'stage', required: true, options: ORCHESTRATION_PIPELINE_STAGES },
  ] },
  { kind: 'prospecting.enrich', title: 'Enriquecer prospecto', required: ['leadId'], references: ['leadId'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'leadId', label: 'ID del lead', type: 'reference', required: true },
    { key: 'website', label: 'Web del prospecto', type: 'text', required: false },
  ] },
  { kind: 'sequence.create_draft', title: 'Preparar borrador de secuencia', required: ['leadIds'], references: ['leadIds'], effects: 'local', compensation: 'automatic', retryPolicy: 'safe', fields: [
    { key: 'leadIds', label: 'IDs de leads (separados por comas)', type: 'referenceList', required: true, hint: 'Entre 1 y 100 leads.' },
    { key: 'name', label: 'Nombre de la secuencia', type: 'text', required: false },
  ] },
]

export interface ActionInputValidationIssue {
  code: string
  message: string
  field?: string
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasFiniteInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function requiredText(input: Record<string, unknown>, field: string): ActionInputValidationIssue | null {
  return hasText(input[field]) ? null : { code: 'ACTION_REFERENCE_REQUIRED', field, message: `La acción necesita la referencia ${field}.` }
}

function oneOfReference(input: Record<string, unknown>, fields: string[], canResolveImplicitly: boolean): ActionInputValidationIssue | null {
  if (fields.some(field => hasText(input[field]))) return null
  if (canResolveImplicitly) return null
  return { code: 'ACTION_REFERENCE_REQUIRED', field: fields.join('|'), message: `La acción necesita una de estas referencias: ${fields.join(', ')}.` }
}

/** Validación estática compartida por el controller y el servicio. */
export function validateOrchestrationActionInput(
  kind: OrchestrationActionKind,
  input: Record<string, unknown>,
  options: { canResolveCampaign?: boolean; canResolvePublishedCampaign?: boolean } = {},
): ActionInputValidationIssue | null {
  const canResolveCampaign = options.canResolveCampaign === true
  const canResolvePublishedCampaign = options.canResolvePublishedCampaign === true
  switch (kind) {
    case 'landing.create_draft':
      return null
    case 'ads.publish_paused': {
      const reference = oneOfReference(input, ['campaignId'], canResolveCampaign)
      if (reference) return reference
      if (!hasFiniteInteger(input.budgetCents)) return { code: 'ACTION_BUDGET_REQUIRED', field: 'budgetCents', message: 'La publicación Ads necesita budgetCents explícito para poder aplicar el límite aprobado.' }
      return null
    }
    case 'ads.activate': {
      const reference = oneOfReference(input, ['campaignId'], canResolvePublishedCampaign)
      if (reference) return reference
      if (!hasFiniteInteger(input.dailyBudgetCents, 1)) return { code: 'ACTION_BUDGET_REQUIRED', field: 'dailyBudgetCents', message: 'La activación Ads necesita dailyBudgetCents entero y positivo.' }
      if (!hasFiniteInteger(input.durationDays, 1)) return { code: 'ACTION_DURATION_REQUIRED', field: 'durationDays', message: 'La activación Ads necesita durationDays entero y positivo.' }
      return null
    }
    case 'social.create_draft': {
      const reference = oneOfReference(input, ['campaignId', 'landingSlug'], canResolveCampaign)
      if (reference) return reference
      if (!hasText(input.text)) return { code: 'ACTION_INPUT_REQUIRED', field: 'text', message: 'La publicación social necesita text.' }
      if (!Array.isArray(input.platforms) || input.platforms.length === 0 || input.platforms.some(platform => !hasText(platform))) return { code: 'ACTION_INPUT_REQUIRED', field: 'platforms', message: 'La publicación social necesita al menos una plataforma válida.' }
      return null
    }
    case 'email.publish':
      return requiredText(input, 'marketingCampaignId')
    case 'agent.activate':
      return requiredText(input, 'agentId')
    case 'lead.create_follow_up':
      return requiredText(input, 'leadId') || requiredText(input, 'title')
    case 'pipeline.move_stage':
      return requiredText(input, 'opportunityId') || requiredText(input, 'toStage') || (
        (ORCHESTRATION_PIPELINE_STAGES as readonly string[]).includes(String(input.toStage))
          ? null
          : { code: 'ACTION_INPUT_INVALID', field: 'toStage', message: `toStage debe ser una de: ${ORCHESTRATION_PIPELINE_STAGES.join(', ')}.` }
      )
    case 'prospecting.enrich':
      return requiredText(input, 'leadId')
    case 'sequence.create_draft':
      return Array.isArray(input.leadIds) && input.leadIds.length > 0
        ? null
        : { code: 'ACTION_REFERENCE_REQUIRED', field: 'leadIds', message: 'La secuencia necesita al menos un leadId.' }
  }
}

export interface OrchestrationAction {
  id: string
  kind: OrchestrationActionKind
  title: string
  input: Record<string, unknown>
  /**
   * Referencias de activos que forman parte del contrato público. `input`
   * conserva los parámetros operativos completos; este campo permite a la UI
   * renderizar enlaces y validaciones sin conocer el formato interno de cada
   * adaptador.
   */
  references: OrchestrationActionReferences
  estimatedCostCents: number
  requiresApproval: boolean
}

export interface AdapterContext {
  orgId: string
  actorUserId: string
  actorRole: string
  planId: string
  planBudgetCents: number
  idempotencyKey: string
  action: OrchestrationAction
}

export interface AdapterResult {
  status: OrchestrationActionStatus
  code?: string
  message?: string
  output?: Record<string, unknown>
}

function stringInput(action: OrchestrationAction, key: string): string {
  const value = action.input[key]
  return typeof value === 'string' ? value.trim() : ''
}

function numberInput(action: OrchestrationAction, key: string): number | null {
  const value = action.input[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function blocked(code: string, message: string): AdapterResult {
  return { status: 'blocked', code, message }
}

function failed(error: unknown): AdapterResult {
  return {
    status: 'failed',
    code: 'ADAPTER_ERROR',
    message: error instanceof Error ? error.message : 'Error desconocido del adaptador',
  }
}

function publicAppUrl(): URL | null {
  const raw = process.env.APP_URL || process.env.FRONTEND_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

async function metaPreflight(orgId: string, options: { requirePage?: boolean; requirePublicUrl?: boolean } = {}): Promise<AdapterResult | null> {
  const account = await prisma.metaAdAccount.findFirst({
    where: { orgId, status: 'connected' },
    select: { id: true, metaPageId: true },
  })
  if (!account) return blocked('META_ACCOUNT_MISSING', 'Conecta una cuenta de Meta Ads antes de ejecutar esta acción.')
  if (options.requirePage !== false && !account.metaPageId) return blocked('META_PAGE_MISSING', 'La cuenta de Meta no tiene una página conectada.')
  if (options.requirePublicUrl !== false && !publicAppUrl()) return blocked('PUBLIC_APP_URL_MISSING', 'APP_URL o FRONTEND_URL debe ser pública para crear una landing utilizable por Meta.')
  if (!await getDecryptedToken(orgId)) return blocked('META_TOKEN_MISSING', 'El token de Meta no está disponible o ha caducado; vuelve a conectar la cuenta.')
  return null
}

type CampaignReferenceRow = {
  id: string
  status: string
  adStatus: string | null
  landingSlug: string | null
  budgetCents: number | null
  adAssets: Prisma.JsonValue | null
  settings: Prisma.JsonValue | null
  metaCampaignId: string | null
  metaAdSetId: string | null
  metaAdId: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function resolveCampaignReference(context: AdapterContext, options: { allowImplicit?: boolean; requirePublished?: boolean } = {}): Promise<{ campaign: CampaignReferenceRow } | { blocked: AdapterResult }> {
  const requestedId = stringInput(context.action, 'campaignId')
  const select = { id: true, status: true, adStatus: true, landingSlug: true, budgetCents: true, adAssets: true, settings: true, metaCampaignId: true, metaAdSetId: true, metaAdId: true } as const
  if (requestedId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: requestedId, orgId: context.orgId }, select })
    if (!campaign) return { blocked: blocked('CAMPAIGN_NOT_FOUND', 'La campaña indicada no existe en esta organización.') }
    if (options.requirePublished && (!campaign.metaCampaignId || !campaign.metaAdSetId || !campaign.metaAdId)) {
      return { blocked: blocked('META_CAMPAIGN_NOT_PUBLISHED', 'La campaña indicada todavía no tiene todos los recursos publicados en Meta.') }
    }
    return { campaign }
  }
  if (options.allowImplicit !== true) return { blocked: blocked('CAMPAIGN_REFERENCE_REQUIRED', 'Indica campaignId o crea primero una landing en este mismo plan.') }

  // Solo se resuelven campañas marcadas por este plan y esta operación. Así
  // una acción posterior puede consumir la salida de landing.create_draft sin
  // aceptar accidentalmente un activo de otra campaña o de otra organización.
  const candidates = await prisma.campaign.findMany({
    where: { orgId: context.orgId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select,
  })
  const owned = candidates.filter(candidate => {
    const assets = record(candidate.adAssets)
    return assets.orchestrationPlanId === context.planId && assets.orchestrationIdempotencyKey === context.idempotencyKey
  })
  if (owned.length === 0) return { blocked: blocked('CAMPAIGN_REFERENCE_REQUIRED', 'No se encontró una campaña creada por este plan; indica campaignId o añade landing.create_draft antes de esta acción.') }
  if (owned.length > 1) return { blocked: blocked('CAMPAIGN_REFERENCE_AMBIGUOUS', 'El plan creó más de una campaña posible; indica campaignId explícitamente.') }
  if (options.requirePublished && (!owned[0].metaCampaignId || !owned[0].metaAdSetId || !owned[0].metaAdId)) {
    return { blocked: blocked('META_CAMPAIGN_NOT_PUBLISHED', 'La campaña implícita todavía no tiene todos los recursos publicados en Meta.') }
  }
  return { campaign: owned[0] }
}

async function createLandingDraft(context: AdapterContext): Promise<AdapterResult> {
  const campaignId = stringInput(context.action, 'campaignId')
  const slug = stringInput(context.action, 'slug') || `orch-${context.planId.replace(/[^a-zA-Z0-9]/g, '').slice(-24)}`
  const name = stringInput(context.action, 'name') || `Landing del plan ${context.planId}`
  const requestedBudgetCents = numberInput(context.action, 'budgetCents')
  const assets = {
    offer: stringInput(context.action, 'offer'),
    leadMagnet: stringInput(context.action, 'leadMagnet'),
    adCopy: stringInput(context.action, 'adCopy'),
    landingTemplateId: stringInput(context.action, 'landingTemplateId') || 'generic-v1',
    imagePrompt: stringInput(context.action, 'imagePrompt'),
    imageAssetId: stringInput(context.action, 'imageAssetId') || undefined,
    imageUrl: stringInput(context.action, 'imageUrl') || undefined,
    ...(requestedBudgetCents !== null ? { presupuestoMensual: requestedBudgetCents / 100 } : {}),
    orchestrationPlanId: context.planId,
    orchestrationIdempotencyKey: context.idempotencyKey,
    orchestrationActionId: context.action.id,
  }

  const existingBySlug = await prisma.campaign.findUnique({ where: { landingSlug: slug } })
  if (existingBySlug && existingBySlug.orgId !== context.orgId) {
    return blocked('LANDING_SLUG_OWNERSHIP', 'El slug de landing ya pertenece a otra organización.')
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId: context.orgId } })
    if (!campaign) return blocked('CAMPAIGN_NOT_FOUND', 'La campaña indicada no existe en esta organización.')
    const currentAssets = record(campaign.adAssets)
    if (currentAssets.orchestrationPlanId === context.planId && currentAssets.orchestrationIdempotencyKey === context.idempotencyKey) {
      return { status: 'succeeded', output: { campaignId: campaign.id, landingSlug: campaign.landingSlug, externalEffect: false, idempotentReplay: true } }
    }
    const requestedLandingSlug = stringInput(context.action, 'landingSlug')
    if (campaign.landingSlug && requestedLandingSlug && campaign.landingSlug !== requestedLandingSlug) {
      return blocked('LANDING_REFERENCE_MISMATCH', 'landingSlug no coincide con la landing de campaignId.')
    }
    if (campaign.status !== 'draft') return blocked('LANDING_CAMPAIGN_NOT_DRAFT', 'La campaña referenciada ya no está en borrador; no se sobrescribe desde el orquestador.')
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'draft',
        landingSlug: campaign.landingSlug || slug,
        adAssets: { ...(campaign.adAssets as Record<string, unknown> | null ?? {}), ...assets } as Prisma.InputJsonValue,
      },
    })
    return {
      status: 'succeeded',
      output: {
        campaignId: updated.id,
        landingSlug: updated.landingSlug,
        previousStatus: campaign.status,
        orchestrationPlanId: context.planId,
        externalEffect: false,
      },
    }
  }

  if (existingBySlug) {
    const existingAssets = existingBySlug.adAssets as Record<string, unknown> | null
    if (existingAssets?.orchestrationIdempotencyKey !== context.idempotencyKey) {
      return blocked('LANDING_SLUG_CONFLICT', 'El slug determinista ya existe con otra operación.')
    }
    return { status: 'succeeded', output: { campaignId: existingBySlug.id, landingSlug: existingBySlug.landingSlug, externalEffect: false, idempotentReplay: true } }
  }

  const campaign = await prisma.campaign.create({
    data: {
      orgId: context.orgId,
      name,
      objective: stringInput(context.action, 'objective') || 'Captación coordinada',
      goal: stringInput(context.action, 'goal') || undefined,
      landingSlug: slug,
      status: 'draft',
      adAssets: assets as Prisma.InputJsonValue,
    },
  })
  return {
    status: 'succeeded',
    output: {
      campaignId: campaign.id,
      landingSlug: campaign.landingSlug,
      createdByOrchestration: true,
      orchestrationPlanId: context.planId,
      externalEffect: false,
    },
  }
}

async function publishPausedAd(context: AdapterContext): Promise<AdapterResult> {
  const preflight = await metaPreflight(context.orgId, { requirePage: true, requirePublicUrl: true })
  if (preflight) return preflight
  const resolution = await resolveCampaignReference(context, { allowImplicit: true })
  if ('blocked' in resolution) return resolution.blocked
  const campaign = resolution.campaign
  const requestedBudget = numberInput(context.action, 'budgetCents')
  if (requestedBudget === null || requestedBudget < 0 || requestedBudget > context.planBudgetCents) {
    return blocked('BUDGET_LIMIT_EXCEEDED', 'El presupuesto solicitado supera el límite aprobado del plan.')
  }
  if (campaign.status === 'active' || campaign.adStatus === 'active') return blocked('CAMPAIGN_ALREADY_ACTIVE', 'La campaña ya está activa; usa una acción de pausa o no la vuelvas a publicar.')
  try {
    // El presupuesto aprobado viaja a publishCampaign, que lo compara con el
    // total del que calcula el diario (misma prioridad: activación Meta →
    // presupuesto mensual del asistente → campaña) y aborta antes de tocar
    // Meta si difieren. Así no se aprueba un importe y se publica otro.
    const result = await metaCampaignBuilder.publishCampaign(context.orgId, campaign.id, { expectedTotalBudgetCents: requestedBudget })
    return { status: 'succeeded', output: { ...result, campaignId: campaign.id, externalEffect: true, remoteState: 'paused', idempotentReplay: Boolean(campaign.metaCampaignId && campaign.metaAdSetId && campaign.metaAdId) } }
  } catch (error) {
    if (metaCampaignBuilder.isMetaPublishError(error) && (error.code === 'BUDGET_APPROVAL_MISMATCH' || error.code === 'NO_BUDGET')) {
      return blocked(error.code === 'NO_BUDGET' ? 'CAMPAIGN_BUDGET_NOT_CONFIGURED' : 'BUDGET_CONFIGURATION_MISMATCH', error.message)
    }
    return failed(error)
  }
}

async function activateAd(context: AdapterContext): Promise<AdapterResult> {
  // Activar recursos ya publicados no necesita página ni URL pública; esas
  // dependencias solo aplican al paso que crea el creativo y su landing.
  const preflight = await metaPreflight(context.orgId, { requirePage: false, requirePublicUrl: false })
  if (preflight) return preflight
  const dailyBudgetCents = numberInput(context.action, 'dailyBudgetCents')
  if (!dailyBudgetCents || dailyBudgetCents <= 0) return blocked('DAILY_BUDGET_REQUIRED', 'Indica dailyBudgetCents para que el límite de gasto sea verificable.')
  const durationDays = numberInput(context.action, 'durationDays') ?? 30
  const projectedBudget = dailyBudgetCents * durationDays
  if (!Number.isSafeInteger(projectedBudget) || projectedBudget > context.planBudgetCents) return blocked('BUDGET_LIMIT_EXCEEDED', 'El gasto máximo diario multiplicado por la duración supera el presupuesto aprobado.')
  const resolution = await resolveCampaignReference(context, { allowImplicit: true, requirePublished: true })
  if ('blocked' in resolution) return resolution.blocked
  const campaign = resolution.campaign
  if (!campaign.metaCampaignId || !campaign.metaAdSetId || !campaign.metaAdId) return blocked('META_CAMPAIGN_NOT_PUBLISHED', 'Publica primero la campaña en estado pausado antes de activarla.')
  if (campaign.status === 'active' && campaign.adStatus === 'pending_review') {
    return { status: 'succeeded', output: { campaignId: campaign.id, externalEffect: true, remoteState: 'pending_review', dailyBudgetCents, idempotentReplay: true } }
  }
  try {
    await metaCampaignBuilder.activateCampaign(context.orgId, campaign.id)
    return { status: 'succeeded', output: { campaignId: campaign.id, externalEffect: true, remoteState: 'pending_review', dailyBudgetCents } }
  } catch (error) {
    return failed(error)
  }
}

async function createSocialDraft(context: AdapterContext): Promise<AdapterResult> {
  const provider = stringInput(context.action, 'provider').toLowerCase() || 'metricool'
  const text = stringInput(context.action, 'text')
  const platforms = Array.isArray(context.action.input.platforms)
    ? context.action.input.platforms.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const landingSlug = stringInput(context.action, 'landingSlug')
  // Check attribution configuration before any campaign lookup so a missing
  // public URL remains a deterministic configuration result.
  if (!publicAppUrl()) return blocked('PUBLIC_APP_URL_MISSING', 'Configura una URL publica para mantener la atribucion UTM de la publicacion.')
  const resolution = await resolveCampaignReference(context, { allowImplicit: true })
  if ('blocked' in resolution) return resolution.blocked
  const campaign = resolution.campaign
  const resolvedCampaignId = campaign.id
  const resolvedLandingSlug = landingSlug || campaign.landingSlug || ''
  if (!text || !platforms.length || !resolvedLandingSlug) return blocked('SOCIAL_INPUT_INCOMPLETE', 'La publicación necesita text, platforms y una landing resoluble.')
  if (!publicAppUrl()) return blocked('PUBLIC_APP_URL_MISSING', 'Configura una URL pública para mantener la atribución UTM de la publicación.')
  const attribution = { campaignId: resolvedCampaignId, landingSlug: resolvedLandingSlug, cta: stringInput(context.action, 'cta') || undefined }
  const settings = record(campaign.settings)
  const socialIntents = record(settings.orchestrationSocialIntents)
  const existingIntent = record(socialIntents[context.action.id])
  if (existingIntent.status === 'succeeded') {
    return { status: 'succeeded', output: { provider, result: existingIntent.result ?? null, campaignId: resolvedCampaignId, externalEffect: true, remoteState: 'draft', idempotentReplay: true } }
  }
  if (existingIntent.status === 'pending') {
    return blocked('OUTCOME_UNKNOWN', 'El proveedor social pudo haber creado el borrador antes de una interrupción; revisa el proveedor antes de reintentar.')
  }
  try {
    if (provider === 'metricool') {
      if (!(await metricoolSync.isConfiguredForOrg(context.orgId))) return blocked('METRICOOL_NOT_CONFIGURED', 'Configura Metricool para esta organización.')
      if (!(await metricoolSync.listProfiles(context.orgId)).length) return blocked('METRICOOL_PROFILE_MISSING', 'Metricool no devuelve perfiles publicables para esta cuenta.')
      const pendingSettings = {
        ...settings,
        orchestrationSocialIntents: {
          ...socialIntents,
          [context.action.id]: { status: 'pending', provider, idempotencyKey: context.idempotencyKey, createdAt: new Date().toISOString() },
        },
      }
      await prisma.campaign.updateMany({ where: { id: resolvedCampaignId, orgId: context.orgId }, data: { settings: pendingSettings as Prisma.InputJsonValue } })
      const result = await metricoolSync.createDraftPost({ text, platforms, attribution, imageUrl: stringInput(context.action, 'imageUrl') || undefined, scheduledAt: stringInput(context.action, 'scheduledAt') || undefined }, context.orgId)
      if (!result) return blocked('METRICOOL_UNAVAILABLE', 'Metricool no confirmó la creación del borrador.')
      const completedSettings = { ...pendingSettings, orchestrationSocialIntents: { ...socialIntents, [context.action.id]: { status: 'succeeded', provider, result: JSON.parse(JSON.stringify(result)) } } }
      await prisma.campaign.updateMany({ where: { id: resolvedCampaignId, orgId: context.orgId }, data: { settings: completedSettings as Prisma.InputJsonValue } })
      return { status: 'succeeded', output: { provider, result, campaignId: resolvedCampaignId, externalEffect: true, remoteState: 'draft', compensation: 'manual_review' } }
    }
    return blocked('SOCIAL_PROVIDER_UNSUPPORTED', `Proveedor social no soportado: ${provider}`)
  } catch (error) {
    return failed(error)
  }
}

async function publishEmail(context: AdapterContext): Promise<AdapterResult> {
  const campaignId = stringInput(context.action, 'marketingCampaignId')
  if (!campaignId) return blocked('EMAIL_INPUT_INCOMPLETE', 'La acción necesita marketingCampaignId.')
  const campaign = await prisma.marketingCampaign.findFirst({ where: { id: campaignId, orgId: context.orgId }, select: { status: true, emailDraftId: true } })
  if (!campaign) return blocked('EMAIL_CAMPAIGN_NOT_FOUND', 'La campaña de email no existe en esta organización.')
  if (!campaign.emailDraftId) return blocked('EMAIL_DRAFT_REQUIRED', 'La campaña necesita un borrador local de email.')
  if (['running', 'scheduled', 'completed'].includes(campaign.status)) return { status: 'succeeded', output: { campaignId, emailDraftId: campaign.emailDraftId, enrolled: null, skipped: null, externalEffect: true, remoteState: campaign.status, idempotentReplay: true } }
  if (campaign.status === 'publishing') return blocked('OUTCOME_UNKNOWN', 'La campaña estaba publicándose cuando se interrumpió el proceso; revisa su cola local antes de reintentar.')
  try {
    const validation = await marketingCampaignsService.validateCampaign(context.orgId, campaignId)
    if (!validation.valid) return blocked('EMAIL_CAMPAIGN_INVALID', `La campaña de email no está lista: ${validation.missing.join(', ')}`)
    const result = await marketingCampaignsService.publishCampaign(context.orgId, context.actorUserId, campaignId)
    return { status: 'succeeded', output: { campaignId, emailDraftId: campaign.emailDraftId, enrolled: result.enrolled, skipped: result.skipped, externalEffect: true, remoteState: result.campaign.status } }
  } catch (error) {
    return failed(error)
  }
}
async function activateAgent(context: AdapterContext): Promise<AdapterResult> {
  const agentId = stringInput(context.action, 'agentId')
  if (!agentId) return blocked('AGENT_ID_REQUIRED', 'Indica agentId para activar el agente.')
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: context.orgId }, select: { isActive: true } })
  if (!agent) return blocked('AGENT_NOT_FOUND', 'El agente no existe en esta organización.')
  if (agent.isActive) return { status: 'succeeded', output: { agentId, previousIsActive: true, isActive: true, externalEffect: false, idempotentReplay: true } }
  const updated = await agentsService.updateAgent(context.orgId, agentId, { isActive: true })
  if (!updated.count) return blocked('AGENT_UPDATE_FAILED', 'No se pudo activar el agente.')
  return { status: 'succeeded', output: { agentId, previousIsActive: agent.isActive, isActive: true, externalEffect: false } }
}

async function createFollowUp(context: AdapterContext): Promise<AdapterResult> {
  const leadId = stringInput(context.action, 'leadId')
  const title = stringInput(context.action, 'title')
  if (!leadId || !title) return blocked('FOLLOW_UP_INPUT_INCOMPLETE', 'El seguimiento necesita leadId y title.')
  const sourceId = `${context.planId}:${context.action.id}`
  const legacySourceId = `${sourceId}:${context.idempotencyKey}`
  const existing = await prisma.task.findFirst({ where: { orgId: context.orgId, source: 'orchestration', sourceId: { in: [sourceId, legacySourceId] } }, select: { id: true, status: true } })
  if (existing) return { status: 'succeeded', output: { taskId: existing.id, status: existing.status, idempotentReplay: true, externalEffect: false } }
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: context.orgId }, select: { ownerId: true } })
  if (!lead) return blocked('LEAD_NOT_FOUND', 'El lead indicado no existe en esta organización.')
  const dueInDays = numberInput(context.action, 'dueInDays') ?? 3
  const task = await tasksService.createSystemTask(context.orgId, context.actorUserId, {
    type: 'orchestration',
    title,
    description: stringInput(context.action, 'description') || undefined,
    leadId,
    ownerId: lead.ownerId ?? undefined,
    priority: ['low', 'normal', 'high', 'urgent'].includes(stringInput(context.action, 'priority')) ? stringInput(context.action, 'priority') as 'low' | 'normal' | 'high' | 'urgent' : undefined,
    dueAt: new Date(Date.now() + Math.max(0, dueInDays) * 86_400_000).toISOString(),
    source: 'orchestration',
    sourceId,
  })
  return { status: 'succeeded', output: { taskId: task.id, leadId, externalEffect: false } }
}

async function enrichProspect(context: AdapterContext): Promise<AdapterResult> {
  const leadId = stringInput(context.action, 'leadId')
  if (!leadId) return blocked('PROSPECT_LEAD_REQUIRED', 'Indica leadId para enriquecer el prospecto.')
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: context.orgId }, select: { email: true, customFields: true } })
  if (!lead) return blocked('LEAD_NOT_FOUND', 'El prospecto indicado no existe en esta organización.')
  const fields = lead.customFields && typeof lead.customFields === 'object' && !Array.isArray(lead.customFields)
    ? lead.customFields as Record<string, unknown>
    : {}
  if (fields.orchestrationPlanId === context.planId && fields.orchestrationActionId === context.action.id) {
    return { status: 'succeeded', output: { leadId, orchestrationPlanId: context.planId, externalEffect: false, idempotentReplay: true } }
  }
  const website = stringInput(context.action, 'website') || (typeof fields.website === 'string' ? fields.website : '')
  if (!website) return blocked('PROSPECT_WEBSITE_REQUIRED', 'El prospecto necesita una web para poder enriquecerlo.')
  const enriched = await enrichFromWebsite(website)
  if (!enriched) return blocked('PROSPECT_ENRICHMENT_UNAVAILABLE', 'No se pudo leer la web del prospecto.')
  const nextFields = {
    ...fields,
    website,
    prospectingEnrichment: enriched,
    orchestrationPlanId: context.planId,
    orchestrationIdempotencyKey: context.idempotencyKey,
    orchestrationActionId: context.action.id,
  }
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, orgId: context.orgId },
    data: { email: enriched.email || lead.email, customFields: nextFields as Prisma.InputJsonValue },
  })
  if (!updated.count) return blocked('LEAD_UPDATE_FAILED', 'No se pudo guardar el enriquecimiento del prospecto.')
  return {
    status: 'succeeded',
    output: { leadId, previousEmail: lead.email, previousCustomFields: fields, orchestrationPlanId: context.planId, externalEffect: false },
  }
}

async function createSequenceDraft(context: AdapterContext): Promise<AdapterResult> {
  const name = stringInput(context.action, 'name') || `Secuencia del plan ${context.planId}`
  const leadIds = Array.isArray(context.action.input.leadIds)
    ? context.action.input.leadIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  if (!leadIds.length) return blocked('SEQUENCE_LEADS_REQUIRED', 'La secuencia necesita al menos un leadId.')
  const sequenceId = stringInput(context.action, 'sequenceId') || `orch-sequence-${context.planId}-${context.action.id}`
  const existing = await prisma.growthProgram.findFirst({ where: { id: sequenceId, orgId: context.orgId, type: 'sales_sequence' }, select: { id: true, status: true, config: true } })
  if (existing) return { status: 'succeeded', output: { sequenceId: existing.id, status: existing.status, idempotentReplay: true, externalEffect: false } }
  const steps = Array.isArray(context.action.input.steps) ? context.action.input.steps : []
  const program = await prisma.growthProgram.create({
    data: {
      id: sequenceId,
      orgId: context.orgId,
      type: 'sales_sequence',
      name,
      description: stringInput(context.action, 'description') || 'Borrador de secuencia generado por el orquestador.',
      status: 'draft',
      config: { leadIds, steps, orchestrationPlanId: context.planId, orchestrationIdempotencyKey: context.idempotencyKey } as Prisma.InputJsonValue,
    },
  })
  return { status: 'succeeded', output: { sequenceId: program.id, status: program.status, leadCount: leadIds.length, externalEffect: false } }
}

async function movePipelineStage(context: AdapterContext): Promise<AdapterResult> {
  const opportunityId = stringInput(context.action, 'opportunityId')
  const toStage = stringInput(context.action, 'toStage') as OpportunityStage
  if (!opportunityId || !toStage) return blocked('PIPELINE_INPUT_INCOMPLETE', 'La acción necesita opportunityId y toStage.')
  const allowedStages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
  if (!allowedStages.includes(toStage)) return blocked('PIPELINE_STAGE_INVALID', `Etapa no soportada: ${toStage}`)
  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId: context.orgId }, select: { stage: true } })
  if (!opportunity) return blocked('OPPORTUNITY_NOT_FOUND', 'La oportunidad indicada no existe en esta organización.')
  try {
    const result = await pipelineService.moveStage(context.orgId, context.actorUserId, context.actorRole, opportunityId, toStage, stringInput(context.action, 'reason') || undefined, numberInput(context.action, 'probability') ?? undefined)
    return { status: 'succeeded', output: { opportunityId, previousStage: opportunity.stage, stage: result.stage, externalEffect: false } }
  } catch (error) {
    return failed(error)
  }
}

export async function executeOrchestrationAction(context: AdapterContext): Promise<AdapterResult> {
  try {
    switch (context.action.kind) {
      case 'landing.create_draft': return createLandingDraft(context)
      case 'ads.publish_paused': return publishPausedAd(context)
      case 'ads.activate': return activateAd(context)
      case 'social.create_draft': return createSocialDraft(context)
      case 'email.publish': return publishEmail(context)
      case 'agent.activate': return activateAgent(context)
      case 'lead.create_follow_up': return createFollowUp(context)
      case 'pipeline.move_stage': return movePipelineStage(context)
      case 'prospecting.enrich': return enrichProspect(context)
      case 'sequence.create_draft': return createSequenceDraft(context)
    }
  } catch (error) {
    return failed(error)
  }
}

export async function compensateOrchestrationAction(context: AdapterContext, output: Record<string, unknown> | null): Promise<AdapterResult> {
  try {
    switch (context.action.kind) {
      case 'ads.publish_paused':
      case 'ads.activate': {
        if (output?.idempotentReplay === true) return { status: 'succeeded', output: { compensated: 'no_owned_external_effect', idempotentReplay: true } }
        const campaignId = stringInput(context.action, 'campaignId')
        const resolved = await resolveCampaignReference(context, { allowImplicit: true })
        if ('blocked' in resolved && !campaignId) return resolved.blocked
        const resolvedCampaignId = campaignId || ('campaign' in resolved ? resolved.campaign.id : '')
        if (!resolvedCampaignId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay campaignId para pausar Meta.')
        await metaCampaignBuilder.pauseCampaign(context.orgId, resolvedCampaignId)
        return { status: 'succeeded', output: { campaignId: resolvedCampaignId, compensated: 'paused_meta_campaign' } }
      }
      case 'email.publish': {
        if (output?.idempotentReplay === true) return { status: 'succeeded', output: { compensated: 'no_owned_external_effect', idempotentReplay: true } }
        const campaignId = stringInput(context.action, 'marketingCampaignId')
        if (!campaignId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay campaña de email para pausar.')
        await marketingCampaignsService.pauseCampaign(context.orgId, context.actorUserId, campaignId)
        return { status: 'succeeded', output: { campaignId, compensated: 'paused_email_campaign' } }
      }
      case 'landing.create_draft': {
        const campaignId = typeof output?.campaignId === 'string' ? output.campaignId : stringInput(context.action, 'campaignId')
        if (!campaignId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay campaña de landing para devolver a borrador.')
        const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId: context.orgId }, select: { status: true, adAssets: true } })
        if (!campaign) return blocked('CAMPAIGN_NOT_FOUND', 'La campaña de landing ya no existe en esta organización.')
        const assets = campaign.adAssets as Record<string, unknown> | null
        if (assets?.orchestrationPlanId !== context.planId) return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La landing ya no está marcada como propiedad de este plan.')
        if (campaign.status !== 'draft') return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La campaña cambió después de la ejecución; no se sobrescribe durante el rollback.')
        const previousStatus = typeof output?.previousStatus === 'string' ? output.previousStatus : 'draft'
        if (output?.createdByOrchestration === true) {
          return { status: 'succeeded', output: { campaignId, compensated: 'kept_as_draft' } }
        }
        await prisma.campaign.updateMany({ where: { id: campaignId, orgId: context.orgId, status: 'draft' }, data: { status: previousStatus as 'draft' | 'active' | 'paused' | 'done' } })
        return { status: 'succeeded', output: { campaignId, compensated: 'restored_previous_status', status: previousStatus } }
      }
      case 'agent.activate': {
        const agentId = stringInput(context.action, 'agentId')
        const previous = typeof output?.previousIsActive === 'boolean' ? output.previousIsActive : false
        if (!agentId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay agentId para compensar.')
        const current = await prisma.agent.findFirst({ where: { id: agentId, orgId: context.orgId }, select: { isActive: true } })
        if (!current) return blocked('AGENT_NOT_FOUND', 'El agente ya no existe en esta organización.')
        if (output?.idempotentReplay === true) return { status: 'succeeded', output: { agentId, compensated: 'no_owned_state_change', idempotentReplay: true } }
        if (current.isActive === previous) return { status: 'succeeded', output: { agentId, compensated: 'already_restored' } }
        if (!current.isActive) return blocked('COMPENSATION_CONCURRENT_CHANGE', 'El agente cambió después de la ejecución; no se sobrescribe durante el rollback.')
        await agentsService.updateAgent(context.orgId, agentId, { isActive: previous })
        return { status: 'succeeded', output: { agentId, compensated: 'restored_active_state' } }
      }
      case 'lead.create_follow_up': {
        const taskId = typeof output?.taskId === 'string' ? output.taskId : null
        if (!taskId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay taskId para cancelar el seguimiento.')
        const task = await prisma.task.findFirst({ where: { id: taskId, orgId: context.orgId, source: 'orchestration' }, select: { status: true } })
        if (!task) return blocked('TASK_NOT_FOUND', 'La tarea de seguimiento ya no existe.')
        if (task.status !== 'open') return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La tarea ya fue modificada; no se cancela durante el rollback.')
        const updated = await prisma.task.updateMany({ where: { id: taskId, orgId: context.orgId, source: 'orchestration', status: 'open' }, data: { status: 'cancelled', completedAt: new Date() } })
        return updated.count ? { status: 'succeeded', output: { taskId, compensated: 'cancelled_task' } } : blocked('TASK_NOT_FOUND', 'La tarea de seguimiento ya no existe.')
      }
      case 'pipeline.move_stage': {
        const opportunityId = stringInput(context.action, 'opportunityId')
        const previousStage = typeof output?.previousStage === 'string' ? output.previousStage as OpportunityStage : null
        if (!opportunityId || !previousStage) return blocked('COMPENSATION_INPUT_MISSING', 'No hay etapa previa para revertir la oportunidad.')
        const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId: context.orgId }, select: { stage: true } })
        if (!opportunity) return blocked('OPPORTUNITY_NOT_FOUND', 'La oportunidad ya no existe en esta organización.')
        const expectedStage = stringInput(context.action, 'toStage') as OpportunityStage
        if (expectedStage && opportunity.stage !== expectedStage) return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La oportunidad cambió después de la ejecución; no se sobrescribe durante el rollback.')
        if (opportunity.stage === previousStage) return { status: 'succeeded', output: { opportunityId, compensated: 'already_restored', stage: previousStage } }
        await pipelineService.moveStage(context.orgId, context.actorUserId, context.actorRole, opportunityId, previousStage, 'Compensación del plan de orquestación')
        return { status: 'succeeded', output: { opportunityId, compensated: 'restored_stage', stage: previousStage } }
      }
      case 'prospecting.enrich': {
        const leadId = stringInput(context.action, 'leadId')
        if (!leadId || !output?.previousCustomFields || typeof output.previousCustomFields !== 'object') return blocked('COMPENSATION_INPUT_MISSING', 'No hay estado previo del prospecto para compensar.')
        const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId: context.orgId }, select: { customFields: true } })
        if (!lead) return blocked('LEAD_NOT_FOUND', 'El prospecto ya no existe en esta organización.')
        const current = lead.customFields as Record<string, unknown> | null
        if (current?.orchestrationPlanId !== context.planId) return blocked('COMPENSATION_CONCURRENT_CHANGE', 'El prospecto cambió después del enriquecimiento.')
        await prisma.lead.updateMany({ where: { id: leadId, orgId: context.orgId }, data: { email: typeof output.previousEmail === 'string' ? output.previousEmail : null, customFields: output.previousCustomFields as Prisma.InputJsonValue } })
        return { status: 'succeeded', output: { leadId, compensated: 'restored_prospect' } }
      }
      case 'sequence.create_draft': {
        const sequenceId = typeof output?.sequenceId === 'string' ? output.sequenceId : stringInput(context.action, 'sequenceId')
        if (!sequenceId) return blocked('COMPENSATION_INPUT_MISSING', 'No hay secuencia para archivar.')
        const sequence = await prisma.growthProgram.findFirst({ where: { id: sequenceId, orgId: context.orgId, type: 'sales_sequence' }, select: { status: true, config: true } })
        if (!sequence) return blocked('SEQUENCE_NOT_FOUND', 'La secuencia ya no existe en esta organización.')
        const config = sequence.config as Record<string, unknown> | null
        if (config?.orchestrationPlanId !== context.planId) return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La secuencia ya no está marcada como propiedad de este plan.')
        if (sequence.status !== 'draft') return blocked('COMPENSATION_CONCURRENT_CHANGE', 'La secuencia ya fue modificada; no se archiva durante el rollback.')
        await prisma.growthProgram.updateMany({ where: { id: sequenceId, orgId: context.orgId, type: 'sales_sequence', status: 'draft' }, data: { status: 'archived', archivedAt: new Date() } })
        return { status: 'succeeded', output: { sequenceId, compensated: 'archived_sequence_draft' } }
      }
      case 'social.create_draft':
        return blocked('COMPENSATION_UNSUPPORTED', 'El adaptador actual no expone borrado seguro de borradores sociales; requiere revisión manual.')
    }
  } catch (error) {
    return failed(error)
  }
}

export function actionHasExternalEffect(kind: OrchestrationActionKind): boolean {
  return kind === 'ads.publish_paused' || kind === 'ads.activate' || kind === 'social.create_draft' || kind === 'email.publish'
}

