import { randomUUID } from 'node:crypto'
import { ActionItemPriority as PrismaActionItemPriority, ActionItemStatus as PrismaActionItemStatus, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export const ACTION_ITEM_STATUSES = ['new', 'accepted', 'in_progress', 'completed', 'dismissed', 'blocked'] as const
export const ACTION_ITEM_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
// Compatibility aliases accepted at the HTTP boundary. The service keeps only
// the canonical names in its internal state and response contract.
export const ACTION_ITEM_STATUS_INPUTS = [
  ...ACTION_ITEM_STATUSES,
  'postponed',
  'discarded',
] as const

export type ActionItemStatus = typeof ACTION_ITEM_STATUSES[number]
export type ActionItemStatusInput = typeof ACTION_ITEM_STATUS_INPUTS[number]
export type ActionItemPriority = typeof ACTION_ITEM_PRIORITIES[number]
export type ActionImpactMetric = 'leads' | 'meetings' | 'revenue' | 'cost' | 'risk' | 'operations'

export type ActionCenterWarning = {
  source: 'next_best_actions' | 'leads' | 'pipeline' | 'campaigns' | 'organic' | 'automations' | 'meetings' | 'persistence'
  code: 'source_unavailable' | 'persistence_unavailable'
  message: string
}

export interface ActionItem {
  id: string
  kind: string
  title: string
  evidence: string
  priority: ActionItemPriority
  impact: {
    metric: ActionImpactMetric
    value?: number
    label: string
  }
  owner: {
    type: 'user' | 'team' | 'system'
    id?: string
    label: string
  }
  status: ActionItemStatus
  cta: {
    label: string
    method: 'navigate' | 'review'
  }
  target: {
    type: string
    id?: string
    path: string
  }
  dueAt?: string
  result?: unknown
}

export interface ActionItemFilters {
  status?: ActionItemStatus
  priority?: ActionItemPriority
  limit?: number
}

export class ActionItemNotFoundError extends Error {
  constructor() {
    super('Acción no encontrada')
    this.name = 'ActionItemNotFoundError'
  }
}

export class ActionCenterUnavailableError extends Error {
  constructor() {
    super('El centro de acción no puede verificar la acción con los datos disponibles')
    this.name = 'ActionCenterUnavailableError'
  }
}

export class ActionCenterPersistenceError extends Error {
  constructor() {
    super('No se pudo persistir el centro de acción')
    this.name = 'ActionCenterPersistenceError'
  }
}

export class ActionItemIdempotencyError extends Error {
  constructor() {
    super('La clave de idempotencia ya fue utilizada para otra acción')
    this.name = 'ActionItemIdempotencyError'
  }
}

export class ActionItemConcurrentUpdateError extends Error {
  constructor() {
    super('La acción cambió mientras se actualizaba; vuelve a intentarlo')
    this.name = 'ActionItemConcurrentUpdateError'
  }
}

export class ActionItemStatusError extends Error {
  constructor(
    public readonly current: ActionItemStatus,
    public readonly next: ActionItemStatus,
  ) {
    super(`Transición de estado no permitida: ${current} → ${next}`)
    this.name = 'ActionItemStatusError'
  }
}

export function normalizeActionItemStatus(status: ActionItemStatusInput): ActionItemStatus {
  if (status === 'postponed') return 'blocked'
  if (status === 'discarded') return 'dismissed'
  return status
}

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<ActionItemStatus, readonly ActionItemStatus[]>> = {
  new: ['new', 'accepted', 'in_progress', 'completed', 'dismissed', 'blocked'],
  accepted: ['accepted', 'in_progress', 'completed', 'dismissed', 'blocked'],
  in_progress: ['in_progress', 'completed', 'dismissed', 'blocked'],
  completed: ['completed'],
  dismissed: ['dismissed', 'new', 'accepted', 'in_progress'],
  blocked: ['blocked', 'new', 'accepted', 'in_progress', 'completed', 'dismissed'],
}

function assertOrgId(orgId: string): void {
  if (typeof orgId !== 'string' || orgId.trim().length === 0 || orgId.length > 128) {
    throw new Error('orgId no válido')
  }
}

function statusFromNextBestAction(status: string): ActionItemStatus {
  if (status === 'accepted') return 'accepted'
  if (status === 'executed') return 'completed'
  if (status === 'dismissed') return 'dismissed'
  if (status === 'expired') return 'blocked'
  return 'new'
}

function priorityFromScore(score: number): ActionItemPriority {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0
  if (safeScore >= 0.9) return 'urgent'
  if (safeScore >= 0.75) return 'high'
  if (safeScore >= 0.5) return 'medium'
  return 'low'
}

function priorityFromCount(count: number): ActionItemPriority {
  if (count >= 10) return 'urgent'
  if (count >= 5) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

function item(
  value: Omit<ActionItem, 'status'> & { status?: ActionItemStatus },
): ActionItem {
  return { ...value, status: value.status ?? 'new' }
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

async function safely<T>(
  source: ActionCenterWarning['source'],
  query: Promise<T>,
  fallback: T,
  warnings: ActionCenterWarning[],
  failedSources: Set<ActionCenterWarning['source']>,
): Promise<T> {
  try {
    return await query
  } catch {
    // Keep the dashboard usable, but make partial data explicit to callers.
    failedSources.add(source)
    warnings.push({
      source,
      code: 'source_unavailable',
      message: 'No se pudo consultar esta fuente; los resultados pueden estar incompletos.',
    })
    return fallback
  }
}

type NextBestActionRow = {
  id: string
  type: string
  reason: string
  message: string | null
  score: number
  status: string
  leadId: string | null
  conversationId: string
  lead: { name: string } | null
}

type DerivedItems = {
  items: ActionItem[]
  warnings: ActionCenterWarning[]
  failedSources: Set<ActionCenterWarning['source']>
}

async function derivedItems(orgId: string): Promise<DerivedItems> {
  assertOrgId(orgId)
  const now = new Date()
  const staleSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const warnings: ActionCenterWarning[] = []
  const failedSources = new Set<ActionCenterWarning['source']>()

  const [nextBestActions, newLeadCount, stalledOpportunityCount, inactiveCampaignCount, overdueOrganicCount, failedAutomationCount, overdueMeetingCount] = await Promise.all([
    safely('next_best_actions', prisma.nextBestAction.findMany({
      where: { orgId, status: { in: ['proposed', 'accepted'] } },
      select: {
        id: true,
        type: true,
        reason: true,
        message: true,
        score: true,
        status: true,
        leadId: true,
        conversationId: true,
        lead: { select: { name: true } },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }), [] as NextBestActionRow[], warnings, failedSources),
    safely('leads', prisma.lead.count({ where: { orgId, status: 'new', attempts: 0 } }), 0, warnings, failedSources),
    safely('pipeline', prisma.opportunity.count({
      where: {
        orgId,
        stage: { in: ['lead', 'qualified', 'proposal', 'negotiation'] },
        updatedAt: { lt: staleSince },
      },
    }), 0, warnings, failedSources),
    safely('campaigns', prisma.campaign.count({ where: { orgId, status: 'active', totalLeads: 0 } }), 0, warnings, failedSources),
    safely('organic', prisma.organicAction.count({ where: { orgId, status: 'pending', dueAt: { lt: now } } }), 0, warnings, failedSources),
    safely('automations', prisma.automationRun.count({ where: { orgId, status: 'failed', updatedAt: { gte: staleSince } } }), 0, warnings, failedSources),
    safely('meetings', prisma.meeting.count({ where: { orgId, status: 'scheduled', scheduledAt: { lt: now } } }), 0, warnings, failedSources),
  ])

  const items: ActionItem[] = []

  if (newLeadCount > 0) {
    items.push(item({
      id: `action:${orgId}:lead_without_contact`,
      kind: 'lead_without_contact',
      title: `Tienes ${plural(newLeadCount, 'lead nuevo', 'leads nuevos')} sin contactar.`,
      evidence: `${newLeadCount} leads están en estado nuevo, con cero intentos de contacto y datos de la organización ${orgId} filtrados por el JWT.`,
      priority: priorityFromCount(newLeadCount),
      impact: { metric: 'leads', value: newLeadCount, label: 'Leads pendientes de primer contacto' },
      owner: { type: 'team', label: 'Equipo comercial' },
      cta: { label: 'Abrir cola priorizada', method: 'navigate' },
      target: { type: 'leads', path: '/leads' },
    }))
  }

  if (stalledOpportunityCount > 0) {
    items.push(item({
      id: `action:${orgId}:stalled_opportunity`,
      kind: 'stalled_opportunity',
      title: `Hay ${plural(stalledOpportunityCount, 'oportunidad estancada', 'oportunidades estancadas')}.`,
      evidence: `${stalledOpportunityCount} oportunidades abiertas no se actualizan desde hace al menos 7 días.`,
      priority: priorityFromCount(stalledOpportunityCount),
      impact: { metric: 'revenue', value: stalledOpportunityCount, label: 'Oportunidades sin avance comercial' },
      owner: { type: 'team', label: 'Responsable de ventas' },
      cta: { label: 'Revisar pipeline', method: 'navigate' },
      target: { type: 'pipeline', path: '/pipeline' },
    }))
  }

  if (inactiveCampaignCount > 0) {
    items.push(item({
      id: `action:${orgId}:campaign_efficiency`,
      kind: 'campaign_efficiency',
      title: `Hay ${plural(inactiveCampaignCount, 'campaña activa', 'campañas activas')} sin leads todavía.`,
      evidence: `${inactiveCampaignCount} campañas activas tienen totalLeads igual a cero; conviene revisar tracking, presupuesto y landing antes de optimizar.`,
      priority: priorityFromCount(inactiveCampaignCount),
      impact: { metric: 'cost', value: inactiveCampaignCount, label: 'Campañas activas sin conversión registrada' },
      owner: { type: 'team', label: 'Marketing / Growth' },
      cta: { label: 'Revisar campañas', method: 'navigate' },
      target: { type: 'campaigns', path: '/captacion/planificar' },
    }))
  }

  if (overdueOrganicCount > 0) {
    items.push(item({
      id: `action:${orgId}:organic_opportunity`,
      kind: 'organic_opportunity',
      title: `Hay ${plural(overdueOrganicCount, 'acción orgánica vencida', 'acciones orgánicas vencidas')}.`,
      evidence: `${overdueOrganicCount} acciones orgánicas pendientes tienen una fecha de vencimiento anterior a ahora.`,
      priority: priorityFromCount(overdueOrganicCount),
      impact: { metric: 'leads', value: overdueOrganicCount, label: 'Oportunidades orgánicas pendientes' },
      owner: { type: 'team', label: 'Marketing / Growth' },
      cta: { label: 'Revisar Orgánico y social', method: 'navigate' },
      target: { type: 'organic', path: '/captacion/atraer/organico?tab=acciones' },
    }))
  }

  if (failedAutomationCount > 0) {
    items.push(item({
      id: `action:${orgId}:automation_error`,
      kind: 'automation_error',
      title: `Hay ${plural(failedAutomationCount, 'ejecución de automatización con error', 'ejecuciones de automatización con error')}.`,
      evidence: `${failedAutomationCount} AutomationRun tienen status failed y requieren diagnóstico antes de volver a activar el flujo.`,
      priority: priorityFromCount(failedAutomationCount),
      impact: { metric: 'operations', value: failedAutomationCount, label: 'Ejecuciones automáticas fallidas' },
      owner: { type: 'team', label: 'Revenue Operations' },
      cta: { label: 'Diagnosticar automatizaciones', method: 'navigate' },
      target: { type: 'automations', path: '/automatizaciones' },
    }))
  }

  if (overdueMeetingCount > 0) {
    items.push(item({
      id: `action:${orgId}:meeting_follow_up`,
      kind: 'meeting_follow_up',
      title: `Hay ${plural(overdueMeetingCount, 'reunión pendiente de revisar', 'reuniones pendientes de revisar')}.`,
      evidence: `${overdueMeetingCount} reuniones siguen programadas aunque su fecha ya ha pasado.`,
      priority: priorityFromCount(overdueMeetingCount),
      impact: { metric: 'meetings', value: overdueMeetingCount, label: 'Reuniones que necesitan resultado o reprogramación' },
      owner: { type: 'team', label: 'Equipo comercial' },
      cta: { label: 'Revisar reuniones', method: 'navigate' },
      target: { type: 'meetings', path: '/reuniones' },
    }))
  }

  for (const action of nextBestActions) {
    const title = action.reason.trim() || `Siguiente acción para ${action.lead?.name ?? 'un lead'}`
    items.push(item({
      id: `action:${orgId}:next-best:${action.id}`,
      kind: action.type === 'call' || action.type === 'email' || action.type === 'reply' ? 'lead_follow_up' : 'next_best_action',
      title,
      evidence: [action.reason, action.message].filter(Boolean).join(' '),
      priority: priorityFromScore(action.score),
      impact: { metric: 'leads', label: action.lead?.name ? `Seguimiento recomendado para ${action.lead.name}` : 'Seguimiento recomendado' },
      owner: { type: 'team', label: 'Equipo comercial' },
      status: statusFromNextBestAction(action.status),
      cta: { label: action.type === 'call' ? 'Abrir llamada' : 'Revisar recomendación', method: 'review' },
      target: action.leadId
        ? { type: 'lead', id: action.leadId, path: `/leads/${action.leadId}` }
        : { type: 'conversation', id: action.conversationId, path: `/conversacion/inbox` },
    }))
  }

  return {
    items: items.map(value => ({
      ...value,
      // The materialized ActionItem row is the source of truth for status.
      // The derived status is only used when the signal is first persisted.
      status: value.status,
    })),
    warnings,
    failedSources,
  }
}

const PRIORITY_RANK: Record<ActionItemPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

type ActionItemRow = Prisma.ActionItemGetPayload<{}>

function toImpactMetric(value: string | null): ActionImpactMetric {
  if (value === 'leads' || value === 'meetings' || value === 'revenue' || value === 'cost' || value === 'risk' || value === 'operations') {
    return value
  }
  return 'operations'
}

function toActionItem(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    evidence: row.evidence,
    priority: row.priority as ActionItemPriority,
    impact: {
      metric: toImpactMetric(row.impactMetric),
      value: row.impactValue ?? undefined,
      label: row.impactLabel ?? '',
    },
    owner: {
      type: row.ownerType === 'user' || row.ownerType === 'system' ? row.ownerType : 'team',
      id: row.ownerId ?? undefined,
      label: row.ownerLabel,
    },
    status: row.status as ActionItemStatus,
    cta: {
      label: row.ctaLabel,
      method: row.ctaMethod === 'review' ? 'review' : 'navigate',
    },
    target: {
      type: row.targetType,
      id: row.targetId ?? undefined,
      path: row.targetPath,
    },
    dueAt: row.dueAt?.toISOString(),
    result: row.result ?? undefined,
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : value as Prisma.InputJsonValue
}

function actionItemWriteData(orgId: string, source: ActionItem) {
  return {
    orgId,
    dedupeKey: source.id,
    kind: source.kind,
    title: source.title,
    evidence: source.evidence,
    priority: source.priority as PrismaActionItemPriority,
    impactMetric: source.impact.metric,
    impactValue: source.impact.value ?? null,
    impactLabel: source.impact.label,
    ownerType: source.owner.type,
    ownerId: source.owner.id ?? null,
    ownerLabel: source.owner.label,
    status: source.status as PrismaActionItemStatus,
    ctaLabel: source.cta.label,
    ctaMethod: source.cta.method,
    targetType: source.target.type,
    targetId: source.target.id ?? null,
    targetPath: source.target.path,
    dueAt: source.dueAt ? new Date(source.dueAt) : null,
    result: jsonInput(source.result),
  }
}

const MAX_MATERIALIZED_ACTIONS = 150

async function materializeActionItems(orgId: string, sources: ActionItem[]): Promise<ActionItemRow[]> {
  if (sources.length === 0) return []

  try {
    return await prisma.$transaction(async tx => {
      const rows: ActionItemRow[] = []
      const boundedSources = sources.slice(0, MAX_MATERIALIZED_ACTIONS)

      for (const source of boundedSources) {
        const data = actionItemWriteData(orgId, source)
        const row = await tx.actionItem.upsert({
          where: { orgId_dedupeKey: { orgId, dedupeKey: source.id } },
          create: data,
          // Content and routing may change as source systems evolve, but the
          // status is user-owned and must never be reset by a GET refresh.
          update: {
            kind: data.kind,
            title: data.title,
            evidence: data.evidence,
            priority: data.priority,
            impactMetric: data.impactMetric,
            impactValue: data.impactValue,
            impactLabel: data.impactLabel,
            ownerType: data.ownerType,
            ownerId: data.ownerId,
            ownerLabel: data.ownerLabel,
            ctaLabel: data.ctaLabel,
            ctaMethod: data.ctaMethod,
            targetType: data.targetType,
            targetId: data.targetId,
            targetPath: data.targetPath,
            dueAt: data.dueAt,
          },
        })
        rows.push(row)
      }

      // A deterministic creation record makes materialization safe to repeat
      // and gives every row a complete audit trail without duplicate history.
      await tx.actionItemHistory.createMany({
        data: rows.map(row => ({
          orgId,
          actionItemId: row.id,
          fromStatus: null,
          toStatus: row.status,
          actorType: 'system',
          idempotencyKey: `materialized:${orgId}:${row.dedupeKey}`,
          reason: 'materialized_from_action_signal',
        })),
        skipDuplicates: true,
      })

      return rows
    }, {
      // ponytail: subir el timeout, no reescribir el bucle. Son hasta 150 upserts
      // secuenciales y con Postgres remoto (Neon) cada ida y vuelta cuesta ~50-100 ms,
      // asi que el limite por defecto de 5 s se agotaba siempre y el Centro de Accion
      // respondia 503. Techo conocido: si algun dia se pasa de 150 items o la latencia
      // sube, toca agrupar en createMany + updateMany en vez de subir mas este numero.
      timeout: 30_000,
      maxWait: 10_000,
    })
  } catch (error) {
    if (error instanceof ActionCenterPersistenceError) throw error
    throw new ActionCenterPersistenceError()
  }
}

/**
 * Ensure/backfill boundary for the derived centre. It is intentionally safe
 * to call from every read: the composite orgId+dedupeKey upsert makes it an
 * idempotent backfill for existing tenants and never deletes historical rows.
 */
export async function ensureActionItems(orgId: string) {
  const derived = await derivedItems(orgId)
  const warnings = derived.warnings
  let items: ActionItem[]
  try {
    items = (await materializeActionItems(orgId, derived.items)).map(toActionItem)
  } catch (error) {
    if (!(error instanceof ActionCenterPersistenceError)) throw error
    // Leer el centro de acción nunca puede depender de poder escribir su
    // caché: las señales ya están calculadas en memoria, así que se devuelven
    // marcadas como degradadas en lugar de tumbar el dashboard entero.
    // Ojo: sin fila persistida, el `id` es el dedupeKey derivado y los
    // estados guardados por el usuario no se reflejan hasta que la escritura
    // vuelva a funcionar.
    items = derived.items
    warnings.push({
      source: 'persistence',
      code: 'persistence_unavailable',
      message: 'No se pudo guardar el estado del centro de acción; se muestran las señales calculadas ahora mismo.',
    })
  }
  return {
    items,
    degraded: warnings.length > 0,
    warnings,
  }
}

export async function listActionItems(orgId: string, filters: ActionItemFilters = {}) {
  const ensured = await ensureActionItems(orgId)
  const matchingItems = ensured.items
    .filter(action => !filters.status || action.status === filters.status)
    .filter(action => !filters.priority || action.priority === filters.priority)
    .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || left.id.localeCompare(right.id))

  const requestedLimit = Number.isInteger(filters.limit) ? filters.limit as number : 100
  const limit = Math.max(1, Math.min(100, requestedLimit))
  return {
    items: matchingItems.slice(0, limit),
    total: matchingItems.length,
    degraded: ensured.degraded,
    warnings: ensured.warnings,
  }
}

export type ActionItemStatusUpdate = {
  actorUserId?: string
  idempotencyKey?: string
  reason?: string
  result?: unknown
}

function assertIdempotencyKey(key: string | undefined): string {
  const normalized = key?.trim()
  if (normalized && normalized.length <= 200) return normalized
  return randomUUID()
}

async function findPersistedActionItem(
  client: Prisma.TransactionClient,
  orgId: string,
  actionId: string,
): Promise<ActionItemRow | null> {
  return client.actionItem.findFirst({
    where: {
      orgId,
      OR: [{ id: actionId }, { dedupeKey: actionId }],
    },
  })
}

export async function updateActionItemStatus(
  orgId: string,
  actionId: string,
  status: ActionItemStatus,
  input: ActionItemStatusUpdate = {},
): Promise<ActionItem> {
  assertOrgId(orgId)
  if (typeof actionId !== 'string' || actionId.trim().length === 0 || actionId.length > 240) {
    throw new ActionItemNotFoundError()
  }

  const providedIdempotencyKey = input.idempotencyKey?.trim()
  const idempotencyKey = assertIdempotencyKey(providedIdempotencyKey)
  const now = new Date()

  try {
    return await prisma.$transaction(async tx => {
      const current = await findPersistedActionItem(tx, orgId, actionId)
      if (!current) throw new ActionItemNotFoundError()

      const replay = await tx.actionItemHistory.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
        include: { actionItem: true },
      })
      if (replay) {
        if (replay.actionItemId !== current.id) throw new ActionItemIdempotencyError()
        return toActionItem(replay.actionItem)
      }

      const currentStatus = current.status as ActionItemStatus
      if (!ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(status)) {
        throw new ActionItemStatusError(currentStatus, status)
      }

      const result = jsonInput(input.result)
      if (currentStatus === status) {
        if (providedIdempotencyKey || input.result !== undefined || input.reason) {
          const updated = await tx.actionItem.update({
            where: { id: current.id },
            data: {
              result,
              resultLabel: input.reason ?? undefined,
              lastResultAt: input.result !== undefined ? now : undefined,
            },
          })
          await tx.actionItemHistory.create({
            data: {
              orgId,
              actionItemId: current.id,
              fromStatus: current.status,
              toStatus: current.status,
              actorUserId: input.actorUserId ?? null,
              actorType: input.actorUserId ? 'user' : 'system',
              idempotencyKey,
              reason: input.reason ?? 'idempotent_status_check',
              result,
            },
          })
          return toActionItem(updated)
        }
        return toActionItem(current)
      }

      const changed = await tx.actionItem.updateMany({
        where: { id: current.id, orgId, status: current.status },
        data: {
          status: status as PrismaActionItemStatus,
          result,
          resultLabel: input.reason ?? undefined,
          lastResultAt: now,
          completedAt: status === 'completed' ? now : null,
          dismissedAt: status === 'dismissed' ? now : null,
        },
      })
      if (changed.count !== 1) throw new ActionItemConcurrentUpdateError()

      const updated = await tx.actionItem.findUnique({ where: { id: current.id } })
      if (!updated) throw new ActionItemNotFoundError()
      await tx.actionItemHistory.create({
        data: {
          orgId,
          actionItemId: current.id,
          fromStatus: current.status,
          toStatus: status as PrismaActionItemStatus,
          actorUserId: input.actorUserId ?? null,
          actorType: input.actorUserId ? 'user' : 'system',
          idempotencyKey,
          reason: input.reason ?? null,
          result,
        },
      })
      return toActionItem(updated)
    })
  } catch (error) {
    // Two concurrent retries may race at the unique idempotency fence. The
    // winner's persisted result is safe to replay; any other unique failure is
    // surfaced as an unavailable persistence layer.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const replay = await prisma.actionItemHistory.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
        include: { actionItem: true },
      })
      if (replay) {
        const requestedAction = await prisma.actionItem.findFirst({
          where: { orgId, OR: [{ id: actionId }, { dedupeKey: actionId }] },
          select: { id: true },
        })
        if (!requestedAction || replay.actionItemId !== requestedAction.id) throw new ActionItemIdempotencyError()
        return toActionItem(replay.actionItem)
      }
    }
    if (
      error instanceof ActionItemNotFoundError ||
      error instanceof ActionItemStatusError ||
      error instanceof ActionItemIdempotencyError ||
      error instanceof ActionItemConcurrentUpdateError
    ) throw error
    throw new ActionCenterPersistenceError()
  }
}
