import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import {
  OrganicGoogleIntegrationError,
  googleDataGet,
  googleDataPost,
  integrationForIngest,
  markIngestError,
} from './organicGoogleIntegration.service'
import type { OrganicChannel } from './organicChannels.service'

/**
 * Ingesta de GA4 y del Perfil de Empresa — fase 1 de `docs/vendrava/organico.md`.
 *
 * Las dos integraciones se conectaban y se quedaban en discovery: la banda de
 * integridad las declaraba "conectadas, sin ingesta" y el embudo decía *sin
 * medición* en "Presencia" y "Visitas". Esto es la lectura que faltaba.
 *
 * Tres reglas que gobiernan el volcado:
 *
 * 1. **El tráfico pagado no entra.** GA4 mezcla en la misma propiedad las
 *    sesiones de anuncios y las orgánicas; quedarse las de pago sería apuntarse
 *    leads que ya midió Ads (§8 y `organicChannels.isOrganicEvent`).
 * 2. **Lo que no se sabe encasillar va a `unattributed`.** Directo y referencia
 *    no se reparten entre canales: inflar el canal favorito es exactamente lo
 *    que el documento prohíbe.
 * 3. **Se guarda el día, no el periodo.** El snapshot de canal se reconstruye
 *    entero cada hora; si las visitas vivieran solo allí, cada reconstrucción
 *    las borraría. Con el diario, cualquier ventana se recalcula sumando.
 */

const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const GBP_PERFORMANCE_API = 'https://businessprofileperformance.googleapis.com/v1'
/** Las reseñas siguen viviendo en la API v4, que Google no ha reemplazado. */
const GBP_REVIEWS_API = 'https://mybusiness.googleapis.com/v4'

export type IngestInput = { startDate: string; endDate: string }

/**
 * Agrupación de canal de GA4 → canal del embudo orgánico.
 *
 * `null` significa "esto no es orgánico y no se ingiere". Se decide por lista
 * blanca: una agrupación nueva de Google entra como desconocida, nunca como
 * orgánica por descuido.
 */
export function channelFromGa4Group(group: string): OrganicChannel | null {
  const value = group.trim().toLowerCase()
  if (!value) return null
  // Cualquier cosa pagada la mide Ads.
  if (value.includes('paid') || value.includes('cross-network') || value.includes('display') || value.includes('affiliate')) return null
  if (value === 'organic search') return 'search'
  if (value === 'organic social') return 'social'
  if (value === 'organic video') return 'social'
  if (value === 'organic shopping') return 'search'
  // Directo, referencia, email y el resto del tráfico no pagado existen, pero
  // no se les puede poner un canal: se declaran como no identificados.
  if (value === 'direct' || value === 'referral' || value === 'email' || value === 'unassigned' || value === 'audio' || value === 'sms' || value === 'mobile push notifications') {
    return 'unattributed'
  }
  return 'unattributed'
}

function parseYmd(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    throw new OrganicGoogleIntegrationError('invalid_range', 'Las fechas deben venir en formato YYYY-MM-DD')
  }
  return { year, month, day }
}

/** `20260715` (formato de GA4) → `Date` en UTC a medianoche. */
function dateFromGa4(value: string): Date | null {
  if (!/^\d{8}$/.test(value)) return null
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`)
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Solo la ruta: la query string multiplicaría la misma página por sus UTMs. */
function normalizePath(value: string): string {
  const path = value.split('?')[0].trim()
  if (!path) return '/'
  return path.length > 300 ? path.slice(0, 300) : path
}

/**
 * Deja constancia del fallo en la integración antes de propagarlo.
 *
 * Sin esto, un token revocado o un permiso retirado dejarían la fuente en verde
 * en la banda de integridad mientras el embudo se queda sin datos: exactamente
 * el estado que la fase 0 de este documento vino a eliminar.
 */
async function withIngestError<T>(provider: string, orgId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const code = error instanceof OrganicGoogleIntegrationError ? error.code : 'ingest_failed'
    await markIngestError(orgId, provider, code).catch(() => {})
    throw error
  }
}

type TrafficRow = {
  provider: string
  date: Date
  channel: string
  page: string
  sessions?: number | null
  engagedSessions?: number | null
  views?: number | null
  calls?: number | null
  websiteClicks?: number | null
}

/**
 * Vuelca las filas del día. Es idempotente por (proyecto, proveedor, día,
 * canal, página): re-sincronizar una ventana ya leída corrige los datos en vez
 * de duplicarlos, que es lo que hace segura una re-sincronización automática.
 */
async function upsertRows(orgId: string, projectId: string, rows: TrafficRow[]) {
  let written = 0
  for (const row of rows) {
    const data = {
      sessions: row.sessions ?? null,
      engagedSessions: row.engagedSessions ?? null,
      views: row.views ?? null,
      calls: row.calls ?? null,
      websiteClicks: row.websiteClicks ?? null,
    }
    await prisma.organicTrafficDaily.upsert({
      where: {
        projectId_provider_date_channel_page: {
          projectId,
          provider: row.provider,
          date: row.date,
          channel: row.channel,
          page: row.page,
        },
      },
      create: { orgId, projectId, provider: row.provider, date: row.date, channel: row.channel, page: row.page, ...data },
      update: data,
    })
    written += 1
  }
  return written
}

// ─── GA4 ─────────────────────────────────────────────────────────────────────

/**
 * Sesiones orgánicas por página y día.
 *
 * Se pide a la API de datos la combinación mínima que responde a la pregunta
 * del embudo: qué día, por qué agrupación de canal y a qué página aterrizaron.
 * Pedir más dimensiones multiplica las filas y no añade una sola respuesta.
 */
export async function syncGa4Traffic(orgId: string, userId: string | null, input: IngestInput) {
  const { project, integration, accessToken } = await integrationForIngest(orgId, 'ga4')

  const data = await withIngestError('ga4', orgId, () => googleDataPost(
    `${GA4_DATA_API}/${integration.externalPropertyId}:runReport`,
    accessToken,
    {
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }, { name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
      // 10 000 filas cubren de sobra un mes de una pyme; el tope evita que una
      // web enorme desborde la ingesta sin avisar.
      limit: 10_000,
      keepEmptyRows: false,
    },
  ))

  const reportRows = Array.isArray(data.rows) ? data.rows : []
  const aggregated = new Map<string, TrafficRow>()
  let skippedPaid = 0

  for (const raw of reportRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const dimensions = Array.isArray(row.dimensionValues) ? row.dimensionValues : []
    const metrics = Array.isArray(row.metricValues) ? row.metricValues : []
    const dimensionValue = (index: number) => {
      const item = dimensions[index]
      return item && typeof item === 'object' ? String((item as Record<string, unknown>).value ?? '') : ''
    }
    const metricValue = (index: number) => {
      const item = metrics[index]
      return item && typeof item === 'object' ? toInt((item as Record<string, unknown>).value) : null
    }

    const date = dateFromGa4(dimensionValue(0))
    if (!date) continue
    const channel = channelFromGa4Group(dimensionValue(1))
    if (!channel) {
      skippedPaid += 1
      continue
    }
    const page = normalizePath(dimensionValue(2))
    const key = `${date.toISOString()}|${channel}|${page}`
    const existing = aggregated.get(key)
    const sessions = metricValue(0) ?? 0
    const engaged = metricValue(1) ?? 0
    if (existing) {
      // Dos agrupaciones distintas pueden caer en el mismo canal nuestro
      // («Organic Social» y «Organic Video» son ambas redes): se suman en vez
      // de pisarse.
      existing.sessions = (existing.sessions ?? 0) + sessions
      existing.engagedSessions = (existing.engagedSessions ?? 0) + engaged
    } else {
      aggregated.set(key, { provider: 'ga4', date, channel, page, sessions, engagedSessions: engaged })
    }
  }

  const rows = Array.from(aggregated.values())
  const written = await upsertRows(orgId, project.id, rows)
  const sessions = rows.reduce((total, row) => total + (row.sessions ?? 0), 0)

  const updated = await prisma.organicIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedAt: new Date(), lastError: null, status: 'connected' },
  })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    actorType: userId ? 'user' : 'system',
    action: 'organic.integration.ga4.sync',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: { property: integration.externalPropertyId, ...input, rows: written, sessions, skippedPaid },
  })

  return {
    provider: 'ga4' as const,
    property: integration.externalPropertyId,
    startDate: input.startDate,
    endDate: input.endDate,
    rows: written,
    sessions,
    /** Filas descartadas por ser tráfico de pago: lo mide Ads, no el orgánico. */
    skippedPaid,
  }
}

// ─── Perfil de Empresa de Google ─────────────────────────────────────────────

/** Métricas diarias de la ficha. Vistas, llamadas y clics al sitio web. */
const GBP_DAILY_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
] as const

const IMPRESSION_METRICS = new Set<string>([
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
])

type DailyTotals = { views: number; calls: number; websiteClicks: number }

/**
 * Convierte la respuesta de series temporales de Google en un total por día.
 *
 * Se expone para poder probar el mapeo sin una cuenta de Google conectada: es
 * la parte con lógica real y la que se rompería en silencio si Google cambiara
 * la forma de la respuesta.
 */
export function foldGbpTimeSeries(payload: Record<string, unknown>): Map<string, DailyTotals> {
  const byDay = new Map<string, DailyTotals>()
  const series = Array.isArray(payload.multiDailyMetricTimeSeries) ? payload.multiDailyMetricTimeSeries : []

  for (const group of series) {
    if (!group || typeof group !== 'object') continue
    const inner = (group as Record<string, unknown>).dailyMetricTimeSeries
    const metricSeries = Array.isArray(inner) ? inner : []
    for (const entry of metricSeries) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      const metric = typeof item.dailyMetric === 'string' ? item.dailyMetric : ''
      const timeSeries = item.timeSeries
      const points = timeSeries && typeof timeSeries === 'object' && Array.isArray((timeSeries as Record<string, unknown>).datedValues)
        ? ((timeSeries as Record<string, unknown>).datedValues as unknown[])
        : []
      for (const point of points) {
        if (!point || typeof point !== 'object') continue
        const value = point as Record<string, unknown>
        const date = value.date as Record<string, unknown> | undefined
        if (!date) continue
        const year = toInt(date.year)
        const month = toInt(date.month)
        const day = toInt(date.day)
        if (!year || !month || !day) continue
        const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        // Un día sin actividad llega **sin** `value`: eso es un cero medido, no
        // una ausencia de medición, así que se cuenta como cero.
        const amount = toInt(value.value) ?? 0
        const totals = byDay.get(key) ?? { views: 0, calls: 0, websiteClicks: 0 }
        if (IMPRESSION_METRICS.has(metric)) totals.views += amount
        else if (metric === 'CALL_CLICKS') totals.calls += amount
        else if (metric === 'WEBSITE_CLICKS') totals.websiteClicks += amount
        byDay.set(key, totals)
      }
    }
  }
  return byDay
}

/** La cuenta a la que pertenece la ubicación, guardada en el discovery. */
function accountForLocation(discovery: unknown, locationId: string): string | null {
  if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) return null
  const locations = (discovery as Record<string, unknown>).locations
  if (!Array.isArray(locations)) return null
  for (const item of locations) {
    if (!item || typeof item !== 'object') continue
    const value = item as Record<string, unknown>
    if (value.id === locationId && typeof value.accountId === 'string') return value.accountId
  }
  return null
}

/**
 * Reseñas nuevas sin responder → `OrganicOpportunity` del canal `gbp`.
 *
 * Es el mapeo del núcleo universal (§4.4 y §10): una reseña sin responder es un
 * acontecimiento, y los acontecimientos son oportunidades. Así entra en la cola
 * común en vez de necesitar una pantalla propia.
 *
 * La API de reseñas sigue en la v4 y está restringida: si Google la rechaza no
 * se rompe la sincronización de métricas, se declara que las reseñas no están
 * disponibles y por qué.
 */
async function ingestReviews(
  orgId: string,
  projectId: string,
  accessToken: string,
  accountId: string | null,
  locationId: string,
) {
  if (!accountId) {
    return { status: 'unavailable' as const, reason: 'El discovery no trae la cuenta a la que pertenece la ficha.', created: 0, unanswered: 0 }
  }
  let payload: Record<string, unknown>
  try {
    payload = await googleDataGet(`${GBP_REVIEWS_API}/${accountId}/${locationId}/reviews?pageSize=50`, accessToken)
  } catch (error) {
    const code = error instanceof OrganicGoogleIntegrationError ? error.code : 'reviews_request_failed'
    return {
      status: 'unavailable' as const,
      reason: `Google no devolvió las reseñas (${code}). La API v4 de reseñas exige acceso concedido por Google aparte del OAuth.`,
      created: 0,
      unanswered: 0,
    }
  }

  const reviews = Array.isArray(payload.reviews) ? payload.reviews : []
  let created = 0
  let unanswered = 0

  for (const raw of reviews) {
    if (!raw || typeof raw !== 'object') continue
    const review = raw as Record<string, unknown>
    const reviewId = typeof review.reviewId === 'string' ? review.reviewId : typeof review.name === 'string' ? review.name : null
    if (!reviewId) continue
    if (review.reviewReply) continue
    unanswered += 1

    const rating = typeof review.starRating === 'string' ? review.starRating : 'SIN_VALORAR'
    const sourceKey = `review:${reviewId}`
    const existing = await prisma.organicOpportunity.findUnique({
      where: { orgId_projectId_source_sourceKey: { orgId, projectId, source: 'google_business_profile', sourceKey } },
      select: { id: true },
    })
    if (existing) continue

    await prisma.organicOpportunity.create({
      data: {
        orgId,
        projectId,
        title: `Reseña sin responder (${rating})`,
        source: 'google_business_profile',
        sourceKind: 'gbp',
        channel: 'gbp',
        status: 'open',
        // Una reseña negativa sin responder corre más que una de cinco
        // estrellas: la prioridad lo refleja sin inventar un valor económico.
        score: rating === 'ONE' || rating === 'TWO' ? 90 : 60,
        metadata: {
          reviewId,
          rating,
          // Nunca el texto literal de la reseña: es contenido de una persona
          // identificable y las evidencias van agregadas (§8).
          hasComment: typeof review.comment === 'string' && review.comment.length > 0,
          createdAt: typeof review.createTime === 'string' ? review.createTime : null,
        } as object,
      },
    })
    created += 1
  }

  return { status: 'ready' as const, reason: null, created, unanswered }
}

export async function syncBusinessProfile(orgId: string, userId: string | null, input: IngestInput) {
  const { project, integration, accessToken } = await integrationForIngest(orgId, 'google_business_profile')
  const locationId = integration.externalPropertyId!
  const start = parseYmd(input.startDate)
  const end = parseYmd(input.endDate)

  const params = new URLSearchParams()
  for (const metric of GBP_DAILY_METRICS) params.append('dailyMetrics', metric)
  params.set('dailyRange.start_date.year', String(start.year))
  params.set('dailyRange.start_date.month', String(start.month))
  params.set('dailyRange.start_date.day', String(start.day))
  params.set('dailyRange.end_date.year', String(end.year))
  params.set('dailyRange.end_date.month', String(end.month))
  params.set('dailyRange.end_date.day', String(end.day))

  const payload = await withIngestError('google_business_profile', orgId, () => googleDataGet(
    `${GBP_PERFORMANCE_API}/${locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
    accessToken,
  ))

  const byDay = foldGbpTimeSeries(payload)
  const rows: TrafficRow[] = Array.from(byDay.entries()).map(([day, totals]) => ({
    provider: 'google_business_profile',
    date: new Date(`${day}T00:00:00.000Z`),
    channel: 'gbp',
    page: '',
    views: totals.views,
    calls: totals.calls,
    websiteClicks: totals.websiteClicks,
  }))
  const written = await upsertRows(orgId, project.id, rows)
  const views = rows.reduce((total, row) => total + (row.views ?? 0), 0)
  const calls = rows.reduce((total, row) => total + (row.calls ?? 0), 0)

  const reviews = await ingestReviews(
    orgId,
    project.id,
    accessToken,
    accountForLocation(integration.discovery, locationId),
    locationId,
  )

  const updated = await prisma.organicIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedAt: new Date(), lastError: null, status: 'connected' },
  })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    actorType: userId ? 'user' : 'system',
    action: 'organic.integration.google_business_profile.sync',
    entityType: 'OrganicIntegration',
    entityId: updated.id,
    after: { location: locationId, ...input, rows: written, views, calls, reviews: reviews.status },
  })

  return {
    provider: 'google_business_profile' as const,
    location: locationId,
    startDate: input.startDate,
    endDate: input.endDate,
    rows: written,
    views,
    calls,
    reviews,
  }
}

// ─── Lectura agregada ────────────────────────────────────────────────────────

export type ChannelTraffic = { visits: number | null; views: number | null; calls: number | null }

/**
 * Totales por canal en una ventana. `null` donde no hay ni una fila ingerida:
 * un 0 diría que se midió y no hubo nadie, que es una afirmación distinta y más
 * grave.
 */
export async function getTrafficByChannel(orgId: string, projectId: string, since: Date) {
  const rows = await prisma.organicTrafficDaily.groupBy({
    by: ['channel'],
    where: { orgId, projectId, date: { gte: since } },
    _sum: { sessions: true, views: true, calls: true },
    _count: { _all: true },
  })
  const result = new Map<string, ChannelTraffic>()
  for (const row of rows) {
    result.set(row.channel, {
      visits: row._sum.sessions,
      views: row._sum.views,
      calls: row._sum.calls,
    })
  }
  return result
}

/** Páginas orgánicas con más sesiones: el detalle que GA4 hace posible. */
export async function getTopOrganicPages(orgId: string, projectId: string, since: Date, limit = 10) {
  const rows = await prisma.organicTrafficDaily.groupBy({
    by: ['page', 'channel'],
    where: { orgId, projectId, provider: 'ga4', date: { gte: since }, page: { not: '' } },
    _sum: { sessions: true, engagedSessions: true },
    orderBy: { _sum: { sessions: 'desc' } },
    take: limit,
  })
  return rows.map(row => ({
    page: row.page,
    channel: row.channel,
    sessions: row._sum.sessions ?? 0,
    engagedSessions: row._sum.engagedSessions ?? 0,
  }))
}

/** Última fecha con datos por proveedor, para la banda de integridad (§5.1). */
export async function getIngestFreshness(orgId: string, projectId: string) {
  const rows = await prisma.organicTrafficDaily.groupBy({
    by: ['provider'],
    where: { orgId, projectId },
    _max: { date: true },
    _count: { _all: true },
  })
  return new Map(rows.map(row => [row.provider, { lastDate: row._max.date, rows: row._count._all }]))
}
