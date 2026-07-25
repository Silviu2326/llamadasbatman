import { Prisma, RevenueExperiment, RevenueExperimentAssignment, RevenueExperimentVariant } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import * as tasksService from './tasks.service'

export const EXPERIMENT_SURFACES = ['landing', 'playbook', 'voice', 'sequence', 'audience'] as const
export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed', 'archived'] as const
export const MEMORY_STATUSES = ['proposed', 'approved', 'rejected', 'applied'] as const
export const GOVERNANCE_POLICY_KEYS = ['consent', 'cost', 'approvals'] as const

export type ExperimentSurface = typeof EXPERIMENT_SURFACES[number]
export type ExperimentStatus = typeof EXPERIMENT_STATUSES[number]
export type MemoryStatus = typeof MEMORY_STATUSES[number]
export type GovernancePolicyKey = typeof GOVERNANCE_POLICY_KEYS[number]

export class RevenueIntelligenceNotFoundError extends Error {
  constructor(entity = 'Recurso') {
    super(`${entity} no encontrado`)
    this.name = 'RevenueIntelligenceNotFoundError'
  }
}

export class RevenueIntelligenceStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevenueIntelligenceStateError'
  }
}

export class RevenueIntelligencePolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevenueIntelligencePolicyError'
  }
}

export interface NextActionFilters {
  status?: string
  limit?: number
}

export interface CreateExperimentInput {
  name: string
  surface: ExperimentSurface
  primaryMetric: string
  audienceDefinition?: Record<string, unknown> | null
  attributionWindowDays?: number
  budgetCents?: number | null
  variants: Array<{
    key: string
    name: string
    isControl?: boolean
    allocation?: number
    payload?: Record<string, unknown> | null
  }>
}

export interface UpdateExperimentInput {
  name?: string
  primaryMetric?: string
  audienceDefinition?: Record<string, unknown> | null
  attributionWindowDays?: number
  budgetCents?: number | null
  status?: Extract<ExperimentStatus, 'paused' | 'completed' | 'archived'>
}

export interface CreateMemoryProposalInput {
  sourceType: string
  sourceId?: string | null
  targetType: string
  targetId?: string | null
  title: string
  summary: string
  evidence?: Record<string, unknown> | null
  proposedChange?: Record<string, unknown> | null
  confidence?: number
}

export interface PolicyInput {
  enabled: boolean
  config?: Record<string, unknown> | null
}

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

function asOutputJson(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function nextBusinessRecommendation(now = new Date()): Date {
  const recommended = new Date(now)
  const weekday = recommended.getUTCDay()
  const hour = recommended.getUTCHours()
  if (weekday === 0 || weekday === 6) {
    recommended.setUTCDate(recommended.getUTCDate() + (weekday === 6 ? 2 : 1))
    recommended.setUTCHours(9, 30, 0, 0)
    return recommended
  }
  if (hour < 9) {
    recommended.setUTCHours(9, 30, 0, 0)
    return recommended
  }
  if (hour >= 18) {
    recommended.setUTCDate(recommended.getUTCDate() + 1)
    if (recommended.getUTCDay() === 6) recommended.setUTCDate(recommended.getUTCDate() + 2)
    if (recommended.getUTCDay() === 0) recommended.setUTCDate(recommended.getUTCDate() + 1)
    recommended.setUTCHours(9, 30, 0, 0)
  }
  return recommended
}

function latestConsent(consents: Array<{ channel: string; status: string; occurredAt: Date }>, channel: string): boolean {
  return consents.find(consent => consent.channel === channel)?.status === 'granted'
}

function recommendedChannel(lead: {
  status: string
  email: string | null
  phone: string | null
  contactConsents: Array<{ channel: string; status: string; occurredAt: Date }>
}): string | null {
  const emailAllowed = Boolean(lead.email) && latestConsent(lead.contactConsents, 'email')
  const voiceAllowed = Boolean(lead.phone) && latestConsent(lead.contactConsents, 'voice')
  const whatsappAllowed = Boolean(lead.phone) && latestConsent(lead.contactConsents, 'whatsapp')
  if (lead.status === 'qualified' && voiceAllowed) return 'voice'
  if (emailAllowed) return 'email'
  if (whatsappAllowed) return 'whatsapp'
  if (voiceAllowed) return 'voice'
  return null
}

function actionTypeForChannel(channel: string | null): string {
  if (channel === 'voice') return 'call'
  if (channel === 'email') return 'email'
  if (channel === 'whatsapp') return 'reply'
  return 'create_task'
}

function scoreLead(lead: {
  status: string
  email: string | null
  phone: string | null
  attempts: number
  lastAttemptAt: Date | null
  firstRespondedAt: Date | null
}, now: Date): number {
  let score = 0.35
  if (lead.status === 'qualified') score += 0.3
  if (lead.status === 'contacted') score += 0.15
  if (lead.status === 'new') score += 0.22
  if (lead.email) score += 0.07
  if (lead.phone) score += 0.08
  if (lead.firstRespondedAt) score += 0.08
  if (lead.attempts >= 4) score -= 0.12
  if (lead.lastAttemptAt && now.getTime() - lead.lastAttemptAt.getTime() < 24 * 60 * 60 * 1000) score -= 0.18
  return Math.max(0.05, Math.min(0.95, Math.round(score * 100) / 100))
}

function suggestedMessage(channel: string | null, leadName: string, status: string): string | null {
  const firstName = leadName.trim().split(/\s+/)[0] || 'hola'
  if (channel === 'email') return `Hola ${firstName}, quería retomar tu interés y compartirte el siguiente paso más útil. ¿Te encaja una breve conversación esta semana?`
  if (channel === 'whatsapp') return `Hola ${firstName}, te escribo para retomar tu consulta. ¿Qué momento te viene bien para avanzar?`
  if (channel === 'voice') return `Llamar a ${firstName} con un resumen del contexto y una pregunta de avance${status === 'qualified' ? ' orientada a la propuesta' : ''}.`
  return `Revisar el consentimiento y asignar un propietario antes de volver a contactar a ${firstName}.`
}

async function ensureConversation(orgId: string, leadId: string, leadName: string, existingId?: string): Promise<string> {
  if (existingId) return existingId
  const existing = await prisma.conversation.findFirst({ where: { orgId, leadId }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
  if (existing) return existing.id
  const created = await prisma.conversation.create({
    data: {
      orgId,
      leadId,
      channel: 'mixed',
      provider: 'crm',
      address: `lead:${leadId}`,
      status: 'open',
      subject: `Seguimiento de ${leadName}`,
    },
    select: { id: true },
  })
  return created.id
}

/**
 * Calcula recomendaciones explicables y consentidas. No ejecuta ningún canal:
 * solo materializa una propuesta que el usuario puede aceptar o descartar.
 */
export async function refreshNextBestActions(orgId: string, actorUserId: string, limit = 100) {
  const now = new Date()
  await prisma.nextBestAction.updateMany({
    where: { orgId, status: 'proposed', expiresAt: { lt: now } },
    data: { status: 'expired' },
  })

  const leads = await prisma.lead.findMany({
    where: { orgId, status: { in: ['new', 'contacted', 'qualified'] } },
    select: {
      id: true, name: true, email: true, phone: true, status: true, attempts: true,
      lastAttemptAt: true, firstRespondedAt: true,
      contactConsents: { select: { channel: true, status: true, occurredAt: true }, orderBy: { occurredAt: 'desc' } },
      conversations: { select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(limit, 250),
  })

  const created: string[] = []
  let skipped = 0
  for (const lead of leads) {
    const conversationId = await ensureConversation(orgId, lead.id, lead.name, lead.conversations[0]?.id)
    const current = await prisma.nextBestAction.findFirst({
      where: { orgId, conversationId, status: 'proposed', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    })
    if (current) {
      skipped += 1
      continue
    }

    const channel = recommendedChannel(lead)
    const score = scoreLead(lead, now)
    const action = await prisma.nextBestAction.create({
      data: {
        orgId,
        conversationId,
        leadId: lead.id,
        type: actionTypeForChannel(channel),
        channel,
        score,
        confidence: score,
        reason: channel
          ? `Prioridad calculada por estado ${lead.status}, señales de contacto y consentimiento vigente.`
          : 'No hay consentimiento vigente para un canal de contacto; requiere revisión humana.',
        message: suggestedMessage(channel, lead.name, lead.status),
        recommendedFor: nextBusinessRecommendation(now),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        metadata: { factors: { status: lead.status, attempts: lead.attempts, consentedChannel: channel } },
      },
    })
    created.push(action.id)
  }

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'revenue_intelligence.next_action.refresh',
    entityType: 'NextBestAction',
    entityId: `refresh:${now.toISOString()}`,
    after: { created: created.length, skipped, considered: leads.length },
  })
  return { created: created.length, skipped, considered: leads.length, actionIds: created }
}

export async function listNextBestActions(orgId: string, filters: NextActionFilters = {}) {
  const actions = await prisma.nextBestAction.findMany({
    where: { orgId, ...(filters.status ? { status: filters.status } : {}) },
    include: {
      lead: { select: { id: true, name: true, email: true, phone: true, company: true, status: true } },
      conversation: { select: { id: true, channel: true, subject: true, updatedAt: true } },
      acceptedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { score: 'desc' }, { recommendedFor: { sort: 'asc', nulls: 'last' } }],
    take: filters.limit ?? 100,
  })
  return { actions, total: actions.length }
}

export async function updateNextBestActionStatus(
  orgId: string,
  actorUserId: string,
  id: string,
  status: 'accepted' | 'dismissed' | 'executed',
) {
  const before = await prisma.nextBestAction.findFirst({ where: { id, orgId } })
  if (!before) throw new RevenueIntelligenceNotFoundError('Recomendación')
  if (before.status !== 'proposed') throw new RevenueIntelligenceStateError(`La recomendación ya está en estado "${before.status}"`)
  if (before.expiresAt && before.expiresAt <= new Date()) throw new RevenueIntelligenceStateError('La recomendación ha caducado; genera una nueva antes de actuar.')

  let result: unknown
  if (status === 'accepted') {
    const task = await tasksService.createSystemTask(orgId, actorUserId, {
      type: 'next_best_action',
      title: before.reason.slice(0, 200),
      description: [before.reason, before.message].filter(Boolean).join('\n\n'),
      ownerId: actorUserId,
      dueAt: before.recommendedFor?.toISOString(),
      leadId: before.leadId ?? undefined,
      conversationId: before.conversationId,
      source: 'next_best_action',
      sourceId: before.id,
    })
    const nextBestAction = await prisma.nextBestAction.update({
      where: { id: before.id },
      data: { status: 'accepted', acceptedById: actorUserId, acceptedAt: new Date(), convertedTaskId: task.id },
    })
    result = { nextBestAction, task }
  } else {
    result = await prisma.nextBestAction.update({
      where: { id: before.id },
      data: { status, ...(status === 'executed' ? { executedAt: new Date() } : {}) },
    })
  }
  await writeAuditLog({ orgId, actorUserId, action: `revenue_intelligence.next_action.${status}`, entityType: 'NextBestAction', entityId: id, before, after: result })
  return result
}

function experimentInclude() {
  return {
    variants: { orderBy: { createdAt: 'asc' as const } },
    createdBy: { select: { id: true, name: true, email: true } },
  }
}

async function findExperiment(orgId: string, id: string): Promise<RevenueExperiment> {
  const experiment = await prisma.revenueExperiment.findFirst({ where: { id, orgId } })
  if (!experiment) throw new RevenueIntelligenceNotFoundError('Experimento')
  return experiment
}

function validateVariants(variants: CreateExperimentInput['variants']) {
  const keys = new Set(variants.map(variant => variant.key))
  if (keys.size !== variants.length) throw new RevenueIntelligenceStateError('Las claves de variante deben ser únicas.')
  if (variants.filter(variant => variant.isControl).length > 1) throw new RevenueIntelligenceStateError('Solo puede existir una variante de control.')
  if (variants.reduce((sum, variant) => sum + (variant.allocation ?? 50), 0) <= 0) throw new RevenueIntelligenceStateError('La asignación total debe ser mayor que cero.')
}

export async function listExperiments(orgId: string, status?: ExperimentStatus, limit = 100) {
  const experiments = await prisma.revenueExperiment.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    include: experimentInclude(),
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  const withResults = await Promise.all(experiments.map(async experiment => ({ ...experiment, results: await experimentResults(orgId, experiment.id) })))
  return { experiments: withResults, total: withResults.length }
}

export async function getExperiment(orgId: string, id: string) {
  await findExperiment(orgId, id)
  const experiment = await prisma.revenueExperiment.findFirst({ where: { id, orgId }, include: experimentInclude() })
  if (!experiment) throw new RevenueIntelligenceNotFoundError('Experimento')
  return { ...experiment, results: await experimentResults(orgId, id) }
}

export async function createExperiment(orgId: string, actorUserId: string, input: CreateExperimentInput) {
  validateVariants(input.variants)
  const experiment = await prisma.revenueExperiment.create({
    data: {
      orgId,
      createdById: actorUserId,
      name: input.name,
      surface: input.surface,
      primaryMetric: input.primaryMetric,
      audienceDefinition: asJson(input.audienceDefinition),
      attributionWindowDays: input.attributionWindowDays ?? 30,
      budgetCents: input.budgetCents ?? undefined,
      variants: {
        create: input.variants.map(variant => ({
          key: variant.key,
          name: variant.name,
          isControl: variant.isControl ?? false,
          allocation: variant.allocation ?? 50,
          payload: asJson(variant.payload),
        })),
      },
    },
    include: experimentInclude(),
  })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.experiment.create', entityType: 'RevenueExperiment', entityId: experiment.id, after: experiment })
  return experiment
}

export async function updateExperiment(orgId: string, actorUserId: string, id: string, input: UpdateExperimentInput) {
  const before = await findExperiment(orgId, id)
  if (before.status === 'archived') throw new RevenueIntelligenceStateError('Un experimento archivado no se puede modificar.')
  if (input.status === 'archived' && before.status === 'running') throw new RevenueIntelligenceStateError('Pausa o completa el experimento antes de archivarlo.')
  const data: Prisma.RevenueExperimentUpdateManyMutationInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.primaryMetric !== undefined) data.primaryMetric = input.primaryMetric
  if (input.audienceDefinition !== undefined) data.audienceDefinition = asJson(input.audienceDefinition)
  if (input.attributionWindowDays !== undefined) data.attributionWindowDays = input.attributionWindowDays
  if (input.budgetCents !== undefined) data.budgetCents = input.budgetCents
  if (input.status !== undefined) {
    data.status = input.status
    if (input.status === 'completed') data.endsAt = new Date()
  }
  const updated = await prisma.revenueExperiment.update({ where: { id: before.id }, data, include: experimentInclude() })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.experiment.update', entityType: 'RevenueExperiment', entityId: id, before, after: updated })
  return updated
}

async function getPolicyRecord(orgId: string, key: GovernancePolicyKey) {
  return prisma.governancePolicy.findUnique({ where: { orgId_key: { orgId, key } } })
}

function costPolicyAllows(policy: { enabled: boolean; config: Prisma.JsonValue | null } | null, budgetCents: number | null, actorRole: string) {
  if (!policy?.enabled) return
  const config = asOutputJson(policy.config)
  const maxBudget = Number(config?.maxExperimentBudgetCents)
  if (budgetCents !== null && Number.isFinite(maxBudget) && maxBudget >= 0 && budgetCents > maxBudget) {
    throw new RevenueIntelligencePolicyError(`El presupuesto del experimento supera el límite de ${maxBudget} céntimos configurado por gobierno.`)
  }
  if (budgetCents && budgetCents > 0 && config?.requireAdminForPaidExperiments === true && actorRole !== 'admin') {
    throw new RevenueIntelligencePolicyError('La política de coste requiere aprobación de un administrador para experimentos con presupuesto.')
  }
}

export async function startExperiment(orgId: string, actorUserId: string, actorRole: string, id: string) {
  const before = await findExperiment(orgId, id)
  if (!['draft', 'paused'].includes(before.status)) throw new RevenueIntelligenceStateError('Solo se pueden iniciar experimentos en borrador o pausados.')
  const variants = await prisma.revenueExperimentVariant.count({ where: { experimentId: id } })
  if (variants < 2) throw new RevenueIntelligenceStateError('Un experimento necesita al menos dos variantes para iniciar.')
  costPolicyAllows(await getPolicyRecord(orgId, 'cost'), before.budgetCents, actorRole)
  const experiment = await prisma.revenueExperiment.update({
    where: { id: before.id },
    data: { status: 'running', startsAt: before.startsAt ?? new Date(), endsAt: null },
    include: experimentInclude(),
  })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.experiment.start', entityType: 'RevenueExperiment', entityId: id, before, after: experiment })
  return experiment
}

function stableBucket(subjectKey: string): number {
  let hash = 2166136261
  for (let index = 0; index < subjectKey.length; index += 1) {
    hash ^= subjectKey.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 10_000
}

function chooseVariant(variants: RevenueExperimentVariant[], subjectKey: string): RevenueExperimentVariant {
  const total = variants.reduce((sum, variant) => sum + Math.max(0, variant.allocation), 0)
  const target = (stableBucket(subjectKey) / 10_000) * total
  let accumulated = 0
  for (const variant of variants) {
    accumulated += Math.max(0, variant.allocation)
    if (target < accumulated) return variant
  }
  return variants[variants.length - 1]
}

export async function assignExperimentVariant(
  orgId: string,
  id: string,
  subjectKey: string,
  leadId?: string,
  metadata?: Record<string, unknown> | null,
) {
  const experiment = await findExperiment(orgId, id)
  if (experiment.status !== 'running') throw new RevenueIntelligenceStateError('El experimento debe estar activo antes de asignar audiencia.')
  if (leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
    if (!lead) throw new RevenueIntelligenceNotFoundError('Lead')
  }
  const existing = await prisma.revenueExperimentAssignment.findUnique({ where: { experimentId_subjectKey: { experimentId: id, subjectKey } }, include: { variant: true } })
  if (existing) return existing
  const variants = await prisma.revenueExperimentVariant.findMany({ where: { experimentId: id }, orderBy: { createdAt: 'asc' } })
  const selected = chooseVariant(variants, subjectKey)
  return prisma.revenueExperimentAssignment.create({
    data: { orgId, experimentId: id, variantId: selected.id, subjectKey, leadId, metadata: asJson(metadata) },
    include: { variant: true },
  })
}

export async function recordExperimentConversion(
  orgId: string,
  actorUserId: string,
  id: string,
  subjectKey: string,
  input: { conversionType: string; attributedRevenue?: number | null; currency?: string },
) {
  await findExperiment(orgId, id)
  const before = await prisma.revenueExperimentAssignment.findFirst({ where: { orgId, experimentId: id, subjectKey } })
  if (!before) throw new RevenueIntelligenceNotFoundError('Asignación del experimento')
  const assignment = await prisma.revenueExperimentAssignment.update({
    where: { id: before.id },
    data: {
      convertedAt: before.convertedAt ?? new Date(),
      conversionType: input.conversionType,
      attributedRevenue: input.attributedRevenue ?? undefined,
      currency: input.currency ?? undefined,
    },
    include: { variant: true },
  })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.experiment.conversion', entityType: 'RevenueExperimentAssignment', entityId: assignment.id, before, after: assignment })
  return assignment
}

export async function experimentResults(orgId: string, id: string) {
  const assignments = await prisma.revenueExperimentAssignment.findMany({
    where: { orgId, experimentId: id },
    select: { variantId: true, convertedAt: true, attributedRevenue: true, currency: true },
    take: 10_000,
  })
  const variants = await prisma.revenueExperimentVariant.findMany({ where: { experimentId: id }, select: { id: true, key: true, name: true, isControl: true } })
  const totals = new Map(variants.map(variant => [variant.id, { ...variant, exposures: 0, conversions: 0, revenue: 0, currencies: new Set<string>() }]))
  for (const assignment of assignments) {
    const total = totals.get(assignment.variantId)
    if (!total) continue
    total.exposures += 1
    if (assignment.convertedAt) total.conversions += 1
    if (assignment.attributedRevenue) total.revenue += Number(assignment.attributedRevenue)
    if (assignment.attributedRevenue) total.currencies.add(assignment.currency)
  }
  const byVariant = Array.from(totals.values()).map(total => ({
    id: total.id,
    key: total.key,
    name: total.name,
    isControl: total.isControl,
    exposures: total.exposures,
    conversions: total.conversions,
    conversionRate: total.exposures ? Number((total.conversions / total.exposures).toFixed(4)) : 0,
    attributedRevenue: Number(total.revenue.toFixed(2)),
    currencies: Array.from(total.currencies),
  }))
  return { totalAssignments: assignments.length, byVariant }
}

async function assertMemoryReferencesOwned(orgId: string, input: CreateMemoryProposalInput) {
  if (input.targetId && input.targetType === 'playbook') {
    if (!await prisma.playbook.findFirst({ where: { id: input.targetId, orgId }, select: { id: true } })) throw new RevenueIntelligenceNotFoundError('Playbook de destino')
  }
  if (input.targetId && input.targetType === 'knowledge_base') {
    if (!await prisma.knowledgeBase.findFirst({ where: { id: input.targetId, orgId }, select: { id: true } })) throw new RevenueIntelligenceNotFoundError('Base de conocimiento de destino')
  }
  if (input.sourceId && input.sourceType === 'conversation') {
    if (!await prisma.conversation.findFirst({ where: { id: input.sourceId, orgId }, select: { id: true } })) throw new RevenueIntelligenceNotFoundError('Conversación de origen')
  }
  if (input.sourceId && input.sourceType === 'experiment') await findExperiment(orgId, input.sourceId)
}

export async function listMemoryProposals(orgId: string, status?: MemoryStatus, limit = 100) {
  const proposals = await prisma.operationalMemoryProposal.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  return { proposals, total: proposals.length }
}

export async function createMemoryProposal(orgId: string, actorUserId: string, input: CreateMemoryProposalInput) {
  await assertMemoryReferencesOwned(orgId, input)
  const proposal = await prisma.operationalMemoryProposal.create({
    data: {
      orgId,
      createdById: actorUserId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? undefined,
      targetType: input.targetType,
      targetId: input.targetId ?? undefined,
      title: input.title,
      summary: input.summary,
      evidence: asJson(input.evidence),
      proposedChange: asJson(input.proposedChange),
      confidence: input.confidence ?? 0,
    },
  })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.memory.propose', entityType: 'OperationalMemoryProposal', entityId: proposal.id, after: proposal })
  return proposal
}

export async function reviewMemoryProposal(
  orgId: string,
  actorUserId: string,
  id: string,
  decision: 'approve' | 'reject' | 'mark_applied',
  reviewComment?: string,
) {
  const before = await prisma.operationalMemoryProposal.findFirst({ where: { id, orgId } })
  if (!before) throw new RevenueIntelligenceNotFoundError('Propuesta de memoria')
  if (decision !== 'mark_applied' && before.status !== 'proposed') throw new RevenueIntelligenceStateError('Solo una propuesta pendiente puede aprobarse o rechazarse.')
  if (decision === 'mark_applied' && before.status !== 'approved') throw new RevenueIntelligenceStateError('Solo una propuesta aprobada puede marcarse como aplicada.')
  const now = new Date()
  const after = await prisma.operationalMemoryProposal.update({
    where: { id: before.id },
    data: {
      status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'applied',
      reviewedById: actorUserId,
      reviewedAt: now,
      reviewComment: reviewComment ?? undefined,
      ...(decision === 'mark_applied' ? { appliedAt: now } : {}),
    },
  })
  await writeAuditLog({ orgId, actorUserId, action: `revenue_intelligence.memory.${decision}`, entityType: 'OperationalMemoryProposal', entityId: id, before, after })
  return after
}

const DEFAULT_POLICY_CONFIG: Record<GovernancePolicyKey, Record<string, unknown>> = {
  consent: { requireExplicitConsent: true, channels: ['email', 'whatsapp', 'voice'], auditConsentChanges: true },
  cost: { maxExperimentBudgetCents: 0, requireAdminForPaidExperiments: true, monthlyBudgetAlertCents: 0 },
  approvals: { memoryReviewRole: 'admin', policyChangeRole: 'admin', experimentApprovalRole: 'admin' },
}

export async function listGovernancePolicies(orgId: string) {
  const persisted = await prisma.governancePolicy.findMany({ where: { orgId }, orderBy: { key: 'asc' } })
  const byKey = new Map(persisted.map(policy => [policy.key, policy]))
  return GOVERNANCE_POLICY_KEYS.map(key => byKey.get(key) ?? {
    id: null,
    orgId,
    key,
    enabled: true,
    config: DEFAULT_POLICY_CONFIG[key],
    updatedById: null,
    createdAt: null,
    updatedAt: null,
    isDefault: true,
  })
}

export async function getGovernancePolicy(orgId: string, key: GovernancePolicyKey) {
  const policy = await getPolicyRecord(orgId, key)
  return policy ?? { id: null, orgId, key, enabled: true, config: DEFAULT_POLICY_CONFIG[key], updatedById: null, createdAt: null, updatedAt: null, isDefault: true }
}

export async function updateGovernancePolicy(orgId: string, actorUserId: string, key: GovernancePolicyKey, input: PolicyInput) {
  const before = await getPolicyRecord(orgId, key)
  const policy = await prisma.governancePolicy.upsert({
    where: { orgId_key: { orgId, key } },
    create: { orgId, key, enabled: input.enabled, config: asJson(input.config), updatedById: actorUserId },
    update: { enabled: input.enabled, config: asJson(input.config), updatedById: actorUserId },
  })
  await writeAuditLog({ orgId, actorUserId, action: 'revenue_intelligence.governance.policy.update', entityType: 'GovernancePolicy', entityId: policy.id, before, after: policy })
  return policy
}

export async function governanceOverview(orgId: string) {
  const [policies, auditEvents, pendingMemoryProposals, activeExperiments, pendingActions, recentAuditEvents] = await Promise.all([
    listGovernancePolicies(orgId),
    prisma.auditLog.count({ where: { orgId } }),
    prisma.operationalMemoryProposal.count({ where: { orgId, status: 'proposed' } }),
    prisma.revenueExperiment.count({ where: { orgId, status: 'running' } }),
    prisma.nextBestAction.count({ where: { orgId, status: 'proposed' } }),
    prisma.auditLog.findMany({
      where: { orgId },
      select: { id: true, action: true, entityType: true, entityId: true, actorType: true, createdAt: true, actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ])
  return {
    policies,
    counts: { auditEvents, pendingMemoryProposals, activeExperiments, pendingActions },
    recentAuditEvents,
  }
}
