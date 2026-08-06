import { createHash, randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

/**
 * Telemetría de landings — docs/vendrava/landings.md §3 y §7.
 *
 * Dos responsabilidades:
 *
 * 1. **Identidad y versión** (§3.1). La telemetría no cuelga del `landingSlug`:
 *    un slug puede cambiar, reutilizarse o apuntar a otro contenido y mezclaría
 *    en una misma línea base dos páginas distintas. Cada publicación recibe un
 *    `LandingVersion` inmutable y todo evento lo referencia.
 * 2. **Ingesta de eventos** (§7.1). Comportamiento anónimo, sin PII: se guarda
 *    qué campo se tocó y si se rellenó, jamás lo que se escribió en él.
 */

/** Lista blanca de §7.1. Un tipo fuera de esta lista se descarta en silencio. */
export const LANDING_EVENT_TYPES = [
  'view',
  'scroll_50',
  'scroll_90',
  'cta_click',
  'form_start',
  // Emitidos solo cuando exista un formulario de varios pasos. El contrato se
  // define ya para no versionar el ingestor cuando llegue.
  'form_step_view',
  'form_step_complete',
  'form_field_blur',
  'form_validation_error',
  'form_error',
  'form_submit',
] as const

export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number]

const EVENT_TYPE_SET = new Set<string>(LANDING_EVENT_TYPES)

/** Un lote más grande que esto es un cliente roto o un intento de inundación. */
const MAX_BATCH_SIZE = 40

/**
 * Margen del reloj del cliente. El navegador decide `occurredAt` y puede tener
 * la hora mal; fuera de esta ventana se sustituye por la hora del servidor en
 * vez de descartar el evento.
 */
const CLOCK_TOLERANCE_MS = 6 * 60 * 60 * 1000

/**
 * Exclusiones de §3.2. No pretende ser exhaustivo — ningún filtro por
 * user-agent lo es — pero quita el grueso del ruido: rastreadores y las
 * previsualizaciones de redes y mensajería, que piden la página entera y
 * dispararían una "visita" por cada enlace compartido.
 */
const BOT_PATTERN = /bot|crawler|spider|crawling|slurp|headless|phantom|puppeteer|playwright|lighthouse|preview|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot|discordbot|slackbot|embedly|pinterest|google-inspectiontool|chrome-lighthouse|gtmetrix|pingdom|uptime|monitoring|curl|wget|python-requests|axios|node-fetch|okhttp|java\/|go-http-client/i

export function isBotUserAgent(userAgent: string | undefined) {
  if (!userAgent) return true
  return BOT_PATTERN.test(userAgent)
}

export function deviceFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return 'unknown'
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(userAgent)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

function cleanToken(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

/**
 * El contenido publicado que define una versión. Deliberadamente explícito: si
 * mañana el editor añade un bloque nuevo, hay que añadirlo aquí a conciencia.
 * Incluir el objeto entero haría que un campo interno irrelevante (un contador
 * de vistas heredado, por ejemplo) partiese la línea base sin que nadie tocara
 * la página.
 */
export function landingContentOf(campaign: { name: string; adAssets: unknown }) {
  const assets = (campaign.adAssets ?? {}) as Record<string, unknown>
  return {
    name: campaign.name,
    title: cleanToken(assets.title, 300) ?? null,
    offer: cleanToken(assets.offer, 500) ?? null,
    leadMagnet: cleanToken(assets.leadMagnet, 500) ?? null,
    adCopy: cleanToken(assets.adCopy, 2000) ?? null,
    landingTemplateId: cleanToken(assets.landingTemplateId, 80) ?? 'generic-v1',
    imageUrl: cleanToken(assets.imageUrl, 1000) ?? null,
    seo: (assets.seo ?? null) as Prisma.InputJsonValue | null,
  }
}

export function landingContentHash(content: ReturnType<typeof landingContentOf>) {
  // Claves ordenadas: `JSON.stringify` respeta el orden de inserción y dos
  // objetos equivalentes con distinto orden darían hashes distintos.
  const stable = JSON.stringify(content, Object.keys(content).sort())
  return createHash('sha256').update(stable).digest('hex')
}

type CampaignForVersion = {
  id: string
  orgId: string
  name: string
  adAssets: unknown
  landingSlug: string | null
  landingKey: string | null
}

/**
 * Devuelve la versión vigente de la landing, creándola si el contenido cambió.
 *
 * Se llama al servir la landing pública, no al guardarla: así una landing que
 * ya existía antes de esta telemetría obtiene su primera versión en la primera
 * visita, sin necesidad de un backfill que invente fechas de publicación.
 */
export async function resolveCurrentVersion(campaign: CampaignForVersion) {
  const landingKey = campaign.landingKey ?? await assignLandingKey(campaign.id)
  const content = landingContentOf(campaign)
  const contentHash = landingContentHash(content)

  const existing = await prisma.landingVersion.findUnique({
    where: { landingKey_contentHash: { landingKey, contentHash } },
  })
  if (existing) return existing

  const last = await prisma.landingVersion.findFirst({
    where: { landingKey },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  try {
    return await prisma.landingVersion.create({
      data: {
        orgId: campaign.orgId,
        campaignId: campaign.id,
        landingKey,
        version: (last?.version ?? 0) + 1,
        contentHash,
        content: content as unknown as Prisma.InputJsonObject,
        slug: campaign.landingSlug,
      },
    })
  } catch (error) {
    // Dos visitas simultáneas a una landing recién editada compiten por crear
    // la misma versión. El índice único decide; el perdedor lee la ganadora.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.landingVersion.findUnique({
        where: { landingKey_contentHash: { landingKey, contentHash } },
      })
      if (winner) return winner
    }
    throw error
  }
}

async function assignLandingKey(campaignId: string) {
  const landingKey = `lk_${randomUUID().replace(/-/g, '')}`
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { landingKey },
    select: { landingKey: true },
  })
  return updated.landingKey as string
}

export interface LandingEventInput {
  type?: string
  field?: string
  filled?: boolean
  value?: number
  occurredAt?: string
}

export interface LandingEventContext {
  orgId: string
  campaignId: string
  landingKey: string
  landingVersionId: string
  sessionId: string
  /** Pendiente de la decisión de cookies (§13): hoy siempre `null`. */
  visitorId?: string | null
  experimentId?: string | null
  variantId?: string | null
  source: string
  medium?: string
  utmCampaign?: string
  content?: string
  term?: string
  referrer?: string
  device: string
}

function normalizeEvent(event: LandingEventInput, context: LandingEventContext, now: number) {
  const type = cleanToken(event.type, 40)
  if (!type || !EVENT_TYPE_SET.has(type)) return null

  const field = cleanToken(event.field, 60) ?? ''
  const rawTimestamp = typeof event.occurredAt === 'string' ? Date.parse(event.occurredAt) : Number.NaN
  const withinTolerance = Number.isFinite(rawTimestamp)
    && rawTimestamp <= now + CLOCK_TOLERANCE_MS
    && rawTimestamp >= now - CLOCK_TOLERANCE_MS
  const occurredAt = new Date(withinTolerance ? rawTimestamp : now)

  // `value` transporta magnitudes (ms en el campo, % de scroll). Se acota para
  // que un cliente manipulado no envenene la media de tiempo por campo.
  const rawValue = typeof event.value === 'number' && Number.isFinite(event.value) ? Math.round(event.value) : null
  const value = rawValue === null ? null : Math.min(Math.max(rawValue, 0), 3_600_000)

  return {
    orgId: context.orgId,
    campaignId: context.campaignId,
    landingKey: context.landingKey,
    landingVersionId: context.landingVersionId,
    experimentId: context.experimentId ?? null,
    variantId: context.variantId ?? null,
    visitorId: context.visitorId ?? null,
    sessionId: context.sessionId,
    type,
    field,
    filled: typeof event.filled === 'boolean' ? event.filled : null,
    value,
    source: context.source,
    medium: context.medium ?? null,
    utmCampaign: context.utmCampaign ?? null,
    content: context.content ?? null,
    term: context.term ?? null,
    referrer: context.referrer ?? null,
    device: context.device,
    occurredAt,
  }
}

/**
 * Atribución sellada de una sesión: la de su primer evento.
 *
 * Sin esto, una sesión que empieza directa y luego entra otra vez con UTM
 * reparte sus eventos entre dos filas del agregado —que agrupa por origen— y la
 * misma sesión se cuenta dos veces. Ocurre poco con visitantes reales y todo el
 * rato en pruebas internas, que es cuando más se mira el dato.
 *
 * El dispositivo se sella por el mismo motivo: también es clave del agregado.
 *
 * Esto hace que `LandingEvent` sea **primer contacto**: la sesión se atribuye a
 * donde empezó. `AcquisitionEvent` es último contacto —su upsert sobrescribe el
 * origen—, así que en el caso raro de una sesión que cambia de origen a mitad,
 * las dos tablas pueden discrepar. Se prefiere primer contacto aquí porque
 * reescribir eventos ya guardados sería reescribir el histórico, y porque para
 * una sesión de landing la pregunta es de dónde llegó, no por dónde volvió.
 */
async function sealedAttribution(sessionId: string) {
  return prisma.landingEvent.findFirst({
    where: { sessionId },
    orderBy: { occurredAt: 'asc' },
    select: { source: true, medium: true, utmCampaign: true, content: true, term: true, referrer: true, device: true },
  })
}

/**
 * Persiste un lote de eventos. Devuelve cuántos se aceptaron: los duplicados
 * (mismo `sessionId` + tipo + campo) se ignoran, porque las tasas de §7.2 se
 * calculan sobre sesiones expuestas y repetir un blur no debe pesar más.
 */
export async function ingestLandingEvents(events: LandingEventInput[], context: LandingEventContext) {
  if (!Array.isArray(events) || !events.length) return { accepted: 0 }

  // La primera visita de la sesión decide su origen; el resto lo hereda.
  const sealed = await sealedAttribution(context.sessionId)
  const effective: LandingEventContext = sealed
    ? {
        ...context,
        source: sealed.source,
        medium: sealed.medium ?? undefined,
        utmCampaign: sealed.utmCampaign ?? undefined,
        content: sealed.content ?? undefined,
        term: sealed.term ?? undefined,
        referrer: sealed.referrer ?? undefined,
        device: sealed.device ?? context.device,
      }
    : context

  const now = Date.now()
  const normalized = events
    .slice(0, MAX_BATCH_SIZE)
    .map(event => normalizeEvent(event, effective, now))
    .filter((event): event is NonNullable<typeof event> => event !== null)

  if (!normalized.length) return { accepted: 0 }

  // Deduplicación dentro del propio lote: `createMany` con `skipDuplicates`
  // resuelve los choques contra la tabla, no los que trae el lote consigo.
  const seen = new Set<string>()
  const unique = normalized.filter(event => {
    const key = `${event.sessionId}|${event.type}|${event.field}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const result = await prisma.landingEvent.createMany({ data: unique, skipDuplicates: true })
  return { accepted: result.count }
}
