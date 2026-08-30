import { prisma } from '../lib/prisma'
import { OpportunityStage } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'
import { createTask, listTasks } from './tasks.service'
import { scopedOwnerId, type DataActor } from '../lib/dataScope'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { emitOutcome } from './outcomes.service'

function opportunityOwner(actor: DataActor, permission: 'pipeline.read' | 'pipeline.write' | 'pipeline.reopen') {
  return scopedOwnerId(actor, permission)
}

/** Errores de dominio para que el controller pueda mapear a códigos HTTP. */
export class OwnershipError extends Error {
  constructor(public field: string) {
    super(`${field} no pertenece a la organización`)
    this.name = 'OwnershipError'
  }
}

/** 404 (P0-02): la fila no existe o no pertenece a la organización. */
export class OpportunityNotFoundError extends Error {
  constructor() {
    super('Opportunity not found')
    this.name = 'OpportunityNotFoundError'
  }
}

/** 400: violación de una regla de negocio (p.ej. cerrar perdida sin motivo). */
export class PipelineValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineValidationError'
  }
}

/** 400: la acción no es válida para el estado actual (OP-104, p.ej. mark-won sobre una ya cerrada). */
export class PipelineStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineStateError'
  }
}

/** 404 (OP-108): el contacto (OpportunityContact) no existe para esa oportunidad/lead. */
export class OpportunityContactNotFoundError extends Error {
  constructor() {
    super('Opportunity contact not found')
    this.name = 'OpportunityContactNotFoundError'
  }
}

/** 404 (OP-109): la línea de producto no existe para esa oportunidad. */
export class LineItemNotFoundError extends Error {
  constructor() {
    super('Line item not found')
    this.name = 'LineItemNotFoundError'
  }
}

/** 404 (OP-109): el producto no existe o no pertenece a la organización. */
export class ProductNotFoundError extends Error {
  constructor() {
    super('Product not found')
    this.name = 'ProductNotFoundError'
  }
}

const CLOSED_STAGES: OpportunityStage[] = ['closed_won', 'closed_lost']

/**
 * OP-105: etapas "activas" del pipeline en las que toda oportunidad debe
 * tener un siguiente paso (Task) abierto. closed_won/closed_lost quedan
 * fuera: esos cierres se gestionan por markWon/markLost y no requieren un
 * seguimiento futuro.
 */
const ACTIVE_FOLLOWUP_STAGES: OpportunityStage[] = ['qualified', 'proposal', 'negotiation']

/**
 * OP-105: garantiza que ninguna oportunidad quede sin seguimiento al entrar
 * en una etapa activa. Decisión de diseño: en vez de BLOQUEAR moveStage()
 * cuando no existe ya una tarea abierta (lo que rompería flujos existentes
 * sin previo aviso), se CREA automáticamente una Task de seguimiento por
 * defecto. Así se cumple "ninguna oportunidad sin siguiente paso" sin
 * fricción para el usuario.
 */
async function ensureFollowUpTask(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  opportunity: { id: string; name: string; leadId: string; assignedTo: string | null },
  toStage: OpportunityStage
) {
  if (!ACTIVE_FOLLOWUP_STAGES.includes(toStage)) return

  const [open, inProgress] = await Promise.all([
    listTasks(orgId, { userId: actorUserId, role: actorRole }, { opportunityId: opportunity.id, status: 'open', limit: 1 }),
    listTasks(orgId, { userId: actorUserId, role: actorRole }, { opportunityId: opportunity.id, status: 'in_progress', limit: 1 }),
  ])
  if (open.total > 0 || inProgress.total > 0) return

  await createTask(orgId, { userId: actorUserId, role: actorRole }, {
    type: 'follow_up',
    title: `Siguiente paso: ${opportunity.name}`,
    opportunityId: opportunity.id,
    leadId: opportunity.leadId,
    ownerId: opportunity.assignedTo ?? actorUserId ?? undefined,
    priority: 'normal',
    dueAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    source: 'automation',
    sourceId: `opportunity-stage-task:${opportunity.id}:${toStage}`,
  })
}

/**
 * Valida que las referencias recibidas del cliente (lead, usuario asignado)
 * pertenezcan a la organización antes de dejarlas tocar la base (P0-01/VE-01).
 */
async function assertOwnedReferences(orgId: string, refs: {
  leadId?: string
  assignedTo?: string
}) {
  const checks: Promise<void>[] = []

  if (refs.leadId !== undefined) {
    checks.push(
      prisma.lead.findFirst({ where: { id: refs.leadId, orgId }, select: { id: true } }).then((lead) => {
        if (!lead) throw new OwnershipError('leadId')
      })
    )
  }
  if (refs.assignedTo) {
    checks.push(
      prisma.user.findFirst({ where: { id: refs.assignedTo, orgId }, select: { id: true } }).then((user) => {
        if (!user) throw new OwnershipError('assignedTo')
      })
    )
  }

  await Promise.all(checks)
}

export async function getOpportunity(orgId: string, actor: DataActor, id: string) {
  return prisma.opportunity.findFirst({
    where: { id, orgId, assignedTo: opportunityOwner(actor, 'pipeline.read') },
    include: { lead: true },
  })
}

export async function listByStage(orgId: string, actor: DataActor) {
  const opportunities = await prisma.opportunity.findMany({
    where: { orgId, assignedTo: opportunityOwner(actor, 'pipeline.read') },
    include: { lead: true, assignee: true },
    orderBy: { createdAt: 'desc' },
  })

  const stages: OpportunityStage[] = [
    'lead',
    'qualified',
    'proposal',
    'negotiation',
    'closed_won',
    'closed_lost',
  ]

  const grouped: Record<string, typeof opportunities> = {}
  for (const stage of stages) {
    grouped[stage] = []
  }
  for (const opp of opportunities) {
    grouped[opp.stage].push(opp)
  }

  return grouped
}

/** OP-103: campos permitidos para ordenar server-side; 'campo:direccion'. */
const SORTABLE_OPPORTUNITY_FIELDS = new Set(['createdAt', 'updatedAt', 'expectedCloseDate', 'value', 'name'])

interface OpportunityListFilters {
  search?: string
  stage?: OpportunityStage
  /** Propietario de la oportunidad (Opportunity.assignedTo). */
  ownerId?: string
  /** Rango sobre expectedCloseDate. */
  closeFrom?: string
  closeTo?: string
  /** Origen del lead asociado (Lead.source). */
  source?: string
  sort?: string
  page?: number
  limit?: number
}

/**
 * OP-103: construye el `where`/`orderBy` de Prisma para la vista de lista,
 * siguiendo el mismo patrón que buildLeadQuery (LE-101) / listMeetings
 * (RE-103): filtros server-side + paginado.
 */
function buildOpportunityQuery(orgId: string, actor: DataActor, filters: Omit<OpportunityListFilters, 'page' | 'limit'>) {
  const { search, stage, ownerId, closeFrom, closeTo, source, sort } = filters

  const where: Record<string, unknown> = { orgId }
  const forcedOwnerId = opportunityOwner(actor, 'pipeline.read')
  if (stage) where.stage = stage
  if (forcedOwnerId !== undefined) where.assignedTo = forcedOwnerId
  else if (ownerId) where.assignedTo = ownerId
  if (source) where.lead = { source }
  if (closeFrom || closeTo) {
    where.expectedCloseDate = {
      ...(closeFrom ? { gte: new Date(closeFrom) } : {}),
      ...(closeTo ? { lte: new Date(closeTo) } : {}),
    }
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { lead: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' }
  if (sort) {
    const [field, direction] = sort.split(':')
    if (SORTABLE_OPPORTUNITY_FIELDS.has(field) && (direction === 'asc' || direction === 'desc')) {
      orderBy = { [field]: direction }
    }
  }

  return { where, orderBy }
}

/** OP-103: vista de lista (alternativa al kanban de listByStage) con búsqueda/filtros/paginado. */
export async function listOpportunities(orgId: string, actor: DataActor, filters: OpportunityListFilters = {}) {
  const { page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit
  const { where, orderBy } = buildOpportunityQuery(orgId, actor, filters)

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        lead: { select: { id: true, name: true, company: true } },
        assignee: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.opportunity.count({ where }),
  ])

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function createOpportunity(orgId: string, actorUserId: string, actorRole: string, data: {
  leadId: string
  assignedTo?: string
  name: string
  stage?: OpportunityStage
  value?: number
  currency?: string
  probability?: number
  expectedCloseDate?: string
  notes?: string
}) {
  const forcedOwnerId = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const assignedTo = forcedOwnerId ?? data.assignedTo
  await assertOwnedReferences(orgId, { leadId: data.leadId, assignedTo })
  if (forcedOwnerId) {
    const ownedLead = await prisma.lead.findFirst({ where: { id: data.leadId, orgId, ownerId: forcedOwnerId }, select: { id: true } })
    if (!ownedLead) throw new OwnershipError('leadId')
  }

  const initialStage = data.stage ?? 'lead'

  const opportunity = await prisma.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        orgId,
        leadId: data.leadId,
        assignedTo,
        name: data.name,
        stage: initialStage,
        value: data.value,
        currency: data.currency ?? 'EUR',
        probability: data.probability ?? 0,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
        notes: data.notes,
      },
    })

    await tx.opportunityStageHistory.create({
      data: {
        orgId,
        opportunityId: created.id,
        fromStage: null,
        toStage: created.stage,
        toProbability: created.probability,
        actorUserId,
        source: 'manual',
        enteredAt: created.createdAt,
      },
    })

    // AU-107: evento de dominio 'opportunity.created' — el dispatcher
    // (jobs/outboxDispatcher.ts) lo consume genéricamente vía
    // runAutomationsForEvent, sin eventId propio: se deduplica con el id
    // de la propia fila de OutboxEvent (fallback en el dispatcher).
    await tx.outboxEvent.create({
      data: {
        orgId,
        topic: 'opportunity.created',
        aggregateType: 'Opportunity',
        aggregateId: created.id,
        payload: { opportunityId: created.id, leadId: created.leadId, stage: created.stage },
      },
    })

    return created
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.create',
    entityType: 'Opportunity',
    entityId: opportunity.id,
    after: opportunity,
  })

  await logSalesActivity({
    orgId,
    type: 'opportunity_created',
    opportunityId: opportunity.id,
    leadId: data.leadId,
    actorUserId,
    metadata: { stage: opportunity.stage },
  })

  return opportunity
}

/**
 * OP-101/OP-02: mueve una oportunidad de etapa dejando rastro en
 * OpportunityStageHistory (cierra la fila vigente y abre una nueva).
 * Cerrar como 'closed_lost' exige `reason` (OP-07, alcance mínimo aquí).
 */
export async function moveStage(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  id: string,
  toStage: OpportunityStage,
  reason?: string,
  probability?: number
) {
  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const opportunity = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!opportunity) throw new OpportunityNotFoundError()

  if (toStage === opportunity.stage) return opportunity

  if (toStage === 'closed_lost' && !reason) {
    throw new PipelineValidationError('Se requiere un motivo (reason) para marcar la oportunidad como perdida')
  }

  const fromStage = opportunity.stage
  const fromProbability = opportunity.probability
  const toProbability = probability ?? opportunity.probability

  const updated = await prisma.$transaction(async (tx) => {
    await tx.opportunityStageHistory.updateMany({
      where: { opportunityId: id, leftAt: null },
      data: { leftAt: new Date() },
    })

    await tx.opportunityStageHistory.create({
      data: {
        orgId,
        opportunityId: id,
        fromStage,
        toStage,
        fromProbability,
        toProbability,
        actorUserId,
        source: 'manual',
        reason,
      },
    })

    const result = await tx.opportunity.update({
      where: { id },
      data: {
        stage: toStage,
        stageEnteredAt: new Date(),
        probability: toProbability,
        lossReason: toStage === 'closed_lost' ? reason : opportunity.lossReason,
      },
    })

    // AU-107: eventos de dominio de Oportunidad. Sin eventId propio en el
    // payload: el dispatcher usa el id de la fila de OutboxEvent como
    // dedupe key (ver jobs/outboxDispatcher.ts), lo que es correcto aquí
    // porque una misma oportunidad puede cambiar de etapa (o ganar/perder)
    // más de una vez a lo largo de su vida (p.ej. tras reopen()).
    await tx.outboxEvent.create({
      data: {
        orgId,
        topic: 'opportunity.stage.changed',
        aggregateType: 'Opportunity',
        aggregateId: id,
        payload: { opportunityId: id, leadId: opportunity.leadId, fromStage, toStage },
      },
    })

    if (toStage === 'closed_won') {
      await tx.outboxEvent.create({
        data: {
          orgId,
          topic: 'opportunity.won',
          aggregateType: 'Opportunity',
          aggregateId: id,
          // El valor viaja en el evento para que la señal de venta que se
          // devuelve a Meta lleve importe sin tener que releer la fila.
          payload: {
            opportunityId: id,
            leadId: opportunity.leadId,
            fromStage,
            valueCents: opportunity.value != null ? Math.round(Number(opportunity.value) * 100) : null,
            currency: opportunity.currency ?? 'EUR',
          },
        },
      })
    }

    if (toStage === 'closed_lost') {
      await tx.outboxEvent.create({
        data: {
          orgId,
          topic: 'opportunity.lost',
          aggregateType: 'Opportunity',
          aggregateId: id,
          payload: { opportunityId: id, leadId: opportunity.leadId, fromStage, reason: reason ?? null },
        },
      })
    }

    return result
  })

  // North star (09 §5): oportunidad ganada = resultado 'deal_won'. Nunca lanza.
  if (toStage === 'closed_won') {
    await emitOutcome({
      orgId,
      kind: 'deal_won',
      sourceRef: { opportunityId: id, leadId: opportunity.leadId },
      valueCents: opportunity.value != null ? Math.round(Number(opportunity.value) * 100) : null,
    })
  }

  await logSalesActivity({
    orgId,
    type: 'stage_change',
    opportunityId: id,
    leadId: opportunity.leadId,
    actorUserId,
    metadata: { from: fromStage, to: toStage },
  })

  // OP-105: siguiente paso obligatorio en etapas activas (ver ensureFollowUpTask).
  await ensureFollowUpTask(
    orgId,
    actorUserId,
    actorRole,
    { id: updated.id, name: updated.name, leadId: updated.leadId, assignedTo: updated.assignedTo },
    toStage
  )

  return updated
}

/**
 * OP-104: marca la oportunidad como ganada. Reutiliza moveStage() para dejar
 * el rastro en OpportunityStageHistory (probability=100) y luego fija
 * actualCloseDate (hoy si no se pasa) y, opcionalmente, el valor final.
 * No permite ganar una oportunidad ya cerrada (won o lost): hay que pasar
 * por reopen() primero para no pisar un cierre existente en silencio.
 */
export async function markWon(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  id: string,
  data: { actualCloseDate?: string; finalValue?: number }
) {
  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const opportunity = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!opportunity) throw new OpportunityNotFoundError()

  if (CLOSED_STAGES.includes(opportunity.stage)) {
    throw new PipelineStateError('La oportunidad ya está cerrada; reábrela antes de marcarla como ganada')
  }

  if (data.finalValue !== undefined && data.finalValue < 0) {
    throw new PipelineValidationError('finalValue debe ser mayor o igual a 0')
  }

  await moveStage(orgId, actorUserId, actorRole, id, 'closed_won', undefined, 100)

  const result = await prisma.opportunity.update({
    where: { id },
    data: {
      actualCloseDate: data.actualCloseDate ? new Date(data.actualCloseDate) : new Date(),
      ...(data.finalValue !== undefined ? { value: data.finalValue } : {}),
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.mark_won',
    entityType: 'Opportunity',
    entityId: id,
    before: opportunity,
    after: result,
  })

  await logSalesActivity({
    orgId,
    type: 'opportunity_won',
    opportunityId: id,
    leadId: opportunity.leadId,
    actorUserId,
    metadata: { finalValue: data.finalValue ?? null, actualCloseDate: result.actualCloseDate },
  })

  return result
}

/**
 * OP-104: marca la oportunidad como perdida. `reason` es obligatorio (lo
 * exige también moveStage() para 'closed_lost', que lo persiste en
 * `lossReason`); `lossNotes` no tiene columna propia en el schema, así que
 * se registra como SalesActivity (reutilizando el timeline, sin modelo
 * nuevo). No permite perder una oportunidad ya cerrada.
 */
export async function markLost(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  id: string,
  data: { reason: string; lossNotes?: string }
) {
  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const opportunity = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!opportunity) throw new OpportunityNotFoundError()

  if (CLOSED_STAGES.includes(opportunity.stage)) {
    throw new PipelineStateError('La oportunidad ya está cerrada; reábrela antes de marcarla como perdida')
  }

  await moveStage(orgId, actorUserId, actorRole, id, 'closed_lost', data.reason)

  const result = await prisma.opportunity.update({
    where: { id },
    data: { actualCloseDate: new Date() },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.mark_lost',
    entityType: 'Opportunity',
    entityId: id,
    before: opportunity,
    after: result,
  })

  await logSalesActivity({
    orgId,
    type: 'opportunity_lost',
    opportunityId: id,
    leadId: opportunity.leadId,
    actorUserId,
    body: data.lossNotes,
    metadata: { reason: data.reason },
  })

  return result
}

/**
 * OP-104: reabre una oportunidad cerrada (won o lost) devolviéndola a una
 * etapa activa del pipeline. A diferencia de un move-stage normal, esta
 * acción deshace un cierre que se consideraba definitivo (revierte una
 * venta ganada o descarta el motivo de pérdida registrado), por eso el
 * controlador/ruta la restringe a rol 'admin' — no es un cambio de etapa
 * cualquiera. Solo aplica si la oportunidad está actualmente cerrada.
 */
export async function reopen(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  id: string,
  data: { toStage?: OpportunityStage }
) {
  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.reopen')
  const opportunity = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!opportunity) throw new OpportunityNotFoundError()

  if (!CLOSED_STAGES.includes(opportunity.stage)) {
    throw new PipelineStateError('Solo se puede reabrir una oportunidad que esté cerrada (ganada o perdida)')
  }

  const toStage = data.toStage ?? 'negotiation'
  const fromStage = opportunity.stage

  await moveStage(orgId, actorUserId, actorRole, id, toStage)

  const result = await prisma.opportunity.update({
    where: { id },
    data: { actualCloseDate: null, lossReason: null },
  })

  // AU-107: 'opportunity.reopened' es un evento propio de la acción de
  // reabrir (distinto del 'opportunity.stage.changed' ya emitido dentro de
  // moveStage() de arriba).
  await prisma.outboxEvent.create({
    data: {
      orgId,
      topic: 'opportunity.reopened',
      aggregateType: 'Opportunity',
      aggregateId: id,
      payload: { opportunityId: id, leadId: opportunity.leadId, fromStage, toStage },
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.reopen',
    entityType: 'Opportunity',
    entityId: id,
    before: opportunity,
    after: result,
  })

  await logSalesActivity({
    orgId,
    type: 'opportunity_reopened',
    opportunityId: id,
    leadId: opportunity.leadId,
    actorUserId,
    metadata: { from: opportunity.stage, to: toStage },
  })

  return result
}

export async function getStageHistory(orgId: string, actor: DataActor, id: string) {
  const opportunity = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo: opportunityOwner(actor, 'pipeline.read') }, select: { id: true } })
  if (!opportunity) throw new OpportunityNotFoundError()

  return prisma.opportunityStageHistory.findMany({
    where: { orgId, opportunityId: id },
    orderBy: { enteredAt: 'asc' },
  })
}

/**
 * Actividad real de la oportunidad (SalesActivity), que hasta ahora la ficha
 * pintaba con un array fijo. Incluye la del lead asociado: una llamada o un
 * email al contacto son actividad de la oportunidad aunque se registren en él.
 */
export async function getOpportunityActivity(orgId: string, actor: DataActor, id: string, limit = 50) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, orgId, assignedTo: opportunityOwner(actor, 'pipeline.read') },
    select: { id: true, leadId: true },
  })
  if (!opportunity) throw new OpportunityNotFoundError()

  return prisma.salesActivity.findMany({
    where: {
      orgId,
      OR: [{ opportunityId: id }, ...(opportunity.leadId ? [{ leadId: opportunity.leadId }] : [])],
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 100),
  })
}

const DAYS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const COLORS   = ['#7c3aed','#2563eb','#059669']

export async function getPipelineInsights(orgId: string) {
  const [negOpps, meetings, won, lost] = await Promise.all([
    prisma.opportunity.findMany({ where: { orgId, stage: 'negotiation' }, select: { probability: true } }),
    prisma.meeting.findMany({ where: { orgId }, select: { scheduledAt: true } }),
    prisma.opportunity.count({ where: { orgId, stage: 'closed_won' } }),
    prisma.opportunity.count({ where: { orgId, stage: 'closed_lost' } }),
  ])

  const avgNegProb = negOpps.length > 0
    ? Math.round(negOpps.reduce((s, o) => s + o.probability, 0) / negOpps.length) : 0

  const dayCounts = Array(7).fill(0)
  meetings.forEach(m => dayCounts[m.scheduledAt.getDay()]++)
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts))
  const bestDay = meetings.length > 0 ? DAYS_ES[bestDayIdx] : 'martes'

  const convRate = (won + lost) > 0 ? Math.round(won / (won + lost) * 100) : null

  return [
    { color: COLORS[0], text: negOpps.length > 0
        ? `Las oportunidades en negociación tienen un ${avgNegProb}% de probabilidad de cierre.`
        : 'No hay oportunidades en negociación actualmente.' },
    { color: COLORS[1], text: `El mejor día para agendar reuniones es los ${bestDay}.` },
    { color: COLORS[2], text: convRate !== null
        ? `La tasa de conversión actual es del ${convRate}%.`
        : 'Aún no hay oportunidades cerradas para calcular la conversión.' },
  ]
}

export async function getPipelinePrediction(orgId: string) {
  const opps = await prisma.opportunity.findMany({
    where: { orgId, stage: { notIn: ['closed_won', 'closed_lost'] } },
    select: { value: true, probability: true, expectedCloseDate: true },
  })

  const now = new Date()
  const weeks = Array.from({ length: 5 }, (_, w) => {
    const start = new Date(now); start.setDate(now.getDate() + w * 7)
    const end   = new Date(start); end.setDate(start.getDate() + 7)
    const label = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const value = opps
      .filter(o => o.expectedCloseDate && o.expectedCloseDate >= start && o.expectedCloseDate < end)
      .reduce((s, o) => s + (Number(o.value) || 0) * (o.probability / 100), 0)
    return { date: label, value: Math.round(value / 1000) }
  })

  const total = Math.round(opps.reduce((s, o) => s + (Number(o.value) || 0) * (o.probability / 100), 0))
  return { total, weeks }
}

export async function getPipelineActions(orgId: string) {
  const sevenAgo = new Date(Date.now() - 7 * 86400_000)
  const threeAgo = new Date(Date.now() - 3 * 86400_000)

  const [staleCount, staleAgg, staleProposals, goodCalls] = await Promise.all([
    prisma.opportunity.count({ where: { orgId, stage: { in: ['lead', 'qualified'] }, stageEnteredAt: { lt: sevenAgo } } }),
    prisma.opportunity.aggregate({ where: { orgId, stage: { in: ['lead', 'qualified'] }, stageEnteredAt: { lt: sevenAgo } }, _sum: { value: true } }),
    prisma.opportunity.count({ where: { orgId, stage: 'proposal', stageEnteredAt: { lt: threeAgo } } }),
    prisma.call.findMany({ where: { orgId, outcome: { in: [...QUALIFYING_CALL_OUTCOMES] }, startedAt: { not: null } }, select: { startedAt: true }, take: 100, orderBy: { createdAt: 'desc' } }),
  ])

  const hourCounts: Record<number, number> = {}
  goodCalls.forEach(c => { const h = c.startedAt!.getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1 })
  const bestHour = Object.keys(hourCounts).length > 0
    ? parseInt(Object.keys(hourCounts).reduce((a, b) => hourCounts[+a] > hourCounts[+b] ? a : b))
    : 10

  const staleValue = Math.round(Number(staleAgg._sum.value ?? 0))

  return [
    { type:'followup',  title:`${staleCount} oportunidades necesitan seguimiento`,    desc:`Podrías perder €${staleValue.toLocaleString('es-ES')}`,       cta:'Ver oportunidades', url:'/pipeline' },
    { type:'proposal',  title:`${staleProposals} propuestas sin respuesta > 3 días`,  desc:'Enviar recordatorio puede aumentar 32%',                        cta:'Ver propuestas',    url:'/pipeline' },
    { type:'timing',    title:'Mejor momento para contactar',                          desc:`Hoy ${bestHour}:00 - ${bestHour + 2}:00`,                       cta:'Ver calendario',    url:'/reuniones' },
  ]
}

export async function updateOpportunity(orgId: string, actorUserId: string, actorRole: string, id: string, data: {
  name?: string
  value?: number
  currency?: string
  probability?: number
  expectedCloseDate?: string
  notes?: string
  assignedTo?: string
}) {
  await assertOwnedReferences(orgId, { assignedTo: data.assignedTo })

  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const before = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!before) throw new OpportunityNotFoundError()

  const result = await prisma.opportunity.updateMany({
    where: { id, orgId, assignedTo },
    data: {
      ...data,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
    },
  })

  if (result.count === 0) throw new OpportunityNotFoundError()

  const after = await prisma.opportunity.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.update',
    entityType: 'Opportunity',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  return after
}

// ─── OP-107: forecast ───────────────────────────────────────────────────────

/** Categorías de forecast válidas para Opportunity.forecastCategory. */
export const FORECAST_CATEGORIES = ['pipeline', 'best_case', 'commit', 'omitted'] as const
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number]

interface ForecastFilters {
  ownerId?: string
  /** Filtra la base de cálculo a una única categoría (por defecto usa todas). */
  category?: string
  /** Si se pasa, solo se calcula para esa moneda (si no, se agrupa por moneda). */
  currency?: string
  closeFrom?: string
  closeTo?: string
}

/**
 * OP-107: forecast de oportunidades abiertas agrupado por moneda (no se
 * convierten divisas — ver nota de diseño en el ticket: sin proveedor de
 * tipo de cambio, mezclar monedas en una sola suma sería incorrecto).
 * forecastCategory=null se trata como 'pipeline' (aún no clasificada).
 * 'omitted' se excluye de todos los totales: es la categoría que el usuario
 * usa para sacar una oportunidad del forecast oficial sin cerrarla.
 */
export async function getForecast(orgId: string, actor: DataActor, filters: ForecastFilters = {}) {
  const { ownerId, category, currency, closeFrom, closeTo } = filters

  const where: Record<string, unknown> = {
    orgId,
    stage: { notIn: CLOSED_STAGES },
  }
  const forcedOwnerId = opportunityOwner(actor, 'pipeline.read')
  if (forcedOwnerId !== undefined) where.assignedTo = forcedOwnerId
  else if (ownerId) where.assignedTo = ownerId
  if (currency) where.currency = currency
  if (closeFrom || closeTo) {
    where.expectedCloseDate = {
      ...(closeFrom ? { gte: new Date(closeFrom) } : {}),
      ...(closeTo ? { lte: new Date(closeTo) } : {}),
    }
  }
  if (category) {
    where.forecastCategory = category === 'pipeline' ? { in: [null, 'pipeline'] } : category
  }

  const opportunities = await prisma.opportunity.findMany({
    where,
    select: { value: true, probability: true, currency: true, forecastCategory: true },
  })

  const byCurrency: Record<string, {
    pipeline: number
    weightedPipeline: number
    commit: number
    bestCase: number
    count: number
  }> = {}

  for (const opp of opportunities) {
    const cat = opp.forecastCategory ?? 'pipeline'
    if (cat === 'omitted') continue

    const bucket = byCurrency[opp.currency] ?? (byCurrency[opp.currency] = {
      pipeline: 0, weightedPipeline: 0, commit: 0, bestCase: 0, count: 0,
    })

    const value = Number(opp.value ?? 0)
    bucket.pipeline += value
    bucket.weightedPipeline += value * (opp.probability / 100)
    bucket.count += 1

    if (cat === 'commit') {
      bucket.commit += value
      bucket.bestCase += value
    } else if (cat === 'best_case') {
      bucket.bestCase += value
    }
  }

  return byCurrency
}

/** OP-107: fija manualmente la categoría de forecast de una oportunidad. */
export async function updateForecastCategory(
  orgId: string,
  actorUserId: string,
  actorRole: string,
  id: string,
  forecastCategory: ForecastCategory
) {
  const assignedTo = opportunityOwner({ userId: actorUserId, role: actorRole }, 'pipeline.write')
  const before = await prisma.opportunity.findFirst({ where: { id, orgId, assignedTo } })
  if (!before) throw new OpportunityNotFoundError()

  const after = await prisma.opportunity.update({
    where: { id },
    data: { forecastCategory },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.forecast_category.update',
    entityType: 'Opportunity',
    entityId: id,
    before,
    after,
  })

  return after
}

// ─── OP-108: contactos / roles de compra ────────────────────────────────────

export const OPPORTUNITY_CONTACT_ROLES = ['champion', 'decision_maker', 'economic_buyer', 'influencer', 'blocker'] as const
export type OpportunityContactRole = (typeof OPPORTUNITY_CONTACT_ROLES)[number]

export async function listOpportunityContacts(orgId: string, opportunityId: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true } })
  if (!opp) throw new OpportunityNotFoundError()

  return prisma.opportunityContact.findMany({
    where: { orgId, opportunityId },
    include: { lead: { select: { id: true, name: true, email: true, phone: true, company: true } } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * OP-108: añade (o actualiza, si ya existía) un lead como contacto de la
 * oportunidad con un rol de compra. Solo puede haber un contacto primario
 * por oportunidad: marcar uno como primario desmarca cualquier otro.
 */
export async function addOpportunityContact(
  orgId: string,
  actorUserId: string | null | undefined,
  opportunityId: string,
  data: { leadId: string; role: OpportunityContactRole; isPrimary?: boolean }
) {
  const [opp, lead] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true } }),
    prisma.lead.findFirst({ where: { id: data.leadId, orgId }, select: { id: true } }),
  ])
  if (!opp) throw new OpportunityNotFoundError()
  if (!lead) throw new OwnershipError('leadId')

  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.opportunityContact.updateMany({
        where: { orgId, opportunityId, isPrimary: true },
        data: { isPrimary: false },
      })
    }
    return tx.opportunityContact.upsert({
      where: { opportunityId_leadId: { opportunityId, leadId: data.leadId } },
      create: { orgId, opportunityId, leadId: data.leadId, role: data.role, isPrimary: data.isPrimary ?? false },
      update: { role: data.role, isPrimary: data.isPrimary ?? false },
    })
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.contact.add',
    entityType: 'OpportunityContact',
    entityId: contact.id,
    after: contact,
  })

  return contact
}

export async function removeOpportunityContact(orgId: string, opportunityId: string, leadId: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true } })
  if (!opp) throw new OpportunityNotFoundError()

  const result = await prisma.opportunityContact.deleteMany({ where: { orgId, opportunityId, leadId } })
  if (result.count === 0) throw new OpportunityContactNotFoundError()
  return result
}

// ─── OP-109: productos / líneas de producto ─────────────────────────────────

export async function listProducts(orgId: string) {
  return prisma.product.findMany({ where: { orgId, isActive: true }, orderBy: { name: 'asc' } })
}

export async function createProduct(
  orgId: string,
  actorUserId: string | null | undefined,
  data: { name: string; sku?: string; unitPrice?: number; currency?: string }
) {
  const product = await prisma.product.create({
    data: {
      orgId,
      name: data.name,
      sku: data.sku,
      unitPrice: data.unitPrice,
      currency: data.currency ?? 'EUR',
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'product.create',
    entityType: 'Product',
    entityId: product.id,
    after: product,
  })

  return product
}

export async function listLineItems(orgId: string, opportunityId: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true } })
  if (!opp) throw new OpportunityNotFoundError()

  return prisma.opportunityLineItem.findMany({
    where: { orgId, opportunityId },
    include: { product: { select: { id: true, name: true, sku: true } } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * OP-109: añade una línea de producto a la oportunidad. No recalcula
 * Opportunity.value (decisión de diseño explícita, ver ticket): el total de
 * líneas se muestra aparte, como referencia, sin pisar flujos existentes que
 * ya setean value manualmente.
 */
export async function addLineItem(
  orgId: string,
  actorUserId: string | null | undefined,
  opportunityId: string,
  data: { productId?: string; name: string; quantity: number; unitPrice: number; currency?: string }
) {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true, currency: true } })
  if (!opp) throw new OpportunityNotFoundError()

  if (data.productId) {
    const product = await prisma.product.findFirst({ where: { id: data.productId, orgId }, select: { id: true } })
    if (!product) throw new ProductNotFoundError()
  }

  const lineItem = await prisma.opportunityLineItem.create({
    data: {
      orgId,
      opportunityId,
      productId: data.productId,
      name: data.name,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      currency: data.currency ?? opp.currency,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.line_item.add',
    entityType: 'OpportunityLineItem',
    entityId: lineItem.id,
    after: lineItem,
  })

  return lineItem
}

export async function removeLineItem(orgId: string, opportunityId: string, lineItemId: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, orgId }, select: { id: true } })
  if (!opp) throw new OpportunityNotFoundError()

  const result = await prisma.opportunityLineItem.deleteMany({ where: { id: lineItemId, orgId, opportunityId } })
  if (result.count === 0) throw new LineItemNotFoundError()
  return result
}
