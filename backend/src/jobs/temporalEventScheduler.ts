import { prisma } from '../lib/prisma'

// Materializa los eventos temporales una vez y los entrega por outbox. Cada
// dedupeKey incorpora la revisión temporal de la entidad: una reunión
// reprogramada o una oportunidad que vuelve a proposal puede generar el
// disparo correcto, mientras que los triggers anteriores se cancelan.
const POLL_MS = Number(process.env.TEMPORAL_TRIGGER_POLL_MS ?? 5 * 60_000)
const BATCH_SIZE = 200
const DAY_MS = 24 * 60 * 60 * 1000
const TEMPORAL_RULES = [
  'lead.inactive.7d',
  'lead.inactive.30d',
  'meeting.scheduled.24h',
  'opportunity.proposal.3d',
] as const

type TemporalRule = typeof TEMPORAL_RULES[number]
type ScheduledTriggerRecord = Awaited<ReturnType<typeof prisma.scheduledTrigger.findMany>>[number]

let running = false

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

function payloadDate(payload: Record<string, unknown>, key: string): Date | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function inactiveDays(ruleKey: string): 7 | 30 | null {
  if (ruleKey === 'lead.inactive.7d') return 7
  if (ruleKey === 'lead.inactive.30d') return 30
  return null
}

async function upsertScheduledTrigger(input: {
  orgId: string
  ruleKey: TemporalRule
  entityType: string
  entityId: string
  dedupeKey: string
  dueAt: Date
  payload: Record<string, unknown>
}) {
  const existing = await prisma.scheduledTrigger.findUnique({ where: { dedupeKey: input.dedupeKey } })
  if (existing) {
    // Solo el trigger aún pendiente puede ser reprogramado. Un fired es un
    // hecho histórico; una nueva revisión usa un dedupeKey diferente.
    if (existing.status === 'pending') {
      await prisma.scheduledTrigger.updateMany({
        where: { id: existing.id, status: 'pending' },
        data: { dueAt: input.dueAt, payload: input.payload as any },
      })
    }
    return existing
  }

  try {
    return await prisma.scheduledTrigger.create({
      data: {
        orgId: input.orgId,
        ruleKey: input.ruleKey,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
        dueAt: input.dueAt,
        status: 'pending',
        payload: input.payload as any,
      },
    })
  } catch (error: any) {
    // Dos procesos pueden descubrir la misma entidad a la vez. La unique de
    // dedupeKey es el árbitro y el ganador ya dejó el trigger materializado.
    if (error?.code === 'P2002') return prisma.scheduledTrigger.findUnique({ where: { dedupeKey: input.dedupeKey } })
    throw error
  }
}

async function scanLeadInactivity(days: 7 | 30) {
  const ruleKey: TemporalRule = days === 7 ? 'lead.inactive.7d' : 'lead.inactive.30d'
  const threshold = new Date(Date.now() - days * DAY_MS)
  const leads = await prisma.lead.findMany({
    where: {
      status: { not: 'converted' },
      OR: [
        { lastAttemptAt: { lte: threshold } },
        { lastAttemptAt: null, createdAt: { lte: threshold } },
      ],
    },
    select: { id: true, orgId: true, createdAt: true, lastAttemptAt: true },
    take: BATCH_SIZE,
  })

  for (const lead of leads) {
    const inactiveSince = lead.lastAttemptAt ?? lead.createdAt
    const dedupeKey = `${ruleKey}:${lead.id}:${inactiveSince.getTime()}`
    await upsertScheduledTrigger({
      orgId: lead.orgId,
      ruleKey,
      entityType: 'Lead',
      entityId: lead.id,
      dedupeKey,
      dueAt: new Date(inactiveSince.getTime() + days * DAY_MS),
      payload: { leadId: lead.id, eventId: dedupeKey, inactiveSince: inactiveSince.toISOString() },
    })
  }
}

async function scanMeetingsSoon() {
  const ruleKey: TemporalRule = 'meeting.scheduled.24h'
  const now = new Date()
  // Se descubre una reunión antes de cruzar T-24 y se conserva su dueAt
  // exacto. Si se creó con menos de 24 h de margen, dicho dueAt ya está en el
  // pasado y se entrega en el siguiente ciclo, sin pretender que fue T-24.
  const windowEnd = new Date(now.getTime() + DAY_MS + POLL_MS)
  const meetings = await prisma.meeting.findMany({
    where: { status: 'scheduled', scheduledAt: { gte: now, lte: windowEnd } },
    select: { id: true, orgId: true, leadId: true, scheduledAt: true },
    take: BATCH_SIZE,
  })

  for (const meeting of meetings) {
    const scheduledAt = meeting.scheduledAt
    const dedupeKey = `${ruleKey}:${meeting.id}:${scheduledAt.getTime()}`
    await upsertScheduledTrigger({
      orgId: meeting.orgId,
      ruleKey,
      entityType: 'Meeting',
      entityId: meeting.id,
      dedupeKey,
      dueAt: new Date(scheduledAt.getTime() - DAY_MS),
      payload: {
        meetingId: meeting.id,
        leadId: meeting.leadId,
        eventId: dedupeKey,
        scheduledAt: scheduledAt.toISOString(),
      },
    })
  }
}

async function scheduleProposals(opportunities: Array<{ id: string; orgId: string; leadId: string; stageEnteredAt: Date }>) {
  const ruleKey: TemporalRule = 'opportunity.proposal.3d'
  for (const opportunity of opportunities) {
    const stageEnteredAt = opportunity.stageEnteredAt
    const dedupeKey = `${ruleKey}:${opportunity.id}:${stageEnteredAt.getTime()}`
    await upsertScheduledTrigger({
      orgId: opportunity.orgId,
      ruleKey,
      entityType: 'Opportunity',
      entityId: opportunity.id,
      dedupeKey,
      dueAt: new Date(stageEnteredAt.getTime() + 3 * DAY_MS),
      payload: {
        opportunityId: opportunity.id,
        leadId: opportunity.leadId,
        eventId: dedupeKey,
        stageEnteredAt: stageEnteredAt.toISOString(),
      },
    })
  }
}

async function scanStaleProposals() {
  const now = new Date()
  const threshold = new Date(now.getTime() - 3 * DAY_MS)
  // Las dos consultas evitan que una cola histórica de propuestas viejas
  // impida materializar propuestas recién movidas a la etapa. Ambas usan
  // stageEnteredAt, nunca createdAt.
  const [recent, stale] = await Promise.all([
    prisma.opportunity.findMany({
      where: { stage: 'proposal', stageEnteredAt: { gt: threshold } },
      select: { id: true, orgId: true, leadId: true, stageEnteredAt: true },
      orderBy: { stageEnteredAt: 'asc' },
      take: BATCH_SIZE,
    }),
    prisma.opportunity.findMany({
      where: { stage: 'proposal', stageEnteredAt: { lte: threshold } },
      select: { id: true, orgId: true, leadId: true, stageEnteredAt: true },
      orderBy: { stageEnteredAt: 'desc' },
      take: BATCH_SIZE,
    }),
  ])
  await scheduleProposals([...recent, ...stale])
}

async function triggerIsStillValid(trigger: ScheduledTriggerRecord): Promise<boolean> {
  const payload = payloadObject(trigger.payload)

  if (trigger.ruleKey === 'meeting.scheduled.24h') {
    const expectedAt = payloadDate(payload, 'scheduledAt')
    // Los triggers creados por versiones anteriores no incluían la revisión
    // de la cita. Se cancelan de forma conservadora y el scan crea uno nuevo.
    if (!expectedAt) return false
    const meeting = await prisma.meeting.findFirst({
      where: { id: trigger.entityId, orgId: trigger.orgId },
      select: { status: true, scheduledAt: true },
    })
    return Boolean(meeting && meeting.status === 'scheduled' && meeting.scheduledAt.getTime() === expectedAt.getTime())
  }

  if (trigger.ruleKey === 'opportunity.proposal.3d') {
    const expectedAt = payloadDate(payload, 'stageEnteredAt')
    if (!expectedAt) return false
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: trigger.entityId, orgId: trigger.orgId },
      select: { stage: true, stageEnteredAt: true },
    })
    return Boolean(opportunity && opportunity.stage === 'proposal' && opportunity.stageEnteredAt.getTime() === expectedAt.getTime())
  }

  const days = inactiveDays(trigger.ruleKey)
  if (days) {
    const expectedAt = payloadDate(payload, 'inactiveSince')
    if (!expectedAt) return false
    const lead = await prisma.lead.findFirst({
      where: { id: trigger.entityId, orgId: trigger.orgId },
      select: { status: true, createdAt: true, lastAttemptAt: true },
    })
    if (!lead || lead.status === 'converted') return false
    const inactiveSince = lead.lastAttemptAt ?? lead.createdAt
    return inactiveSince.getTime() === expectedAt.getTime()
      && inactiveSince.getTime() <= Date.now() - days * DAY_MS
  }

  return false
}

async function cancelInvalidScheduledTriggers() {
  const pending = await prisma.scheduledTrigger.findMany({
    where: { status: 'pending', ruleKey: { in: [...TEMPORAL_RULES] } },
    orderBy: { dueAt: 'asc' },
    take: BATCH_SIZE,
  })

  for (const trigger of pending) {
    if (await triggerIsStillValid(trigger)) continue
    await prisma.scheduledTrigger.updateMany({
      where: { id: trigger.id, status: 'pending' },
      data: { status: 'cancelled' },
    })
  }
}

async function publishDueTriggers() {
  const due = await prisma.scheduledTrigger.findMany({
    where: { status: 'pending', dueAt: { lte: new Date() } },
    orderBy: { dueAt: 'asc' },
    take: BATCH_SIZE,
  })

  for (const trigger of due) {
    if (!(await triggerIsStillValid(trigger))) {
      await prisma.scheduledTrigger.updateMany({
        where: { id: trigger.id, status: 'pending' },
        data: { status: 'cancelled' },
      })
      continue
    }

    try {
      // Reclamar el trigger y crear su outbox en la misma transacción evita
      // tanto la doble publicación como perderlo si el proceso cae entre
      // ambas escrituras.
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.scheduledTrigger.updateMany({
          where: { id: trigger.id, status: 'pending' },
          data: { status: 'fired', firedAt: new Date() },
        })
        if (!claimed.count) return

        const payload = payloadObject(trigger.payload)
        await tx.outboxEvent.create({
          data: {
            orgId: trigger.orgId,
            topic: trigger.ruleKey,
            aggregateType: trigger.entityType,
            aggregateId: trigger.entityId,
            payload: { ...payload, eventId: payload.eventId ?? trigger.dedupeKey } as any,
          },
        })
      })
    } catch (error) {
      // La transacción revierte el claim: queda pending para un reintento
      // posterior. No se altera firedAt ni se pierde el disparador.
      console.error(`[TemporalEventScheduler] error publicando trigger ${trigger.id}:`, error)
    }
  }
}

async function runTemporalEventScheduler() {
  if (running) return
  running = true
  try {
    await cancelInvalidScheduledTriggers()
    await scanLeadInactivity(7)
    await scanLeadInactivity(30)
    await scanMeetingsSoon()
    await scanStaleProposals()
    await publishDueTriggers()
  } catch (error) {
    console.error('[TemporalEventScheduler] error en ciclo:', error)
  } finally {
    running = false
  }
}

let temporalEventSchedulerTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  temporalEventSchedulerTimer = setInterval(() => void runTemporalEventScheduler(), POLL_MS)
  temporalEventSchedulerTimer.unref()
  void runTemporalEventScheduler()
}

export { runTemporalEventScheduler, temporalEventSchedulerTimer }
