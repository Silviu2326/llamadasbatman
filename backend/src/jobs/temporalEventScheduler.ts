import { prisma } from '../lib/prisma'

// P0-08/AU-01: los cuatro eventos temporales del catálogo de automatizaciones
// (lead.inactive.7d/30d, meeting.scheduled.24h, opportunity.proposal.3d) no
// tenían ningún productor — una automatización activada para ellos nunca
// corría. Este job escanea las entidades candidatas, materializa un
// ScheduledTrigger deterministamente deduplicado por entidad+regla
// (dedupeKey unique) y publica los vencidos al outbox, la misma fuente de
// verdad que consume runAutomationsForEvent()/outboxDispatcher.
const POLL_MS = Number(process.env.TEMPORAL_TRIGGER_POLL_MS ?? 5 * 60_000)
const BATCH_SIZE = 200
const DAY_MS = 24 * 60 * 60 * 1000
let running = false

async function upsertScheduledTrigger(input: {
  orgId: string
  ruleKey: string
  entityType: string
  entityId: string
  dedupeKey: string
  payload: Record<string, unknown>
}) {
  const existing = await prisma.scheduledTrigger.findUnique({ where: { dedupeKey: input.dedupeKey } })
  // Ya existe un trigger (pending/fired/cancelled) para esta entidad+regla:
  // no se duplica la emisión aunque la condición siga siendo verdadera en
  // ciclos posteriores.
  if (existing) return
  await prisma.scheduledTrigger.create({
    data: {
      orgId: input.orgId,
      ruleKey: input.ruleKey,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupeKey: input.dedupeKey,
      dueAt: new Date(),
      status: 'pending',
      payload: input.payload as any,
    },
  })
}

async function scanLeadInactivity(days: 7 | 30) {
  const ruleKey = days === 7 ? 'lead.inactive.7d' : 'lead.inactive.30d'
  const threshold = new Date(Date.now() - days * DAY_MS)
  const leads = await prisma.lead.findMany({
    where: {
      status: { not: 'converted' },
      OR: [
        { lastAttemptAt: { lte: threshold } },
        { lastAttemptAt: null, createdAt: { lte: threshold } },
      ],
    },
    select: { id: true, orgId: true },
    take: BATCH_SIZE,
  })
  for (const lead of leads) {
    const dedupeKey = `${ruleKey}:${lead.id}`
    await upsertScheduledTrigger({
      orgId: lead.orgId,
      ruleKey,
      entityType: 'Lead',
      entityId: lead.id,
      dedupeKey,
      payload: { leadId: lead.id, eventId: dedupeKey },
    })
  }
}

async function scanMeetingsSoon() {
  const ruleKey = 'meeting.scheduled.24h'
  const now = new Date()
  const windowEnd = new Date(now.getTime() + DAY_MS)
  const meetings = await prisma.meeting.findMany({
    where: { status: 'scheduled', scheduledAt: { gte: now, lte: windowEnd } },
    select: { id: true, orgId: true, leadId: true },
    take: BATCH_SIZE,
  })
  for (const meeting of meetings) {
    const dedupeKey = `${ruleKey}:${meeting.id}`
    await upsertScheduledTrigger({
      orgId: meeting.orgId,
      ruleKey,
      entityType: 'Meeting',
      entityId: meeting.id,
      dedupeKey,
      payload: { meetingId: meeting.id, leadId: meeting.leadId, eventId: dedupeKey },
    })
  }
}

async function scanStaleProposals() {
  const ruleKey = 'opportunity.proposal.3d'
  const threshold = new Date(Date.now() - 3 * DAY_MS)
  const opportunities = await prisma.opportunity.findMany({
    where: { stage: 'proposal', createdAt: { lte: threshold } },
    select: { id: true, orgId: true, leadId: true },
    take: BATCH_SIZE,
  })
  for (const opportunity of opportunities) {
    const dedupeKey = `${ruleKey}:${opportunity.id}`
    await upsertScheduledTrigger({
      orgId: opportunity.orgId,
      ruleKey,
      entityType: 'Opportunity',
      entityId: opportunity.id,
      dedupeKey,
      payload: { opportunityId: opportunity.id, leadId: opportunity.leadId, eventId: dedupeKey },
    })
  }
}

async function publishDueTriggers() {
  const due = await prisma.scheduledTrigger.findMany({
    where: { status: 'pending', dueAt: { lte: new Date() } },
    take: BATCH_SIZE,
  })
  for (const trigger of due) {
    const claimed = await prisma.scheduledTrigger.updateMany({
      where: { id: trigger.id, status: 'pending' },
      data: { status: 'fired', firedAt: new Date() },
    })
    if (!claimed.count) continue
    try {
      const payload = trigger.payload && typeof trigger.payload === 'object' && !Array.isArray(trigger.payload)
        ? trigger.payload as Record<string, unknown>
        : { eventId: trigger.dedupeKey }
      await prisma.outboxEvent.create({
        data: {
          orgId: trigger.orgId,
          topic: trigger.ruleKey,
          aggregateType: trigger.entityType,
          aggregateId: trigger.entityId,
          payload: payload as any,
        },
      })
    } catch (error) {
      console.error(`[TemporalEventScheduler] error publicando trigger ${trigger.id}:`, error)
      // Deja el registro reintentable en el próximo ciclo si no se pudo
      // publicar al outbox, en vez de perder el evento silenciosamente.
      await prisma.scheduledTrigger.updateMany({ where: { id: trigger.id, status: 'fired' }, data: { status: 'pending', firedAt: null } })
    }
  }
}

async function runTemporalEventScheduler() {
  if (running) return
  running = true
  try {
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
