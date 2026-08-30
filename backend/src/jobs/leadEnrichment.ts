import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { auditBusiness, enrichFromWebsite } from '../services/digitalAudit.service'
import { discoverOwnerEmail } from '../services/emailDiscovery.service'
import { lookupLineType, normalizeE164, type LineType } from '../voice/compliance'

/**
 * Enriquecimiento de leads importados: encadena las etapas 3-5 de
 * PROCESO_AUTOMATICO_LEADS.md sobre los leads que entran por semilla (registros
 * públicos) o por el buscador de prospectos.
 *
 *   auditar la web  →  descartar los que no tienen problema
 *                   →  correo del dueño
 *                   →  tipo de línea (fijo / móvil)
 *                   →  enrutar a cola de llamada o de correo
 *
 * El orden importa y no es casual: la auditoría es gratis y descarta ~1 de cada
 * 5, así que va antes que las dos etapas de pago. Invertirlo cuesta un tercio
 * más por ciclo.
 *
 * Marca cada lead con la etiqueta `enriched` al terminar, que es también el
 * filtro de selección del lote siguiente.
 */
const QUEUE_NAME = 'lead-enrichment'
const TICK_INTERVAL_MS = 15 * 60 * 1000
const REPEATABLE_JOB_ID = 'lead-enrichment-tick'
const BATCH_SIZE = 125
const ENRICHED_TAG = 'enriched'
const reportEnrichmentError = reportQueueError('LeadEnrichment')

let leadEnrichmentQueue: Queue | null = null
let leadEnrichmentWorker: Worker | null = null

/**
 * Estado → zona horaria IANA.
 *
 * ponytail: mapa plano en vez de una API de zonas horarias. Cubre los 15
 * estados de la costa Este —el mercado objetivo—, que son todos Eastern. Los
 * estados partidos entre dos husos quedan deliberadamente fuera: sin zona
 * horaria `canCall` se niega a marcar, que es el fallo seguro. Si algún día se
 * abre el centro o el oeste, esto se sustituye por la Time Zone API de Google
 * (5 $/1000) en vez de crecer a mano.
 */
const STATE_TZ: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', GA: 'America/New_York',
  MA: 'America/New_York', MD: 'America/New_York', ME: 'America/New_York',
  NC: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York',
  NY: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VA: 'America/New_York', VT: 'America/New_York',
  DC: 'America/New_York', OH: 'America/New_York', WV: 'America/New_York',
  IL: 'America/Chicago', WI: 'America/Chicago', MN: 'America/Chicago',
  IA: 'America/Chicago', MO: 'America/Chicago', AR: 'America/Chicago',
  LA: 'America/Chicago', MS: 'America/Chicago', AL: 'America/Chicago',
  OK: 'America/Chicago', CO: 'America/Denver', NM: 'America/Denver',
  UT: 'America/Denver', MT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix', CA: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  NV: 'America/Los_Angeles', HI: 'Pacific/Honolulu',
}

export function timeZoneForState(state?: unknown): string | null {
  if (typeof state !== 'string') return null
  return STATE_TZ[state.trim().toUpperCase()] ?? null
}

type EnrichmentFields = {
  website?: unknown
  state?: unknown
  ownerName?: unknown
  sector?: unknown
  city?: unknown
}

export type EnrichmentOutcome = {
  /** Nada que vender: su web ya está bien. */
  discarded: boolean
  lineType: LineType
  callTimeZone: string | null
  /** El publicado en su web, o el del dueño deducido y verificado. */
  discoveredEmail: string | null
  tier: string | null
}

/** Decide el destino de un lead sin tocar la base de datos: es lo testeable. */
export function routeLead(outcome: EnrichmentOutcome): 'discarded' | 'call' | 'email' {
  if (outcome.discarded) return 'discarded'
  // Solo el fijo de empresa admite llamada en frío; el resto entra por correo
  // y solo pasa a la cola de llamada cuando responde dando permiso.
  return outcome.lineType === 'landline' ? 'call' : 'email'
}

async function enrichLead(lead: {
  id: string
  orgId: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  tags: string[]
  customFields: unknown
}): Promise<EnrichmentOutcome> {
  const fields = (lead.customFields ?? {}) as EnrichmentFields
  const website = typeof fields.website === 'string' ? fields.website : null

  // ── Etapa 3 · auditar la web (gratis, y descarta antes de gastar) ──────────
  let tier: string | null = null
  let scrapedEmail: string | null = null
  if (website) {
    try {
      const audit = await auditBusiness({
        name: lead.company ?? lead.name,
        website,
        sector: typeof fields.sector === 'string' ? fields.sector : null,
        city: typeof fields.city === 'string' ? fields.city : null,
      })
      tier = audit.tier
    } catch (error) {
      console.warn(`[LeadEnrichment] auditoría de ${website} falló:`, (error as Error).message)
    }
    // auditBusiness puntúa pero no extrae el correo publicado; eso lo hace
    // enrichFromWebsite. Solo se pide cuando aún no tenemos ninguno.
    if (!lead.email) {
      scrapedEmail = await enrichFromWebsite(website)
        .then((r) => r?.email ?? null)
        .catch(() => null)
    }
  }
  // Sin web es mejor prospecto, no peor: hay que construirla entera.
  const discarded = tier === 'COLD'
  if (discarded) {
    return { discarded, lineType: 'unknown', callTimeZone: null, discoveredEmail: null, tier }
  }

  // ── Etapa 4 · correo del dueño ────────────────────────────────────────────
  // El publicado en su web es gratis y ya lo tenemos; el patrón del dueño solo
  // se paga cuando no hay ninguno, porque cuesta hasta cinco verificaciones.
  let discoveredEmail = scrapedEmail
  if (!lead.email && !discoveredEmail && website && typeof fields.ownerName === 'string') {
    discoveredEmail = await discoverOwnerEmail(fields.ownerName, website)
  }

  // ── Etapa 5 · tipo de línea, la puerta legal ──────────────────────────────
  const lineType = lead.phone ? await lookupLineType(lead.orgId, lead.phone) : 'unknown'

  return { discarded, lineType, callTimeZone: timeZoneForState(fields.state), discoveredEmail, tier }
}

async function persist(
  lead: { id: string; email: string | null; tags: string[]; customFields: unknown },
  outcome: EnrichmentOutcome
) {
  const route = routeLead(outcome)
  const tags = new Set(lead.tags)
  tags.add(ENRICHED_TAG)
  tags.add(`route:${route}`)

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      email: lead.email ?? outcome.discoveredEmail ?? undefined,
      tags: [...tags],
      customFields: {
        ...((lead.customFields ?? {}) as Record<string, unknown>),
        lineType: outcome.lineType,
        callTimeZone: outcome.callTimeZone,
        auditTier: outcome.tier,
        enrichedAt: new Date().toISOString(),
      },
    },
  })
}

/** Procesa un lote. Un lead que falla se salta: nunca se aborta el lote. */
export async function runEnrichmentBatch(limit = BATCH_SIZE): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: { NOT: { tags: { has: ENRICHED_TAG } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true, orgId: true, name: true, phone: true, email: true,
      company: true, tags: true, customFields: true,
    },
  })

  let processed = 0
  for (const lead of leads) {
    try {
      if (lead.phone && !normalizeE164(lead.phone)) {
        await persist(lead, { discarded: true, lineType: 'unknown', callTimeZone: null, discoveredEmail: null, tier: null })
        continue
      }
      await persist(lead, await enrichLead(lead))
      processed++
    } catch (error) {
      console.error(`[LeadEnrichment] lead ${lead.id} falló:`, (error as Error).message)
    }
  }
  return processed
}

void (async () => {
  const connection = await connectOptionalRedis('LeadEnrichment')
  if (!connection) return

  try {
    leadEnrichmentQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    leadEnrichmentQueue.on('error', reportEnrichmentError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await leadEnrichmentQueue.add('tick', {}, { repeat: { every: TICK_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportEnrichmentError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const processed = await runEnrichmentBatch()
        if (processed) console.log(`[LeadEnrichment] ${processed} leads enriquecidos`)
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('failed', (job, error) => console.error(`[LeadEnrichment] job ${job?.id} failed:`, error))
    worker.on('error', reportEnrichmentError)
    leadEnrichmentWorker = worker
  } catch (error) {
    reportEnrichmentError(error as Error)
    connection.disconnect()
  }
})()

export { leadEnrichmentQueue, leadEnrichmentWorker }
