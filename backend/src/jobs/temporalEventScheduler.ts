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
  dueAt: Date
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
      // CORRECCIÓN (revisión posterior): antes se guardaba siempre `now()`
      // sin importar la regla, así que un trigger se disparaba en el mismo
      // ciclo en que se detectaba (p.ej. "T-24h" en realidad disparaba en
      // cuanto la reunión entraba en la ventana de 24h, no exactamente a
      // T-24h). Ahora cada scan calcula el dueAt real de su regla.
      dueAt: input.dueAt,
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
  const now = new Date()
  for (const lead of leads) {
    const dedupeKey = `${ruleKey}:${lead.id}`
    await upsertScheduledTrigger({
      orgId: lead.orgId,
      ruleKey,
      entityType: 'Lead',
      entityId: lead.id,
      dedupeKey,
      // El umbral ya pasó (es la condición de la query), así que el dueAt
      // real cae en el pasado — se dispara en el próximo publishDueTriggers,
      // que es el comportamiento correcto para "ya lleva N días inactivo".
      dueAt: now,
      payload: { leadId: lead.id, eventId: dedupeKey },
    })
  }
}

async function scanMeetingsSoon() {
  const ruleKey = 'meeting.scheduled.24h'
  const now = new Date()
  // Ventana ampliada por POLL_MS: detecta reuniones ANTES de que crucen el
  // umbral T-24h para poder guardar un dueAt futuro y dejar que
  // publishDueTriggers() lo dispare justo cuando llegue, en vez de disparar
  // en cuanto la reunión "ya está" dentro de las 24h (que podía ser mucho
  // antes o, para reuniones creadas con poca antelación, casi al instante).
  const windowEnd = new Date(now.getTime() + DAY_MS + POLL_MS)
  const meetings = await prisma.meeting.findMany({
    where: { status: 'scheduled', scheduledAt: { gte: now, lte: windowEnd } },
    select: { id: true, orgId: true, leadId: true, scheduledAt: true },
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
      dueAt: new Date(meeting.scheduledAt.getTime() - DAY_MS),
      payload: { meetingId: meeting.id, leadId: meeting.leadId, eventId: dedupeKey },
    })
  }
}

async function scanStaleProposals() {
  const ruleKey = 'opportunity.proposal.3d'
  const threshold = new Date(Date.now() - 3 * DAY_MS)
  // CORRECCIÓN (revisión posterior): usaba createdAt, así que una oportunidad
  // antigua movida HOY a "proposal" se marcaba estancada de inmediato.
  // stageEnteredAt existe desde OP-101 (historial de etapa) — se usa aquí.
  const opportunities = await prisma.opportunity.findMany({
    where: { stage: 'proposal', stageEnteredAt: { lte: threshold } },
    select: { id: true, orgId: true, leadId: true, stageEnteredAt: true },
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
      dueAt: new Date(opportunity.stageEnteredAt.getTime() + 3 * DAY_MS),
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
