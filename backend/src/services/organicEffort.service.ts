import { prisma } from '../lib/prisma'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { minutesForFormat, hoursForProspects } from '../data/effortEstimates'
import { classifyChannel, isOrganicEvent, type OrganicChannel } from './organicChannels.service'

/**
 * Horas invertidas y ranking por pieza — `docs/vendrava/organico.md` §5.2 y §5.4.
 *
 * El gasto del orgánico es tiempo, así que "coste por cualificado en tiempo" es
 * lo que aquí sustituye al CAC. Hasta ahora las horas se rellenaban a mano;
 * este servicio las deriva de lo que realmente se produjo:
 *
 *   piezas publicadas × minutos por formato + lotes de prospección
 *
 * Sigue siendo una **estimación declarada**, no un registro de tiempo real, y
 * se presenta como tal en la interfaz. Nadie ha cronometrado estas piezas.
 */

/**
 * Canal de publicación de una pieza → canal del embudo orgánico.
 *
 * Una pieza puede salir a varios canales a la vez, pero escribirla costó el
 * mismo tiempo una sola vez: las horas se imputan al primero para no duplicar
 * el esfuerzo tantas veces como canales tenga.
 */
function pieceChannel(channels: string[]): OrganicChannel {
  const value = (channels[0] ?? '').toLowerCase()
  if (!value) return 'social'
  if (value.includes('blog') || value.includes('web') || value.includes('seo')) return 'search'
  if (value.includes('gbp') || value.includes('business')) return 'gbp'
  return 'social'
}

/**
 * Horas estimadas por canal en el período. Solo cuentan las piezas
 * **publicadas**: un borrador que nunca salió no consumió el tiempo de
 * publicarlo ni pudo traer un solo lead.
 */
export async function computeHoursByChannel(orgId: string, periodStart: Date) {
  const [pieces, prospectImports] = await Promise.all([
    prisma.contentPiece.findMany({
      where: { orgId, status: 'published', publishedAt: { gte: periodStart } },
      select: { format: true, channels: true },
    }).catch(() => [] as Array<{ format: string; channels: string[] }>),
    prisma.acquisitionEvent.count({
      where: { orgId, type: 'prospect_import', createdAt: { gte: periodStart } },
    }),
  ])

  const hours: Partial<Record<OrganicChannel, number>> = {}
  for (const piece of pieces) {
    const channel = pieceChannel(piece.channels)
    hours[channel] = (hours[channel] ?? 0) + minutesForFormat(piece.format) / 60
  }
  if (prospectImports > 0) hours.prospecting = hoursForProspects(prospectImports)

  for (const key of Object.keys(hours) as OrganicChannel[]) {
    hours[key] = Math.round((hours[key] ?? 0) * 10) / 10
  }
  return hours
}

/**
 * Ranking por pieza (§5.4): qué publicación concreta trajo leads, cuáles
 * cualificaron y cuánto tiempo costó producirla.
 *
 * El enganche es `ContentPiece.utmContent` ↔ `AcquisitionEvent.content`. Sin
 * ese UTM propio por pieza, dos posts de la misma campaña y canal serían
 * indistinguibles y esta tabla no existiría.
 */
export async function getPieceRanking(orgId: string, periodStart: Date, limit = 25) {
  const pieces = await prisma.contentPiece.findMany({
    where: { orgId, status: 'published', publishedAt: { gte: periodStart }, utmContent: { not: null } },
    select: { id: true, format: true, channels: true, utmContent: true, publishedAt: true, minutesSaved: true, opportunityId: true },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  }).catch(() => [] as Array<{
    id: string; format: string; channels: string[]; utmContent: string | null
    publishedAt: Date | null; minutesSaved: number | null; opportunityId: string | null
  }>)
  if (!pieces.length) return []

  const utms = pieces.map(piece => piece.utmContent).filter((value): value is string => Boolean(value))
  const events = await prisma.acquisitionEvent.findMany({
    where: { orgId, content: { in: utms }, leadId: { not: null }, createdAt: { gte: periodStart } },
    select: { content: true, leadId: true, type: true, source: true, medium: true },
  })

  // El tráfico pagado se descarta también aquí: una pieza orgánica no se
  // apunta los leads que llegaron por un anuncio a la misma landing.
  const organicEvents = events.filter(isOrganicEvent)
  const leadsByUtm = new Map<string, Set<string>>()
  for (const event of organicEvents) {
    if (!event.content || !event.leadId) continue
    if (!leadsByUtm.has(event.content)) leadsByUtm.set(event.content, new Set())
    leadsByUtm.get(event.content)!.add(event.leadId)
  }

  const allLeadIds = Array.from(new Set(organicEvents.map(event => event.leadId!).filter(Boolean)))
  const qualified = allLeadIds.length
    ? await prisma.lead.findMany({
        where: { orgId, id: { in: allLeadIds }, calls: { some: { outcome: { in: [...QUALIFYING_CALL_OUTCOMES] } } } },
        select: { id: true },
      })
    : []
  const qualifiedIds = new Set(qualified.map(lead => lead.id))

  return pieces
    .map(piece => {
      const leadIds = piece.utmContent ? Array.from(leadsByUtm.get(piece.utmContent) ?? []) : []
      const qualifiedCount = leadIds.filter(id => qualifiedIds.has(id)).length
      const hours = Math.round((minutesForFormat(piece.format) / 60) * 10) / 10
      return {
        pieceId: piece.id,
        format: piece.format,
        channel: pieceChannel(piece.channels),
        publishedAt: piece.publishedAt,
        hoursInvested: hours,
        leads: leadIds.length,
        qualified: qualifiedCount,
        // `null` mientras no haya cualificados: dividir por cero produciría
        // un infinito que la interfaz pintaría como un número enorme.
        hoursPerQualified: qualifiedCount > 0 ? Math.round((hours / qualifiedCount) * 10) / 10 : null,
        minutesSaved: piece.minutesSaved,
        opportunityId: piece.opportunityId,
      }
    })
    .sort((left, right) => right.qualified - left.qualified || right.leads - left.leads)
    .slice(0, limit)
}

/**
 * Escribe las horas en los snapshots de canal ya calculados. Se hace en un paso
 * aparte para que el embudo siga funcionando aunque el motor de contenido de la
 * otra mitad del producto todavía no esté produciendo piezas.
 */
export async function applyHoursToSnapshots(orgId: string, projectId: string, periodKey: string, periodDays: number) {
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)
  const hours = await computeHoursByChannel(orgId, periodStart)
  let updated = 0
  for (const [channel, value] of Object.entries(hours)) {
    if (value == null) continue
    const result = await prisma.organicChannelSnapshot.updateMany({
      where: { orgId, projectId, periodKey, channel },
      data: { hoursInvested: value },
    })
    updated += result.count
  }
  return { channels: Object.keys(hours).length, updated, hours }
}

/**
 * Coste por cualificado en tiempo, por canal. La métrica que sustituye al CAC.
 * `null` donde no hay horas registradas o no hay cualificados: sin las dos
 * cosas no es un coste, es una división sin sentido.
 */
export async function getHoursPerQualified(orgId: string, projectId: string, periodKey: string) {
  const snapshots = await prisma.organicChannelSnapshot.findMany({
    where: { orgId, projectId, periodKey },
    select: { channel: true, hoursInvested: true, qualified: true },
  })
  return snapshots.map(snapshot => ({
    channel: snapshot.channel,
    hoursInvested: snapshot.hoursInvested,
    qualified: snapshot.qualified,
    hoursPerQualified: snapshot.hoursInvested != null && (snapshot.qualified ?? 0) > 0
      ? Math.round((snapshot.hoursInvested / snapshot.qualified!) * 10) / 10
      : null,
  }))
}
